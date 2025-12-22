import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OutreachState = "running" | "paused";

export type OutreachSnapshot = {
  state: OutreachState;
  paused_at: string | null;
  paused_reason: string | null;
};

function normalizeState(v: unknown): OutreachState {
  const s = String(v || "").toLowerCase();
  return s === "paused" ? "paused" : "running";
}

/**
 * Reads the workspace-wide SmartSend automation state.
 * Source of truth: public.workspaces.outreach_state
 */
export async function getOutreachSnapshot(workspaceId: string): Promise<OutreachSnapshot> {
  try {
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("outreach_state, outreach_paused_at, outreach_paused_reason")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;

    return {
      state: normalizeState((data as any)?.outreach_state),
      paused_at: ((data as any)?.outreach_paused_at as string | null) ?? null,
      paused_reason: ((data as any)?.outreach_paused_reason as string | null) ?? null,
    };
  } catch {
    return { state: "running", paused_at: null, paused_reason: null };
  }
}



