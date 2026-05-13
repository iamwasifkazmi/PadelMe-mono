import "express-async-errors";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { Prisma } from "@prisma/client";
import { apiRouter } from "./modules/index.js";
dotenv.config();
export const app = express();
app.use(helmet());
app.use(cors());
/** Score evidence may include data URLs (photos) in `evidenceUrl`; default 100kb is too small. */
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use("/api", apiRouter);
app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error("Unhandled API error:", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // eslint-disable-next-line no-console
        console.error("Prisma KnownRequest:", err.code, err.meta, err.message);
        if (err.code === "P2021") {
            return res.status(503).json({
                error: "Database tables are not fully initialized. Run Prisma db push/migrations.",
                code: err.code,
            });
        }
        if (err.code === "P2022") {
            return res.status(503).json({
                error: "Database schema is out of date (missing column). Run `npx prisma db push` or deploy migrations against this database.",
                code: err.code,
            });
        }
        return res.status(500).json({
            error: "Database request failed",
            code: err.code,
            ...(process.env.NODE_ENV !== "production" ? { detail: err.message } : {}),
        });
    }
    return res.status(500).json({ error: "Internal server error" });
});
