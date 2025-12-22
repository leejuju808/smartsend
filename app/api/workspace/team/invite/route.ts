import { createClient } from "@/lib/supabase/server";
import { getWorkspacePlanCaps } from "@/lib/server/billingCaps";

export async function POST(req: Request) {
  const supabase = createClient();
  const { email } = await req.json();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: meMembership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memErr || !meMembership) {
    return Response.json(
      { error: "No workspace membership found" },
      { status: 400 }
    );
  }

  if (!["owner", "admin"].includes(meMembership.role)) {
    return Response.json(
      { error: "forbidden", message: "Only owner/admin can invite." },
      { status: 403 }
    );
  }

  const workspaceId = meMembership.workspace_id as string;

  // 🔥 1) Fetch caps using billing_plans
  let planTier: string;
  let caps: { seat_limit: number };
  try {
    const planData = await getWorkspacePlanCaps(workspaceId);
    planTier = planData.planTier;
    caps = planData.caps;
  } catch (error: any) {
    console.error("[invite] getWorkspacePlanCaps error", error);
    return Response.json(
      { error: "failed_to_load_plan_caps" },
      { status: 500 }
    );
  }

  // 🔥 2) Count existing seats
  const { data: members, error: membersErr } = await supabase
    .from("team_members")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (membersErr) {
    console.error("[invite] team_members error", membersErr);
    return Response.json(
      { error: "members_query_failed" },
      { status: 500 }
    );
  }

  const seatsUsed = (members || []).length;

  if (seatsUsed >= caps.seat_limit) {
    // Hard block: seat limit reached
    return Response.json(
      {
        error: "seat_limit_reached",
        message:
          "You have reached your seat limit for this plan. Upgrade to add more teammates.",
        plan_tier: planTier,
        seats_used: seatsUsed,
        seat_limit: caps.seat_limit,
      },
      { status: 409 }
    );
  }

  // 🔥 3) (Optional) Avoid duplicate membership
  const { data: existingMember, error: existingErr } = await supabase
    .from("team_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .maybeSingle();

  if (existingErr) {
    console.error("[invite] existing member check error", existingErr);
  }

  if (existingMember) {
    return Response.json(
      {
        error: "already_member",
        message: "This email is already a member of the workspace.",
      },
      { status: 400 }
    );
  }

  // 🔥 4) Insert invite (simple direct member row — or you can use an invites table)
  const { data: newMember, error: insertErr } = await supabase
    .from("team_members")
    .insert({
      workspace_id: workspaceId,
      email,
      role: "member",
      // if you also store user_id once they accept, leave null for now
      user_id: null, // will be linked when user signs up with this email
    })
    .select("id, email, role")
    .single();

  if (insertErr) {
    console.error("[invite] insert error", insertErr);
    return Response.json(
      { error: "invite_insert_failed" },
      { status: 500 }
    );
  }

  return Response.json(
    {
      success: true,
      member: newMember,
      seats_used: seatsUsed + 1,
      seat_limit: caps.seat_limit,
    },
    { status: 200 }
  );
}

