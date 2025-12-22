import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FOUNDER_EMAIL = "julian@smartsendhq.com";

export async function GET() {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is founder/admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  if (profile?.email !== FOUNDER_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: mrr }, { data: plans }, { data: credits }] = await Promise.all([
    supabase
      .from("admin_mrr")
      .select("mrr")
      .then((res) => ({
        data: res.data?.reduce((s, r) => s + (r.mrr || 0), 0) ?? 0,
      })),

    supabase
      .from("workspaces")
      .select("plan")
      .then((res) => ({
        data: {
          starter: res.data?.filter((w: any) => w.plan === "starter").length ?? 0,
          pro: res.data?.filter((w: any) => w.plan === "pro").length ?? 0,
          scale: res.data?.filter((w: any) => w.plan === "scale").length ?? 0,
        },
      })),

    supabase
      .from("credit_transactions")
      .select("delta")
      .then((res) => ({
        data:
          res.data
            ?.filter((r: any) => r.delta > 0)
            .reduce((s: number, r: any) => s + r.delta, 0) ?? 0,
      })),
  ]);

  return NextResponse.json({
    mrr,
    plans,
    creditsPurchased: credits,
  });
}

