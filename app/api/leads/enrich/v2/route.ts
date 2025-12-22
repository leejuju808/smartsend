import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: Request,
) {
  try {
    const { lead_id } = await request.json();

    if (!lead_id) {
      return NextResponse.json({ error: "Missing lead_id" }, { status: 400 });
    }

    const supabase = createClient();

    // Get the lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get the edge function URL
    const edgeBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!edgeBaseUrl) {
      return NextResponse.json({ error: "Edge function URL not configured" }, { status: 500 });
    }

    const edgeFunctionUrl = `${edgeBaseUrl}/functions/v1/lead-enrich-v2`;

    // Call the edge function
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ lead }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Failed to enrich lead", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error("Deep enrich error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










