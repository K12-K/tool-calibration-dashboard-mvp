import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import { addMonths, formatDateTime, formatDuration, toIso } from "../utils/date";

const MAX_MONTHS = 2;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/;

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toIso(d);
}

function rangeError(from: string, to: string): string | null {
  if (!from || !to) return "Select both dates.";
  if (to < from) return "The end date cannot be before the start date.";
  if (to > addMonths(from, MAX_MONTHS)) return `The period cannot be longer than ${MAX_MONTHS} months.`;
  return null;
}

function AddLogModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const gaugesQ = useQuery({ queryKey: ["usage-gauges"], queryFn: api.usageLogGauges });
  const [employeeId, setEmployeeId] = useState("");
  const [asset, setAsset] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const errs: Record<string, string> = {};
    const emp = employeeId.trim();
    if (!emp) errs.employee_id = "Employee ID is required";
    else if (!ID_RE.test(emp)) errs.employee_id = "Letters, numbers, spaces and . _ / - only";
    const gauge = gaugesQ.data?.find((g) => g.asset_no.toLowerCase() === asset.trim().toLowerCase());
    if (!asset.trim()) errs.gauge_id = "Select the gauge that was used";
    else if (!gauge) errs.gauge_id = "No gauge with this Asset #";
    if (!start) errs.start_time = "Start time is required";
    if (!end) errs.end_time = "End time is required";
    if (start && end && new Date(end).getTime() <= new Date(start).getTime()) errs.end_time = "End time must be after the start time";
    setErrors(errs);
    if (Object.keys(errs).length || !gauge) return;

    setBusy(true);
    try {
      await api.createUsageLog({
        employee_id: emp,
        gauge_id: gauge.id,
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ ...err.fields });
        setBanner(err.message);
      } else {
        setBanner("Unexpected error while saving.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add usage log" onClose={onClose}>
      <form onSubmit={submit}>
        {banner && <div className="alert alert-error">{banner}</div>}
        <label className={`field${errors.employee_id ? " has-error" : ""}`}>
          <span className="field-label">EMPLOYEE ID</span>
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} maxLength={50} autoFocus />
          {errors.employee_id && <span className="field-error">{errors.employee_id}</span>}
        </label>
        <label className={`field${errors.gauge_id ? " has-error" : ""}`}>
          <span className="field-label">GAUGE (ASSET #)</span>
          <input list="usage-gauge-options" value={asset} onChange={(e) => setAsset(e.target.value)} placeholder="Type or pick an Asset #" />
          <datalist id="usage-gauge-options">
            {(gaugesQ.data ?? []).map((g) => (
              <option key={g.id} value={g.asset_no}>{g.description ?? ""}</option>
            ))}
          </datalist>
          {errors.gauge_id && <span className="field-error">{errors.gauge_id}</span>}
        </label>
        <label className={`field${errors.start_time ? " has-error" : ""}`}>
          <span className="field-label">START TIME</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          {errors.start_time && <span className="field-error">{errors.start_time}</span>}
        </label>
        <label className={`field${errors.end_time ? " has-error" : ""}`}>
          <span className="field-label">END TIME</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          {errors.end_time && <span className="field-error">{errors.end_time}</span>}
        </label>
        <div className="form-footer">
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Saving…" : "SAVE"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsageLogPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo] = useState<string>(() => toIso(new Date()));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const error = rangeError(from, to);

  const { data, isLoading, isError, error: loadError, isFetching } = useQuery({
    queryKey: ["usage-logs", from, to, page, pageSize],
    queryFn: () => api.listUsageLogs({ date_from: from, date_to: to, page, page_size: pageSize }),
    enabled: error === null,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn btn-primary btn-lg" onClick={() => { setNotice(null); setAdding(true); }}>
          <Plus size={18} /> Add Log
        </button>
        <h2 className="page-title">Usage Log</h2>
        <div className="spacer" />
        <label className="inline-field">
          From
          <input type="date" className="date-input" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="inline-field">
          To
          <input
            type="date"
            className="date-input"
            value={to}
            min={from || undefined}
            max={from ? addMonths(from, MAX_MONTHS) : undefined}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
          />
        </label>
        <span className="muted">{error === null ? (isFetching ? "Updating…" : `${data?.total ?? 0} logs`) : ""}</span>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {isError && error === null && <div className="alert alert-error">{loadError instanceof Error ? loadError.message : "Failed to load"}</div>}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>EMPLOYEE ID</th>
              <th>GAUGE (ASSET #)</th>
              <th>DESCRIPTION</th>
              <th>START TIME</th>
              <th>END TIME</th>
              <th>DURATION</th>
            </tr>
          </thead>
          <tbody>
            {error === null && isLoading && <tr><td colSpan={6} className="empty-cell">Loading…</td></tr>}
            {error === null && !isLoading && data?.items.length === 0 && (
              <tr><td colSpan={6} className="empty-cell">No usage logs in this period.</td></tr>
            )}
            {error === null && data?.items.map((l) => (
              <tr key={l.id}>
                <td className="strong">{l.employee_id}</td>
                <td>{l.asset_no}</td>
                <td>{l.description ?? ""}</td>
                <td>{formatDateTime(l.start_time)}</td>
                <td>{formatDateTime(l.end_time)}</td>
                <td>{formatDuration(l.duration_minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={error === null ? data?.total ?? 0 : 0}
        onPage={setPage}
        onPageSize={(n) => { setPageSize(n); setPage(1); }}
      />
      <p className="hint">Logs are listed latest first by start time. The period can be at most {MAX_MONTHS} months.</p>

      {adding && (
        <AddLogModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setNotice("Usage log added.");
            qc.invalidateQueries({ queryKey: ["usage-logs"] });
          }}
        />
      )}
    </div>
  );
}
