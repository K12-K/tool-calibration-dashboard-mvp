import { request, requestBlob } from "./client";
import type {
  Attachment,
  CalibrationReport,
  ColumnValues,
  GaugeDetail,
  GaugeInput,
  GaugeList,
  ListParams,
  Options,
  RegisterResult,
  TokenResult,
  User,
} from "./types";

export const api = {
  // auth
  register: (email: string, password: string, full_name: string) =>
    request<RegisterResult>("/auth/register", { method: "POST", body: { email, password, full_name } }),
  verifyRegistration: (email: string, code: string) =>
    request<{ message: string }>("/auth/register/verify", { method: "POST", body: { email, code } }),
  login: (email: string, password: string) =>
    request<TokenResult>("/auth/login", { method: "POST", body: { email, password } }),
  resetPassword: (email: string, code: string, new_password: string) =>
    request<{ message: string }>("/auth/reset-password", { method: "POST", body: { email, code, new_password } }),
  me: () => request<User>("/auth/me"),

  // meta
  options: () => request<Options>("/meta/options"),

  // gauges
  listGauges: (p: ListParams) =>
    request<GaugeList>("/gauges", {
      query: {
        page: p.page,
        page_size: p.page_size,
        sort_by: p.sort_by,
        sort_dir: p.sort_dir,
        q: p.q,
        filters: Object.keys(p.filters).length ? JSON.stringify(p.filters) : undefined,
        contains: Object.keys(p.contains).length ? JSON.stringify(p.contains) : undefined,
      },
    }),
  columnValues: (column: string) => request<ColumnValues>(`/gauges/columns/${column}/values`),
  getGauge: (id: number) => request<GaugeDetail>(`/gauges/${id}`),
  createGauge: (data: GaugeInput) => request<GaugeDetail>("/gauges", { method: "POST", body: data }),
  updateGauge: (id: number, data: GaugeInput) => request<GaugeDetail>(`/gauges/${id}`, { method: "PUT", body: data }),
  deleteGauge: (id: number) => request<void>(`/gauges/${id}`, { method: "DELETE" }),

  // attachments
  uploadAttachment: (gaugeId: number, kind: "image" | "certificate", file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>(`/gauges/${gaugeId}/attachments`, { method: "POST", query: { kind }, form });
  },
  deleteAttachment: (id: number) => request<void>(`/attachments/${id}`, { method: "DELETE" }),
  attachmentBlob: (id: number, download = false) =>
    requestBlob(`/attachments/${id}/file`, { download: download ? "true" : undefined }),

  // reports
  calibrationReport: (days: number) => request<CalibrationReport>("/reports/calibration", { query: { days } }),
};
