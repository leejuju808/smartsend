import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { campaignId, leads }: { campaignId: string; leads: Array<{ id: string; email: string }> } = await req.json();

    if (!campaignId || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "Missing campaignId or leads" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const functionsUrl = supabaseUrl.replace(/\.supabase\.co/, ".functions.supabase.co");

    const res = await fetch(`${functionsUrl}/lead-verify`, {
      method: "POST",
      headers: {
        "x-ss-secret": process.env.LEAD_VERIFY_SECRET!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ campaignId, leads }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Verification failed" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}

