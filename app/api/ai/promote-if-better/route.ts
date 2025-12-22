import { NextResponse } from "next/server";

export async function POST() {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-promote-if-better`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  return NextResponse.json(await r.json());
}
















