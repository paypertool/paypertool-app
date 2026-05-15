import path from "node:path";
import { existsSync } from "node:fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { paymentMiddleware } from "x402-express";
import router from "./routes";
import { logger } from "./lib/logger";
import { PAY_TO_ADDRESS, x402Routes } from "./lib/x402-config";
import { settlementCounterMiddleware } from "./lib/stats";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ exposedHeaders: ["X-PAYMENT-RESPONSE"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(settlementCounterMiddleware);
app.use(paymentMiddleware(PAY_TO_ADDRESS, x402Routes));

app.use("/api", router);

const webDist = process.env.WEB_DIST;
if (webDist) {
  const absDist = path.resolve(webDist);
  if (existsSync(absDist)) {
    logger.info({ webDist: absDist }, "serving static web from WEB_DIST");
    app.use(express.static(absDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api(\/|$)).*/, (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(absDist, "index.html"));
    });
  } else {
    logger.warn({ webDist: absDist }, "WEB_DIST set but path does not exist; static disabled");
  }
}

export default app;
