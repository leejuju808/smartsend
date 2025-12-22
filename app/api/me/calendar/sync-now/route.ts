import { NextResponse } from "next/server";

export async function POST() {
  const fn = `${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/calendar-sync`;
  const r = await fetch(fn, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return NextResponse.json(
      { error: (j as { error?: string }).error || "sync_failed" },
      { status: 500 }
    );
  }
  return NextResponse.json(j);
}


