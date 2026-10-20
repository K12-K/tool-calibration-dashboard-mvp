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
import type { CertItem, Staged } from "../components/AttachmentPanels";
import FilePreview from "../components/FilePreview";
import type { PreviewTarget } from "../components/FilePreview";
import { Brand } from "../components/Layout";
import { DaysLeft } from "../components/StatusBadge";
import { LATEST_TAG, isLatest, normalizeTag } from "../utils/certTags";
import { addDays, daysUntil, formatDate } from "../utils/date";

type Mode = "new" | "view" | "edit";

interface FormState {
  asset_no: string;
  description: string;
  manufacturer: string;
  serial_number: string;
  gauge_code: string;
  calibration_date: string;
  frequency_days: string;
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
  frequency_days: "",
  status: "CALIBRATED",
  location: "",
  comments: "",
};

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/;
const HIDDEN_STATUSES = ["PAST DUE"]; // shown automatically from the due date, not picked by hand
const FREQ_PRESETS = [30, 90, 180, 365, 730, 1095];

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.asset_no.trim()) e.asset_no = "Asset # is required";
  else if (!ID_RE.test(f.asset_no.trim())) e.asset_no = "Letters, numbers, spaces and . _ / - only";
  if (f.serial_number.trim() && !ID_RE.test(f.serial_number.trim())) e.serial_number = "Letters, numbers, spaces and . _ / - only";
  if (f.status !== "CALIBRATED") return e; // calibration fields are not used for other statuses
  const freq = f.frequency_days.trim();
  if (freq) {
    const n = Number(freq);
    if (!Number.isInteger(n) || n < 1 || n > 3650) e.frequency_days = "Whole days, 1 to 3650";
  }
  if (freq && !f.calibration_date) e.calibration_date = "Required when a frequency is set";
  if (f.calibration_date && !freq && !e.frequency_days) e.frequency_days = "Required to calculate the due date";
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
    calibration_date: f.status === "CALIBRATED" && f.calibration_date ? f.calibration_date : null,
    frequency_days: f.status === "CALIBRATED" && f.frequency_days.trim() ? Number(f.frequency_days) : null,
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
  const [stagedTool, setStagedTool] = useState<Staged[]>([]);
  const [stagedCerts, setStagedCerts] = useState<Staged[]>([]);
  const [certOrder, setCertOrder] = useState<string[]>([]); // display order, keys "a:<id>" / "s:<key>"
  const [certTags, setCertTags] = useState<Record<string, string>>({});
  const [toolErrors, setToolErrors] = useState<string[]>([]);
  const [certErrors, setCertErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const notice = (location.state as { notice?: string; warning?: string } | null) ?? null;

  useEffect(() => {
    const g = gaugeQ.data;
    if (!g) return;
    const calibrated = HIDDEN_STATUSES.includes(g.status) || g.status === "CALIBRATED"; // legacy PAST DUE counts as CALIBRATED
    setForm({
      asset_no: g.asset_no,
      description: g.description ?? "",
      manufacturer: g.manufacturer ?? "",
      serial_number: g.serial_number ?? "",
      gauge_code: g.gauge_code ?? "",
      calibration_date: calibrated ? g.calibration_date ?? "" : "",
      frequency_days: calibrated && g.frequency_days ? String(g.frequency_days) : "",
      status: HIDDEN_STATUSES.includes(g.status) ? "CALIBRATED" : g.status, // legacy entries saved as PAST DUE
      location: g.location ?? "",
      comments: g.comments ?? "",
    });
    const certs = g.attachments.filter((a) => a.kind === "certificate");
    setCertOrder(certs.map((a) => `a:${a.id}`));
    setCertTags(Object.fromEntries(certs.map((a) => [`a:${a.id}`, a.tag ?? ""])));
  }, [gaugeQ.data]);

  const limits = optionsQ.data?.limits;
  const existingTool: Attachment[] = useMemo(
    () => (gaugeQ.data?.attachments ?? []).filter((a) => a.kind === "tool_image" && !removed.has(a.id)),
    [gaugeQ.data, removed],
  );
  const certItems: CertItem[] = useMemo(
    () =>
      certOrder.flatMap((key): CertItem[] => {
        if (key.startsWith("a:")) {
          const a = gaugeQ.data?.attachments.find((x) => x.id === Number(key.slice(2)));
          return a ? [{ key, name: a.original_name, size: a.size_bytes, uploadedAt: a.uploaded_at, attachmentId: a.id }] : [];
        }
        const s = stagedCerts.find((x) => `s:${x.key}` === key);
        return s ? [{ key, name: s.file.name, size: s.file.size, file: s.file }] : [];
      }),
    [certOrder, gaugeQ.data, stagedCerts],
  );

  const freqN = /^\d+$/.test(form.frequency_days.trim()) ? Number(form.frequency_days) : null;
  const dueDate = form.calibration_date && freqN ? addDays(form.calibration_date, freqN) : null;
  const daysLeft = dueDate ? daysUntil(dueDate) : null;
  const notCalibrated = form.status !== "CALIBRATED"; // date, frequency and due date only apply to CALIBRATED
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

  const changeStatus = (e: ChangeEvent<HTMLSelectElement>) => {
    const status = e.target.value;
    setForm((f) => (status === "CALIBRATED" ? { ...f, status } : { ...f, status, calibration_date: "", frequency_days: "" }));
    setErrors((er) => {
      const next = { ...er };
      delete next.status;
      if (status !== "CALIBRATED") {
        delete next.calibration_date;
        delete next.frequency_days;
      }
      return next;
    });
  };

  const addFiles = (kind: "tool_image" | "certificate") => (files: File[]) => {
    if (!limits) return;
    if (kind === "tool_image") {
      const { accepted, errors: errs } = checkFiles(files, "image", existingTool.length + stagedTool.length, limits.max_tool_images, limits.max_upload_bytes);
      setStagedTool((s) => [...s, ...accepted.map((file) => ({ key: newKey(), file }))]);
      setToolErrors(errs);
      return;
    }
    const { accepted, errors: errs } = checkFiles(files, "certificate", certOrder.length, limits.max_certificates, limits.max_upload_bytes);
    const staged = accepted.map((file) => ({ key: newKey(), file }));
    setStagedCerts((s) => [...staged, ...s]);
    if (staged.length) {
      const keys = staged.map((s) => `s:${s.key}`);
      setCertOrder((o) => [...keys, ...o]);
      // a newly added PDF gets LATEST CERT by default (taken from the previous holder); the tag can be edited before saving
      setCertTags((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (isLatest(next[k])) next[k] = "";
        });
        keys.forEach((k, i) => {
          next[k] = i === 0 ? LATEST_TAG : "";
        });
        return next;
      });
    }
    setCertErrors(errs);
  };

  const previewExisting = (a: Attachment) =>
    setPreview({ title: a.original_name, fileName: a.original_name, contentType: a.content_type, attachmentId: a.id });
  const previewStaged = (s: Staged) =>
    setPreview({ title: s.file.name, fileName: s.file.name, contentType: s.file.type || "application/octet-stream", file: s.file });

  const changeCertTag = (key: string, value: string) =>
    setCertTags((prev) => {
      const next = { ...prev, [key]: value };
      if (isLatest(value)) {
        // LATEST CERT can be on one PDF only
        Object.keys(next).forEach((k) => {
          if (k !== key && isLatest(next[k])) next[k] = "";
        });
      }
      return next;
    });

  const moveCert = (key: string, dir: -1 | 1) =>
    setCertOrder((o) => {
      const i = o.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const removeCert = (key: string) => {
    if (key.startsWith("a:")) setRemoved((r) => new Set(r).add(Number(key.slice(2))));
    else setStagedCerts((s) => s.filter((x) => `s:${x.key}` !== key));
    setCertOrder((o) => o.filter((k) => k !== key));
  };

  const previewCert = (key: string) => {
    const it = certItems.find((c) => c.key === key);
    if (!it) return;
    if (it.attachmentId !== undefined) {
      setPreview({ title: it.name, fileName: it.name, contentType: "application/pdf", attachmentId: it.attachmentId });
    } else if (it.file) {
      setPreview({ title: it.name, fileName: it.name, contentType: "application/pdf", file: it.file });
    }
  };

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
      // certificates: upload new PDFs with their tag, save changed tags, then store the order.
      // The PDF holding LATEST CERT is written last so the server never sees two holders.
      const idByKey: Record<string, number> = {};
      const certOps = certOrder.map((key) => {
        const tag = normalizeTag(certTags[key]);
        const latest = tag === LATEST_TAG;
        if (key.startsWith("a:")) {
          const attId = Number(key.slice(2));
          idByKey[key] = attId;
          const original = normalizeTag(gaugeQ.data?.attachments.find((a) => a.id === attId)?.tag);
          const name = gaugeQ.data?.attachments.find((a) => a.id === attId)?.original_name ?? "certificate";
          return { latest, name, run: original === tag ? null : () => api.updateAttachmentTag(attId, tag).then(() => undefined) };
        }
        const s = stagedCerts.find((x) => `s:${x.key}` === key);
        const run = s
          ? async () => {
            const att = await api.uploadAttachment(saved.id, "certificate", s.file, tag);
            idByKey[key] = att.id;
          }
          : null;
        return { latest, name: s?.file.name ?? "certificate", run };
      });
      for (const op of [...certOps].sort((a, b) => Number(a.latest) - Number(b.latest))) {
        if (!op.run) continue;
        try {
          await op.run();
        } catch (e) {
          failures.push(`${op.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        }
      }
      const finalIds = certOrder.map((k) => idByKey[k]).filter((v): v is number => v !== undefined);
      const initialIds = (gaugeQ.data?.attachments ?? [])
        .filter((a) => a.kind === "certificate" && !removed.has(a.id))
        .map((a) => a.id);
      if (finalIds.length > 0 && (stagedCerts.length > 0 || finalIds.join(",") !== initialIds.join(","))) {
        try {
          await api.reorderCertificates(saved.id, finalIds);
        } catch (e) {
          failures.push(`Certificate order: ${e instanceof Error ? e.message : "could not be saved"}`);
        }
      }
      for (const s of stagedTool) {
        try {
          await api.uploadAttachment(saved.id, "tool_image", s.file);
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
        navigate("/", { replace: true, state: { notice: `Entry ${saved.asset_no} saved successfully.` } });
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
              <select value={form.status} onChange={changeStatus} disabled={dis}>
                {opts.statuses.filter((s) => !HIDDEN_STATUSES.includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="DATE OF CALIBRATION" error={errors.calibration_date} hint={notCalibrated ? "Only used when STATUS is CALIBRATED" : undefined}>
              <input type="date" value={form.calibration_date} onChange={set("calibration_date")} disabled={dis || notCalibrated} min="2000-01-01" max="2100-12-31" />
            </Field>
            <Field label="FREQUENCY (DAYS)" error={errors.frequency_days} hint={notCalibrated ? "Only used when STATUS is CALIBRATED" : "Choose a preset or type a number of days"}>
              <input type="number" min={1} max={3650} step={1} list="freq-presets" value={form.frequency_days} onChange={set("frequency_days")} disabled={dis || notCalibrated} />
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
            <ImagesPanel
              title="TOOL/EQUIPMENT IMAGE"
              uploadLabel="Upload image"
              emptyText="No tool/equipment image"
              single
              readOnly={readOnly}
              max={limits?.max_tool_images ?? 1}
              maxBytes={limits?.max_upload_bytes ?? 3 * 1024 * 1024}
              existing={existingTool}
              staged={stagedTool}
              errors={toolErrors}
              onAdd={addFiles("tool_image")}
              onRemoveExisting={(aid) => setRemoved((r) => new Set(r).add(aid))}
              onRemoveStaged={(key) => setStagedTool((s) => s.filter((x) => x.key !== key))}
              onPreviewExisting={previewExisting}
              onPreviewStaged={previewStaged}
            />
          </div>
        </div>

        <CertificatesPanel
          readOnly={readOnly}
          max={limits?.max_certificates ?? 3}
          maxBytes={limits?.max_upload_bytes ?? 3 * 1024 * 1024}
          items={certItems}
          tags={certTags}
          errors={certErrors}
          onAdd={addFiles("certificate")}
          onTagChange={changeCertTag}
          onMakeLatest={(key) => changeCertTag(key, LATEST_TAG)}
          onMove={moveCert}
          onRemove={removeCert}
          onPreview={previewCert}
        />

        <Field label="COMMENTS" error={errors.comments}>
          <textarea rows={4} value={form.comments} onChange={set("comments")} disabled={dis} maxLength={5000} />
        </Field>

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
