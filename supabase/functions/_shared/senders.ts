import { ensureFreshToken, type Conn, type Provider } from "./oauth.ts";

function toBase64Url(input: string) {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

type SendArgs = {
  account: Conn;
  to: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  inReplyToMessageId?: string | null;
  threadId?: string | null;
};

type SendResult = {
  ok: boolean;
  providerMessageId?: string;
  providerThreadId?: string;
  errorCode?: string;
  retryAfter?: number;
};

export async function sendEmailViaProvider(
  provider: Provider,
  args: SendArgs
): Promise<SendResult> {
  try {
    const fresh = await ensureFreshToken(args.account);
    if (provider === "gmail") return await sendGmail(fresh, args);
    if (provider === "outlook") return await sendOutlook(fresh, args);
    return {
      ok: true,
      providerMessageId: crypto.randomUUID(),
      providerThreadId: args.threadId ?? crypto.randomUUID(),
    };
  } catch (_error) {
    return { ok: false, errorCode: "auth", retryAfter: 120 };
  }
}

async function sendGmail(acct: Conn, args: SendArgs): Promise<SendResult> {
  const from = acct.email!;
  const to = args.to;
  const subject = args.subject || "";
  const boundary = "mixed-" + crypto.randomUUID();
  const refs = args.inReplyToMessageId
    ? `\nIn-Reply-To: <${args.inReplyToMessageId}>\nReferences: <${args.inReplyToMessageId}>`
    : "";

  let body: string;
  if (args.html) {
    body = [
      `Content-Type: multipart/alternative; boundary=${boundary}\n`,
      `--${boundary}\nContent-Type: text/plain; charset=UTF-8\n\n${args.text || ""}\n`,
      `--${boundary}\nContent-Type: text/html; charset=UTF-8\n\n${args.html}\n`,
      `--${boundary}--`,
    ].join("");
  } else {
    body = args.text || "";
  }

  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0${refs}`,
    args.html ? "" : `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
  ].join("\n");

  const payload: Record<string, unknown> = { raw: toBase64Url(raw) };
  if (args.threadId) payload.threadId = args.threadId;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${acct.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: payload }),
  });

  const j = await res.json().catch(() => ({}));
  if (res.status === 429) return { ok: false, errorCode: "429", retryAfter: parseRetryAfter(res) };
  if (res.status === 401) return { ok: false, errorCode: "401" };
  if (!res.ok) return { ok: false, errorCode: String(res.status) };

  return { ok: true, providerMessageId: j?.id as string | undefined, providerThreadId: j?.threadId as string | undefined };
}

async function sendOutlook(acct: Conn, args: SendArgs): Promise<SendResult> {
  const json = {
    message: {
      subject: args.subject || "",
      toRecipients: [{ emailAddress: { address: args.to } }],
      body: {
        contentType: args.html ? "HTML" : "Text",
        content: args.html ?? args.text ?? "",
      },
      internetMessageHeaders: args.inReplyToMessageId
        ? [
            { name: "In-Reply-To", value: `<${args.inReplyToMessageId}>` },
            { name: "References", value: `<${args.inReplyToMessageId}>` },
          ]
        : [],
    },
    saveToSentItems: true,
  };

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      authorization: `Bearer ${acct.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(json),
  });

  if (res.status === 429 || res.status === 503) {
    return { ok: false, errorCode: "429", retryAfter: parseRetryAfter(res) };
  }
  if (res.status === 401) return { ok: false, errorCode: "401" };
  if (!res.ok) return { ok: false, errorCode: String(res.status) };

  return {
    ok: true,
    providerMessageId: crypto.randomUUID(),
    providerThreadId: args.threadId ?? crypto.randomUUID(),
  };
}

function parseRetryAfter(res: Response): number {
  const h = res.headers.get("retry-after");
  const n = h ? Number(h) : NaN;
  return Number.isFinite(n) ? Math.max(30, n) : 180;
}





