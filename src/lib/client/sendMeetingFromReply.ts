export async function processReplyForMeeting(opts: {
  messageId: string;
  senderEmail: string;  // your connected inbox/sender
  leadEmail: string;    // the person who replied
  leadFirstName?: string;
  subject?: string;
  body: string;         // the reply body
}) {
  const res = await fetch("/api/reply-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return res.json();
}
