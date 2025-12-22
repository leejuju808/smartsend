export async function selectVariant({
  accountId,
  experimentId,
  leadId,
}: {
  accountId: string;
  experimentId: string;
  leadId: string;
}) {
  const endpoint = process.env.AB_SELECT_URL;
  if (!endpoint) {
    throw new Error("missing_ab_select_url");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account_id: accountId,
      experiment_id: experimentId,
      lead_id: leadId,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "ab_select_failed");
  }

  return payload.variant_id as string;
}

