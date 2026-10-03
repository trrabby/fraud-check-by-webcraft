import { NextFunction, Request, Response } from "express";

export const errorHandler = (
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  console.error("[Error]", err);
  res.status(err.status ?? 500).json({
    success: false,
    error: err.message || "Internal server error",
  });
};

export default errorHandler;
