import axios from "axios";

import CourierDataValidator from "../helpers/courierDataValidator";
import config from "../config";
import { CourierResult, PathaoStats } from "../types";
import { CourierService } from "./courierService.interface";

interface PathaoLoginResponse {
  access_token?: string;
}

export class PathaoService implements CourierService {
  private readonly username: string;
  private readonly password: string;

  constructor() {
    CourierDataValidator.enforceConfig([
      { path: "pathao.user", value: config.couriers.pathao.user },
      { path: "pathao.password", value: config.couriers.pathao.password },
    ]);
    this.username = config.couriers.pathao.user;
    this.password = config.couriers.pathao.password;
  }

  async getDeliveryStats(phoneNumber: string): Promise<CourierResult> {
    try {
      CourierDataValidator.checkBdMobile(phoneNumber);

      // ── 1. Login ──────────────────────────────────────────────────────────
      const loginResp = await axios.post<PathaoLoginResponse>(
        "https://merchant.pathao.com/api/v1/login",
        { username: this.username, password: this.password },
        { validateStatus: () => true, timeout: 30000 },
      );

      if (!(loginResp.status >= 200 && loginResp.status < 300)) {
        return {
          error: "Failed to authenticate with Pathao",
          status: loginResp.status,
        };
      }

      const accessToken = String(loginResp.data?.access_token ?? "").trim();
      if (!accessToken) {
        return { error: "No access token received from Pathao" };
      }

      // ── 2. Fetch customer success stats ───────────────────────────────────
      const authResp = await axios.post<PathaoStats>(
        "https://merchant.pathao.com/api/v1/user/success",
        { phone: phoneNumber },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          validateStatus: () => true,
          timeout: 30000,
        },
      );
      // console.log(authResp);
      if (!(authResp.status >= 200 && authResp.status < 300)) {
        return {
          error: "Failed to retrieve customer data from Pathao",
          status: authResp.status,
        };
      }

      // ── 3. Pass through Pathao's raw response verbatim ────────────────────
      // No derived `success` / `cancel` / `total` / `success_ratio` fields.
      // The manager extracts counts for the aggregate from the known
      // `data.customer.*` path; the UI reads the raw shape directly.
      return this.normalize(authResp.data);
    } catch (e) {
      return {
        error: "An error occurred while processing Pathao request",
        message: (e as Error).message,
      };
    }
  }

  /**
   * Ensure the response is a plain object. If Pathao ever returns a string
   * body (rare) we attempt a JSON.parse; otherwise we wrap it under `raw`.
   */
  private normalize(raw: unknown): PathaoStats {
    if (typeof raw === "object" && raw !== null) {
      return raw as PathaoStats;
    }
    try {
      const parsed = JSON.parse(String(raw));
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as PathaoStats;
      }
    } catch {
      /* fall through */
    }
    return { raw } as PathaoStats;
  }
}

export default PathaoService;
