import Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    // Check authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email from profile
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    // Restrict to founder email
    if (profile?.email !== "julian@smartsendhq.com") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const subs = await stripe.subscriptions.list({ 
      status: "active", 
      limit: 100 
    });
    
    const mrr = subs.data.reduce((acc, s) => {
      const amount = s.items.data[0]?.price?.unit_amount || 0;
      return acc + amount / 100;
    }, 0);
    
    return NextResponse.json({ mrr: Math.round(mrr * 100) / 100 });
  } catch (error) {
    console.error("Error fetching MRR:", error);
    return NextResponse.json(
      { error: "Failed to fetch MRR" },
      { status: 500 }
    );
  }
}

