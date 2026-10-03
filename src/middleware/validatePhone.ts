import { NextFunction, Request, Response } from "express";

const BD_MOBILE_REGEX = /^01[3-9][0-9]{8}$/;

export const validatePhone = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const phone =
    req.params.phone ||
    (req.query.phone as string | undefined) ||
    (req.body && (req.body as { phone?: string }).phone);

  if (!phone || !BD_MOBILE_REGEX.test(String(phone))) {
    res.status(400).json({
      success: false,
      error:
        "Invalid phone number. Format: 01********* (11 digits, without +88).",
    });
    return;
  }
  next();
};

export default validatePhone;
