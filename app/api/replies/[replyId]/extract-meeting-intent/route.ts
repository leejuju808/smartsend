import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest, { params }: { params: { replyId: string } }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Configuration missing" }, { status: 500 });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/meeting-intent-extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({ reply_id: params.replyId }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}















