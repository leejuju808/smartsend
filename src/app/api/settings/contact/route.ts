import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "company_name, default_city, booking_url, phone, email_signature"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Contact settings load error:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }

  return NextResponse.json(
    data || {
      company_name: "",
      default_city: "",
      booking_url: "",
      phone: "",
      email_signature: "",
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { company_name, default_city, booking_url, phone, email_signature } = body;

  const { error } = await supabase
    .from("profiles")
    .update({
      company_name,
      default_city,
      booking_url,
      phone,
      email_signature,
    })
    .eq("id", user.id);

  if (error) {
    console.error("Contact settings save error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  // Mark contact info as set in onboarding
  await supabase
    .from("profiles")
    .update({ onboarding_contact_set: true })
    .eq("id", user.id);

  return NextResponse.json({ success: true }, { status: 200 });
}

