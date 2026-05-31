import { Navigate, Route, Routes } from "react-router-dom";
import SessionListScreen from "./screens/SessionList";
import NewSessionScreen from "./screens/NewSession";
import TableScreen from "./screens/Table";
import HandInputScreen from "./screens/HandInput";
import HandResultScreen from "./screens/HandResult";
import HandListScreen from "./screens/HandList";
import HandPlayScreen from "./screens/HandPlay";
import TableSetupScreen from "./screens/TableSetup";

function App() {
  return (
    <div className="min-h-full max-w-xl mx-auto">
      <Routes>
        <Route path="/" element={<SessionListScreen />} />
        <Route path="/sessions/new" element={<NewSessionScreen />} />
        <Route path="/sessions/:id/table" element={<TableScreen />} />
        <Route path="/sessions/:id/hands" element={<HandListScreen />} />
        <Route path="/sessions/:id/hands/:handId/input" element={<HandInputScreen />} />
        <Route path="/sessions/:id/hands/:handId/result" element={<HandResultScreen />} />
        <Route path="/sessions/:id/hands/:handId/play" element={<HandPlayScreen />} />
        <Route path="/sessions/:id/setup" element={<TableSetupScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
