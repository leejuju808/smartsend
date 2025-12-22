import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { assigned_to } = (await req.json().catch(() => ({}))) as { assigned_to?: string | null };

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, lead_id, assigned_to")
    .eq("id", params.id)
    .single();

  if (threadError || !thread) {
    const message = threadError?.message ?? "not found";
    return new Response(JSON.stringify({ error: message }), { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("inbox_threads")
    .update({ assigned_to: assigned_to ?? null })
    .eq("id", params.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 400 });
  }

  const { data: lead } = await supabase
    .from("campaign_leads")
    .select("campaign_id")
    .eq("id", thread.lead_id)
    .single();

  if (lead?.campaign_id) {
    await supabase.from("delivery_events").insert({
      campaign_id: lead.campaign_id,
      lead_id: thread.lead_id,
      event: assigned_to ? "thread_assigned" : "thread_unassigned",
      meta: { thread_id: params.id, to: assigned_to },
    });
  }

  return Response.json({ ok: true });
}





