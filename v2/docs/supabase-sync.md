# Supabase 同期 — 設計ドキュメント

ステータス: 設計中 / 実装前
最終更新: 2026-06-18

## 目的と動機

現在 v2 は IndexedDB (Dexie) **オフライン専用**。データは端末固有で、ブラウザ
データを消すと消失する。実機運用前にクラウド同期を導入し、複数端末・万一の
紛失でも履歴が残るようにする。

データモデルは既にこれを想定して構築済み:
- 全行が `id (UUID)` / `updatedAt` / `deletedAt` を持つ (Tier D で完了)
- ID はクライアント生成 UUID なので **オフライン編集と後追い同期がそのまま成立**
- マージ戦略 = updatedAt の **last-write-wins (LWW)**

## セキュリティ脅威モデル

これがこのドキュメントの主目的。Supabase が原因のデータ漏洩は典型的に以下:

| # | 漏洩パターン | 我々のアプリでの影響 |
|---|---|---|
| 1 | **RLS を有効化していない** テーブル | anon キーで全ユーザーのハンド履歴が読み取り可能 |
| 2 | **RLS policy が一部の操作に欠けている** | SELECT は守られているが INSERT/UPDATE で改竄可能、など |
| 3 | `service_role` キーが **フロントエンドに混入** | RLS が全て無効になり全データ流出 |
| 4 | `userId` カラムがクライアント書き換え可能 | A が B のデータを書き換え／読める |
| 5 | Realtime / Storage の policy 漏れ | 同様の漏洩経路 (本MVPでは未使用予定) |

## ポリシー: 多層防御

3つの層で守る:

1. **Public 鍵 (anon) しかフロントに置かない**
   - `VITE_SUPABASE_ANON_KEY` 環境変数経由で bundle に含める
   - `SUPABASE_SERVICE_ROLE_KEY` は GitHub Actions Secret / `.env.local` (gitignore) にのみ存在
   - CI で `dist/` の grep ガード (詳細は §7)

2. **全テーブル RLS 有効化、policy で `auth.uid()` 照合**
   - すべての同期対象テーブルに `user_id uuid not null` カラム
   - 各操作 (SELECT/INSERT/UPDATE/DELETE) に明示 policy
   - CI で `pg_tables.rowsecurity` の全テーブル `true` チェック (詳細は §7)

3. **インサート時に `user_id` をサーバー側で強制**
   - クライアントから渡されてくる `user_id` は信頼しない
   - INSERT policy で `with check (user_id = auth.uid())` をかけ、別ユーザーの ID で INSERT できないようにする

## 認証方式

採用案: **Supabase Auth のマジックリンク (パスワードレス)**
- 理由: パスワード管理不要、Apple/Google 登録不要、登録 UX が最小
- フロー: メアド入力 → リンク受信 → タップでセッション確立
- セッション: localStorage 経由でブラウザ再起動後も継続

将来オプション: Sign in with Apple (App Store 配布時の要件), Google OAuth

## スキーマ変更

### クライアント側 (`src/data/types.ts`)

```ts
export interface Syncable {
  id: string;
  userId: string;       // 追加: 所有者の auth.uid()
  updatedAt: number;
  deletedAt: number;
}
```

### Supabase 側 (PostgreSQL)

各テーブル共通の必須カラム:

```sql
create table sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at bigint not null,
  deleted_at bigint not null default 0,
  -- 以下、ドメインカラム
  ...
);

-- RLS 必須
alter table sessions enable row level security;

-- SELECT: 自分の行のみ
create policy "sessions_select_own" on sessions
  for select using (user_id = auth.uid());

-- INSERT: 自分の user_id でしか INSERT できない
create policy "sessions_insert_own" on sessions
  for insert with check (user_id = auth.uid());

-- UPDATE: 自分の行のみ、user_id 変更不可
create policy "sessions_update_own" on sessions
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: 物理削除は使わない (deletedAt の更新 = UPDATE policy 経由)
create policy "sessions_delete_own" on sessions
  for delete using (user_id = auth.uid());

-- 所有者で絞った高速参照
create index sessions_user_alive on sessions (user_id, deleted_at) where deleted_at = 0;
```

