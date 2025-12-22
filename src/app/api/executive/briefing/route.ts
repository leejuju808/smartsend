import { NextRequest, NextResponse } from "next/server";
import { generateOwnerDailyBriefing } from "@/lib/executive-brain";

// Owner Daily Briefing API
// GET /api/executive/briefing?companyId=...
// or POST { companyId }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  try {
    const briefing = await generateOwnerDailyBriefing(companyId);
    return NextResponse.json(briefing);
  } catch (error: any) {
    console.error("[ExecutiveBrain] Error generating briefing (GET)", error);
    return NextResponse.json({ error: "Failed to generate executive briefing" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companyId = body.companyId as string | undefined;

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  try {
    const briefing = await generateOwnerDailyBriefing(companyId);
    return NextResponse.json(briefing);
  } catch (error: any) {
    console.error("[ExecutiveBrain] Error generating briefing (POST)", error);
    return NextResponse.json({ error: "Failed to generate executive briefing" }, { status: 500 });
  }
}













