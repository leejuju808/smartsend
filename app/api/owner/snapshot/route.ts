// app/api/owner/snapshot/route.ts
// Block 21726 — SmartSend Roofing "Owner Snapshot" Top Bar v1
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = user.user_metadata?.company_id;
    if (!companyId) {
      return NextResponse.json({ error: "Missing company_id" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("get_owner_snapshot", {
      p_company_id: companyId,
    });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to load snapshot" },
        { status: 500 }
      );
    }

    const row = data?.[0] ?? null;
    return NextResponse.json({ data: row }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}











































