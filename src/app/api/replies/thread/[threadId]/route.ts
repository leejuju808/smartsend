import { NextResponse } from "next/server";
import { getGmailAccessToken } from "@/lib/google/token";

export async function GET(_: Request, { params }: { params: { threadId: string } }) {
  const token = await getGmailAccessToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${params.threadId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const json = await res.json();
  return NextResponse.json(json);
}

