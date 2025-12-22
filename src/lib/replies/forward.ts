export async function forwardToDetector(
  fnUrl: string,
  ownerUserId: string,
  normalized: { sender: string; subject: string | null; bodyText: string; messageId: string | null },
  serviceRoleKey: string
) {
  const resp = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      messageId: normalized.messageId ?? `provider-${Date.now()}`,
      sender: normalized.sender,
      subject: normalized.subject,
      bodyText: normalized.bodyText,
      ownerUserId,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || "Detector error");
  return data;
}
