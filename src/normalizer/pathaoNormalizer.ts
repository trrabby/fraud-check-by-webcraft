import { CourierContribution } from "./types";

/**
 * Pathao v2 "rating" responses:
 *   {
 *     data: {
 *       data_type: "rating",
 *       customer_rating: "excellent_customer" | …,
 *       risk_level: "low" | "medium" | "high" | "very_high" | "unknown",
 *       success_rate: 95,     // percent, 0–100
 *       total: 0, success: 0, cancel: 0
 *     }
 *   }
 *
 * We convert success_rate into counts against a virtual total of 10 orders,
 * weighted by how confident the risk_level tells us to be.
 */

const VIRTUAL_TOTAL = 10;

const WEIGHT_BY_RISK: Record<string, number> = {
  low: 0.7,
  medium: 0.6,
  high: 0.5,
  very_high: 0.4,
  unknown: 0.3,
};

interface PathaoRaw {
  data?: {
    data_type?: string;
    customer_rating?: string;
    risk_level?: string;
    success_rate?: number | string;
    // legacy signals
    show_count?: boolean;
    customer_success_rate?: number | string;
  };
}

function toFloat(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function normalizePathao(data: unknown): CourierContribution | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as PathaoRaw;
  const inner = raw.data;

  if (!inner || typeof inner !== "object") return null;

  // Accept either the new `success_rate` field or the legacy estimate.
  const successRateRaw =
    inner.success_rate ?? inner.customer_success_rate ?? null;
  const successRate = toFloat(successRateRaw, NaN);

  const isRating = inner.data_type === "rating";

  // If there is no numeric estimate, Pathao has no usable signal.
  if (!Number.isFinite(successRate) && !isRating) {
    return {
      success: 0,
      cancel: 0,
      weight: 0.3,
      group: "a",
      hasSignal: false,
      source: "empty",
    };
  }

  const rate = Number.isFinite(successRate) ? successRate : 0;

  const success = (rate / 100) * VIRTUAL_TOTAL;
  const cancel = Math.max(0, VIRTUAL_TOTAL - success);

  const weight =
    WEIGHT_BY_RISK[String(inner.risk_level ?? "unknown")] ??
    WEIGHT_BY_RISK.unknown;

  return {
    success,
    cancel,
    weight,
    group: "a",
    hasSignal: true,
    source: "rating",
  };
}
