import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { extractMentions } from "@/lib/notes/utils";

export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id, user } = gate;
    const supabase = getServerSupabase();

    const { thread_id, body } = await req.json();

    if (!thread_id || !body) {
      return NextResponse.json(
        { error: "thread_id and body are required" },
        { status: 400 }
      );
    }

    // Get thread info to get workspace_id and lead_id
    const { data: thread, error: threadError } = await supabase
      .from("reply_threads")
      .select("workspace_id, lead_id")
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Verify thread belongs to workspace
    if (thread.workspace_id !== workspace_id) {
      return NextResponse.json(
        { error: "Thread not found in workspace" },
        { status: 403 }
      );
    }

    // Extract mentions from body
    const mentionUsernames = extractMentions(body);

    // Convert @username → user_id via workspace_members and profiles
    let mentionIds: string[] = [];
    if (mentionUsernames.length > 0) {
      // Get all workspace members with their profiles
      const { data: teamMembers, error: teamError } = await supabase
        .from("workspace_members")
        .select(`
          user_id,
          profiles (
            email,
            full_name
          )
        `)
        .eq("workspace_id", workspace_id);

      if (!teamError && teamMembers) {
        // Match usernames to emails (username is typically email prefix)
        mentionIds = teamMembers
          .filter((member: any) => {
            if (!member.profiles) return false;
            const email = member.profiles.email || "";
            const emailPrefix = email.split("@")[0];
            const fullName = member.profiles.full_name || "";
            
            return (
              mentionUsernames.includes(emailPrefix) ||
              mentionUsernames.includes(email) ||
              mentionUsernames.includes(fullName.toLowerCase().replace(/\s+/g, "."))
            );
          })
          .map((member: any) => member.user_id);
      }
    }

    // Insert note
    const { data: note, error: noteError } = await supabase
      .from("notes")
      .insert({
        workspace_id: thread.workspace_id,
        thread_id,
        lead_id: thread.lead_id,
        user_id: user.id,
        body,
        mentions: mentionIds,
      })
      .select()
      .single();

    if (noteError) {
      return NextResponse.json(
        { error: noteError.message },
        { status: 500 }
      );
    }

    // Create notifications for mentions
    if (mentionIds.length > 0) {
      const notifications = mentionIds.map((uid) => ({
        workspace_id,
        user_id: uid,
        type: "mention",
        title: "You were mentioned in a note",
        body: body.slice(0, 80),
        link: `/replies/${thread_id}`,
      }));

      await supabase.from("notifications").insert(notifications);
    }

    return NextResponse.json({ ok: true, note });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create note" },
      { status: 500 }
    );
  }
}










