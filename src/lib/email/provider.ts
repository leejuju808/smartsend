type ProviderArgs = {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
};

async function sendBrevo(a: ProviderArgs) {
  const apiKey = process.env.BREVO_API_KEY!;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: a.from.match(/<(.*)>/)?.[1] ?? a.from, name: a.from.replace(/<.*>/, "").trim() },
      to: [{ email: a.to }],
      subject: a.subject,
      textContent: a.text,
      htmlContent: a.html,
      headers: a.headers ?? {},
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}`);
  return { ok: true } as const;
}

async function sendMailerSend(a: ProviderArgs) {
  const token = process.env.MAILERSEND_TOKEN!;
  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      from: { email: a.from.match(/<(.*)>/)?.[1] ?? a.from, name: a.from.replace(/<.*>/, "").trim() },
      to: [{ email: a.to }],
      subject: a.subject,
      text: a.text,
      html: a.html,
      headers: a.headers ?? {},
    }),
  });
  if (!res.ok) throw new Error(`MailerSend ${res.status}`);
  return { ok: true } as const;
}

async function sendDev(a: ProviderArgs) {
  // Dev transport: pretend success (useful for local testing)
  console.log("[DEV SEND] →", a.to, a.subject);
  return { ok: true } as const;
}

export async function sendViaProvider(a: ProviderArgs) {
  const pick = (process.env.EMAIL_PROVIDER || "dev").toLowerCase();
  if (pick === "brevo") return sendBrevo(a);
  if (pick === "mailersend") return sendMailerSend(a);
  return sendDev(a);
} 