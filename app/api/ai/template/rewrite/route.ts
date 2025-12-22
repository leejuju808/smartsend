import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subject, body, tone, length, variants, mergeFields } =
      await req.json();

    const { data, error } = await supabase.functions.invoke(
      "template-rewriter",
      {
        body: {
          subject,
          body,
          tone,
          length,
          variants,
          merge_fields: mergeFields,
        },
      }
    );

    if (error) {
      console.error("Error invoking template-rewriter:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error("Error in POST /api/ai/template/rewrite:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







