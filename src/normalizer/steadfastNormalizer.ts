import { CourierContribution } from "./types";

interface SteadfastRaw {
  delivery_ratio?: number | string;
  cancellation_ratio?: number | string;
  volume_range?: string;
  volume_band?: string;
  // legacy fields, harmless if missing
  total_delivered?: number | string;
  total_cancelled?: number | string;
}

function toFloat(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Steadfast's `volume_range` is a coarse bucket: "5", "1-5", "6-20", "100+".
 * We use the midpoint as a representative total.
 */
function parseVolumeMidpoint(range: string): number {
  const r = range.trim();
  if (!r) return 0;

  const plus = r.match(/^(\d+)\s*\+$/);
  if (plus) return Number.parseInt(plus[1], 10);

  const dash = r.match(/^(\d+)\s*-\s*(\d+)$/);
  if (dash) {
    const lo = Number.parseInt(dash[1], 10);
    const hi = Number.parseInt(dash[2], 10);
    return (lo + hi) / 2;
  }

  const single = Number.parseInt(r, 10);
  return Number.isFinite(single) ? single : 0;
}

export function normalizeSteadfast(data: unknown): CourierContribution | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as SteadfastRaw;

  // ── Legacy count-based shape (defensive) ─────────────────────────────
  if (raw.total_delivered !== undefined || raw.total_cancelled !== undefined) {
    const success = toFloat(raw.total_delivered);
    const cancel = toFloat(raw.total_cancelled);
    const total = success + cancel;

    return {
      success,
      cancel,
      weight: total > 0 ? 0.9 : 0.4,
      group: "a",
      hasSignal: total > 0,
      source: total > 0 ? "counts" : "empty",
    };
  }

  // ── Current ratio + bucket shape ─────────────────────────────────────
  const deliveryRatio = toFloat(raw.delivery_ratio);
  const volumeRange = String(raw.volume_range ?? "");
  const total = parseVolumeMidpoint(volumeRange);

  if (total <= 0) {
    // No volume info → no reliable signal, but Steadfast did answer.
    return {
      success: 0,
      cancel: 0,
      weight: 0.4,
      group: "a",
      hasSignal: false,
      source: "empty",
    };
  }

  const success = (deliveryRatio / 100) * total;
  const cancel = Math.max(0, total - success);

  return {
    success,
    cancel,
    weight: 0.9,
    group: "a",
    hasSignal: true,
    source: "ratio_bucket",
  };
}
