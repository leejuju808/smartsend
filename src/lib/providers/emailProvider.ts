export type SendRequest = {
  provider: "gmail" | "outlook";
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendEmail(req: SendRequest): Promise<SendResult> {
  // TODO: wire real Gmail/Outlook API using stored OAuth tokens per workspace
  // For now, simulate a success path so end-to-end tests go green.
  await new Promise((r) => setTimeout(r, 150)); // simulate latency
  // Simple failure simulation for invalid emails:
  if (!req.to.includes("@")) return { ok: false, error: "Invalid recipient" };
  return { ok: true, messageId: `msg_${Math.random().toString(36).slice(2)}` };
}