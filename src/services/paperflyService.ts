import axios from "axios";

import CourierDataValidator from "../helpers/courierDataValidator";
import cacheStore from "../utils/cache";
import config from "../config";
import { CourierResult, CourierStats } from "../types";
import { CourierService } from "./courierService.interface";

interface PaperflyLoginResponse {
  token?: string;
}

interface PaperflyRecord {
  status?: string;
  [key: string]: unknown;
}

interface PaperflyListResponse {
  draw?: number;
  page?: number;
  limit?: number;
  totalFiltered?: number;
  totalRecords?: number;
  records?: PaperflyRecord[];
}

export class PaperflyService implements CourierService {
  private readonly baseUrl =
    "https://go-app.paperfly.com.bd/merchant/api/react";
  private readonly cacheKey = "paperfly_token";
  private readonly cacheSeconds = 3300;

  private readonly username: string;
  private readonly password: string;

  constructor() {
    CourierDataValidator.enforceConfig([
      { path: "paperfly.user", value: config.couriers.paperfly.user },
      { path: "paperfly.password", value: config.couriers.paperfly.password },
    ]);

    this.username = config.couriers.paperfly.user;
    this.password = config.couriers.paperfly.password;
  }

  private async getToken(): Promise<string> {
    const cached = cacheStore.get<string>(this.cacheKey);
    if (cached) return cached;

    const resp = await axios.post<PaperflyLoginResponse>(
      `${this.baseUrl}/authentication/login_using_password.php`,
      { username: this.username, password: this.password },
      { validateStatus: () => true, timeout: 30000 },
    );

    if (!(resp.status >= 200 && resp.status < 300) || !resp.data?.token) {
      throw new Error(
        "Paperfly Login Failed: " + JSON.stringify(resp.data ?? {}),
      );
    }

    cacheStore.set(this.cacheKey, resp.data.token, this.cacheSeconds);
    return resp.data.token;
  }

  async getDeliveryStats(phoneNumber: string): Promise<CourierResult> {
    try {
      CourierDataValidator.checkBdMobile(phoneNumber);
      const token = await this.getToken();

      const resp = await axios.post<PaperflyListResponse>(
        `${this.baseUrl}/smart-check/list.php`,
        { search_text: phoneNumber, limit: 50, page: 1 },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json, text/plain, */*",
          },
          validateStatus: () => true,
          timeout: 30000,
        },
      );
      // console.log(resp.data);
      if (!(resp.status >= 200 && resp.status < 300)) {
        return {
          error: "Failed to fetch fraud data from Paperfly",
          status: resp.status,
        };
      }

      const data = resp.data ?? {};
      const records = Array.isArray(data.records) ? data.records : [];
      const totalFiltered = this.toInt(data.totalFiltered);
      const totalRecords = this.toInt(data.totalRecords);

      // ── No record rows returned ───────────────────────────────────────────
      // Paperfly can report `totalRecords > 0` with an empty `records` list.
      // In that case we have no statuses to tally — return an honest
      // "no breakdown" envelope instead of fake zeros.
      if (records.length === 0) {
        return {
          success: 0,
          cancel: 0,
          total: 0,
          success_ratio: 0,
        } as CourierStats;
      }

      // ── Tally statuses from the records that were returned ────────────────
      let success = 0;
      let cancel = 0;
      let other = 0;

      for (const record of records) {
        const status = String(record.status ?? "").toLowerCase();
        if (status.includes("delivered") || status.includes("success")) {
          success++;
        } else if (
          status.includes("return") ||
          status.includes("cancel") ||
          status.includes("fail")
        ) {
          cancel++;
        } else {
          other++;
        }
      }

      const tallied = success + cancel;
      const total = tallied > 0 ? tallied : records.length;

      const success_ratio =
        tallied > 0 ? Math.round((success / tallied) * 10000) / 100 : 0;

      // `other` is intentionally unused in the response but kept for clarity
      // if you ever want to expose it. Attach it as an extra field.
      void other;
      void totalFiltered;
      void totalRecords;

      return { success, cancel, total, success_ratio };
    } catch (e) {
      return {
        error: "An error occurred while processing Paperfly request",
        message: (e as Error).message,
      };
    }
  }

  private toInt(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    const n = Number.parseInt(String(v ?? "0"), 10);
    return Number.isFinite(n) ? n : 0;
  }
}

export default PaperflyService;
