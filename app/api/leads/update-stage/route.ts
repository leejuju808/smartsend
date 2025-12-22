// app/api/leads/update-stage/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  contactId: z.string().uuid(),
  pipelineStage: z
    .enum(["HOT", "WARM", "FOLLOW_UP", "NOT_INTERESTED", "CLEAR"])
    .optional(),
});

export async function POST(req: Request) {
  const supabase = createClient();

  const json = await req.json();
  const parse = BodySchema.safeParse(json);

  if (!parse.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload" },
      { status: 400 }
    );
  }

  const { contactId, pipelineStage } = parse.data;

  // get current session user -> find account_id (adjust to your auth model)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Verify contact exists and user has access
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, workspace_id, account_id")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json(
      { ok: false, error: "Contact not found" },
      { status: 404 }
    );
  }

  // OPTIONAL: Verify workspace/account access
  // Check if user has access to this contact's workspace or account
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", contact.workspace_id)
    .maybeSingle();

  // If no workspace membership, check account membership
  if (!membership && contact.account_id) {
    const { data: accountMembership } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("account_id", contact.account_id)
      .maybeSingle();

    if (!accountMembership) {
      return NextResponse.json(
        { ok: false, error: "Access denied" },
        { status: 403 }
      );
    }
  } else if (!membership) {
    // If contact has no account_id and no workspace membership, deny access
    return NextResponse.json(
      { ok: false, error: "Access denied" },
      { status: 403 }
    );
  }

  const updatePayload =
    pipelineStage === "CLEAR"
      ? { pipeline_stage: null }
      : { pipeline_stage: pipelineStage ?? null };

  const { error } = await supabase
    .from("contacts")
    .update(updatePayload)
    .eq("id", contactId);

  if (error) {
    console.error("[update-stage] error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update stage" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}






























































