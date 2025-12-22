import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { body: test_email_body } = await req.json();

    // Invoke the deliverability-scan edge function
    const { data, error } = await supabase.functions.invoke("deliverability-scan", {
      body: {
        workspace_id: params.id,
        test_email_body: test_email_body || "",
      },
    });

    if (error) {
      console.error("Error invoking deliverability-scan:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.error("Error in POST /api/workspaces/[id]/deliverability/run:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










