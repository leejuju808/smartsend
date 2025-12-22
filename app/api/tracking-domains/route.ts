import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Domain = z
  .string()
  .min(1)
  .transform((value) => value.trim().toLowerCase())
  .transform((value) => value.replace(/^https?:\/\//, "").split("/")[0])
  .refine(
    (value) => /^(?!-)(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(value),
    { message: "Invalid domain" },
  );

const Body = z.object({ domain: Domain });

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.from("tracking_domains").select("*");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const payload = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { domain } = parsed.data;
  const { data, error } = await supabase
    .from("tracking_domains")
    .insert({ domain })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ item: data });
}


