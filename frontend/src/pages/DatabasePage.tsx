import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, FilterX, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/endpoints";
import type { Gauge, ListParams } from "../api/types";
import ColumnFilter from "../components/ColumnFilter";
import type { ColumnDef } from "../components/ColumnFilter";
import Pagination from "../components/Pagination";
import StatusBadge, { DaysLeft } from "../components/StatusBadge";
import { formatDate } from "../utils/date";

const COLUMNS: ColumnDef[] = [
  { key: "asset_no", label: "ASSET #", kind: "text" },
  { key: "description", label: "DESCRIPTION", kind: "text" },
  { key: "manufacturer", label: "MANUFACTURER", kind: "text" },
  { key: "serial_number", label: "S/N", kind: "text" },
  { key: "gauge_code", label: "GAUGE CODE", kind: "text" },
  { key: "calibration_date", label: "DATE OF CALIBRATION", kind: "date" },
  { key: "frequency_months", label: "FREQUENCY", kind: "number" },
  { key: "due_date", label: "DUE DATE", kind: "date" },
  { key: "days_left", label: "DAYS LEFT", kind: "number" },
  { key: "status", label: "STATUS", kind: "text" },
  { key: "location", label: "LOCATION", kind: "text" },
  { key: "comments", label: "COMMENTS", kind: "longtext" },
];

const STORAGE_KEY = "calibration.table.v1";
const DEFAULT_STATE: ListParams = {
  page: 1,
  page_size: 25,
  sort_by: "created_at", // newest entries first
  sort_dir: "desc",
  q: "",
  filters: {},
  contains: {},
};

function loadState(): ListParams {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_STATE;
}

function renderCell(col: ColumnDef, g: Gauge) {
  switch (col.key) {
    case "calibration_date":
      return formatDate(g.calibration_date);
    case "due_date":
      return formatDate(g.due_date);
    case "frequency_months":
      return g.frequency_months ? `${g.frequency_months} mo` : "";
    case "days_left":
      return <DaysLeft days={g.days_left} />;
    case "status":
      return <StatusBadge status={g.display_status} />;
    case "comments":
      return <span className="cell-clip" title={g.comments ?? ""}>{g.comments ?? ""}</span>;
    default:
      return (g as unknown as Record<string, string | null>)[col.key] ?? "";
  }
}

export default function DatabasePage() {
  const navigate = useNavigate();
  const [state, setState] = useState<ListParams>(loadState);
  const [qInput, setQInput] = useState(state.q);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // debounce the global search box
  useEffect(() => {
    const t = setTimeout(() => setState((s) => (s.q === qInput ? s : { ...s, q: qInput, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["gauges", state],
    queryFn: () => api.listGauges(state),
    placeholderData: keepPreviousData,
  });

  const activeFilters = Object.keys(state.filters).length + Object.keys(state.contains).length;
  const customSort = !(state.sort_by === DEFAULT_STATE.sort_by && state.sort_dir === DEFAULT_STATE.sort_dir);

  const setSort = (by: string, dir: "asc" | "desc") => setState((s) => ({ ...s, sort_by: by, sort_dir: dir, page: 1 }));
  const setValues = (key: string, values: string[] | undefined) =>
    setState((s) => {
      const filters = { ...s.filters };
      if (values && values.length) filters[key] = values;
      else delete filters[key];
      return { ...s, filters, page: 1 };
    });
  const setContains = (key: string, text: string | undefined) =>
    setState((s) => {
      const contains = { ...s.contains };
      if (text) contains[key] = text;
      else delete contains[key];
      return { ...s, contains, page: 1 };
    });
  const resetAll = () => {
    setQInput("");
    setState({ ...DEFAULT_STATE, page_size: state.page_size });
  };

  return (
    <div className="page">
      <div className="toolbar">
        <Link to="/gauges/new" className="btn btn-primary btn-lg">
          <Plus size={18} /> Add New Entry
        </Link>
        <div className="search-box">
          <Search size={16} />
          <input placeholder="Search all columns…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        {(activeFilters > 0 || customSort || state.q) && (
          <button className="btn btn-ghost" onClick={resetAll}>
            <FilterX size={16} /> Reset{activeFilters > 0 ? ` (${activeFilters} filter${activeFilters > 1 ? "s" : ""})` : ""}
          </button>
        )}
        <span className="muted toolbar-right">{isFetching ? "Updating…" : `${data?.total ?? 0} entries`}</span>
      </div>

      {isError && <div className="alert alert-error">{error instanceof Error ? error.message : "Failed to load"}</div>}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={state.sort_by === c.key ? "sorted" : undefined}>
                  <div className="th-inner">
                    <button
                      className="th-label"
                      onClick={() => setSort(c.key, state.sort_by === c.key && state.sort_dir === "asc" ? "desc" : "asc")}
                      title="Click to sort"
                    >
                      {c.label}
                      {state.sort_by === c.key && <span className="sort-ind">{state.sort_dir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                    <ColumnFilter
                      column={c}
                      sortDir={state.sort_by === c.key ? state.sort_dir : null}
                      onSort={(dir) => setSort(c.key, dir)}
                      selected={state.filters[c.key]}
                      onApplyValues={(v) => setValues(c.key, v)}
                      contains={state.contains[c.key]}
                      onApplyContains={(t) => setContains(c.key, t)}
                    />
                  </div>
                </th>
              ))}
              <th className="sticky-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={COLUMNS.length + 1} className="empty-cell">Loading…</td></tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="empty-cell">
                  No entries found. {activeFilters > 0 || state.q ? "Try clearing the filters." : "Click “Add New Entry” to create the first one."}
                </td>
              </tr>
            )}
            {data?.items.map((g) => (
              <tr key={g.id} className="row-click" onClick={() => navigate(`/gauges/${g.id}/edit`)}>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={c.key === "asset_no" ? "strong" : undefined}>{renderCell(c, g)}</td>
                ))}
                <td className="sticky-right" onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    <Link to={`/gauges/${g.id}`} className="btn btn-outline btn-sm"><Eye size={14} /> View</Link>
                    <Link to={`/gauges/${g.id}/edit`} className="btn btn-primary btn-sm"><Pencil size={14} /> Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={state.page}
        pageSize={state.page_size}
        total={data?.total ?? 0}
        onPage={(page) => setState((s) => ({ ...s, page }))}
        onPageSize={(page_size) => setState((s) => ({ ...s, page_size, page: 1 }))}
      />
    </div>
  );
}
