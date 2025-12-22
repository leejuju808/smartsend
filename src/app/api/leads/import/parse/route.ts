import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { uploadId, storagePath, mapping } = await req.json();
    
    if (!uploadId || !storagePath || !mapping) {
      return NextResponse.json(
        { error: "uploadId, storagePath, and mapping required" },
        { status: 400 }
      );
    }

    // Call edge function to parse + stage
    const edgeFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/import-parse`
      : `${process.env.SUPABASE_URL}/functions/v1/import-parse`;

    const parseResponse = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        upload_id: uploadId, 
        storage_path: storagePath, 
        mapping 
      }),
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text();
      console.error("Parse error:", errorText);
      return NextResponse.json(
        { error: "Parse failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in import/parse:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

