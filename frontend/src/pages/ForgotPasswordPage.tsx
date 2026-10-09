import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/endpoints";
import AuthShell from "./AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await api.resetPassword(email.trim(), code.trim(), password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated">
        <div className="alert alert-success">Your password was changed. All previous sessions were signed out.</div>
        <Link to="/login" className="btn btn-primary btn-block">Go to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset password" subtitle="Enter the current 6-digit code from your authenticator app to set a new password.">
      <form onSubmit={submit} className="auth-form">
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span className="field-label">EMAIL</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span className="field-label">AUTHENTICATOR CODE</span>
          <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required />
        </label>
        <label className="field">
          <span className="field-label">NEW PASSWORD</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
          <span className="field-hint">At least 8 characters, with a letter and a number.</span>
        </label>
        <label className="field">
          <span className="field-label">CONFIRM NEW PASSWORD</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 6}>{busy ? "Updating…" : "Reset password"}</button>
      </form>
      <div className="auth-links"><Link to="/login">Back to sign in</Link></div>
      <p className="hint">Lost access to your authenticator app? Ask your administrator to reset your two-factor setup.</p>
    </AuthShell>
  );
}
