"use server";

type SendArgs = {
  threadId?: string;
  toEmail: string;
  subject: string;
  body: string;
};

/**
 * TODO:
 * - Wire to Gmail/Outlook send (Edge Function or API route).
 * - Optionally insert the outbound into `email_messages` for local thread history.
 */
export async function sendReply({ threadId, toEmail, subject, body }: SendArgs) {
  // Placeholder: persist locally for now so UI feels real.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/replies/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, toEmail, subject, body }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Send failed: ${res.status}`);
  } catch (e) {
    console.error(e);
    throw e;
  }
}


