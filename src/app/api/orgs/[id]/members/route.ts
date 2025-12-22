import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: members, error } = await supabase
      .from("org_members")
      .select(`
        id,
        role,
        created_at,
        profiles:user_id (
          id,
          email,
          full_name
        )
      `)
      .eq("org_id", params.id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Transform the data to flatten the profile information
    const transformedMembers = members?.map((member: any) => ({
      id: member.id,
      role: member.role,
      created_at: member.created_at,
      email: member.profiles?.email,
      full_name: member.profiles?.full_name,
      user_id: member.profiles?.id
    })) || [];

    return NextResponse.json(transformedMembers);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 