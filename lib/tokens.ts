export function randomToken(len = 32): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && typeof (crypto as any).getRandomValues === "function") {
    (crypto as any).getRandomValues(bytes);
  } else {
    // Node.js fallback
    const nodeCrypto = require("node:crypto");
    const buf = nodeCrypto.randomBytes(len);
    buf.copy(Buffer.from(bytes.buffer));
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


