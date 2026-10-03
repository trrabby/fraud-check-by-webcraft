import { Router } from "express";

import * as fraudController from "../controllers/fraudController";
import validatePhone from "../middleware/validatePhone";

const router = Router();

router.get("/couriers", fraudController.couriers);
router.get("/check/:phone", validatePhone, fraudController.check);
router.get(
  "/check/:courier/:phone",
  validatePhone,
  fraudController.checkSingle,
);

export default router;
