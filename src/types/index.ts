/** Classic count shape — reserved for couriers that still return counts natively. */
export interface CourierStats {
  success: number;
  cancel: number;
  total: number;
  success_ratio: number;

  // Optional extras — some couriers return them
  fraud_count?: number;
  customer_name?: string;
  customer_id?: number | string;
}
/** Steadfast's pass-through shape. */
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

/**
 * Pathao v2 pass-through shape.
 * `data.customer_rating` is the only signal — no counts, no per-order status.
 */
export interface PathaoStats {
  message?: string;
  type?: string;
  code?: number;
  data?: {
    version?: string;
    address_book?: unknown[];
    show_count?: boolean;
    customer_rating?: string;
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

export interface AggregateStats {
  total_success: number;
  total_cancel: number;
  total_deliveries: number;
  success_ratio: number;
  cancel_ratio: number;
}

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

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Classic count-based shape. */
export const isCourierStats = (r: CourierResult | null): r is CourierStats =>
  !!r &&
  typeof (r as CourierStats).success === "number" &&
  typeof (r as CourierStats).cancel === "number" &&
  typeof (r as CourierStats).total === "number" &&
  typeof (r as CourierStats).success_ratio === "number";

/** Steadfast pass-through shape. */
export const isSteadfastStats = (
  r: CourierResult | null,
): r is SteadfastStats =>
  !!r && typeof (r as SteadfastStats).delivery_ratio === "number";

/**
 * Pathao v2 pass-through shape.
 * Distinguished by the presence of `data` as an object that carries either
 * `customer_rating` or `show_count` (v2 markers).
 */
export const isPathaoStats = (r: CourierResult | null): r is PathaoStats => {
  if (!r) return false;
  const obj = r as PathaoStats;
  if (typeof obj !== "object") return false;
  const d = obj.data;
  if (!d || typeof d !== "object") return false;
  return "customer_rating" in d || "show_count" in d || d.version === "v2";
};

/** Any error envelope. */
export const isCourierError = (r: CourierResult | null): r is CourierError =>
  !!r && typeof (r as CourierError).error === "string";
