import SteadfastService from "../services/steadfastService";
import PathaoService from "../services/pathaoService";
import RedxService from "../services/redxService";
import PaperflyService from "../services/paperflyService";
import CarrybeeService from "../services/carrybeeService";

import {
  AggregateStats,
  CourierKey,
  CourierResult,
  FraudReport,
  isCourierStats,
} from "../types";
import { CourierService } from "../services/courierService.interface";

const COURIER_KEYS: CourierKey[] = [
  "steadfast",
  "pathao",
  "redx",
  "paperfly",
  "carrybee",
];

export class FraudCheckerManager {
  public readonly services: Record<CourierKey, CourierService | null>;

  constructor() {
    const registry: Record<CourierKey, () => CourierService> = {
      steadfast: () => new SteadfastService(),
      pathao: () => new PathaoService(),
      redx: () => new RedxService(),
      paperfly: () => new PaperflyService(),
      carrybee: () => new CarrybeeService(),
    };

    this.services = COURIER_KEYS.reduce(
      (acc, key) => {
        try {
          acc[key] = registry[key]();
        } catch (e) {
          console.warn(
            `[Courier Fraud Check] ${key} disabled: ${(e as Error).message}`,
          );
          acc[key] = null;
        }
        return acc;
      },
      {} as Record<CourierKey, CourierService | null>,
    );
  }

  private emptyAggregate(): AggregateStats {
    return {
      total_success: 0,
      total_cancel: 0,
      total_deliveries: 0,
      success_ratio: 0,
      cancel_ratio: 0,
    };
  }

  /**
   * Extract counts for the aggregate from a courier's response.
   *
   * Only count-based shapes contribute. Shapes that return ratios or ratings
   * (Steadfast, Pathao v2) return `null` here and are excluded from the sum,
   * though their raw payloads are still forwarded to the caller.
   */
  private extractCounts(
    _key: CourierKey,
    data: CourierResult | null,
  ): { success: number; cancel: number } | null {
    if (!data) return null;
    if (isCourierStats(data)) {
      return { success: data.success, cancel: data.cancel };
    }
    return null;
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

    let totalSuccessCount = 0;
    let totalCancelCount = 0;

    await Promise.all(
      COURIER_KEYS.map(async (key) => {
        const service = this.services[key];
        if (!service) {
          payload[key] = { error: "Service not configured" } as CourierResult;
          return;
        }

        try {
          const stats = await service.getDeliveryStats(phoneNumber);
          payload[key] = stats;

          const counts = this.extractCounts(key, stats);
          if (counts) {
            totalSuccessCount += counts.success;
            totalCancelCount += counts.cancel;
          }
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

    const overallTotal = totalSuccessCount + totalCancelCount;
    payload.aggregate.total_success = totalSuccessCount;
    payload.aggregate.total_cancel = totalCancelCount;
    payload.aggregate.total_deliveries = overallTotal;

    if (overallTotal > 0) {
      payload.aggregate.success_ratio =
        Math.round((totalSuccessCount / overallTotal) * 10000) / 100;
      payload.aggregate.cancel_ratio =
        Math.round((totalCancelCount / overallTotal) * 10000) / 100;
    }

    return payload;
  }
}

export default FraudCheckerManager;
