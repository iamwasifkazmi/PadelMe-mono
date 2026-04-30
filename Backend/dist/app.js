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
app.use(express.json());
app.use(morgan("dev"));
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use("/api", apiRouter);
app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error("Unhandled API error:", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2021") {
            return res.status(503).json({
                error: "Database tables are not fully initialized. Run Prisma db push/migrations.",
            });
        }
        return res.status(500).json({ error: "Database request failed" });
    }
    return res.status(500).json({ error: "Internal server error" });
});
