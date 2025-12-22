import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function buildEmailBody(lead: any, quote: any, items: any[]) {
  const lines = items
    .map(
      (it) =>
        `• ${it.label} — ${it.quantity} x $${Number(
          it.unit_price
        ).toLocaleString()} = $${Number(it.total || (it.quantity * it.unit_price)).toLocaleString()}`
    )
    .join("\n");

  return `
Hi ${lead.name || lead.first_name || ""},

Here's your roofing estimate:

Estimate: ${quote.title}
Total: $${Number(quote.total).toLocaleString()}

Breakdown:
${lines || "See attached estimate details."}

If everything looks good, just reply to this email and we can get you scheduled.

Thanks,
Your roofing team
  `.trim();
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { quote_id } = await req.json();

    if (!quote_id) {
      return NextResponse.json({ error: "quote_id required" }, { status: 400 });
    }

    // 1) Fetch quote + lead + items
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*, leads!inner(*), quote_items(*)")
      .eq("id", quote_id)
      .single();

    if (error) {
      console.error("Error fetching quote:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!quote.leads || !quote.leads.email) {
      return NextResponse.json(
        { error: "Lead does not have an email." },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", quote.leads.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 2) Build email
    const subject = `Roofing Estimate - $${Number(quote.total).toLocaleString()}`;
    const bodyText = buildEmailBody(quote.leads, quote, quote.quote_items || []);
    const bodyHtml = bodyText.replace(/\n/g, "<br>");

    // 3) Get a connected account for sending (try to find user's account)
    const { data: accounts } = await supabase
      .from("connected_accounts")
      .select("id, provider, email_address")
      .eq("user_id", user.id)
      .limit(1);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: "No email account connected. Please connect an email account in settings." },
        { status: 400 }
      );
    }

    const account = accounts[0];

    // 4) Call send-email edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
    const sendResponse = await fetch(sendEmailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        account_id: account.id,
        to: quote.leads.email,
        subject,
        html: bodyHtml,
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error("Email send failed:", errorText);
      return NextResponse.json(
        { error: "Failed to send email", details: errorText },
        { status: 500 }
      );
    }

    // 5) Update quote + lead pipeline_stage
    const { error: updErr } = await supabase
      .from("quotes")
      .update({
        status: "sent",
        sent_at: new Date().toISOString()
      })
      .eq("id", quote_id);

    if (updErr) {
      console.error("Error updating quote:", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Move lead to "estimate_sent"
    const { error: leadErr } = await supabase
      .from("leads")
      .update({ pipeline_stage: "estimate_sent" })
      .eq("id", quote.lead_id);

    if (leadErr) {
      console.error("Error updating lead pipeline:", leadErr);
      // Don't fail the whole request if pipeline update fails
    }

    // Timeline log
    const addEventUrl = process.env.ADD_LEAD_EVENT_URL || 
      `${supabaseUrl}/functions/v1/add-lead-event`;
    
    try {
      await fetch(addEventUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          lead_id: quote.lead_id,
          event_type: "quote_created",
          event_subtype: "sent",
          message: `Estimate sent for $${Number(quote.total).toLocaleString()}`,
          metadata: { quote_id }
        })
      });
    } catch (eventErr) {
      console.error("Failed to log timeline event:", eventErr);
      // Don't fail the whole request if timeline logging fails
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unexpected error in send quote:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

