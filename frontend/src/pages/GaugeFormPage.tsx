import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Attachment, GaugeInput } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { CertificatesPanel, ImagesPanel, checkFiles } from "../components/AttachmentPanels";
import type { Staged } from "../components/AttachmentPanels";
import FilePreview from "../components/FilePreview";
import type { PreviewTarget } from "../components/FilePreview";
import { Brand } from "../components/Layout";
import { DaysLeft } from "../components/StatusBadge";
import { addMonths, daysUntil, formatDate } from "../utils/date";

type Mode = "new" | "view" | "edit";

interface FormState {
  asset_no: string;
  description: string;
  manufacturer: string;
  serial_number: string;
  gauge_code: string;
  calibration_date: string;
  frequency_months: string;
  status: string;
  location: string;
  comments: string;
}

const EMPTY: FormState = {
  asset_no: "",
  description: "",
  manufacturer: "",
  serial_number: "",
  gauge_code: "",
  calibration_date: "",
  frequency_months: "",
  status: "CALIBRATED",
  location: "",
  comments: "",
};

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/;
const FREQ_PRESETS = [1, 3, 6, 12, 24, 36];

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.asset_no.trim()) e.asset_no = "Asset # is required";
  else if (!ID_RE.test(f.asset_no.trim())) e.asset_no = "Letters, numbers, spaces and . _ / - only";
  if (f.serial_number.trim() && !ID_RE.test(f.serial_number.trim())) e.serial_number = "Letters, numbers, spaces and . _ / - only";
  const freq = f.frequency_months.trim();
  if (freq) {
    const n = Number(freq);
    if (!Number.isInteger(n) || n < 1 || n > 240) e.frequency_months = "Whole months, 1 to 240";
  }
  if (freq && !f.calibration_date) e.calibration_date = "Required when a frequency is set";
  if (f.calibration_date && !freq && !e.frequency_months) e.frequency_months = "Required to calculate the due date";
  return e;
}

function toInput(f: FormState): GaugeInput {
  const t = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    asset_no: f.asset_no.trim(),
    description: t(f.description),
    manufacturer: t(f.manufacturer),
    serial_number: t(f.serial_number),
    gauge_code: t(f.gauge_code),
    calibration_date: f.calibration_date || null,
    frequency_months: f.frequency_months.trim() ? Number(f.frequency_months) : null,
    status: f.status,
    location: t(f.location),
    comments: t(f.comments),
  };
}

