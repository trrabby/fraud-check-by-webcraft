import express, { Application } from "express";
import path from "path";

import apiRoutes from "./routes/api";
import errorHandler from "./middleware/errorHandler";
import * as fraudController from "./controllers/fraudController";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "..", "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.get("/", fraudController.index);

app.use("/api", apiRoutes);

app.use((_req, res) =>
  res.status(404).json({ success: false, error: "Not found" }),
);

app.use(errorHandler);

export default app;
