import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<any>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    const workspaceId = profile?.workspace_id;

    // Get mailboxes with today's usage
    const today = new Date().toISOString().split('T')[0];
    
    const { data: mailboxes, error: mailboxesError } = await supabase
      .from("mailboxes")
      .select(`
        *,
        mailbox_daily_usage!inner(
          sent_count
        )
      `)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("mailbox_daily_usage.date", today);

    if (mailboxesError) {
      console.error("Error fetching mailboxes:", mailboxesError);
      return NextResponse.json({ error: "Failed to fetch mailboxes" }, { status: 500 });
    }

    // Get mailboxes without usage today (to include them with 0 usage)
    const { data: unusedMailboxes, error: unusedError } = await supabase
      .from("mailboxes")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .not("id", "in", `(${mailboxes?.map(m => m.id).join(",") || ""})`);

    if (unusedError) {
      console.error("Error fetching unused mailboxes:", unusedError);
    }

    // Combine and format results
    const allMailboxes = [
      ...(mailboxes || []).map(m => ({
        ...m,
        used_today: m.mailbox_daily_usage?.[0]?.sent_count || 0,
        remaining_today: Math.max(0, m.daily_cap - (m.mailbox_daily_usage?.[0]?.sent_count || 0))
      })),
      ...(unusedMailboxes || []).map(m => ({
        ...m,
        used_today: 0,
        remaining_today: m.daily_cap
      }))
    ];

    // Add workspace mailboxes if user has workspace
    if (workspaceId) {
      const { data: workspaceMailboxes, error: wsError } = await supabase
        .from("mailboxes")
        .select(`
          *,
          mailbox_daily_usage!inner(
            sent_count
          )
        `)
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .eq("mailbox_daily_usage.date", today);

      if (!wsError && workspaceMailboxes) {
        const workspaceMailboxesFormatted = workspaceMailboxes.map(m => ({
          ...m,
          used_today: m.mailbox_daily_usage?.[0]?.sent_count || 0,
          remaining_today: Math.max(0, m.daily_cap - (m.mailbox_daily_usage?.[0]?.sent_count || 0))
        }));
        allMailboxes.push(...workspaceMailboxesFormatted);
      }
    }

    return NextResponse.json({
      mailboxes: allMailboxes,
      total_mailboxes: allMailboxes.length,
      total_used_today: allMailboxes.reduce((sum, m) => sum + m.used_today, 0),
      total_capacity_today: allMailboxes.reduce((sum, m) => sum + m.daily_cap, 0)
    });

  } catch (error) {
    console.error("Error in mailboxes list:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 