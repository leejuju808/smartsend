// Block 8410 — Smart Template Rewriter v1
// app/api/templates/[templateId]/rewrite/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: Request,
  { params }: { params: { templateId: string } }
) {
  const { intent } = await req.json().catch(() => ({}));
  if (
    !intent ||
    ![
      "shorter",
      "longer",
      "more_casual",
      "more_formal",
      "new_angle",
      "subject_only",
    ].includes(intent)
  ) {
    return NextResponse.json({ error: "Invalid or missing intent" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  // Optional: get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/rewrite-template`;

  try {
    const res = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        template_id: params.templateId,
        intent,
        owner_user_id: user?.id ?? null,
      }),
    });

    // Block 8470 — Pass through 402 status for plan gating
    if (res.status === 402) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return NextResponse.json(
          { error: json.error || "Smart template rewriter is only available on Pro plans." },
          { status: 402 }
        );
      } catch {
        return NextResponse.json(
          { error: text || "Smart template rewriter is only available on Pro plans." },
          { status: 402 }
        );
      }
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("rewrite-template failed:", res.status, text);
      return NextResponse.json(
        { error: "rewrite-template failed" },
        { status: 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Error calling rewrite-template:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
