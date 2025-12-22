import { NextResponse } from "next/server";
import { ensureGmailToken } from "@/lib/google/ensureToken";
import { ensureOutlookToken } from "@/lib/outlook/ensureToken";

function b64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(req: Request) {
  const form = await req.formData();
  const to = String(form.get("to") || "");
  const provider = String(form.get("provider") || "gmail");
  if (!to) return NextResponse.redirect("/settings/email?err=no_to");

  if (provider === "outlook") {
    const token = await ensureOutlookToken();
    const payload = {
      message: {
        subject: "SmartSend Test",
        body: { contentType: "Text", content: "This is a test from SmartSend." },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: true
    };
    const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const ok = r.ok;
    return NextResponse.redirect(`/settings/email?${ok ? "ok=test_sent" : "err=test_failed"}`);
  } else {
    const token = await ensureGmailToken();
    const mime = `To: ${to}
Subject: SmartSend Test
Content-Type: text/plain; charset="UTF-8"

This is a test from SmartSend.`;

    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(mime) })
    });

    const ok = r.ok;
    return NextResponse.redirect(`/settings/email?${ok ? "ok=test_sent" : "err=test_failed"}`);
  }
}

