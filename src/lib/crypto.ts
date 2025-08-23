import crypto from "crypto";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex"); // 64-char hex
}

export function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
} 