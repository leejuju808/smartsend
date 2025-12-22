import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("sequence_templates")
      .select("*")
      .eq("visibility", "public")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch public templates" },
      { status: 500 }
    );
  }
}



