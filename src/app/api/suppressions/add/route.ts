import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normEmail(e?: string) {
  if (!e) return null;
  const v = e.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

export async function POST(req: Request) {
  try {
    const { email, reason } = await req.json();
    const norm = normEmail(email);
    if (!norm) return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });

    const { error } = await supabase.from("suppressions").upsert(
      { email: norm, reason: reason || "manual" },
      { onConflict: "email" }
    );
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
