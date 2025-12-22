// Round-robin assignment logic for threads
// This can be called from edge functions or API routes when new threads are created

import { supabaseAdmin } from "@/server/supabase";

interface AssignmentResult {
  assignedUserId: string | null;
  nextCursor: number;
}

/**
 * Assign a new thread using round-robin algorithm
 * @param workspaceId - Workspace ID
 * @param threadId - Thread ID to assign
 * @param currentCursor - Current round-robin cursor position
 * @returns Updated cursor and assigned user ID
 */
export async function assignThreadRoundRobin(
  workspaceId: string,
  threadId: string,
  currentCursor?: number
): Promise<AssignmentResult> {
  // Get eligible team members (owner, admin, member with accepted_at)
  const { data: members, error } = await supabaseAdmin
    .from("team_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner")
    .not("accepted_at", "is", null)
    .order("user_id", { ascending: true });

  if (error || !members || members.length === 0) {
    // Fallback: try admin role
    const { data: adminMembers } = await supabaseAdmin
      .from("team_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId)
      .in("role", ["owner", "admin"])
      .not("accepted_at", "is", null)
      .order("user_id", { ascending: true });

    if (!adminMembers || adminMembers.length === 0) {
      // Final fallback: include members
      const { data: allMembers } = await supabaseAdmin
        .from("team_members")
        .select("user_id, role")
        .eq("workspace_id", workspaceId)
        .in("role", ["owner", "admin", "member"])
        .not("accepted_at", "is", null)
        .order("user_id", { ascending: true });

      if (!allMembers || allMembers.length === 0) {
        return { assignedUserId: null, nextCursor: 0 };
      }

      const cursor = currentCursor ?? 0;
      const nextIndex = cursor % allMembers.length;
      const assignedUser = allMembers[nextIndex];

      await supabaseAdmin
        .from("email_threads")
        .update({ owner_id: assignedUser.user_id })
        .eq("id", threadId);

      return {
        assignedUserId: assignedUser.user_id,
        nextCursor: cursor + 1,
      };
    }

    const cursor = currentCursor ?? 0;
    const nextIndex = cursor % adminMembers.length;
    const assignedUser = adminMembers[nextIndex];

    await supabaseAdmin
      .from("email_threads")
      .update({ owner_id: assignedUser.user_id })
      .eq("id", threadId);

    return {
      assignedUserId: assignedUser.user_id,
      nextCursor: cursor + 1,
    };
  }

  const cursor = currentCursor ?? 0;
  const nextIndex = cursor % members.length;
  const assignedUser = members[nextIndex];

  await supabaseAdmin
    .from("email_threads")
    .update({ owner_id: assignedUser.user_id })
    .eq("id", threadId);

  return {
    assignedUserId: assignedUser.user_id,
    nextCursor: cursor + 1,
  };
}

/**
 * Escalate thread: if intent is 'meeting' and owner_id is null, assign to first available admin
 */
export async function escalateThreadIfNeeded(
  workspaceId: string,
  threadId: string,
  intent?: string | null
): Promise<boolean> {
  if (intent !== "meeting") {
    return false;
  }

  // Check if thread is unassigned
  const { data: thread } = await supabaseAdmin
    .from("email_threads")
    .select("owner_id")
    .eq("id", threadId)
    .single();

  if (thread?.owner_id) {
    return false; // Already assigned
  }

  // Find first available admin
  const { data: admin } = await supabaseAdmin
    .from("team_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])
    .not("accepted_at", "is", null)
    .order("user_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (admin) {
    await supabaseAdmin
      .from("email_threads")
      .update({ owner_id: admin.user_id })
      .eq("id", threadId);
    return true;
  }

  return false;
}

/**
 * Get and update workspace round-robin cursor
 */
export async function getWorkspaceCursor(workspaceId: string): Promise<number> {
  // This would typically be stored in workspace_settings table
  // For now, we'll use a simple approach - you can enhance this to persist the cursor
  const { data } = await supabaseAdmin
    .from("workspace_settings")
    .select("round_robin_cursor")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return data?.round_robin_cursor ?? 0;
}

export async function updateWorkspaceCursor(
  workspaceId: string,
  cursor: number
): Promise<void> {
  await supabaseAdmin
    .from("workspace_settings")
    .upsert({
      workspace_id: workspaceId,
      round_robin_cursor: cursor,
    });
}

