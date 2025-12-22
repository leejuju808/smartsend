import "jsr:@supabase/functions-js/edge-runtime.d.ts";

let cachedKey: CryptoKey | null = null;
let cachedSecret: string | null = null;

const encoder = new TextEncoder();

export async function verifySignature(url: string): Promise<boolean> {
  const secret = Deno.env.get("TRACKING_SECRET");
  if (!secret) {
    console.error("[signing] TRACKING_SECRET is not set");
    return false;
  }

  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) {
    return false;
  }

  const base = url.slice(0, queryIndex);
  const rawQuery = url.slice(queryIndex + 1);
  const params = new URLSearchParams(rawQuery);
  const sig = params.get("sig");

  if (!sig) {
    return false;
  }

  params.delete("sig");
  const serializedParams = params.toString();
  const payload = serializedParams ? `${base}?${serializedParams}` : base;

  const check = (await hmacHex(secret, payload)).slice(0, 16);
  return timingSafeEqual(sig, check);
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  if (secret !== cachedSecret || !cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    cachedSecret = secret;
  }

  const signature = await crypto.subtle.sign(
    "HMAC",
    cachedKey!,
    encoder.encode(payload),
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}



