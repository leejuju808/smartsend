import { NextRequest } from "next/server";
import { assertAdminOrThrow } from "@/lib/server/admin";

export async function GET(_req: NextRequest) {
  try {
    const { supabase } = await assertAdminOrThrow();

    const { data, error } = await supabase
      .from("billing_plans")
      .select(
        "plan_key, stripe_price_id, seat_limit, daily_send_cap, monthly_send_cap, monthly_reply_cap, updated_at"
      )
      .order("plan_key", { ascending: true });

    if (error) {
      console.error("[admin.billing-plans] query error", error);
      return Response.json({ error: "query_failed" }, { status: 500 });
    }

    return Response.json(
      {
        plans: data ?? [],
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err?.code === "not_admin") {
      return Response.json({ error: "not_admin" }, { status: 403 });
    }
    console.error("[admin.billing-plans] unexpected", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}




