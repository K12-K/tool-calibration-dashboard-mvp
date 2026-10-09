import type { ReactNode } from "react";
import { Brand } from "../components/Layout";

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Brand />
        <h1>CALIBRATION LOG</h1>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
