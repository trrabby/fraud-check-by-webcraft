import { NextFunction, Request, Response } from "express";
import FraudCheckerManager from "../managers/fraudCheckerManager";
import { CourierKey, FraudReport } from "../types";
import SteadfastService from "../services/steadfastService";

const manager = new FraudCheckerManager();

export const index = (_req: Request, res: Response): void => {
  res.render("index", { appName: "Courier Fraud Check by WebCraft" });
};

export const check = async (
  req: Request<{ phone: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const phone = req.params.phone;
    const data: FraudReport = await manager.check(phone);
    res.json({ success: true, phone, data });
  } catch (e) {
    next(e);
  }
};

export const checkSingle = async (
  req: Request<{ courier: string; phone: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { courier, phone } = req.params;
    const key = courier as CourierKey;
    const service = manager.services[key];
    if (!service) {
      res.status(404).json({
        success: false,
        error: `Courier "${courier}" is not available or not configured.`,
      });
      return;
    }
    const data = await service.getDeliveryStats(phone);
    res.json({ success: true, courier, phone, data });
  } catch (e) {
    next(e);
  }
};

export const couriers = (_req: Request, res: Response): void => {
  res.json({
    success: true,
    couriers: Object.entries(manager.services).map(([name, svc]) => ({
      name,
      configured: !!svc,
    })),
  });
};

// ── NEW: Steadfast session cookie management ────────────────────────────────

export const setSteadfastSession = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const body = req.body as { cookies?: string | Record<string, string> };
    const input = body?.cookies;
    if (!input) {
      res.status(400).json({
        success: false,
        error:
          "Provide `cookies` as either a Cookie header string or an object.",
      });
      return;
    }
    SteadfastService.setSessionCookies(input);
    res.json({ success: true, message: "Steadfast session cookies stored." });
  } catch (e) {
    next(e);
  }
};

export const clearSteadfastSession = (_req: Request, res: Response): void => {
  SteadfastService.clearSessionCookies();
  res.json({ success: true, message: "Steadfast session cookies cleared." });
};
