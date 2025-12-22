import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const campaignId = searchParams.get("campaign_id");
    const leadId = searchParams.get("lead_id");
    const status = searchParams.get("status") || "open";
    const category = searchParams.get("category");

    // Build query
    let query = supabase
      .from("reply_threads")
      .select(`
        id,
        created_at,
        updated_at,
        last_message_at,
        ai_category,
        status,
        assigned_to,
        campaign_id,
        lead_id,
        company_id,
        leads:lead_id (
          id,
          email,
          first_name,
          last_name,
          company
        ),
        companies:company_id (
          id,
          name,
          domain
        ),
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .eq("status", status)
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (leadId) {
      query = query.eq("lead_id", leadId);
    }

    if (category) {
      query = query.eq("ai_category", category);
    }

    const { data: threads, error } = await query;

    if (error) {
      console.error("Error fetching threads:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format response
    const formatted = threads?.map((t: any) => ({
      id: t.id,
      created_at: t.created_at,
      updated_at: t.updated_at,
      last_message_at: t.last_message_at,
      ai_category: t.ai_category,
      status: t.status,
      assigned_to: t.assigned_to,
      campaign_id: t.campaign_id,
      lead_id: t.lead_id,
      company_id: t.company_id,
      lead_name: t.leads
        ? `${t.leads.first_name || ""} ${t.leads.last_name || ""}`.trim() || t.leads.email
        : "Unknown",
      lead_email: t.leads?.email || "",
      company_name: t.companies?.name || t.leads?.company || null,
      campaign_name: t.campaigns?.name || null,
    }));

    return NextResponse.json({ threads: formatted || [] });
  } catch (e: any) {
    console.error("Error in threads route:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

