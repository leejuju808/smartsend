import crypto from "crypto";

function getSecret(): string {
  const secret = process.env.TRACKING_SECRET;
  if (!secret) {
    throw new Error("TRACKING_SECRET is not set");
  }
  return secret;
}

export function signLink(url: string): string {
  const secret = getSecret();
  const { unsigned } = stripSignature(url);
  const signature = digest(secret, unsigned).slice(0, 16);
  const separator = unsigned.includes("?") ? "&" : "?";
  return `${unsigned}${separator}sig=${signature}`;
}

export function verifySignature(url: string): boolean {
  const secret = getSecret();
  const { unsigned, signature } = stripSignature(url);

  if (!signature) {
    return false;
  }

  const expected = digest(secret, unsigned).slice(0, 16);
  return safeEqual(signature, expected);
}

function stripSignature(url: string): {
  unsigned: string;
  signature: string | null;
} {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) {
    return { unsigned: url, signature: null };
  }

  const base = url.slice(0, queryIndex);
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const signature = params.get("sig");
  if (signature) {
    params.delete("sig");
  }

  const serialized = params.toString();
  const unsigned = serialized ? `${base}?${serialized}` : base;
  return { unsigned, signature };
}

function digest(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  try {
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}



