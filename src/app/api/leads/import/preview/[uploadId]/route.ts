import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { uploadId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data, error } = await supabase
      .from("lead_upload_rows")
      .select("rownum, normalized, errors, valid")
      .eq("upload_id", params.uploadId)
      .order("rownum", { ascending: true })
      .limit(50);

    if (error) {
      console.error("Error fetching preview:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rows: data || [] });
  } catch (error: any) {
    console.error("Error in import/preview:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

