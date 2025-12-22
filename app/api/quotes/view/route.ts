import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication (optional for public view tracking, but verify quote exists)
    const { data: { user } } = await supabase.auth.getUser();
    
    const { quote_id } = await req.json();

    if (!quote_id) {
      return NextResponse.json({ error: "quote_id required" }, { status: 400 });
    }

    // Check if quote exists and get lead_id
    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select("id, lead_id, total, status")
      .eq("id", quote_id)
      .single();

    if (quoteErr || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    // Only update if not already viewed
    if (quote.status !== "viewed") {
      const { error: updErr } = await supabase
        .from("quotes")
        .update({
          status: "viewed",
          viewed_at: new Date().toISOString()
        })
        .eq("id", quote_id);

      if (updErr) {
        console.error("Error updating quote view:", updErr);
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }

      // Log timeline event
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const addEventUrl = process.env.ADD_LEAD_EVENT_URL || 
        (supabaseUrl ? `${supabaseUrl}/functions/v1/add-lead-event` : null);
      
      if (addEventUrl) {
        try {
          await fetch(addEventUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              lead_id: quote.lead_id,
              event_type: "quote_viewed",
              event_subtype: "homeowner",
              message: `Homeowner viewed estimate ($${Number(
                quote.total
              ).toLocaleString()})`,
              metadata: { quote_id }
            })
          });
        } catch (eventErr) {
          console.error("Failed to log timeline event:", eventErr);
          // Don't fail the whole request if timeline logging fails
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unexpected error in view quote:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










































