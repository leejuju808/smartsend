import crypto from "crypto";

// Derive root from full hostname ("send.acme.com" -> "acme.com") naive split
export function splitHost(hostname: string) {
  const parts = hostname.toLowerCase().split(".");
  if (parts.length < 2) throw new Error("Invalid hostname");
  const tracking_subdomain = parts[0];
  const root_domain = parts.slice(1).join(".");
  return { tracking_subdomain, root_domain };
}

// DKIM selector (static or random)
export function makeSelector() {
  return "smartsend";
}

// DKIM 2048-bit RSA key (Node only; store private outside DB in KMS if possible)
export function generateDKIMPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pub = publicKey.export({ type: "pkcs1", format: "pem" }).toString();
  const priv = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  // Convert PEM to TXT-friendly (remove headers/newlines)
  const pubBody = pub.replace(/-----(BEGIN|END) RSA PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  return { publicTxt: `v=DKIM1; k=rsa; p=${pubBody}`, privatePem: priv };
}

// Random TXT token for domain ownership
export function verifyToken() {
  return "smartsend-site-verification=" + crypto.randomBytes(16).toString("hex");
}

// Our tracking host to CNAME to (your app)
export function trackingTarget() {
  // Set this to your click/pixel domain. If you use the same host, point to your apex/app host.
  return process.env.TRACKING_EDGE_HOST || "trk.smartsend.ai";
} 