対象テーブル (Tier D の Dexie 構成と1:1):
- `sessions`
- `session_players`
- `hands`
- `actions`
- `events`
- `bankroll`
- `app_settings` (シングルトンだが user_id 紐付けで複数ユーザー対応)

## 同期エンジン (クライアント側)

### 方針

- **オフラインファースト**: ローカル Dexie が一次ストレージ、Supabase は二次バックアップ + 同期点
- ユーザー操作は **常に Dexie に書く**。同期は背景で
- マージは **LWW (updatedAt 比較)**: ID が同じ行は `updatedAt` 新しい方を勝者
- 削除は `deletedAt > 0` で表現 (物理削除しない)

### ライフサイクル

```
[Login] → fetch_remote_changes(since=last_pull_at)
        → merge_into_local
        → push_local_changes(updatedAt > last_push_at)
        → set last_push_at = now

[Mutation] → write Dexie
           → enqueue for push
           → debounced push every 2s (or on visibility change / online event)

[Realtime] (将来) → subscribe to row changes → merge_into_local
```

### `last_pull_at` / `last_push_at` の保持

- localStorage キー: `v2.sync.lastPullAt`, `v2.sync.lastPushAt`
- 初回ログイン時はゼロから全件 pull

### コンフリクト

- 同じ行を端末A・端末Bが別々に編集 → `updatedAt` 新しい方が勝つ
- 削除と編集の競合: `deletedAt > 0` を編集より優先する単純ルール

## CI ガード

`.github/workflows/deploy.yml` に追加するチェック:

### 1. `service_role` がバンドルに混入していないか

```yaml
- name: No service_role in bundle
  run: |
    cd v2 && npm run build
    if grep -rn 'service_role\|SUPABASE_SERVICE_ROLE' dist/ ; then
      echo "::error::service_role detected in build output"
      exit 1
    fi
```

### 2. 全テーブル RLS 有効

Supabase CLI で migration を当てるフローで、続けて確認クエリ:

```sql
do $$
declare bad text;
begin
  select string_agg(tablename, ', ') into bad
  from pg_tables
  where schemaname = 'public' and rowsecurity = false;
  if bad is not null then
    raise exception 'RLS not enabled on: %', bad;
  end if;
end $$;
```

### 3. クロスユーザー読み取り拒否の統合テスト

`vitest` の integration テストで、2人のユーザーをサインアップして互いのデータが
読めない/書けないことを確認 (`v2/src/sync/rls.integration.test.ts`).

## デプロイ前チェックリスト

実装完了後、本番投入前に **全項目クリア必須**:

- [ ] 全テーブルに RLS 有効化済み (`pg_tables.rowsecurity`)
- [ ] 全テーブルに `user_id` カラムあり、`not null` 制約
- [ ] 全テーブルに SELECT/INSERT/UPDATE/DELETE 各 policy あり
- [ ] `dist/` を grep して `service_role` 文字列なし
- [ ] anon キーは public、service_role は CI Secret のみ
- [ ] 2人ユーザーで相互の行が見えない統合テスト緑
- [ ] サインアウト時にローカル Dexie もクリア (任意機能)
- [ ] 認証なしでもアプリ起動 → 「ログインするとクラウド同期」誘導 UI

## 段階的実装プラン

セキュリティ事故を避けるため、機能を絞った段階的ロールアウト:

| Phase | 内容 | 目安 |
|---|---|---|
| **0** | 本ドキュメント完成・レビュー | 今 |
| **1** | Supabase プロジェクト作成、認証導入、サインイン UI | |
| **2** | スキーマ migration (SQL ファイル + RLS policy)、CI ガード | |
| **3** | 同期エンジン (push only): ローカル変更を Supabase へ反映 | |
| **4** | 同期エンジン (pull): Supabase の変更を取り込む、マージ | |
| **5** | 統合テスト (RLS 2-user)、デプロイ前チェックリスト全パス | |
| **6** | 本番投入 | |

## オープン論点

- 認証方式の最終確定 (現在: マジックリンク推奨)
- Free tier の容量見積もり (1ユーザー何ハンドまで?)
- 将来 Realtime 同期を入れるか (現状は debounced push のみ)
- ローカル Dexie とクラウドが乖離した時の「再同期」UI (任意)
