import { config } from "../config";

const TOKEN_KEY = "calibration.token";

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = config.apiBaseUrl.replace(/\/$/, "") + path;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toError(res: Response): Promise<ApiError> {
  let message = res.statusText || "Request failed";
  const fields: Record<string, string> = {};
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      const parts: string[] = [];
      for (const d of data.detail) {
        const loc: unknown[] = Array.isArray(d.loc) ? d.loc : [];
        const field = String(loc[loc.length - 1] ?? "");
        const msg = String(d.msg ?? "Invalid value").replace(/^Value error, /, "");
        if (field) fields[field] = msg;
        parts.push(field ? `${field}: ${msg}` : msg);
      }
      message = parts.join("; ");
    }
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 413) message = "File is too large.";
  return new ApiError(res.status, message, fields);
}

function authHeaders(): Record<string, string> {
  const t = tokenStore.get();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders() };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? "GET", headers, body });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    tokenStore.clear();
    window.dispatchEvent(new Event("auth:expired"));
  }
  if (!res.ok) throw await toError(res);
  return res;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function requestBlob(path: string, query?: RequestOptions["query"]): Promise<Blob> {
  const res = await send(path, { query });
  return await res.blob();
}
