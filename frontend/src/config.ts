export interface AppConfig {
  companyName: string;
  logoUrl: string;
  footerText: string;
  apiBaseUrl: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppConfig>;
  }
}

const defaults: AppConfig = {
  companyName: "Company",
  logoUrl: "/logo.svg",
  footerText: "Calibration Log",
  apiBaseUrl: "/api",
};

export const config: AppConfig = { ...defaults, ...(window.__APP_CONFIG__ ?? {}) };
