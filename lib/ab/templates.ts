import { selectVariant } from "./selectVariant";
import { supabaseAdmin } from "../supabase-admin";

export async function pickVariantTemplate({
  accountId,
  experimentId,
  leadId,
}: {
  accountId: string;
  experimentId: string;
  leadId: string;
}) {
  const variantId = await selectVariant({ accountId, experimentId, leadId });

  const { data, error } = await supabaseAdmin
    .from("ab_variants")
    .select("template_text")
    .eq("id", variantId)
    .single();

  if (error || !data?.template_text) {
    throw new Error(error?.message ?? "variant_template_missing");
  }

  return { variantId, templateText: data.template_text as string };
}

export async function storeAssignmentSendMessage({
  experimentId,
  leadId,
  messageId,
}: {
  experimentId: string;
  leadId: string;
  messageId: string;
}) {
  const { error } = await supabaseAdmin
    .from("ab_assignments")
    .update({ send_message_id: messageId })
    .eq("experiment_id", experimentId)
    .eq("lead_id", leadId);

  if (error) {
    throw new Error(error.message);
  }
}

