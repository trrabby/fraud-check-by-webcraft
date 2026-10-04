import SteadfastService from "../services/steadfastService";
import PathaoService from "../services/pathaoService";
import RedxService from "../services/redxService";
import PaperflyService from "../services/paperflyService";
import CarrybeeService from "../services/carrybeeService";

import {
  AggregateContribution,
  AggregateStats,
  CourierKey,
  CourierResult,
  FraudReport,
} from "../types";
import { CourierService } from "../services/courierService.interface";
import { CourierContribution, normalizeCourier } from "../normalizer";

/* ── Group weights: 60% to (Steadfast + Pathao), 40% to the rest ── */
const GROUP_A_WEIGHT = 0.6;
const GROUP_B_WEIGHT = 0.4;

/* ── All couriers known to the system ──────────────────────────── */
const ALL_COURIER_KEYS: CourierKey[] = [
  "steadfast",
  "pathao",
  "redx",
  "paperfly",
  "carrybee",
];

/**
 * Couriers disabled via the `DISABLED_COURIERS` env var (comma-separated).
 * Example: `DISABLED_COURIERS=redx`
 */
function getDisabledCouriers(): Set<CourierKey> {
  const raw = process.env.DISABLED_COURIERS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as CourierKey[];
  return new Set(list);
}

export class FraudCheckerManager {
  public readonly services: Record<CourierKey, CourierService | null>;
  private readonly activeKeys: CourierKey[];
  private readonly disabledKeys: Set<CourierKey>;

  constructor() {
    const registry: Record<CourierKey, () => CourierService> = {
      steadfast: () => new SteadfastService(),
      pathao: () => new PathaoService(),
      redx: () => new RedxService(),
      paperfly: () => new PaperflyService(),
      carrybee: () => new CarrybeeService(),
    };

    this.disabledKeys = getDisabledCouriers();

    const services = {} as Record<CourierKey, CourierService | null>;
    const active: CourierKey[] = [];

    for (const key of ALL_COURIER_KEYS) {
      if (this.disabledKeys.has(key)) {
        services[key] = null;
        continue;
      }
      try {
        services[key] = registry[key]();
        active.push(key);
      } catch (e) {
        console.warn(
          `[Courier Fraud Check] ${key} disabled: ${(e as Error).message}`,
        );
        services[key] = null;
      }
    }

    this.services = services;
    this.activeKeys = active;
  }

  private emptyAggregate(): AggregateStats {
    const contributions: Record<string, AggregateContribution | null> = {};
    for (const key of ALL_COURIER_KEYS) contributions[key] = null;

    return {
      total_success: 0,
      total_cancel: 0,
      total_deliveries: 0,
      success_ratio: 0,
      cancel_ratio: 0,
      group_a_ratio: null,
      group_b_ratio: null,
      group_weights: { a: GROUP_A_WEIGHT, b: GROUP_B_WEIGHT },
      contributions,
    };
  }

  /**
   * Compute a group's combined ratio from its contributions.
   *
   * Only contributions with `hasSignal === true` are counted.
   * Returns `null` if the group has no signal at all.
   */
  private computeGroupRatio(items: CourierContribution[]): number | null {
    let weightedSuccess = 0;
    let weightedCancel = 0;

    for (const c of items) {
      if (!c.hasSignal) continue;
      weightedSuccess += c.success * c.weight;
      weightedCancel += c.cancel * c.weight;
    }

    const total = weightedSuccess + weightedCancel;
    if (total <= 0) return null;

    return weightedSuccess / total;
  }

