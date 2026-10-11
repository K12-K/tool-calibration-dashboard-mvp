import { ChevronDown, ChevronUp, Download, Eye, FileText, ImagePlus, Star, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "../api/endpoints";
import type { Attachment } from "../api/types";
import { formatBytes, formatDateTime } from "../utils/date";
import { isLatest } from "../utils/certTags";
import { downloadAttachment } from "./FilePreview";

export interface Staged {
  key: string;
  file: File;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Client-side checks (the server re-validates everything). */
export function checkFiles(
  files: File[],
  kind: "image" | "certificate",
  currentCount: number,
  max: number,
  maxBytes: number,
): { accepted: File[]; errors: string[] } {
  const accepted: File[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (kind === "image" && !IMAGE_TYPES.includes(f.type)) {
      errors.push(`${f.name}: only JPG, PNG, GIF or WEBP images are allowed.`);
    } else if (kind === "certificate" && !(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) {
      errors.push(`${f.name}: only PDF files are allowed.`);
    } else if (f.size > maxBytes) {
      errors.push(`${f.name}: ${formatBytes(f.size)} is larger than the ${formatBytes(maxBytes)} limit.`);
    } else if (currentCount + accepted.length >= max) {
      errors.push(`${f.name}: limit of ${max} reached.`);
    } else {
      accepted.push(f);
    }
  }
  return { accepted, errors };
}

function Thumb({ attachmentId, file, alt }: { attachmentId?: number; file?: File; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = file ?? (await api.attachmentBlob(attachmentId as number));
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        /* leave placeholder */
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId, file]);
  return url ? <img src={url} alt={alt} /> : <div className="thumb-ph">…</div>;
}

interface CommonProps {
  readOnly: boolean;
  max: number;
  maxBytes: number;
  existing: Attachment[]; // already filtered for removed ones
  staged: Staged[];
  errors: string[];
  onAdd: (files: File[]) => void;
  onRemoveExisting: (id: number) => void;
  onRemoveStaged: (key: string) => void;
  onPreviewExisting: (a: Attachment) => void;
  onPreviewStaged: (s: Staged) => void;
}

function useFilePicker(onAdd: (files: File[]) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = ""; // allow picking the same file again
    if (files.length) onAdd(files);
  };
  return { ref, onChange, open: () => ref.current?.click() };
}

export function ImagesPanel(p: CommonProps) {
  const picker = useFilePicker(p.onAdd);
  const total = p.existing.length + p.staged.length;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>IMAGES <span className="muted">({total}/{p.max})</span></h3>
        {!p.readOnly && (
          <>
            <input ref={picker.ref} type="file" hidden multiple accept="image/jpeg,image/png,image/gif,image/webp,image/*" onChange={picker.onChange} />
            <button type="button" className="btn btn-outline" onClick={picker.open} disabled={total >= p.max}>
              <ImagePlus size={16} /> Upload images
            </button>
          </>
        )}
      </div>
      {!p.readOnly && <p className="hint">Up to {p.max} images, each max {formatBytes(p.maxBytes)} (JPG, PNG, GIF, WEBP).</p>}
      {p.errors.map((e) => <div key={e} className="alert alert-error">{e}</div>)}
      {total === 0 && <div className="empty-box">No images</div>}
      <div className="thumb-grid">
        {p.staged.map((s) => (
          <figure key={s.key} className="thumb">
            <button type="button" className="thumb-btn" onClick={() => p.onPreviewStaged(s)} title="Click to enlarge">
              <Thumb file={s.file} alt={s.file.name} />
            </button>
            <figcaption><span className="badge st-info">New</span> {s.file.name}</figcaption>
            {!p.readOnly && (
              <button type="button" className="icon-btn thumb-del" onClick={() => p.onRemoveStaged(s.key)} aria-label="Remove"><Trash2 size={14} /></button>
            )}
          </figure>
        ))}
        {p.existing.map((a) => (
          <figure key={a.id} className="thumb">
            <button type="button" className="thumb-btn" onClick={() => p.onPreviewExisting(a)} title="Click to enlarge">
              <Thumb attachmentId={a.id} alt={a.original_name} />
            </button>
            <figcaption>{a.original_name}</figcaption>
            <div className="thumb-actions">
              <button type="button" className="icon-btn" onClick={() => downloadAttachment(a.id, a.original_name)} aria-label="Download"><Download size={14} /></button>
              {!p.readOnly && (
                <button type="button" className="icon-btn" onClick={() => p.onRemoveExisting(a.id)} aria-label="Delete"><Trash2 size={14} /></button>
              )}
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}

export interface CertItem {
  key: string; // "a:<id>" for saved files, "s:<key>" for files not saved yet
  name: string;
  size: number;
  uploadedAt?: string;
  attachmentId?: number;
  file?: File;
}

interface CertPanelProps {
  readOnly: boolean;
  max: number;
  maxBytes: number;
  items: CertItem[]; // already in display order
  tags: Record<string, string>;
  errors: string[];
  onAdd: (files: File[]) => void;
  onTagChange: (key: string, value: string) => void;
  onMakeLatest: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onRemove: (key: string) => void;
  onPreview: (key: string) => void;
}

export function CertificatesPanel(p: CertPanelProps) {
  const picker = useFilePicker(p.onAdd);
  const total = p.items.length;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>CURRENT CALIBRATION CERT <span className="muted">({total}/{p.max})</span></h3>
        {!p.readOnly && (
          <>
            <input ref={picker.ref} type="file" hidden multiple accept="application/pdf,.pdf" onChange={picker.onChange} />
            <button type="button" className="btn btn-outline" onClick={picker.open} disabled={total >= p.max}>
              <Upload size={16} /> Upload PDF
            </button>
          </>
        )}
      </div>
      {!p.readOnly && (
        <p className="hint">
          Keeps the last {p.max} certificates, PDF only, each max {formatBytes(p.maxBytes)}. Give each PDF a tag; the
          LATEST CERT tag can be on one PDF only and can be moved to any PDF. Use the arrows to change the order.
        </p>
      )}
      {p.errors.map((e) => <div key={e} className="alert alert-error">{e}</div>)}
      {total === 0 && <div className="empty-box">No certificate uploaded</div>}
      <ul className="file-list">
        {p.items.map((it, i) => {
          const tag = p.tags[it.key] ?? "";
          const latest = isLatest(tag);
          return (
            <li key={it.key}>
              <FileText size={18} />
              <div className="file-meta">
                <strong>{it.name}</strong>
                <span className="muted">
                  {formatBytes(it.size)} · {it.uploadedAt ? formatDateTime(it.uploadedAt) : "not saved yet"}
                </span>
              </div>
              {p.readOnly ? (
                tag.trim() ? <span className={`badge ${latest ? "st-ok" : "st-info"}`}>{tag.trim()}</span> : <span className="muted">No tag</span>
              ) : (
                <div className="tag-cell">
                  <input
                    className={`tag-input${latest ? " is-latest" : ""}`}
                    value={tag}
                    maxLength={100}
                    placeholder="Tag (e.g. 2025 cert)"
                    aria-label="Certificate tag"
                    onChange={(e) => p.onTagChange(it.key, e.target.value)}
                  />
                  {!latest && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => p.onMakeLatest(it.key)} title="Move the LATEST CERT tag to this PDF">
                      <Star size={14} /> Make LATEST CERT
                    </button>
                  )}
                </div>
              )}
              {!p.readOnly && (
                <>
                  <button type="button" className="icon-btn" onClick={() => p.onMove(it.key, -1)} disabled={i === 0} aria-label="Move up" title="Move up"><ChevronUp size={16} /></button>
                  <button type="button" className="icon-btn" onClick={() => p.onMove(it.key, 1)} disabled={i === p.items.length - 1} aria-label="Move down" title="Move down"><ChevronDown size={16} /></button>
                </>
              )}
              <button type="button" className="icon-btn" onClick={() => p.onPreview(it.key)} aria-label="View"><Eye size={16} /></button>
              {it.attachmentId !== undefined && (
                <button type="button" className="icon-btn" onClick={() => downloadAttachment(it.attachmentId as number, it.name)} aria-label="Download"><Download size={16} /></button>
              )}
              {!p.readOnly && <button type="button" className="icon-btn" onClick={() => p.onRemove(it.key)} aria-label="Delete"><Trash2 size={16} /></button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
