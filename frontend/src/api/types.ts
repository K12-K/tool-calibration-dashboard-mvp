export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "user";
}

export interface Attachment {
  id: number;
  kind: "image" | "certificate";
  original_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface Gauge {
  id: number;
  asset_no: string;
  description: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  gauge_code: string | null;
  calibration_date: string | null;
  frequency_months: number | null;
  due_date: string | null;
  days_left: number | null;
  status: string;
  display_status: string;
  location: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
}

export interface GaugeDetail extends Gauge {
  attachments: Attachment[];
}

export interface GaugeInput {
  asset_no: string;
  description: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  gauge_code: string | null;
  calibration_date: string | null;
  frequency_months: number | null;
  status: string;
  location: string | null;
  comments: string | null;
}

export interface GaugeList {
  items: Gauge[];
  total: number;
  page: number;
  page_size: number;
}

export interface ColumnValues {
  values: string[];
  has_blank: boolean;
  truncated: boolean;
}

export interface Options {
  statuses: string[];
  locations: string[];
  limits: { max_images: number; max_certificates: number; max_upload_bytes: number };
  due_soon_days: number;
}

export interface CalibrationReport {
  generated_on: string;
  window_days: number;
  summary: { total: number; due_soon: number; past_due: number; by_status: Record<string, number> };
  due_soon: Gauge[];
  past_due: Gauge[];
}

export interface RegisterResult {
  email: string;
  secret: string;
  otpauth_uri: string;
  qr_png_data_uri: string;
}

export interface TokenResult {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ListParams {
  page: number;
  page_size: number;
  sort_by: string;
  sort_dir: "asc" | "desc";
  q: string;
  filters: Record<string, string[]>;
  contains: Record<string, string>;
}
