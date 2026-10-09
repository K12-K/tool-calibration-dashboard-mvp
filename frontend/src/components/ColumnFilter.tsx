import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { formatDate } from "../utils/date";

export const BLANK = "__BLANK__";

export interface ColumnDef {
  key: string;
  label: string;
  kind: "text" | "date" | "number" | "longtext";
}

interface Props {
  column: ColumnDef;
  sortDir: "asc" | "desc" | null;
  onSort: (dir: "asc" | "desc") => void;
  selected?: string[];
  onApplyValues: (values: string[] | undefined) => void;
  contains?: string;
  onApplyContains: (text: string | undefined) => void;
}

export function formatFilterValue(column: ColumnDef, v: string): string {
  if (v === BLANK) return "(Blanks)";
  if (column.kind === "date") return formatDate(v);
  if (column.key === "frequency_months") return `${v} months`;
  return v;
}

const SORT_LABELS: Record<ColumnDef["kind"], [string, string, "asc" | "desc", "asc" | "desc"]> = {
  // [first label, second label, first dir, second dir]
  text: ["Sort A → Z", "Sort Z → A", "asc", "desc"],
  longtext: ["Sort A → Z", "Sort Z → A", "asc", "desc"],
  date: ["Newest first", "Oldest first", "desc", "asc"],
  number: ["Smallest → Largest", "Largest → Smallest", "asc", "desc"],
};

/** Excel-style header menu: sort + searchable checklist of the column's values. */
export default function ColumnFilter({ column, sortDir, onSort, selected, onApplyValues, contains, onApplyContains }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [containsText, setContainsText] = useState(contains ?? "");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const isChecklist = column.kind !== "longtext";
  const active = Boolean(selected?.length) || Boolean(contains);

  const { data, isLoading } = useQuery({
    queryKey: ["distinct", column.key],
    queryFn: () => api.columnValues(column.key),
    enabled: open && isChecklist,
    staleTime: 0,
  });

  const options = useMemo(() => {
    if (!data) return [] as string[];
    return data.has_blank ? [...data.values, BLANK] : data.values;
  }, [data]);

  // (re)initialise the checklist whenever the popover opens / data arrives
  useEffect(() => {
    if (!open || !data) return;
    setChecked(new Set(selected && selected.length ? selected : options));
  }, [open, data, selected, options]);

  useEffect(() => {
    if (open) setContainsText(contains ?? "");
  }, [open, contains]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 290)), top: r.bottom + 4 });
      setSearch("");
    }
    setOpen((o) => !o);
  };

  const visible = options.filter((o) => formatFilterValue(column, o).toLowerCase().includes(search.trim().toLowerCase()));
  const allVisibleChecked = visible.length > 0 && visible.every((o) => checked.has(o));

  const toggleAllVisible = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      visible.forEach((o) => (allVisibleChecked ? next.delete(o) : next.add(o)));
      return next;
    });
  };

  const toggleOne = (v: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  const apply = () => {
    if (isChecklist) {
      onApplyValues(checked.size === options.length ? undefined : Array.from(checked));
    } else {
      onApplyContains(containsText.trim() || undefined);
    }
    setOpen(false);
  };

  const clear = () => {
    onApplyValues(undefined);
    onApplyContains(undefined);
    setOpen(false);
  };

  const [l1, l2, d1, d2] = SORT_LABELS[column.kind];

  return (
    <>
      <button
        ref={btnRef}
        className={`icon-btn th-filter${active ? " is-active" : ""}`}
        onClick={toggleOpen}
        aria-label={`Filter ${column.label}`}
        title={`Sort / filter ${column.label}`}
      >
        <Filter size={14} />
      </button>
      {open &&
        createPortal(
          <div ref={popRef} className="filter-pop" style={{ left: pos.left, top: pos.top }}>
            <button className={`pop-item${sortDir === d1 ? " is-on" : ""}`} onClick={() => { onSort(d1); setOpen(false); }}>
              {d1 === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {l1}
            </button>
            <button className={`pop-item${sortDir === d2 ? " is-on" : ""}`} onClick={() => { onSort(d2); setOpen(false); }}>
              {d2 === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {l2}
            </button>
            <hr />
            {isChecklist ? (
              <>
                <input
                  className="pop-search"
                  placeholder="Search values…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <div className="pop-list">
                  {isLoading && <div className="muted pad">Loading…</div>}
                  {!isLoading && visible.length === 0 && <div className="muted pad">No values</div>}
                  {visible.length > 0 && (
                    <label className="pop-check">
                      <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllVisible} /> (Select all)
                    </label>
                  )}
                  {visible.map((v) => (
                    <label key={v} className="pop-check">
                      <input type="checkbox" checked={checked.has(v)} onChange={() => toggleOne(v)} />
                      <span>{formatFilterValue(column, v)}</span>
                    </label>
                  ))}
                  {data?.truncated && <div className="muted pad">Showing first 500 values</div>}
                </div>
              </>
            ) : (
              <input
                className="pop-search"
                placeholder="Contains text…"
                value={containsText}
                onChange={(e) => setContainsText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                autoFocus
              />
            )}
            <div className="pop-footer">
              <button className="btn btn-ghost" onClick={clear}>Clear</button>
              <button className="btn btn-primary" onClick={apply} disabled={isChecklist && checked.size === 0}>OK</button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
