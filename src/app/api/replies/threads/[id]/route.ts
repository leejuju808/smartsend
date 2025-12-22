import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get thread
    const { data: thread, error: threadError } = await supabase
      .from("reply_threads")
      .select(`
        id,
        created_at,
        updated_at,
        last_message_at,
        ai_category,
        ai_summary,
        ai_action_items,
        ai_tone,
        ai_objections,
        ai_buyer_role,
        ai_opportunity_score,
        status,
        assigned_to,
        owner_id,
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
      .eq("id", params.id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from("reply_messages")
      .select("*")
      .eq("thread_id", params.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    }

    return NextResponse.json({
      thread: {
        id: thread.id,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        last_message_at: thread.last_message_at,
        ai_category: thread.ai_category,
        ai_summary: thread.ai_summary,
        ai_action_items: thread.ai_action_items,
        ai_tone: thread.ai_tone,
        ai_objections: thread.ai_objections,
        ai_buyer_role: thread.ai_buyer_role,
        ai_opportunity_score: thread.ai_opportunity_score,
        status: thread.status,
        assigned_to: thread.assigned_to || thread.owner_id,
        campaign_id: thread.campaign_id,
        lead_id: thread.lead_id,
        company_id: thread.company_id,
        lead_name: thread.leads
          ? `${thread.leads.first_name || ""} ${thread.leads.last_name || ""}`.trim() || thread.leads.email
          : "Unknown",
        lead_email: thread.leads?.email || "",
        company_name: thread.companies?.name || thread.leads?.company || null,
        campaign_name: thread.campaigns?.name || null,
      },
      messages: messages || [],
    });
  } catch (e: any) {
    console.error("Error in thread route:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

