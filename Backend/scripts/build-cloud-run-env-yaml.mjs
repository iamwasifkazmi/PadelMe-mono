#!/usr/bin/env node
/**
 * Reads Backend/.env and writes a YAML file for:
 *   gcloud run services update ... --env-vars-file=PATH
 *
 * --env-vars-file replaces all Cloud Run env vars, so everything required in production
 * must be listed here. Run from Backend/: node scripts/build-cloud-run-env-yaml.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

function yamlDoubleQuoted(str) {
  return (
    '"' +
    String(str)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n") +
    '"'
  );
}

const defaultGoogleIds =
  process.env.GOOGLE_OAUTH_CLIENT_IDS ||
  process.env.GOOGLE_WEB_CLIENT_ID ||
  "775252415773-g3l6i0uvfpbi0tkl1o133v9dhe15o221.apps.googleusercontent.com,775252415773-9j5drsnrenjmgmvvlbpimr7k7o6qp5kp.apps.googleusercontent.com";

let jwtSecret = process.env.JWT_SECRET?.trim();
const envPath = path.join(backendRoot, ".env");
let jwtWarn = false;

if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString("hex");
  jwtWarn = true;
  if (fs.existsSync(envPath)) {
    fs.appendFileSync(envPath, `\n# Added for auth — keep in sync with Cloud Run\nJWT_SECRET=${jwtSecret}\n`, "utf8");
    console.error("[build-cloud-run-env-yaml] Added JWT_SECRET to Backend/.env");
  } else {
    console.error("[build-cloud-run-env-yaml] No JWT_SECRET and no .env — using one-time secret (add JWT_SECRET to .env).");
  }
}

const entries = Object.entries({
  NODE_ENV: "production",
  DATABASE_URL: process.env.DATABASE_URL?.trim(),
  DIRECT_URL: process.env.DIRECT_URL?.trim(),
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || "30d",
  SMTP_HOST: process.env.SMTP_HOST?.trim(),
  SMTP_PORT: process.env.SMTP_PORT?.trim() || "587",
  SMTP_USER: process.env.SMTP_USER?.trim(),
  SMTP_PASS: process.env.SMTP_PASS?.trim(),
  SMTP_FROM: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim(),
  OTP_EXPIRES_MINUTES: process.env.OTP_EXPIRES_MINUTES?.trim() || "10",
  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID?.trim() || "com.mipadel",
  GOOGLE_OAUTH_CLIENT_IDS: defaultGoogleIds,
});

const lines = [];
for (const [k, v] of entries) {
  if (v == null || v === "") {
    console.error(`[build-cloud-run-env-yaml] Skip empty: ${k}`);
    continue;
  }
  lines.push(`${k}: ${yamlDoubleQuoted(v)}`);
}

const outPath = path.join(backendRoot, "cloud-run.env.yaml");
fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log(outPath);

if (jwtWarn && !fs.existsSync(envPath)) {
  console.error(
    "[build-cloud-run-env-yaml] Create Backend/.env with JWT_SECRET for stable tokens across deploys.",
  );
}
