import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, priceId, quantity = 1 } = await req.json();

    if (!workspaceId || !priceId) {
      return NextResponse.json(
        { error: "workspaceId and priceId are required" },
        { status: 400 }
      );
    }

    // Get workspace and ensure it exists
    const { data: ws, error: wsError } = await supabase
      .from("workspaces")
      .select("stripe_customer_id")
      .eq("id", workspaceId)
      .single();

    if (wsError || !ws) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    if (!ws.stripe_customer_id) {
      return NextResponse.json(
        { error: "Workspace does not have a Stripe customer ID" },
        { status: 400 }
      );
    }

    // Call the edge function to create checkout session
    const { data, error } = await supabase.functions.invoke(
      "stripe-credit-checkout",
      {
        body: {
          customer_id: ws.stripe_customer_id,
          price_id: priceId,
          quantity,
          return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/credits`,
        },
      }
    );

    if (error) {
      console.error("Stripe credit checkout error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create checkout" },
        { status: 400 }
      );
    }

    return NextResponse.json({ url: data.url });
  } catch (e: any) {
    console.error("Credit checkout route error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal Error" },
      { status: 500 }
    );
  }
}








