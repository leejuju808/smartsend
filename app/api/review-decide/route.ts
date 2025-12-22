import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { review_id, decided_label } = await req.json();
  const userId = cookies().get("uid")?.value;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/review_decide`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({ review_id, decided_label, user_id: userId }),
  });

  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}

