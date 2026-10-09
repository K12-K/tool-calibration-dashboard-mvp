import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/endpoints";
import type { Gauge } from "../api/types";
import StatusBadge, { DaysLeft } from "../components/StatusBadge";
import { formatDate } from "../utils/date";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(name: string, rows: Gauge[]) {
  const header = ["Asset #", "Description", "Manufacturer", "S/N", "Gauge code", "Location", "Status", "Date of calibration", "Due date", "Days left"];
  const lines = rows.map((g) =>
    [g.asset_no, g.description, g.manufacturer, g.serial_number, g.gauge_code, g.location, g.display_status, g.calibration_date, g.due_date, g.days_left]
      .map(csvEscape)
      .join(","),
  );
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function ReportTable({ rows, empty }: { rows: Gauge[]; empty: string }) {
  if (rows.length === 0) return <div className="empty-box">{empty}</div>;
  return (
    <div className="table-wrap report-table">
      <table className="grid">
        <thead>
          <tr>
            <th>ASSET #</th><th>DESCRIPTION</th><th>LOCATION</th><th>STATUS</th><th>DUE DATE</th><th>DAYS LEFT</th><th className="no-print"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td className="strong">{g.asset_no}</td>
              <td>{g.description}</td>
              <td>{g.location}</td>
              <td><StatusBadge status={g.display_status} /></td>
              <td>{formatDate(g.due_date)}</td>
              <td><DaysLeft days={g.days_left} /></td>
              <td className="no-print"><Link className="btn btn-outline btn-sm" to={`/gauges/${g.id}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ORDER = ["CALIBRATED", "PAST DUE", "OUT FOR CALIBRATION", "OUT OF SERVICE", "REFERENCE ONLY", "MISSING/LOST"];
const BAR_CLASS: Record<string, string> = {
  "CALIBRATED": "bar-ok",
  "PAST DUE": "bar-bad",
  "OUT FOR CALIBRATION": "bar-warn",
  "OUT OF SERVICE": "bar-dark",
  "REFERENCE ONLY": "bar-info",
  "MISSING/LOST": "bar-lost",
};

export default function ReportsPage() {
  const optionsQ = useQuery({ queryKey: ["options"], queryFn: api.options, staleTime: Infinity });
  const [days, setDays] = useState<number | null>(null);
  const windowDays = days ?? optionsQ.data?.due_soon_days ?? 10;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["report", windowDays],
    queryFn: () => api.calibrationReport(windowDays),
    enabled: optionsQ.isSuccess,
  });

  if (isError) return <div className="page"><div className="alert alert-error">{error instanceof Error ? error.message : "Failed to load report"}</div></div>;
  if (isLoading || !data) return <div className="page muted">Loading report…</div>;

  const { summary } = data;
  const total = Math.max(summary.total, 1);

  return (
    <div className="page">
      <div className="toolbar">
        <h2 className="page-title">Calibration Reports</h2>
        <span className="muted">As of {formatDate(data.generated_on)}</span>
        <div className="spacer" />
        <label className="inline-field no-print">
          Due within
          <input
            type="number"
            min={1}
            max={365}
            value={windowDays}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= 365) setDays(n);
            }}
          />
          days
        </label>
        <button className="btn btn-outline no-print" onClick={() => window.print()}><Printer size={16} /> Print</button>
      </div>

      <div className="report-grid">
        <section className="panel">
          <div className="panel-head"><h3>CALIBRATION LOG</h3></div>
          <div className="kpis">
            <div className="kpi"><span className="kpi-n">{summary.total}</span><span>Total gauges</span></div>
            <div className="kpi kpi-warn"><span className="kpi-n">{summary.due_soon}</span><span>Due in {data.window_days} days</span></div>
            <div className="kpi kpi-bad"><span className="kpi-n">{summary.past_due}</span><span>Past due</span></div>
          </div>
          <h4 className="sub-head">By status</h4>
          <ul className="bars">
            {ORDER.map((s) => {
              const n = summary.by_status[s] ?? 0;
              return (
                <li key={s}>
                  <span className="bar-label">{s}</span>
                  <span className="bar-track"><span className={`bar-fill ${BAR_CLASS[s]}`} style={{ width: `${(n / total) * 100}%` }} /></span>
                  <span className="bar-n">{n}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="report-stack">
          <section className="panel">
            <div className="panel-head">
              <h3>CALIBRATION DUE IN NEXT {data.window_days} DAYS <span className="muted">({data.due_soon.length})</span></h3>
              <button className="btn btn-ghost no-print" onClick={() => exportCsv("calibration-due-soon", data.due_soon)} disabled={!data.due_soon.length}>
                <Download size={16} /> CSV
              </button>
            </div>
            <ReportTable rows={data.due_soon} empty={`No calibrations due in the next ${data.window_days} days.`} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>PAST DUE CALIBRATION <span className="muted">({data.past_due.length})</span></h3>
              <button className="btn btn-ghost no-print" onClick={() => exportCsv("calibration-past-due", data.past_due)} disabled={!data.past_due.length}>
                <Download size={16} /> CSV
              </button>
            </div>
            <ReportTable rows={data.past_due} empty="Nothing is past due." />
          </section>
        </div>
      </div>
      <p className="hint">Gauges marked OUT OF SERVICE, REFERENCE ONLY or MISSING/LOST are excluded from the due-soon and past-due lists.</p>
    </div>
  );
}
