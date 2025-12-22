// API endpoint for phone number intelligence
// GET /api/phone/[number]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPhoneIntelligence } from "@/lib/phone-intelligence";

export async function GET(
  req: NextRequest,
  { params }: { params: { number: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's organization
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!orgMember?.org_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const phoneNumber = decodeURIComponent(params.number);
    const contactId = req.nextUrl.searchParams.get("contactId") || undefined;

    // Get phone intelligence
    const intelligence = await getPhoneIntelligence(
      supabase,
      phoneNumber,
      orgMember.org_id,
      contactId
    );

    return NextResponse.json(intelligence, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching phone intelligence:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch phone intelligence" },
      { status: 500 }
    );
  }
}





















































