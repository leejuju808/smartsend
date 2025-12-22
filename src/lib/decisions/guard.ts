import { NextRequest, NextResponse } from "next/server";

type RequireDecisionArgs = {
  req: NextRequest;
  supabase: {
    from: (table: string) => any;
  };
  workspaceId: string;
  userId: string;
  decisionId: unknown;
  decisionTypes: string[];
  requireChoice?: "act" | "accept";
};

function isUuid(v: unknown): v is string {
  const s = String(v ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function requireDecisionForAction(args: RequireDecisionArgs):
  Promise<{ blocked: false } | { blocked: true; response: NextResponse }> {
  const { decisionId, supabase, workspaceId, userId, decisionTypes, requireChoice = "act" } = args;

  if (!isUuid(decisionId)) {
    return {
      blocked: true,
      response: NextResponse.json(
        {
          error: "Decision required (Act or Accept) before changing this.",
          code: "DECISION_REQUIRED",
          hint: "Open the Control Tower in SmartSend and choose Act or Accept.",
        },
        { status: 428 }
      ),
    };
  }

  const { data, error } = await supabase
    .from("ss_decisions")
    .select("id, workspace_id, created_by, created_at, decision_type, choice, valid_until")
    .eq("id", decisionId)
    .maybeSingle();

  if (error || !data) {
    return {
      blocked: true,
      response: NextResponse.json(
        { error: "Decision not found.", code: "DECISION_NOT_FOUND" },
        { status: 428 }
      ),
    };
  }

  if (String((data as any).workspace_id) !== workspaceId) {
    return {
      blocked: true,
      response: NextResponse.json(
        { error: "Decision does not match workspace.", code: "DECISION_WRONG_WORKSPACE" },
        { status: 428 }
      ),
    };
  }

  // Decision must be made by the same actor (no borrowed authority).
  if (String((data as any).created_by || "") !== userId) {
    return {
      blocked: true,
      response: NextResponse.json(
        { error: "Decision must be made by the current user.", code: "DECISION_WRONG_ACTOR" },
        { status: 428 }
      ),
    };
  }

  const dt = String((data as any).decision_type || "");
  if (!decisionTypes.includes(dt)) {
    return {
      blocked: true,
      response: NextResponse.json(
        { error: "Decision type does not authorize this action.", code: "DECISION_WRONG_TYPE" },
        { status: 428 }
      ),
    };
  }

  const choice = String((data as any).choice || "");
  if (choice !== requireChoice) {
    return {
      blocked: true,
      response: NextResponse.json(
        { error: `Decision must be "${requireChoice}".`, code: "DECISION_WRONG_CHOICE" },
        { status: 409 }
      ),
    };
  }

  const now = Date.now();
  const createdAt = new Date(String((data as any).created_at)).getTime();
  const validUntil = (data as any).valid_until ? new Date(String((data as any).valid_until)).getTime() : null;

  // Default freshness rule: must be very recent unless valid_until is explicitly set later.
  const maxAgeMs = 15 * 60 * 1000;
  const isExpired =
    (Number.isFinite(createdAt) && now - createdAt > maxAgeMs) ||
    (validUntil !== null && Number.isFinite(validUntil) && validUntil < now);

  if (isExpired) {
    return {
      blocked: true,
      response: NextResponse.json(
        { error: "Decision expired. Decide again (Act or Accept).", code: "DECISION_EXPIRED" },
        { status: 428 }
      ),
    };
  }

  return { blocked: false };
}



