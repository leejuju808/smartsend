import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { thread_id, action, option_label } = await req.json();

    if (!thread_id || !action) {
      return NextResponse.json(
        { error: "thread_id and action are required" },
        { status: 400 }
      );
    }

    const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-sdr-execute-action`;

    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: user.id,
        thread_id,
        action,
        option_label,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: text }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in execute-action route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


