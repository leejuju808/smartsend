import { NextResponse } from "next/server";

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { ok: false, error: "Supabase credentials are not configured" },
      { status: 500 },
    );
  }

  const endpoint = `${supabaseUrl}/functions/v1/compile_reply_rules`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = { ok: response.ok };
  }

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: (data as { error?: string }).error ?? "Compile failed" },
      { status: response.status },
    );
  }

  return NextResponse.json(data, { status: 200 });
}


