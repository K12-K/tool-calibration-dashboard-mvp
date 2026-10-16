import { Database, BarChart3, LogOut } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { config } from "../config";
import { useAuth } from "../auth/AuthContext";

export function Brand() {
  const [broken, setBroken] = useState(false);
  return (
    <div className="brand">
      {config.logoUrl && !broken ? (
        <img src={config.logoUrl} alt={config.companyName} onError={() => setBroken(true)} />
      ) : (
        <span className="brand-fallback">{config.companyName}</span>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Brand />
        <h1 className="app-title">CALIBRATION LOG</h1>
        <div className="header-user">
          <span className="user-name" title={user?.email}>
            {user?.full_name || user?.email}
            {user?.role === "admin" && <span className="role-chip">Admin</span>}
          </span>
          <button className="btn btn-ghost" onClick={logout} title="Sign out">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>
      <nav className="app-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <Database size={16} /> Database
        </NavLink>
        <NavLink to="/reports" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          <BarChart3 size={16} /> Reports
        </NavLink>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">{config.footerText}</footer>
    </div>
  );
}
