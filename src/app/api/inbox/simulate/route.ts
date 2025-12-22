import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { from_email, subject, body } = await req.json();
  const workspace_id = "your-workspace-id";

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/inbox/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_id, from_email, subject, body }),
  });

  const json = await res.json();
  return NextResponse.json(json);
}