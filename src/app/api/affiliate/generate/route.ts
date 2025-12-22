import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Check if affiliate already exists
    const { data: existing } = await supabase
      .from("affiliates")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(existing);
    }

    // Generate unique referral code (8 characters)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const url = `https://smartsendhq.com/?ref=${code}`;

    // Insert new affiliate record
    const { data, error } = await supabase
      .from("affiliates")
      .insert({ user_id: userId, referral_code: code, referral_url: url })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

