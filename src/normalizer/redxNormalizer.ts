import { CourierContribution } from "./types";

interface RedxRaw {
  success?: number | string;
  cancel?: number | string;
  total?: number | string;
  success_ratio?: number | string;
}

function toFloat(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeRedx(data: unknown): CourierContribution | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as RedxRaw;

  const success = toFloat(raw.success);
  const cancel = toFloat(raw.cancel);
  const total = success + cancel;

  if (total <= 0) {
    return {
      success: 0,
      cancel: 0,
      weight: 0.4,
      group: "b",
      hasSignal: false,
      source: "empty",
    };
  }

  return {
    success,
    cancel,
    weight: 1.0,
    group: "b",
    hasSignal: true,
    source: "counts",
  };
}
