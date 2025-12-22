import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { extractMentions } from "@/lib/notes/utils";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id, user } = gate;
    const supabase = getServerSupabase();

    const { body } = await req.json();

    if (!body) {
      return NextResponse.json(
        { error: "body is required" },
        { status: 400 }
      );
    }

    // Verify note exists and user has permission
    const { data: existingNote, error: fetchError } = await supabase
      .from("notes")
      .select("id, workspace_id, user_id, thread_id")
      .eq("id", params.id)
      .single();

    if (fetchError || !existingNote) {
      return NextResponse.json(
        { error: "Note not found" },
        { status: 404 }
      );
    }

    if (existingNote.workspace_id !== workspace_id) {
      return NextResponse.json(
        { error: "Note not found in workspace" },
        { status: 403 }
      );
    }

    // Check permission: user must be creator or admin
    const { data: isAdmin } = await supabase.rpc("is_workspace_admin", {
      wid: workspace_id,
    });

    if (existingNote.user_id !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Extract mentions from new body
    const mentionUsernames = extractMentions(body);
    let mentionIds: string[] = [];

    if (mentionUsernames.length > 0) {
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

    // Update note
    const { data: note, error: updateError } = await supabase
      .from("notes")
      .update({
        body,
        mentions: mentionIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Create notifications for new mentions (if any)
    if (mentionIds.length > 0 && existingNote.thread_id) {
      const notifications = mentionIds.map((uid) => ({
        workspace_id,
        user_id: uid,
        type: "mention",
        title: "You were mentioned in a note",
        body: body.slice(0, 80),
        link: `/replies/${existingNote.thread_id}`,
      }));

      await supabase.from("notifications").insert(notifications);
    }

    return NextResponse.json({ ok: true, note });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update note" },
      { status: 500 }
    );
  }
}










