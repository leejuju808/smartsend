import { NextResponse } from "next/server";
import { addSuppression } from "@/server/suppression";

function getUserId(req: Request) {
  return new URL(req.url).searchParams.get("userId");
}

export async function POST(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { emails, reason } = await req.json().catch(() => ({}));
  if (!Array.isArray(emails) || !emails.length)
    return NextResponse.json({ error: "emails[]" }, { status: 400 });
  const r = (reason === "complaint" ? "complaint" : "manual") as "complaint" | "manual";
  for (const raw of emails) {
    const email = String(raw || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    await addSuppression({ owner: userId, email, reason: r, source: "manual" });
  }
  return NextResponse.json({ ok: true });
}

