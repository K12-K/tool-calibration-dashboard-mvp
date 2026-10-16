import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute";
import Layout from "./components/Layout";
import DatabasePage from "./pages/DatabasePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import GaugeFormPage from "./pages/GaugeFormPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ReportsPage from "./pages/ReportsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DatabasePage />} />
          <Route path="gauges/new" element={<GaugeFormPage key="new" mode="new" />} />
          <Route path="gauges/:id" element={<GaugeFormPage key="view" mode="view" />} />
          <Route path="gauges/:id/edit" element={<GaugeFormPage key="edit" mode="edit" />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
