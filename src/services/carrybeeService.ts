import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

import CourierDataValidator from "../helpers/courierDataValidator";
import cacheStore from "../utils/cache";
import config from "../config";
import { CourierResult, CourierStats } from "../types";
import { CourierService } from "./courierService.interface";

interface CarrybeeAuthData {
  accessToken: string;
  businessId: string;
}

interface CarrybeeCsrfResponse {
  csrfToken?: string;
}

interface CarrybeeSessionResponse {
  accessToken?: string;
  expires?: string;
  provider?: string;
  user?: {
    name?: string;
    phone?: string;
    businessIds?: string[];
    selectedBusinessId?: string;
    selectedBusinessName?: string;
    selectedBusinessRole?: string;
  };
}

interface CarrybeeCustomerBody {
  error?: boolean;
  message?: string;
  data?: {
    id?: number | string;
    name?: string;
    phone?: string;
    total_order?: number | string;
    cancelled_order?: number | string;
    success_rate?: number | string;
    addresses?: unknown[];
    fraud_count?: number | string;
  };
}

interface CarrybeeAuthResult {
  ok: boolean;
  data?: CarrybeeAuthData;
  error?: string;
  status?: number;
  detail?: string;
}

export class CarrybeeService implements CourierService {
  private readonly cacheKey = "carrybee_auth_data";
  private readonly cacheSeconds = 55 * 60;
  private readonly phone: string;
  private readonly password: string;

