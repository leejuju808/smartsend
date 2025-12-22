import { NextRequest } from "next/server";
import { assertAdminOrThrow } from "@/lib/server/admin";

type UpdatePayload = {
  seat_limit?: number;
  daily_send_cap?: number;
  monthly_send_cap?: number;
  monthly_reply_cap?: number;
  stripe_price_id?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { plan_key: string } }
) {
  const planKey = params.plan_key;

  try {
    const { supabase } = await assertAdminOrThrow();

    let body: UpdatePayload = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }

    const patch: any = {};

    if (typeof body.seat_limit === "number") {
      patch.seat_limit = body.seat_limit;
    }
    if (typeof body.daily_send_cap === "number") {
      patch.daily_send_cap = body.daily_send_cap;
    }
    if (typeof body.monthly_send_cap === "number") {
      patch.monthly_send_cap = body.monthly_send_cap;
    }
    if (typeof body.monthly_reply_cap === "number") {
      patch.monthly_reply_cap = body.monthly_reply_cap;
    }
    if (body.stripe_price_id !== undefined) {
      patch.stripe_price_id = body.stripe_price_id;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "nothing_to_update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("billing_plans")
      .update(patch)
      .eq("plan_key", planKey)
      .select(
        "plan_key, stripe_price_id, seat_limit, daily_send_cap, monthly_send_cap, monthly_reply_cap, updated_at"
      )
      .single();

    if (error) {
      console.error("[admin.billing-plans.update] update error", error);
      return Response.json({ error: "update_failed" }, { status: 500 });
    }

    return Response.json({ plan: data }, { status: 200 });
  } catch (err: any) {
    if (err?.code === "not_admin") {
      return Response.json({ error: "not_admin" }, { status: 403 });
    }
    console.error("[admin.billing-plans.update] unexpected", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}




