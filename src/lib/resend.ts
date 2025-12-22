// lib/resend.ts
export const RESEND_API_BASE = "https://api.resend.com";

export async function resend(path: string, init: RequestInit = {}) {
  const key = process.env.RESEND_API_KEY!;
  const res = await fetch(`${RESEND_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}