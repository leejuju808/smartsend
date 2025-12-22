export async function enqueueEmail(input: {
  to_email: string;
  subject: string;
  html?: string;
  text?: string;
  to_name?: string;
  lead_id?: string;
  scheduled_at?: string;
  campaign_id?: string;
}) {
  const res = await fetch("/api/outbox/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ id: string }>;
}

