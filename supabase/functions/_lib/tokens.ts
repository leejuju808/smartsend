export async function sign(data: Record<string, any>, secret: string) {
  const payload = btoa(JSON.stringify(data));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${payload}.${sig}`;
}

export async function verify(token: string, secret: string) {
  const [payload, sig] = token.split(".");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expectedBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(expectedBuf)));
  if (sig !== expected) throw new Error("bad token");
  return JSON.parse(atob(payload));
}

