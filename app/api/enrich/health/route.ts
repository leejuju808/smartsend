import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = createClient();

  const { data: quotas, error: quotaError } = await supabase
    .from("vendor_quotas")
    .select("*")
    .order("source", { ascending: true });

  if (quotaError) {
    return NextResponse.json({ error: quotaError.message }, { status: 400 });
  }

  const { data: queue, error: queueError } = await supabase
    .from("enrichment_jobs")
    .select("status, count:id")
    .in("status", ["pending", "running", "failed"])
    .group("status");

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 400 });
  }

  return NextResponse.json({
    quotas: quotas ?? [],
    queue: queue ?? [],
  });
}



