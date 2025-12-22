export type SendErr = { type: "transient" | "hard" | "rate"; code: string; message: string };

export function classifyError(e: unknown): SendErr {
  const msg = (e as any)?.message?.toLowerCase?.() || String(e || "");
  // Gmail/HTTP hints
  if (msg.includes("429") || msg.includes("rate") || msg.includes("user-rate") || msg.includes("limit")) {
    return { type: "rate", code: "rate_limited", message: String(e) };
  }
  if (msg.includes("timeout") || msg.includes("temporarily") || msg.includes("5xx") || msg.includes("backend error")) {
    return { type: "transient", code: "temp_error", message: String(e) };
  }
  // SMTP style signals sometimes appear in relay errors or vendor messages
  if (/\b(550|551|552|553|user unknown|mailbox unavailable|invalid recipient|bounced)\b/i.test(msg)) {
    return { type: "hard", code: "smtp_550", message: String(e) };
  }
  // Default conservative: transient once
  return { type: "transient", code: "unknown_error", message: String(e) };
}

export function nextBackoffSeconds(attempt: number) {
  // capped exponential backoff: 2^attempt * 30s (attempt starts at 0)
  const base = Math.pow(2, Math.max(0, attempt)) * 30;
  return Math.min(base, 60 * 30); // cap at 30 minutes
}


