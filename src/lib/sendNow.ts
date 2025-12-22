type SendNowInput = {
  threadId: string;
  campaignId: string;
  leadId: string;
  fromAccountId?: string;
  subject?: string;
  body?: string;
  stepNo?: number;
  provider?: "gmail" | "outlook" | "sim";
  mode?: "last-draft" | "explicit";
};

export async function sendNow(input: SendNowInput) {
  const payload: Record<string, unknown> = {
    mode: input.mode ?? "last-draft",
    thread_id: input.threadId,
    campaign_id: input.campaignId,
    lead_id: input.leadId,
    step_no: input.stepNo ?? 1,
    provider: input.provider ?? "gmail",
  };

  if (input.fromAccountId) {
    payload.from_account_id = input.fromAccountId;
  }

  if (payload.mode === "explicit") {
    payload.subject = input.subject ?? "";
    payload.body = input.body ?? "";
  }

  const res = await fetch("/api/send-now", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 402) {
    const error = new Error("quota_exceeded");
    (error as any).code = "quota_exceeded";
    (error as any).status = 402;
    throw error;
  }

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Failed to send now");
  }

  return res.json();
}

