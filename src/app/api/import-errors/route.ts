import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Item = {
  name: string;
  path: string;
  size: number;
  created_at: string;
  publicUrl: string | null;
};

export async function GET() {
  try {
    const sb = createServerClient();
    const bucket = sb.storage.from("imports");

    const { data, error } = await bucket.list("", {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items: Item[] = (data || [])
      .filter((o) => o.name?.startsWith("errors_") && o.name?.endsWith(".csv"))
      .map((o) => {
        const pub = bucket.getPublicUrl(o.name);
        const size = (o.metadata as any)?.size ?? 0;
        return {
          name: o.name,
          path: o.name,
          size,
          created_at: o.created_at as string,
          publicUrl: pub?.data?.publicUrl ?? null,
        } as Item;
      });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = String(body?.path || "").trim();
    if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

    const sb = createServerClient();
    const bucket = sb.storage.from("imports");
    const { error } = await bucket.remove([path]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}