  async check(phoneNumber: string): Promise<FraudReport> {
    const payload: FraudReport = {
      steadfast: null,
      pathao: null,
      redx: null,
      paperfly: null,
      carrybee: null,
      aggregate: this.emptyAggregate(),
    };

    // Collected contributions keyed by courier, grouped for the blend step.
    const contributions: Record<CourierKey, CourierContribution | null> = {
      steadfast: null,
      pathao: null,
      redx: null,
      paperfly: null,
      carrybee: null,
    };

    await Promise.all(
      ALL_COURIER_KEYS.map(async (key) => {
        // Disabled or unavailable → leave as null
        if (this.disabledKeys.has(key)) return;

        const service = this.services[key];
        if (!service) {
          payload[key] = { error: "Service not configured" } as CourierResult;
          return;
        }

        try {
          const stats = await service.getDeliveryStats(phoneNumber);
          payload[key] = stats;

          const contribution = normalizeCourier(key, stats);
          contributions[key] = contribution;
        } catch (e) {
          console.error(
            `[Courier Fraud Check] ${key} service failed:`,
            (e as Error).message,
          );
          payload[key] = {
            error: "Service unavailable or failed to process",
            message: (e as Error).message,
          };
        }
      }),
    );

    // ── Split into groups ──────────────────────────────────────────
    const groupAItems: CourierContribution[] = [];
    const groupBItems: CourierContribution[] = [];

    for (const key of ALL_COURIER_KEYS) {
      const c = contributions[key];
      if (!c) continue;
      if (c.group === "a") groupAItems.push(c);
      else groupBItems.push(c);
    }

    const ratioA = this.computeGroupRatio(groupAItems);
    const ratioB = this.computeGroupRatio(groupBItems);

    // ── Blend by 60/40 ─────────────────────────────────────────────
    // If only one group has signal, use it at 100% — otherwise the
    // aggregate would falsely show a 60% or 40% ceiling.
    let finalRatio: number;
    if (ratioA !== null && ratioB !== null) {
      finalRatio = GROUP_A_WEIGHT * ratioA + GROUP_B_WEIGHT * ratioB;
    } else if (ratioA !== null) {
      finalRatio = ratioA;
    } else if (ratioB !== null) {
      finalRatio = ratioB;
    } else {
      finalRatio = 0;
    }

    // ── Total deliveries = real observed volume across all couriers ─
    let observedDeliveries = 0;
    for (const key of ALL_COURIER_KEYS) {
      const c = contributions[key];
      if (!c) continue;
      observedDeliveries += c.success + c.cancel;
    }
    const totalDeliveries = Math.round(observedDeliveries);

    // ── Derive counts that match the blended ratio ─────────────────
    const totalSuccess = Math.round(finalRatio * totalDeliveries);
    const totalCancel = Math.max(0, totalDeliveries - totalSuccess);

    payload.aggregate = {
      total_success: totalSuccess,
      total_cancel: totalCancel,
      total_deliveries: totalDeliveries,
      success_ratio: Math.round(finalRatio * 10000) / 100,
      cancel_ratio:
        totalDeliveries > 0
          ? Math.round((totalCancel / totalDeliveries) * 10000) / 100
          : 0,
      group_a_ratio: ratioA === null ? null : Math.round(ratioA * 10000) / 100,
      group_b_ratio: ratioB === null ? null : Math.round(ratioB * 10000) / 100,
      group_weights: { a: GROUP_A_WEIGHT, b: GROUP_B_WEIGHT },
      contributions: {
        steadfast: this.toDebugContribution(contributions.steadfast),
        pathao: this.toDebugContribution(contributions.pathao),
        redx: this.toDebugContribution(contributions.redx),
        paperfly: this.toDebugContribution(contributions.paperfly),
        carrybee: this.toDebugContribution(contributions.carrybee),
      },
    };

    return payload;
  }

  private toDebugContribution(
    c: CourierContribution | null,
  ): AggregateContribution | null {
    if (!c) return null;
    return {
      success: Math.round(c.success * 100) / 100,
      cancel: Math.round(c.cancel * 100) / 100,
      weight: c.weight,
      group: c.group,
      source: c.source,
    };
  }
}

export default FraudCheckerManager;
