// lib/providers/resend.ts

export type SendPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  from?: string;
};

export type ProviderSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function providerSendResend(payload: SendPayload): Promise<ProviderSendResult> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "RESEND_API_KEY missing" };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: payload.from || "SmartSend AI <noreply@smartsend.ai>",
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        headers: payload.headers,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
      return { ok: false, error: `Resend error: ${errorData.message || res.statusText}` };
    }

    const data = await res.json();
    const messageId = (data?.id || data?.messageId || "").toString();
    
    if (!messageId) {
      return { ok: false, error: "no_message_id" };
    }

    return { ok: true, messageId };
  } catch (e: any) {
    return { ok: false, error: `resend_exception:${e?.message ?? String(e)}` };
  }
}
