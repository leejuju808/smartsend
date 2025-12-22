import { createClient } from "@supabase/supabase-js";

type RecordSendInput = {
  account_id: string;
  campaign_id?: string | null;
  lead_id: string;
  message_id?: string | null;
  preset_key: string;
  variant: {
    variant_id: string;
    name?: string | null;
  };
  to_email?: string | null;
  subject?: string | null;
  status?: "queued" | "sent" | "failed";
  meta?: Record<string, unknown>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function recordSend(payload: RecordSendInput) {
  const status = payload.status ?? "sent";

  await supabase.from("email_sends").insert({
    account_id: payload.account_id,
    campaign_id: payload.campaign_id ?? null,
    lead_id: payload.lead_id,
    message_id: payload.message_id ?? null,
    preset_key: payload.preset_key,
    variant_id: payload.variant.variant_id,
    subject: payload.subject ?? null,
    to_email: payload.to_email ?? null,
    status,
    meta: {
      ...(payload.meta ?? {}),
      variant_name: payload.variant.name ?? null,
    },
  });
}

