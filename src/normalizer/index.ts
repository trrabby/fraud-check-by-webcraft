import { CourierKey } from "../types";
import { CourierContribution } from "./types";

import { normalizeSteadfast } from "./steadfastNormalizer";
import { normalizePathao } from "./pathaoNormalizer";
import { normalizeRedx } from "./redxNormalizer";
import { normalizePaperfly } from "./paperflyNormalizer";
import { normalizeCarrybee } from "./carrybeeNormalizer";

const NORMALIZERS: Record<
  CourierKey,
  (data: unknown) => CourierContribution | null
> = {
  steadfast: normalizeSteadfast,
  pathao: normalizePathao,
  redx: normalizeRedx,
  paperfly: normalizePaperfly,
  carrybee: normalizeCarrybee,
};

export function normalizeCourier(
  key: CourierKey,
  data: unknown,
): CourierContribution | null {
  const fn = NORMALIZERS[key];
  return fn ? fn(data) : null;
}

export type { CourierContribution };
