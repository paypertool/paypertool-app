import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getStats } from "../lib/stats";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/stats", async (_req, res) => {
  const stats = await getStats();
  res.set("Cache-Control", "public, max-age=15");
  res.json(stats);
});

export default router;
