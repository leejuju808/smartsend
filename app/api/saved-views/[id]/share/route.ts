import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Supabase credentials are not configured");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ShareBody = {
  email?: string;
  role?: "viewer" | "editor" | "owner";
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: ShareBody;

  try {
    body = (await req.json()) ?? {};
  } catch (error) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  const role = body.role ?? "viewer";
  if (!["viewer", "editor", "owner"].includes(role)) {
    return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  const { data: view, error: viewError } = await supabase
    .from("saved_views")
    .select("id, account_id")
    .eq("id", params.id)
    .maybeSingle();

  if (viewError) {
    return NextResponse.json({ ok: false, error: viewError.message }, { status: 400 });
  }

  if (!view) {
    return NextResponse.json({ ok: false, error: "view_not_found" }, { status: 404 });
  }

  // Lookup user by email
  const { data: userList, error: adminError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1,
    email: normalizedEmail,
  });

  if (adminError) {
    return NextResponse.json({ ok: false, error: adminError.message }, { status: 500 });
  }

  const user = userList.users?.[0];

  if (user) {
    const { error } = await supabase.from("saved_view_memberships").upsert(
      {
        account_id: view.account_id,
        view_id: view.id,
        user_id: user.id,
        role,
      },
      { onConflict: "view_id,user_id" }
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, status: "added_member" });
  }

  const { error: inviteError } = await supabase.from("saved_view_invites").upsert(
    {
      account_id: view.account_id,
      view_id: view.id,
      email: normalizedEmail,
      role,
    },
    { onConflict: "view_id,email" }
  );

  if (inviteError) {
    return NextResponse.json({ ok: false, error: inviteError.message }, { status: 400 });
  }

  // TODO: send notification email

  return NextResponse.json({ ok: true, status: "invited" });
}

