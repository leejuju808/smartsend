export async function queueEmail(input: {
  to: string; 
  subject: string; 
  html: string;
  scheduledFor?: string; 
  maxAttempts?: number;
  campaignId?: string | null;
}) {
  const res = await fetch("/api/queue-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Queue failed (${res.status})`);
  }
  return await res.json();
}