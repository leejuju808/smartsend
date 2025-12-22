import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { job_id, mapping, fileText } = await req.json();

    if (!job_id || !mapping || !fileText) {
      return NextResponse.json(
        { error: "Missing job_id, mapping, or fileText" },
        { status: 400 }
      );
    }

    // Call Supabase Edge Function
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/processImport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id, mapping, fileText }),
      }
    );

    const json = await res.json();
    return NextResponse.json(json, { status: res.ok ? 200 : 400 });
  } catch (error: any) {
    console.error("Import process error:", error);
    return NextResponse.json(
      { error: error?.message || "Import process failed" },
      { status: 500 }
    );
  }
}

