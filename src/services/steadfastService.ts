import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

import CourierDataValidator from "../helpers/courierDataValidator";
import cacheStore from "../utils/cache";
import config from "../config";
import { CourierResult, SteadfastStats } from "../types";
import { CourierService } from "./courierService.interface";

const SESSION_CACHE_KEY = "steadfast_session_cookies";
const SESSION_CACHE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export class SteadfastService implements CourierService {
  private readonly email: string;
  private readonly password: string;

  constructor() {
    CourierDataValidator.enforceConfig([
      { path: "steadfast.user", value: config.couriers.steadfast.user },
      { path: "steadfast.password", value: config.couriers.steadfast.password },
    ]);
    this.email = config.couriers.steadfast.user;
    this.password = config.couriers.steadfast.password;
  }

  static setSessionCookies(input: string | Record<string, string>): void {
    const pairs: Array<{ name: string; value: string }> = [];

    if (typeof input === "string") {
      for (const part of input.split(";")) {
        const [name, ...rest] = part.trim().split("=");
        if (name && rest.length) pairs.push({ name, value: rest.join("=") });
      }
    } else {
      for (const [name, value] of Object.entries(input)) {
        pairs.push({ name, value });
      }
    }

    if (!pairs.length) throw new Error("No cookies parsed from input");

    cacheStore.set(SESSION_CACHE_KEY, pairs, SESSION_CACHE_SECONDS);
  }

  static clearSessionCookies(): void {
    cacheStore.del(SESSION_CACHE_KEY);
  }

  private buildClientFromStoredCookies(): AxiosInstance | null {
    const stored =
      cacheStore.get<Array<{ name: string; value: string }>>(SESSION_CACHE_KEY);
    if (!stored?.length) return null;

    const jar = new CookieJar();
    for (const { name, value } of stored) {
      jar.setCookieSync(
        `${name}=${value}; Domain=.steadfast.com.bd; Path=/`,
        "https://steadfast.com.bd",
      );
    }

    return wrapper(
      axios.create({
        jar,
        maxRedirects: 5,
        validateStatus: () => true,
        timeout: 30000,
      }),
    );
  }

  private buildFreshClient(): AxiosInstance {
    const jar = new CookieJar();
    return wrapper(
      axios.create({
        jar,
        maxRedirects: 5,
        validateStatus: () => true,
        timeout: 30000,
      }),
    );
  }

  private async loginFresh(): Promise<AxiosInstance> {
    const client = this.buildFreshClient();

    const loginPage = await client.get<string>(
      "https://steadfast.com.bd/login",
    );
    const html = typeof loginPage.data === "string" ? loginPage.data : "";
    const tokenMatch = html.match(
      /<input type="hidden" name="_token" value="(.*?)"/,
    );
    const token = tokenMatch ? tokenMatch[1] : null;
    if (!token) throw new Error("CSRF token not found for Steadfast login");

    const loginResp = await client.post(
      "https://steadfast.com.bd/login",
      new URLSearchParams({
        _token: token,
        email: this.email,
        password: this.password,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const finalUrl: string =
      (loginResp.request as any)?.res?.responseUrl ||
      (loginResp.request as any)?.responseUrl ||
      "";

    if (/\/mfa\//i.test(finalUrl)) {
      const err = new Error(
        "Steadfast requires MFA (multi-factor authentication). Please capture " +
          "session cookies from a browser and POST them to /api/steadfast/session.",
      ) as Error & { code?: string };
      err.code = "MFA_REQUIRED";
      throw err;
    }

    if (!(loginResp.status >= 200 && loginResp.status < 400)) {
      const err = new Error("Login to Steadfast failed") as Error & {
        status?: number;
      };
      err.status = loginResp.status;
      throw err;
    }

    return client;
  }

  async getDeliveryStats(phoneNumber: string): Promise<CourierResult> {
    try {
      CourierDataValidator.checkBdMobile(phoneNumber);

      let client = this.buildClientFromStoredCookies();
      if (!client) {
        client = await this.loginFresh();
      }

      const authResp = await client.get(
        `https://steadfast.com.bd/user/frauds/check/${phoneNumber}`,
      );

      const finalUrl: string =
        (authResp.request as any)?.res?.responseUrl ||
        (authResp.request as any)?.responseUrl ||
        "";

      if (/\/login|\/mfa\//i.test(finalUrl)) {
        SteadfastService.clearSessionCookies();

        try {
          client = await this.loginFresh();
        } catch (e) {
          const err = e as Error & { code?: string; status?: number };
          return {
            error: err.message,
            message: err.code || undefined,
            status: err.status,
          };
        }

        const retry = await client.get(
          `https://steadfast.com.bd/user/frauds/check/${phoneNumber}`,
        );
        if (!(retry.status >= 200 && retry.status < 300)) {
          return {
            error:
              "Session expired and fresh login blocked. Please refresh cookies.",
            status: retry.status,
          };
        }
        return this.parseStats(retry.data);
      }

      if (!(authResp.status >= 200 && authResp.status < 300)) {
        return {
          error: "Failed to fetch fraud data from Steadfast",
          status: authResp.status,
        };
      }

      return this.parseStats(authResp.data);
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      return {
        error:
          err.message || "An error occurred while processing Steadfast request",
        message: err.code,
        status: err.status,
      };
    }
  }

  /**
   * Steadfast's response is forwarded verbatim — no derived counts,
   * no bucket-midpoint guessing. Whatever they return is what you see.
   */
  private parseStats(raw: unknown): SteadfastStats {
    let object: Record<string, unknown>;

    if (typeof raw === "object" && raw !== null) {
      object = raw as Record<string, unknown>;
    } else {
      try {
        object = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        object = {};
      }
    }

    return {
      delivery_ratio: this.toNumber(object.delivery_ratio),
      cancellation_ratio: this.toNumber(object.cancellation_ratio),
      volume_band:
        typeof object.volume_band === "string" ? object.volume_band : undefined,
      volume_range:
        typeof object.volume_range === "string"
          ? object.volume_range
          : undefined,
      fraud_reports:
        typeof object.fraud_reports === "number"
          ? object.fraud_reports
          : undefined,
      fraud_categories: Array.isArray(object.fraud_categories)
        ? object.fraud_categories
        : undefined,
      fraud_keywords: Array.isArray(object.fraud_keywords)
        ? object.fraud_keywords
        : undefined,
      frauds: Array.isArray(object.frauds) ? object.frauds : undefined,
    };
  }

  private toNumber(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number.parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
  }
}

export default SteadfastService;
