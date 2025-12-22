import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/importLeads`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      },
      body: form,
    });
    
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "error" }, { status: 500 });
  }
}

export const runtime = "edge";