function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className={`field${error ? " has-error" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function GaugeFormPage({ mode }: { mode: Mode }) {
  const { id } = useParams();
  const gaugeId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const readOnly = mode === "view";

  const optionsQ = useQuery({ queryKey: ["options"], queryFn: api.options, staleTime: Infinity });
  const gaugeQ = useQuery({
    queryKey: ["gauge", gaugeId],
    queryFn: () => api.getGauge(gaugeId as number),
    enabled: gaugeId !== undefined,
    refetchOnWindowFocus: false,
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [stagedImages, setStagedImages] = useState<Staged[]>([]);
  const [stagedCerts, setStagedCerts] = useState<Staged[]>([]);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const [certErrors, setCertErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const notice = (location.state as { notice?: string; warning?: string } | null) ?? null;

  useEffect(() => {
    const g = gaugeQ.data;
    if (!g) return;
    setForm({
      asset_no: g.asset_no,
      description: g.description ?? "",
      manufacturer: g.manufacturer ?? "",
      serial_number: g.serial_number ?? "",
      gauge_code: g.gauge_code ?? "",
      calibration_date: g.calibration_date ?? "",
      frequency_months: g.frequency_months ? String(g.frequency_months) : "",
      status: g.status,
      location: g.location ?? "",
      comments: g.comments ?? "",
    });
  }, [gaugeQ.data]);

  const limits = optionsQ.data?.limits;
  const existingImages: Attachment[] = useMemo(
    () => (gaugeQ.data?.attachments ?? []).filter((a) => a.kind === "image" && !removed.has(a.id)),
    [gaugeQ.data, removed],
  );
  const existingCerts: Attachment[] = useMemo(
    () => (gaugeQ.data?.attachments ?? []).filter((a) => a.kind === "certificate" && !removed.has(a.id)),
    [gaugeQ.data, removed],
  );

  const freqN = /^\d+$/.test(form.frequency_months.trim()) ? Number(form.frequency_months) : null;
  const dueDate = form.calibration_date && freqN ? addMonths(form.calibration_date, freqN) : null;
  const daysLeft = dueDate ? daysUntil(dueDate) : null;
  const overdueHint = form.status === "CALIBRATED" && daysLeft !== null && daysLeft < 0;

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((er) => {
      if (!er[key]) return er;
      const next = { ...er };
      delete next[key];
      return next;
    });
  };

  const addFiles = (kind: "image" | "certificate") => (files: File[]) => {
    if (!limits) return;
    const isImage = kind === "image";
    const count = isImage ? existingImages.length + stagedImages.length : existingCerts.length + stagedCerts.length;
    const { accepted, errors: errs } = checkFiles(files, kind, count, isImage ? limits.max_images : limits.max_certificates, limits.max_upload_bytes);
    const staged = accepted.map((file) => ({ key: newKey(), file }));
    if (isImage) {
      setStagedImages((s) => [...s, ...staged]);
      setImageErrors(errs);
    } else {
      // newest certificate first, so it becomes the "current" one
      setStagedCerts((s) => [...staged.reverse(), ...s]);
      setCertErrors(errs);
    }
  };

  const previewExisting = (a: Attachment) =>
    setPreview({ title: a.original_name, fileName: a.original_name, contentType: a.content_type, attachmentId: a.id });
  const previewStaged = (s: Staged) =>
    setPreview({ title: s.file.name, fileName: s.file.name, contentType: s.file.type || "application/octet-stream", file: s.file });

  const onSave = async () => {
    setBanner(null);
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) {
      setBanner("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = mode === "new" ? await api.createGauge(toInput(form)) : await api.updateGauge(gaugeId as number, toInput(form));
      const failures: string[] = [];
      for (const attId of removed) {
        try {
          await api.deleteAttachment(attId);
        } catch (e) {
          failures.push(`Could not delete a file: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      // upload oldest certificate first so the newest ends up as "current"
      for (const s of [...stagedCerts].reverse()) {
        try {
          await api.uploadAttachment(saved.id, "certificate", s.file);
        } catch (e) {
          failures.push(`${s.file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        }
      }
      for (const s of stagedImages) {
        try {
          await api.uploadAttachment(saved.id, "image", s.file);
        } catch (e) {
          failures.push(`${s.file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        }
      }
      qc.removeQueries({ queryKey: ["gauge", saved.id] });
      await qc.invalidateQueries({ queryKey: ["gauges"] });
      await qc.invalidateQueries({ queryKey: ["distinct"] });
      await qc.invalidateQueries({ queryKey: ["report"] });
      if (failures.length) {
        navigate(`/gauges/${saved.id}/edit`, { replace: true, state: { warning: `Entry saved, but some files failed: ${failures.join(" | ")}` } });
      } else {
        navigate(`/gauges/${saved.id}`, { replace: true, state: { notice: "Entry saved successfully." } });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const fieldErrs = { ...e.fields };
        if (e.status === 409 && /asset/i.test(e.message)) fieldErrs.asset_no = "This Asset # already exists";
        setErrors(fieldErrs);
        setBanner(e.message);
      } else {
        setBanner("Unexpected error while saving.");
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!gaugeId) return;
    if (!window.confirm(`Delete asset ${form.asset_no} and all its files? This cannot be undone.`)) return;
    try {
      await api.deleteGauge(gaugeId);
      qc.removeQueries({ queryKey: ["gauge", gaugeId] });
      await qc.invalidateQueries({ queryKey: ["gauges"] });
      await qc.invalidateQueries({ queryKey: ["report"] });
      navigate("/", { replace: true });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (gaugeId !== undefined && gaugeQ.isLoading) return <div className="page muted">Loading…</div>;
  if (gaugeId !== undefined && gaugeQ.isError) {
    return (
      <div className="page">
        <div className="alert alert-error">{gaugeQ.error instanceof Error ? gaugeQ.error.message : "Could not load the entry"}</div>
        <Link to="/" className="btn btn-outline"><ArrowLeft size={16} /> Back to database</Link>
      </div>
    );
  }
  if (!optionsQ.data) return <div className="page muted">Loading…</div>;
  const opts = optionsQ.data;
  const dis = readOnly || saving;

  return (
    <div className="page form-page">
      <div className="form-top">
        <Link to="/" className="btn btn-ghost"><ArrowLeft size={16} /> Back to database</Link>
        <span className="mode-chip">{mode === "new" ? "New entry" : mode === "view" ? "View" : "Editing"}</span>
        <div className="spacer" />
        {mode === "view" && gaugeId && (
          <Link to={`/gauges/${gaugeId}/edit`} className="btn btn-primary"><Pencil size={16} /> Edit</Link>
        )}
      </div>

      <div className="form-banner">
        <Brand />
        <h2>ASSET ID # {form.asset_no || "—"} &nbsp;GAUGE DETAILS</h2>
      </div>

      {notice?.notice && <div className="alert alert-success">{notice.notice}</div>}
      {notice?.warning && <div className="alert alert-error">{notice.warning}</div>}
      {banner && <div className="alert alert-error">{banner}</div>}

      <div className="form-card">
        <div className="form-grid">
          <div className="form-col">
            <Field label="ASSET #" error={errors.asset_no}>
              <input value={form.asset_no} onChange={set("asset_no")} disabled={dis} maxLength={100} placeholder="e.g. CAL-0001" />
            </Field>
            <Field label="DESCRIPTION" error={errors.description}>
              <input value={form.description} onChange={set("description")} disabled={dis} maxLength={500} />
            </Field>
            <Field label="MANUFACTURER" error={errors.manufacturer}>
              <input value={form.manufacturer} onChange={set("manufacturer")} disabled={dis} maxLength={200} />
            </Field>
            <Field label="S/N" error={errors.serial_number}>
              <input value={form.serial_number} onChange={set("serial_number")} disabled={dis} maxLength={100} />
            </Field>
            <Field label="GAUGE CODE" error={errors.gauge_code}>
              <input value={form.gauge_code} onChange={set("gauge_code")} disabled={dis} maxLength={100} />
            </Field>
            <Field label="LOCATION" error={errors.location}>
              <select value={form.location} onChange={set("location")} disabled={dis}>
                <option value="">— Select —</option>
                {opts.locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          </div>

          <div className="form-col">
            <Field label="STATUS" error={errors.status}>
              <select value={form.status} onChange={set("status")} disabled={dis}>
                {opts.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="DATE OF CALIBRATION" error={errors.calibration_date}>
              <input type="date" value={form.calibration_date} onChange={set("calibration_date")} disabled={dis} min="2000-01-01" max="2100-12-31" />
            </Field>
            <Field label="FREQUENCY (MONTHS)" error={errors.frequency_months} hint="Choose a preset or type a number of months">
              <input type="number" min={1} max={240} step={1} list="freq-presets" value={form.frequency_months} onChange={set("frequency_months")} disabled={dis} />
              <datalist id="freq-presets">{FREQ_PRESETS.map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field label="DUE DATE" hint="Auto calculated: date of calibration + frequency">
              <input value={dueDate ? formatDate(dueDate) : ""} readOnly disabled className="auto" placeholder="—" />
            </Field>
            <Field label="DAYS LEFT" hint="AUTO CALCULATED READ ONLY FIELD">
              <div className="auto-box"><DaysLeft days={daysLeft} /></div>
            </Field>
            {overdueHint && (
              <div className="alert alert-warn">
                The due date has passed, so this gauge shows as <strong>PAST DUE</strong> in the table until a new calibration date is saved.
              </div>
            )}
          </div>
        </div>

        <CertificatesPanel
          readOnly={readOnly}
          max={limits?.max_certificates ?? 3}
          maxBytes={limits?.max_upload_bytes ?? 3 * 1024 * 1024}
          existing={existingCerts}
          staged={stagedCerts}
          errors={certErrors}
          onAdd={addFiles("certificate")}
          onRemoveExisting={(aid) => setRemoved((r) => new Set(r).add(aid))}
          onRemoveStaged={(key) => setStagedCerts((s) => s.filter((x) => x.key !== key))}
          onPreviewExisting={previewExisting}
          onPreviewStaged={previewStaged}
        />

        <Field label="COMMENTS" error={errors.comments}>
          <textarea rows={4} value={form.comments} onChange={set("comments")} disabled={dis} maxLength={5000} />
        </Field>

        <ImagesPanel
          readOnly={readOnly}
          max={limits?.max_images ?? 5}
          maxBytes={limits?.max_upload_bytes ?? 3 * 1024 * 1024}
          existing={existingImages}
          staged={stagedImages}
          errors={imageErrors}
          onAdd={addFiles("image")}
          onRemoveExisting={(aid) => setRemoved((r) => new Set(r).add(aid))}
          onRemoveStaged={(key) => setStagedImages((s) => s.filter((x) => x.key !== key))}
          onPreviewExisting={previewExisting}
          onPreviewStaged={previewStaged}
        />

        {!readOnly && (
          <div className="form-footer">
            {mode === "edit" && user?.role === "admin" && (
              <button type="button" className="btn btn-danger" onClick={onDelete} disabled={saving}>
                <Trash2 size={16} /> Delete entry
              </button>
            )}
            <div className="spacer" />
            <Link to={mode === "edit" && gaugeId ? `/gauges/${gaugeId}` : "/"} className="btn btn-ghost">Cancel</Link>
            <button type="button" className="btn btn-primary btn-lg" onClick={onSave} disabled={saving}>
              <Save size={18} /> {saving ? "Saving…" : "SAVE"}
            </button>
          </div>
        )}
      </div>

      {preview && <FilePreview target={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
