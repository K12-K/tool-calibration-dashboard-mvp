const CLASS_BY_STATUS: Record<string, string> = {
  "CALIBRATED": "st-ok",
  "PAST DUE": "st-bad",
  "OUT OF SERVICE": "st-dark",
  "REFERENCE ONLY": "st-info",
  "MISSING/LOST": "st-lost",
  "OUT FOR CALIBRATION": "st-warn",
};

export default function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  return <span className={`badge ${CLASS_BY_STATUS[status] ?? "st-info"}`}>{status}</span>;
}

export function DaysLeft({ days }: { days: number | null }) {
  if (days === null) return <span className="muted">—</span>;
  const cls = days < 0 ? "days-bad" : days <= 10 ? "days-warn" : "days-ok";
  return <span className={`days ${cls}`}>{days}</span>;
}
