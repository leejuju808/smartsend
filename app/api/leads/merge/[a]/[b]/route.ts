import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ a: string; b: string }> }
) {
  const supabase = createClient();
  await setAccountContext(supabase);
  const { a, b } = await params;

  const { data: leadA, error: errorA } = await supabase
    .from("leads")
    .select("*")
    .eq("id", a)
    .single();

  const { data: leadB, error: errorB } = await supabase
    .from("leads")
    .select("*")
    .eq("id", b)
    .single();

  if (errorA || errorB) {
    return NextResponse.json(
      { error: errorA?.message || errorB?.message || "Failed to fetch leads" },
      { status: 500 }
    );
  }

  if (!leadA || !leadB) {
    return NextResponse.json(
      { error: "One or both leads not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ a: leadA, b: leadB });
}

