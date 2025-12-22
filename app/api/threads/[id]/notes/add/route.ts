import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: user } = await supabase.auth.getUser();

    if (!user.user) {
      return NextResponse.json({ error: "auth" }, { status: 401 });
    }

    const { body } = await req.json();

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    // Insert internal note
    const { error: noteError } = await supabase
      .from("internal_notes")
      .insert({
        thread_id: params.id,
        author_id: user.user.id,
        body: body.trim(),
      });

    if (noteError) {
      return NextResponse.json({ error: noteError.message }, { status: 400 });
    }

    // Get thread info for activity log
    const { data: thread } = await supabase
      .from("reply_threads")
      .select("account_id, campaign_id, lead_id")
      .eq("id", params.id)
      .single();

    // Get workspace_id from campaign or lead if not on thread
    let workspaceId: string | null = null;
    if (thread?.campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("workspace_id")
        .eq("id", thread.campaign_id)
        .maybeSingle();
      workspaceId = campaign?.workspace_id || null;
    }
    if (!workspaceId && thread?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", thread.lead_id)
        .maybeSingle();
      workspaceId = lead?.workspace_id || null;
    }

    // Detect mentions (@email pattern)
    const mentionPattern = /@([\w.-]+@[\w.-]+)/g;
    const mentions = body.match(mentionPattern) ?? [];
    const mentionedEmails = mentions.map((m) => m.substring(1)); // Remove @

    // Log event
    if (thread) {
      await supabase.from("activity_log").insert({
        event_type: "note_added",
        account_id: thread.account_id,
        campaign_id: thread.campaign_id,
        lead_id: thread.lead_id,
        meta: {
          thread_id: params.id,
          body: body.trim(),
          mentions: mentionedEmails,
        },
      });

      // Notify mentioned users
      if (mentionedEmails.length > 0 && workspaceId) {
        const adminClient = createRouteHandlerClient({ cookies });
        const { data: { user: adminUser } } = await adminClient.auth.getUser();
        
        // Use service role client for admin operations
        const { createClient: createAdminClient } = await import("@supabase/supabase-js");
        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        for (const email of mentionedEmails) {
          try {
            // Resolve email to user_id using user_id_by_email function
            const { data: userId } = await adminSupabase.rpc("user_id_by_email", {
              p_email: email,
            });

            if (userId) {
              // Call notify edge function
              await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  user_id: userId,
                  workspace_id: workspaceId,
                  type: "mention",
                  title: "You were mentioned in a comment",
                  body: body.slice(0, 80),
                  link: `/leads/${thread.lead_id ?? `threads/${params.id}`}`,
                }),
              }).catch((err) => {
                console.error("Failed to send notification:", err);
              });
            }
          } catch (err) {
            console.error(`Failed to notify ${email}:`, err);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

