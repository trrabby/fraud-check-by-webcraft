import axios from "axios";

import CourierDataValidator from "../helpers/courierDataValidator";
import cacheStore from "../utils/cache";
import config from "../config";
import { CourierResult, CourierStats } from "../types";
import { CourierService } from "./courierService.interface";

interface RedxLoginResponse {
  data?: {
    accessToken?: string;
  };
}

interface RedxRateBody {
  code?: number;
  isError?: boolean;
  message?: string;
  data?: {
    successRate?: number | string;
    totalParcels?: number | string;
    deliveredParcels?: number | string;
    returnPercentage?: number | string;
    customerSegment?: string;
  };
}

export class RedxService implements CourierService {
  private readonly cacheKey = "redx_access_token";
  private readonly cacheSeconds = 50 * 60;
  private readonly phone: string;
  private readonly password: string;

  constructor() {
    CourierDataValidator.enforceConfig([
      { path: "redx.phone", value: config.couriers.redx.phone },
      { path: "redx.password", value: config.couriers.redx.password },
    ]);

    this.phone = config.couriers.redx.phone;
    this.password = config.couriers.redx.password;

    CourierDataValidator.checkBdMobile(this.phone);
  }

  private async getAccessToken(): Promise<string | null> {
    const cached = cacheStore.get<string>(this.cacheKey);
    if (cached) return cached;

    const resp = await axios.post<RedxLoginResponse>(
      "https://api.redx.com.bd/v4/auth/login",
      { phone: `88${this.phone}`, password: this.password },
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "application/json, text/plain, */*",
        },
        validateStatus: () => true,
        timeout: 30000,
      },
    );

    if (!(resp.status >= 200 && resp.status < 300)) return null;

    const token = resp.data?.data?.accessToken;
    if (token) cacheStore.set(this.cacheKey, token, this.cacheSeconds);
    return token ?? null;
  }

  async getDeliveryStats(queryPhone: string): Promise<CourierResult> {
    try {
      CourierDataValidator.checkBdMobile(queryPhone);

      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return {
          error: "Login failed or unable to get access token from Redx",
        };
      }

      const resp = await axios.get<RedxRateBody>(
        `https://redx.com.bd/api/redx_se/admin/parcel/customer-success-return-rate?phoneNumber=88${queryPhone}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            Origin: "https://redx.com.bd",
            Referer: `https://redx.com.bd/`,
          },
          validateStatus: () => true,
          timeout: 30000,
        },
      );

      const body = resp.data ?? {};

      // ── Success is decided by the BODY, not the HTTP status ───────────────
      // Cloudflare on redx.com.bd sometimes mangles the outer status (400)
      // while the origin body is a valid success payload (`code: 200`).
      const bodyOk = body.code === 200 && body.isError === false;
      const hasPayload = !!body.data;

      if ((resp.status >= 200 && resp.status < 300) || (bodyOk && hasPayload)) {
        return this.parseStats(body.data ?? {});
      }

      if (resp.status === 401 || body.code === 401) {
        cacheStore.del(this.cacheKey);
        return {
          error: "Access token expired or invalid for Redx. Please retry.",
          status: 401,
        };
      }

      return {
        success: 0,
        cancel: 0,
        total: 0,
        success_ratio: 0,
        error: "Threshold hit, wait a minute for Redx",
        status: resp.status,
      };
    } catch (e) {
      return {
        error: "An error occurred while processing Redx request",
        message: (e as Error).message,
      };
    }
  }

  /**
   * RedX's response fields (v2):
   *   successRate       -> ratio (number)              → success_ratio
   *   totalParcels      -> string                      → total
   *   deliveredParcels  -> string                      → success
   *   returnPercentage  -> string                      → informational
   *   customerSegment   -> string                      → informational
   *
   * We pass through what RedX gives us, and only compute `cancel` (which
   * RedX doesn't return) so the aggregate has a number to add.
   */
  private parseStats(data: NonNullable<RedxRateBody["data"]>): CourierStats {
    const success = this.toInt(data.deliveredParcels);
    const total = this.toInt(data.totalParcels);
    const cancel = Math.max(0, total - success);

    // Prefer RedX's own successRate (verbatim). Fall back to computed ratio
    // only if RedX omitted it.
    const success_ratio =
      data.successRate !== undefined && data.successRate !== null
        ? this.toFloat(data.successRate)
        : total > 0
          ? Math.round((success / total) * 10000) / 100
          : 0;

    return { success, cancel, total, success_ratio };
  }

  private toInt(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    const n = Number.parseInt(String(v ?? "0"), 10);
    return Number.isFinite(n) ? n : 0;
  }

  private toFloat(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number.parseFloat(String(v ?? "0"));
    return Number.isFinite(n) ? n : 0;
  }
}

export default RedxService;
