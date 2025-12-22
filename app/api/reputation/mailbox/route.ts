import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type UpdatePayload = {
  email?: string;
  send_limit?: number;
  paused?: boolean;
};

function validatePayload(payload: UpdatePayload) {
  if (!payload.email) {
    return "email is required";
  }
  if (
    payload.send_limit !== undefined &&
    (!Number.isFinite(payload.send_limit) || payload.send_limit < 0)
  ) {
    return "send_limit must be a non-negative number";
  }
  if (
    payload.send_limit !== undefined &&
    !Number.isInteger(payload.send_limit)
  ) {
    return "send_limit must be an integer";
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const payload = (await req.json()) as UpdatePayload;
  const validationError = validatePayload(payload);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const updates: Record<string, unknown> = { last_update: new Date().toISOString() };

  if (payload.send_limit !== undefined) {
    updates.send_limit = payload.send_limit;
    if (payload.send_limit > 0) {
      updates.paused = false;
    }
  }

  if (payload.paused !== undefined) {
    updates.paused = payload.paused;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "no updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mailbox_health")
    .update(updates)
    .eq("email", payload.email!)
    .eq("account_id", user.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ mailbox: data });
}







