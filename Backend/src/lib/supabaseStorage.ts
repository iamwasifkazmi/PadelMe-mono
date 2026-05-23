import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

let client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function supabaseStorageConfigured(): boolean {
  return Boolean(getSupabase() && process.env.SUPABASE_STORAGE_BUCKET?.trim());
}

function bucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "verification";
}

/** Parse data URL or return null if already https. */
export function parseDataUrl(input: string): { mime: string; buffer: Buffer } | null {
  const trimmed = input.trim();
  const m = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

export async function uploadVerificationImage(
  userEmail: string,
  kind: "id" | "selfie",
  source: string,
): Promise<string> {
  const trimmed = source.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  const supabase = getSupabase();
  if (!supabase) return trimmed;

  const parsed = parseDataUrl(trimmed);
  if (!parsed) return trimmed;

  const ext = parsed.mime.includes("png") ? "png" : "jpg";
  const safeEmail = userEmail.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const path = `${safeEmail}/${kind}-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;

  const { error } = await supabase.storage.from(bucketName()).upload(path, parsed.buffer, {
    contentType: parsed.mime,
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucketName()).getPublicUrl(path);
  return data.publicUrl;
}
