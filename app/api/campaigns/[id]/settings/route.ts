import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("campaign_settings")
    .select("*")
    .eq("campaign_id", params.id)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  if (!data) {
    const { data: created, error: insertError } = await supabase
      .from("campaign_settings")
      .insert({ campaign_id: params.id })
      .select("*")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
      });
    }

    return Response.json({ item: created });
  }

  return Response.json({ item: data });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json();

  const payload: Record<string, unknown> = { campaign_id: params.id };

  if (typeof body.ooo_resume_enabled === "boolean") {
    payload.ooo_resume_enabled = body.ooo_resume_enabled;
  }

  if (body.ooo_resume_delay_hours !== undefined) {
    const hours = Number(body.ooo_resume_delay_hours);

    if (!Number.isFinite(hours) || hours < 1) {
      return new Response(
        JSON.stringify({ error: "Delay hours must be a positive number." }),
        { status: 400 }
      );
    }

    payload.ooo_resume_delay_hours = Math.min(168, Math.round(hours));
  }

  const { data, error } = await supabase
    .from("campaign_settings")
    .upsert(payload, { onConflict: "campaign_id" })
    .select("*")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  // Handle auto_stop_on_any_reply on campaigns table
  const campaignPatch: Record<string, unknown> = {};
  if (typeof body.auto_stop_on_any_reply === "boolean") {
    campaignPatch.auto_stop_on_any_reply = body.auto_stop_on_any_reply;
  }

  if (Object.keys(campaignPatch).length > 0) {
    const { error: campaignError } = await supabase
      .from("campaigns")
      .update(campaignPatch)
      .eq("id", params.id);

    if (campaignError) {
      return new Response(
        JSON.stringify({ error: campaignError.message }),
        { status: 500 }
      );
    }
  }

  return Response.json({ item: data });
}





