/* ── Classic count-based shape (RedX, Paperfly, Carrybee) ───────── */
export interface CourierStats {
  success: number;
  cancel: number;
  total: number;
  success_ratio: number;
}

/* ── Steadfast pass-through shape ──────────────────────────────── */
export interface SteadfastStats {
  delivery_ratio: number;
  cancellation_ratio: number;
  volume_band?: string;
  volume_range?: string;
  fraud_reports?: number;
  fraud_categories?: unknown[];
  fraud_keywords?: unknown[];
  frauds?: unknown[];
}

/* ── Pathao v2 pass-through shape ──────────────────────────────── */
export interface PathaoStats {
  message?: string;
  type?: string;
  code?: number;
  data?: {
    version?: string;
    data_type?: string;
    customer_rating?: string;
    risk_level?: string;
    success_rate?: number;
    total?: number;
    success?: number;
    cancel?: number;
    address_book?: unknown[];
    show_count?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CourierError {
  error: string;
  message?: string;
  status?: number;
}

export type CourierResult =
  | CourierStats
  | SteadfastStats
  | PathaoStats
  | CourierError;

/* ── Aggregate ─────────────────────────────────────────────────── */
export interface AggregateContribution {
  success: number;
  cancel: number;
  weight: number;
  group: "a" | "b";
  source: "counts" | "ratio_bucket" | "rating" | "empty";
}

export interface AggregateStats {
  total_success: number;
  total_cancel: number;
  total_deliveries: number;
  success_ratio: number;
  cancel_ratio: number;

  /* Debug / transparency fields */
  group_a_ratio: number | null;
  group_b_ratio: number | null;
  group_weights: { a: number; b: number };
  contributions: Record<string, AggregateContribution | null>;
}

/* ── Report ────────────────────────────────────────────────────── */
export type CourierKey =
  | "steadfast"
  | "pathao"
  | "redx"
  | "paperfly"
  | "carrybee";

export interface FraudReport {
  steadfast: CourierResult | null;
  pathao: CourierResult | null;
  redx: CourierResult | null;
  paperfly: CourierResult | null;
  carrybee: CourierResult | null;
  aggregate: AggregateStats;
}

/* ── API envelopes ─────────────────────────────────────────────── */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/* ── Type guards ───────────────────────────────────────────────── */
export const isCourierStats = (r: CourierResult | null): r is CourierStats =>
  !!r &&
  typeof (r as CourierStats).success === "number" &&
  typeof (r as CourierStats).cancel === "number" &&
  typeof (r as CourierStats).total === "number" &&
  typeof (r as CourierStats).success_ratio === "number";

export const isSteadfastStats = (
  r: CourierResult | null,
): r is SteadfastStats =>
  !!r && typeof (r as SteadfastStats).delivery_ratio === "number";

export const isPathaoStats = (r: CourierResult | null): r is PathaoStats => {
  if (!r) return false;
  const obj = r as PathaoStats;
  if (typeof obj !== "object") return false;
  const d = obj.data;
  if (!d || typeof d !== "object") return false;
  return (
    "customer_rating" in d ||
    "show_count" in d ||
    d.version === "v2" ||
    d.data_type === "rating"
  );
};

export const isCourierError = (r: CourierResult | null): r is CourierError =>
  !!r && typeof (r as CourierError).error === "string";
