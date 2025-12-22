import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

const Patch = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  visibility: z.enum(["private", "team", "system"]).optional(),
  scope: z.enum(["account", "campaign"]).optional(),
  campaignId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  await setAccountContext(supabase);

  let body: z.infer<typeof Patch>;
  try {
    body = Patch.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("saved_views")
    .select("account_id, visibility, scope, campaign_id, owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!existing.account_id) {
    return NextResponse.json({ error: "Saved view missing account" }, { status: 400 });
  }

  const { data: membershipRow, error: membershipError } = await supabase
    .from("saved_view_memberships")
    .select("role")
    .eq("view_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const { data: accountMembership, error: accountMembershipError } = await supabase
    .from("account_members")
    .select("role")
    .eq("account_id", existing.account_id)
    .eq("user_id", user.id)
    .or("is_active.is.null,is_active.eq.true")
    .limit(1)
    .maybeSingle();

  if (accountMembershipError) {
    return NextResponse.json({ error: accountMembershipError.message }, { status: 400 });
  }

  const isOwner = existing.owner_id === user.id;
  const isAccountAdmin = accountMembership?.role === "owner" || accountMembership?.role === "admin";
  const membershipRole = membershipRow?.role;
  const hasEditorAccess =
    isOwner || isAccountAdmin || membershipRole === "editor" || membershipRole === "owner";

  if (!hasEditorAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.visibility !== undefined) {
    updates.visibility = body.visibility;
    updates.is_system = body.visibility === "system";
  }
  if (body.scope !== undefined) updates.scope = body.scope;

  const nextScope = body.scope ?? existing.scope ?? "account";

  if (body.scope !== undefined) {
    if (body.scope === "campaign") {
      const nextCampaign = body.campaignId ?? existing.campaign_id;
      if (!nextCampaign) {
        return NextResponse.json(
          { error: "campaignId is required when scope is campaign" },
          { status: 400 }
        );
      }
      updates.campaign_id = nextCampaign;
    } else {
      updates.campaign_id = null;
    }
  } else if (body.campaignId !== undefined) {
    if (nextScope !== "campaign") {
      return NextResponse.json(
        { error: "campaignId can only be updated for campaign-scoped views" },
        { status: 400 }
      );
    }
    updates.campaign_id = body.campaignId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const needsAdmin =
    existing.visibility === "system" ||
    (body.visibility !== undefined && body.visibility === "system");

  if (needsAdmin && !isAccountAdmin) {
    return NextResponse.json({ error: "Only admins can modify system views" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("saved_views")
    .update(updates)
    .eq("id", params.id)
    .select("id, visibility")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id, visibility: data.visibility });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  await setAccountContext(supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: view, error: viewError } = await supabase
    .from("saved_views")
    .select("account_id, owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (viewError) {
    return NextResponse.json({ error: viewError.message }, { status: 400 });
  }

  if (!view) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!view.account_id || view.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the owner can delete this view" }, { status: 403 });
  }

  const { error } = await supabase.from("saved_views").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

