import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/endpoints";
import type { RegisterResult } from "../api/types";
import AuthShell from "./AuthShell";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setup, setSetup] = useState<RegisterResult | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submitDetails = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      setSetup(await api.register(email.trim(), password, fullName.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    setError(null);
    setBusy(true);
    try {
      await api.verifyRegistration(setup.email, code.trim());
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="All set">
        <div className="alert alert-success">Two-factor authentication is enabled. Redirecting to sign in…</div>
        <Link to="/login" className="btn btn-primary btn-block">Go to sign in</Link>
      </AuthShell>
    );
  }

  if (setup) {
    return (
      <AuthShell title="Set up two-factor authentication" subtitle="Step 2 of 2 — scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).">
        <div className="qr-box">
          <img src={setup.qr_png_data_uri} alt="Authenticator QR code" width={200} height={200} />
        </div>
        <details className="manual-key">
          <summary>Can't scan? Enter the key manually</summary>
          <code>{setup.secret}</code>
        </details>
        <form onSubmit={submitCode} className="auth-form">
          {error && <div className="alert alert-error">{error}</div>}
          <label className="field">
            <span className="field-label">6-DIGIT CODE FROM THE APP</span>
            <input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required autoFocus />
          </label>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and finish"}</button>
        </form>
        <p className="hint">Your account is only activated after this step. This code is also what you will use to reset a forgotten password.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create account" subtitle="Step 1 of 2 — your details">
      <form onSubmit={submitDetails} className="auth-form">
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span className="field-label">FULL NAME</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </label>
        <label className="field">
          <span className="field-label">EMAIL</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span className="field-label">PASSWORD</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
          <span className="field-hint">At least 8 characters, with a letter and a number.</span>
        </label>
        <label className="field">
          <span className="field-label">CONFIRM PASSWORD</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? "Please wait…" : "Continue"}</button>
      </form>
      <div className="auth-links"><Link to="/login">Already have an account? Sign in</Link></div>
    </AuthShell>
  );
}
