import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { stripe } from "@/lib/stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Check authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email from profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    // Restrict to founder/admin access
    // You can modify this to check for admin role instead
    if (profile?.email !== "julian@smartsendhq.com") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch KPIs from database views
    const [{ data: kpis }, { data: cash }] = await Promise.all([
      supabaseAdmin.from("founder_kpis").select("*").single(),
      supabaseAdmin.from("cash_runway").select("*").single()
    ]);

    // Fetch MRR from Stripe as backup
    let mrr = 0;
    try {
      const subs = await stripe.subscriptions.list({ 
        status: "active", 
        limit: 100 
      });
      
      mrr = subs.data.reduce((acc, s) => {
        const amount = s.items.data[0]?.price?.unit_amount || 0;
        return acc + amount / 100;
      }, 0);
      
      mrr = Math.round(mrr * 100) / 100;
    } catch (error) {
      console.error("Error fetching MRR from Stripe:", error);
    }

    // If database view returns null values, use Stripe MRR
    const finalKpis = {
      mrr: kpis?.mrr || mrr || 0,
      churn: kpis?.churn || 0,
      activation: kpis?.activation || 0,
      partner_roi: kpis?.partner_roi || 0,
    };

    const finalCash = {
      months_left: cash?.months_left || null,
    };

    return NextResponse.json({ 
      kpis: finalKpis, 
      cash: finalCash 
    });
  } catch (error) {
    console.error("Error fetching founder metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch founder metrics" },
      { status: 500 }
    );
  }
}

