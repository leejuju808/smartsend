import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AutopilotSnapshot = {
  enabled: boolean;
  enabled_at: string | null;
  locked: boolean;
  locked_at: string | null;
  lock_days: number;
};

function toBool(v: unknown): boolean {
  return v === true || String(v || "").toLowerCase() === "true";
}

function toInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export async function getAutopilotSnapshot(workspaceId: string): Promise<AutopilotSnapshot> {
  // Best-effort: support older DBs that don't have autopilot_* columns yet.
  try {
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("autopilot_enabled, autopilot_enabled_at, autopilot_locked, autopilot_locked_at, autopilot_lock_days")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    return {
      enabled: toBool((data as any)?.autopilot_enabled),
      enabled_at: ((data as any)?.autopilot_enabled_at as string | null) ?? null,
      locked: toBool((data as any)?.autopilot_locked),
      locked_at: ((data as any)?.autopilot_locked_at as string | null) ?? null,
      lock_days: toInt((data as any)?.autopilot_lock_days, 14),
    };
  } catch {
    return { enabled: false, enabled_at: null, locked: false, locked_at: null, lock_days: 14 };
  }
}

export function isAutopilotSystemOverride(req: NextRequest): boolean {
  const expected = String(process.env.AUTOPILOT_SYSTEM_TOKEN || "").trim();
  if (!expected) return false;
  const token = String(req.headers.get("x-smartsend-system-token") || "").trim();
  return token && token === expected;
}

export async function blockIfAutopilotEnabled(opts: {
  req: NextRequest;
  workspaceId: string;
  action: string;
}): Promise<{ blocked: true; response: NextResponse } | { blocked: false; snapshot: AutopilotSnapshot }> {
  const snapshot = await getAutopilotSnapshot(opts.workspaceId);
  if (!snapshot.enabled) return { blocked: false, snapshot };
  if (isAutopilotSystemOverride(opts.req)) return { blocked: false, snapshot };

  return {
    blocked: true,
    response: NextResponse.json(
      {
        error: `AUTOPILOT is ON. ${opts.action} is locked.`,
        autopilot: snapshot,
      },
      { status: 423 }
    ),
  };
}




