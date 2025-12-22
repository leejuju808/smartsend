import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  mailboxes_overrides: z.array(
    z.object({
      mailbox_id: z.string().uuid(),
      health_score: z.number().min(0).max(100).optional(),
      bounce_rate_7d: z.number().min(0).max(100).optional(),
      user_cap: z.number().min(0).optional(),
      warmup_override: z.array(z.number().min(0)).optional(),
    })
  ).optional().default([]),
});

// Default warmup curve from Block 255 migration
const DEFAULT_WARMUP_CURVE = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150];

/**
 * Compute warmup limit for a mailbox on a given date
 */
function computeWarmupLimit(
  warmupOverride: number[] | null | undefined,
  warmupStartedAt: string | null,
  targetDate: string
): number {
  // If no warmup started, return 0
  if (!warmupStartedAt) {
    return 0;
  }

  const curve = warmupOverride || DEFAULT_WARMUP_CURVE;
  const startDate = new Date(warmupStartedAt);
  const target = new Date(targetDate);
  const daysSinceStart = Math.floor((target.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  if (daysSinceStart < 0) {
    return 0; // Not started yet
  }

  if (daysSinceStart === 0) {
    return curve[0] || 0;
  }

  const maxDay = curve.length;
  if (daysSinceStart > maxDay) {
    return curve[maxDay - 1]; // Use max from curve
  }

  return curve[daysSinceStart - 1] || 0;
}

/**
 * Compute 7-day bounce rate for a mailbox
 */
async function get7dBounceRate(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  mailboxId: string,
  targetDate: string
): Promise<number> {
  const target = new Date(targetDate);
  const sevenDaysAgo = new Date(target);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get total sent in last 7 days from mailbox_stats
  const { data: stats } = await supabase
    .from("mailbox_stats")
    .select("sent")
    .eq("mailbox_id", mailboxId)
    .gte("date", sevenDaysAgo.toISOString().split("T")[0])
    .lte("date", targetDate);

  const totalSent = stats?.reduce((sum, s) => sum + (s.sent || 0), 0) || 0;

  // Get total bounces in last 7 days
  const { data: bounces } = await supabase
    .from("bounces")
    .select("id")
    .eq("mailbox_id", mailboxId)
    .gte("created_at", sevenDaysAgo.toISOString())
    .lte("created_at", new Date(target.getTime() + 24 * 60 * 60 * 1000).toISOString());

  const totalBounces = bounces?.length || 0;

  if (totalSent === 0) {
    return 0;
  }

  return (totalBounces / totalSent) * 100;
}

/**
 * Compute safe limit using same logic as Block 255
 */
function computeSafeLimit({
  warmupLimit,
  userCap,
  health,
  bounceRate,
}: {
  warmupLimit: number;
  userCap: number;
  health: number;
  bounceRate: number;
}): number {
  // If bounce rate > 10%, pause mailbox (return 0)
  if (bounceRate > 10) {
    return 0;
  }

  // Calculate base safe limit
  let safeLimit = Math.min(warmupLimit, userCap) * (health / 100);

  // Apply bounce rate penalty
  if (bounceRate > 5) {
    safeLimit = safeLimit * 0.5;
  }

  return Math.max(0, Math.floor(safeLimit));
}

/**
 * Classify risk level
 */
function classifyRisk(health: number, bounceRate: number, safeLimit: number): "Low" | "Medium" | "High" {
  if (safeLimit === 0 || bounceRate > 10 || health < 40) {
    return "High";
  }
  if (bounceRate > 5 || health < 60) {
    return "Medium";
  }
  return "Low";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate body
    const body = await req.json();
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { date, mailboxes_overrides } = parsed.data;

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.workspace_id) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    const workspaceId = membership.workspace_id;

    // Get all mailboxes for workspace
    const { data: mailboxes, error: mailboxesError } = await supabase
      .from("mailboxes")
      .select("id, from_email as email, warmup_started_at, daily_cap, health_score, workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    if (mailboxesError) {
      return NextResponse.json({ error: mailboxesError.message }, { status: 500 });
    }

    // If no mailboxes and no overrides, return empty
    if ((!mailboxes || mailboxes.length === 0) && mailboxes_overrides.length === 0) {
      return NextResponse.json({
        date,
        total_simulated_sends: 0,
        mailboxes: [],
        overall_risk: "Low",
      });
    }

    // Get mailbox IDs from overrides (for virtual mailboxes)
    const mailboxIdsWithOverrides = new Set(mailboxes_overrides.map((o) => o.mailbox_id));
    
    // Include all real mailboxes, plus any virtual ones from overrides
    const validMailboxes = mailboxes || [];

    // Create override map
    const overridesMap = new Map(
      mailboxes_overrides.map((o) => [o.mailbox_id, o])
    );

    // Process each mailbox (including virtual ones from overrides)
    const allMailboxIds = new Set([
      ...validMailboxes.map((mb) => mb.id),
      ...mailboxes_overrides.map((o) => o.mailbox_id),
    ]);

    const results = await Promise.all(
      Array.from(allMailboxIds).map(async (mailboxId) => {
        const mb = validMailboxes.find((m) => m.id === mailboxId);
        const override = overridesMap.get(mailboxId);

        // For virtual mailboxes (not in DB), use override values or defaults
        const warmupStartedAt = mb?.warmup_started_at ?? (override?.warmup_override ? new Date().toISOString() : null);
        const warmupLimit = computeWarmupLimit(
          override?.warmup_override ?? null,
          warmupStartedAt,
          date
        );

        const health = override?.health_score ?? mb?.health_score ?? 100;
        const userCap = override?.user_cap ?? mb?.daily_cap ?? 200;
        
        // Get bounce rate (with override or from DB)
        let bounceRate: number;
        if (override?.bounce_rate_7d !== undefined) {
          bounceRate = override.bounce_rate_7d;
        } else if (mb) {
          bounceRate = await get7dBounceRate(supabase, mb.id, date);
        } else {
          bounceRate = 0; // Default for virtual mailboxes
        }

        const safeLimit = computeSafeLimit({
          warmupLimit,
          userCap,
          health,
          bounceRate,
        });

        const risk = classifyRisk(health, bounceRate, safeLimit);

        // Get email from override or mailbox
        const email = override?.mailbox_id.startsWith("virtual-")
          ? `new-inbox@domain.com` // Will be replaced by frontend
          : mb?.email ?? "unknown@domain.com";

        return {
          mailbox_id: mailboxId,
          email,
          warmup_limit: warmupLimit,
          user_cap: userCap,
          health_score: health,
          bounce_rate_7d: bounceRate,
          simulated_safe_limit: safeLimit,
          risk,
        };
      })
    );

    const total = results.reduce((acc, r) => acc + r.simulated_safe_limit, 0);

    // Determine overall risk (use highest risk level)
    const riskLevels = { Low: 1, Medium: 2, High: 3 };
    const overallRisk = results.reduce(
      (max, r) => (riskLevels[r.risk] > riskLevels[max] ? r.risk : max),
      "Low" as "Low" | "Medium" | "High"
    );

    return NextResponse.json({
      date,
      total_simulated_sends: Math.floor(total),
      mailboxes: results,
      overall_risk: overallRisk,
    });
  } catch (error: any) {
    console.error("Error in simulate:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

