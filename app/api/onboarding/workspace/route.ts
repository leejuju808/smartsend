import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type WorkspacePayload = {
  name: string;
  logoUrl?: string;
  timezone?: string;
  teamSize?: string;
  useCase?: string;
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 50);
}

function generateRandomSuffix(): string {
  return Math.random().toString(36).substring(2, 8).toLowerCase();
}

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as WorkspacePayload;
  const { name, logoUrl, timezone, teamSize, useCase } = body;

  if (!name) {
    return NextResponse.json({ error: "Workspace name required" }, { status: 400 });
  }

  // Get workspace_id from user's workspace_members (first workspace they belong to)
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace found for user" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Generate unique-ish slug
  let baseSlug = slugify(name) || "workspace";
  const randomSuffix = generateRandomSuffix();
  const slug = `${baseSlug}-${randomSuffix}`;

  // Basic defaults from "teamSize" if we want to be fancy
  let defaultCap = 200;
  if (teamSize === "solo") defaultCap = 100;
  if (teamSize === "2-5") defaultCap = 300;
  if (teamSize === "5-10") defaultCap = 400;
  if (teamSize === "10+") defaultCap = 800;

  const { error: updateError } = await supabase
    .from("workspaces")
    .update({
      name,
      slug,
      logo_url: logoUrl ?? null,
      sending_timezone: timezone ?? "America/Los_Angeles",
      default_daily_send_cap: defaultCap,
      onboarding_step: "connect_email", // move to next step
    })
    .eq("id", workspaceId);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: "Failed to update workspace" }, { status: 500 });
  }

  // Seed workspace_settings_kv (upsert in case we rerun)
  const settings = [
    {
      key: "sending_defaults",
      value: {
        timezone: timezone ?? "America/Los_Angeles",
        daily_cap: defaultCap,
        window_start: "08:00",
        window_end: "17:00",
      },
    },
    {
      key: "onboarding_profile",
      value: {
        team_size: teamSize ?? "solo",
        use_case: useCase ?? "cold_outbound",
      },
    },
  ];

  const { error: settingsError } = await supabase
    .from("workspace_settings_kv")
    .upsert(
      settings.map((s) => ({
        workspace_id: workspaceId,
        key: s.key,
        value: s.value,
      })),
      { onConflict: "workspace_id,key" }
    );

  if (settingsError) {
    console.error(settingsError);
    // not fatal for onboarding, still continue
  }

  return NextResponse.json({
    success: true,
    next: "/onboarding/connect-email",
  });
}










