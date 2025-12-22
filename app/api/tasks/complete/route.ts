// app/api/tasks/complete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as { taskId?: string };

    if (!body.taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("followup_tasks")
      .update({
        completed_at: new Date().toISOString(),
      })
      .eq("id", body.taskId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to complete task", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    );
  }
}


























































