import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: pol } = await supabase.from("ai_routing_policy").select("*").eq("name", "replies-cls").maybeSingle();
  const { data: job } = await supabase.from("ai_training_jobs")
    .select("id,status,provider_job_id,model_version_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    ...(pol ?? {}),
    training_job_id: job?.id ?? null,
    training_status: job?.status ?? null,
    training_provider_job_id: job?.provider_job_id ?? null,
    training_model_version_id: job?.model_version_id ?? null,
  });
}

