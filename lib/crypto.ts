import crypto from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";

function key() {
  const decoded = Buffer.from(env().APP_ENCRYPTION_KEY, "base64");
  if (decoded.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return decoded;
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(payload: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function signPublicAsset(value: string) {
  return crypto.createHmac("sha256", env().CRON_SECRET).update(value).digest("base64url");
}

export function verifyPublicAsset(value: string, signature: string) {
  const expected = signPublicAsset(value);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