  constructor() {
    CourierDataValidator.enforceConfig([
      { path: "carrybee.phone", value: config.couriers.carrybee.phone },
      { path: "carrybee.password", value: config.couriers.carrybee.password },
    ]);

    this.phone = config.couriers.carrybee.phone;
    this.password = config.couriers.carrybee.password;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  private async getAuthData(): Promise<CarrybeeAuthResult> {
    const cached = cacheStore.get<CarrybeeAuthData>(this.cacheKey);
    if (cached?.accessToken && cached?.businessId) {
      return { ok: true, data: cached };
    }

    const jar = new CookieJar();
    const client: AxiosInstance = wrapper(
      axios.create({
        jar,
        maxRedirects: 5,
        validateStatus: () => true,
        timeout: 30000,
      }),
    );

    const baseHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://merchant.carrybee.com/login",
      Origin: "https://merchant.carrybee.com",
    };

    // Step 1: CSRF
    let csrfToken: string | undefined;
    try {
      const csrfResp = await client.get<CarrybeeCsrfResponse>(
        "https://merchant.carrybee.com/api/auth/csrf",
        { headers: baseHeaders },
      );
      if (!(csrfResp.status >= 200 && csrfResp.status < 300)) {
        return {
          ok: false,
          error: "Carrybee CSRF request failed",
          status: csrfResp.status,
          detail: JSON.stringify(csrfResp.data).slice(0, 300),
        };
      }
      csrfToken = csrfResp.data?.csrfToken;
      if (!csrfToken) {
        return {
          ok: false,
          error: "Carrybee CSRF token missing in response",
          status: csrfResp.status,
          detail: JSON.stringify(csrfResp.data).slice(0, 300),
        };
      }
    } catch (e) {
      return {
        ok: false,
        error: "Carrybee CSRF request threw",
        detail: (e as Error).message,
      };
    }

    // Step 2: Login callback
    // NOTE: we deliberately do NOT fail on non-2xx here. The login redirect
    // lands on the dashboard, which can 500 while auth still succeeded.
    // The session call in Step 3 is the authoritative check.
    let loginStatus = 0;
    let loginFinalUrl = "";
    try {
      const cleanPhone = `+88${String(this.phone).replace(/^\+?88/, "")}`;
      const loginResp = await client.post(
        "https://merchant.carrybee.com/api/auth/callback/login?",
        new URLSearchParams({
          phone: cleanPhone,
          password: this.password,
          csrfToken,
          callbackUrl: "https://merchant.carrybee.com/login",
        }).toString(),
        {
          headers: {
            ...baseHeaders,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );
      loginStatus = loginResp.status;
      loginFinalUrl =
        (loginResp.request as any)?.res?.responseUrl ||
        (loginResp.request as any)?.responseUrl ||
        "";
    } catch (e) {
      return {
        ok: false,
        error: "Carrybee login request threw",
        detail: (e as Error).message,
      };
    }

    // Step 3: Session — authoritative
    try {
      const sessionResp = await client.get<CarrybeeSessionResponse>(
        "https://merchant.carrybee.com/api/auth/session",
        { headers: baseHeaders },
      );
      if (!(sessionResp.status >= 200 && sessionResp.status < 300)) {
        return {
          ok: false,
          error: "Carrybee session request failed",
          status: sessionResp.status,
          detail: `loginStatus=${loginStatus} finalUrl=${loginFinalUrl} sessionBody=${JSON.stringify(
            sessionResp.data,
          ).slice(0, 300)}`,
        };
      }
      const accessToken = sessionResp.data?.accessToken;
      if (!accessToken) {
        return {
          ok: false,
          error: "Carrybee session has no accessToken — login did not complete",
          status: sessionResp.status,
          detail: `loginStatus=${loginStatus} finalUrl=${loginFinalUrl} sessionBody=${JSON.stringify(
            sessionResp.data,
          ).slice(0, 400)}`,
        };
      }
      const businessId = sessionResp.data?.user?.selectedBusinessId;
      if (!businessId) {
        return {
          ok: false,
          error: "Carrybee session has accessToken but no selectedBusinessId",
          detail: JSON.stringify(sessionResp.data.user ?? {}).slice(0, 400),
        };
      }
      const data: CarrybeeAuthData = { accessToken, businessId };
      cacheStore.set(this.cacheKey, data, this.cacheSeconds);
      return { ok: true, data };
    } catch (e) {
      return {
        ok: false,
        error: "Carrybee session request threw",
        detail: (e as Error).message,
      };
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  async getDeliveryStats(phoneNumber: string): Promise<CourierResult> {
    try {
      CourierDataValidator.checkBdMobile(phoneNumber);

      const authResult = await this.getAuthData();
      if (!authResult.ok || !authResult.data) {
        return {
          error:
            authResult.error ??
            "Login failed or unable to get access token from Carrybee",
          message: authResult.detail,
          status: authResult.status,
        };
      }

      const { accessToken, businessId } = authResult.data;

      // Normalize phone → 11-digit local (0XXXXXXXXXX)
      let cleanPhone = phoneNumber;
      const m = String(phoneNumber).match(/^(?:\+?88)?(01[3-9]\d{8})$/);
      if (m) cleanPhone = m[1];

      const resp = await axios.get<CarrybeeCustomerBody>(
        `https://api-merchant.carrybee.com/api/v2/businesses/${businessId}/customers/${cleanPhone}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Origin: "https://merchant.carrybee.com",
            Referer: `https://merchant.carrybee.com/businesses/${businessId}/dashboard`,
            Authorization: `Bearer ${accessToken}`,
          },
          validateStatus: () => true,
          timeout: 30000,
        },
      );

      const body = resp.data ?? {};

      // ── 200 + valid payload ─────────────────────────────────────────────
      if (
        resp.status >= 200 &&
        resp.status < 300 &&
        body.error === false &&
        body.data
      ) {
        return this.parseStats(body.data);
      }

      // ── 404 → no history in CarryBee for this number ────────────────────
      // Treated as a valid "0 history" result, not an error.
      if (resp.status === 404 || body.error === true) {
        return {
          success: 0,
          cancel: 0,
          total: 0,
          success_ratio: 0,
        } as CourierStats;
      }

      // ── 401 → token is stale, drop the cache ────────────────────────────
      if (resp.status === 401) {
        cacheStore.del(this.cacheKey);
        return {
          error: "Access token expired or invalid for Carrybee. Please retry.",
          status: 401,
        };
      }

      // ── Anything else — surface status + body for debugging ─────────────
      return {
        success: 0,
        cancel: 0,
        total: 0,
        success_ratio: 0,
        error: "Failed to fetch from Carrybee",
        status: resp.status,
        message: `body=${JSON.stringify(body).slice(0, 400)}`,
      };
    } catch (e) {
      return {
        error: "An error occurred while processing Carrybee request",
        message: (e as Error).message,
      };
    }
  }

  // ── Parser ────────────────────────────────────────────────────────────────
  /**
   * CarryBee /customers/{phone} shape:
   *   {
   *     id, name, phone,
   *     total_order, cancelled_order, success_rate,
   *     addresses: [],
   *     fraud_count
   *   }
   *
   * We pass through what CarryBee sends. `success` is derived as
   * total_order − cancelled_order (CarryBee doesn't send it directly).
   * `success_rate` is used verbatim when present.
   */
  private parseStats(
    data: NonNullable<CarrybeeCustomerBody["data"]>,
  ): CourierStats & {
    fraud_count?: number;
    customer_name?: string;
    customer_id?: number | string;
  } {
    const total = this.toInt(data.total_order);
    const cancel = this.toInt(data.cancelled_order);
    const success = Math.max(0, total - cancel);

    // Use CarryBee's own success_rate verbatim when present
    const hasRate =
      data.success_rate !== undefined && data.success_rate !== null;
    const success_ratio = hasRate
      ? this.toFloat(data.success_rate)
      : total > 0
        ? Math.round((success / total) * 10000) / 100
        : 0;

    const fraud_count = this.toInt(data.fraud_count);

    return {
      success,
      cancel,
      total,
      success_ratio,

      // Extra fields — surfaced to the UI as "meaningful messages"
      fraud_count,
      customer_name: typeof data.name === "string" ? data.name : undefined,
      customer_id: data.id,
    };
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

export default CarrybeeService;
