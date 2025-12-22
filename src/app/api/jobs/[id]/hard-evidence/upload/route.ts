import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const jobId = params.id;
    if (!jobId) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const category = String(form.get("category") || "").trim();

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (category !== "before" && category !== "after") {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Verify access to job (company-scoped). Fall back to a best-effort check if schema differs.
    const companyId = await getCurrentCompanyId();
    if (companyId) {
      const { data: job, error } = await supabase
        .from("jobs")
        .select("id, company_id")
        .eq("id", jobId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: "Failed to load job" }, { status: 500 });
      }
      if (!job || (job as any).company_id !== companyId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
    const path = `hard-evidence/${jobId}/${category}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

    const buf = await file.arrayBuffer();

    const { error: uploadError } = await serviceSupabase.storage.from("job-photos").upload(path, buf, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

    if (uploadError) {
      console.error("Hard evidence upload failed:", uploadError);
      return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
    }

    const { data: urlData } = serviceSupabase.storage.from("job-photos").getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      photo_url: urlData.publicUrl,
      storage_path: path,
    });
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[id]/hard-evidence/upload:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}



