import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/endpoints";
import Modal from "./Modal";

export interface PreviewTarget {
  title: string;
  fileName: string;
  contentType: string; // "application/pdf" or "image/*"
  /** either a server attachment id (fetched with auth) or a local File (not saved yet) */
  attachmentId?: number;
  file?: File;
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadAttachment(id: number, fileName: string) {
  saveBlob(await api.attachmentBlob(id, true), fileName);
}

/** Pop-up viewer: PDFs in an embedded viewer, images full size. Has a Download button. */
export default function FilePreview({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPdf = target.contentType === "application/pdf";

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const blob = target.file ?? (await api.attachmentBlob(target.attachmentId as number));
        const typed = blob.type ? blob : new Blob([blob], { type: target.contentType });
        objectUrl = URL.createObjectURL(typed);
        if (!revoked) setUrl(objectUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load file");
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target]);

  const download = async () => {
    if (target.file) saveBlob(target.file, target.fileName);
    else if (target.attachmentId !== undefined) await downloadAttachment(target.attachmentId, target.fileName);
  };

  return (
    <Modal
      title={target.title}
      onClose={onClose}
      wide
      actions={
        <button className="btn btn-primary" onClick={download}>
          <Download size={16} /> Download
        </button>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      {!url && !error && <div className="muted">Loading…</div>}
      {url && isPdf && <iframe className="pdf-frame" src={url} title={target.fileName} />}
      {url && !isPdf && <img className="preview-img" src={url} alt={target.fileName} />}
    </Modal>
  );
}
