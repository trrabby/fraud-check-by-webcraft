import { CourierResult } from "../types";

export interface CourierService {
  getDeliveryStats(phoneNumber: string): Promise<CourierResult>;
}
