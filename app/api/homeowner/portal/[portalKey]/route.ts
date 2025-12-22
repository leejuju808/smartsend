// Block 253900 — SmartSend Customer Experience Engine v1
// GET /api/homeowner/portal/[portalKey]
// Returns comprehensive homeowner portal data (public access via portal_key)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ portalKey: string }> }
) {
  try {
    const { portalKey } = await params;

    if (!portalKey) {
      return NextResponse.json(
        { error: "Portal key is required" },
        { status: 400 }
      );
    }

    // Get homeowner account by portal_key
    const { data: homeownerAccount, error: accountError } = await supabase
      .from("homeowner_accounts")
      .select("*")
      .eq("portal_key", portalKey)
      .eq("is_active", true)
      .single();

    if (accountError || !homeownerAccount) {
      return NextResponse.json(
        { error: "Invalid or inactive portal key" },
        { status: 401 }
      );
    }

    // Update last accessed timestamp
    await supabase
      .from("homeowner_accounts")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", homeownerAccount.id);

    const jobId = homeownerAccount.job_id;

    // Get job details (try multiple job tables)
    let job: any = null;
    const { data: roofingJob } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (roofingJob) {
      job = roofingJob;
    } else {
      const { data: jobAlt } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      job = jobAlt;
    }

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get live job progress timeline
    const { data: progressTimeline } = await supabase.rpc(
      "get_job_progress_timeline",
      { p_job_id: jobId }
    );

    // Get production milestones if available
    let milestones: any[] = [];
    try {
      const { data: prodMilestones } = await supabase
        .from("production_milestones")
        .select("*")
        .eq("job_id", jobId)
        .order("order_index", { ascending: true });
      milestones = prodMilestones || [];
    } catch (e) {
      // Milestones may not exist
    }

    // Get photos with AI explanations
    let photos: any[] = [];
    try {
      // Try crew_photos first
      const { data: crewPhotos } = await supabase
        .from("crew_photos")
        .select("id, photo_url, category, notes, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (crewPhotos && crewPhotos.length > 0) {
        // Get AI explanations for each photo
        const photoIds = crewPhotos.map((p) => p.id);
        const { data: explanations } = await supabase
          .from("photo_explanations")
          .select("*")
          .in("photo_id", photoIds);

        // Merge explanations with photos
        photos = crewPhotos.map((photo) => {
          const explanation = explanations?.find((e) => e.photo_id === photo.id);
          return {
            ...photo,
            url: photo.photo_url,
            explanation: explanation?.homeowner_explanation || null,
          };
        });
      } else {
        // Try job_photo_entries
        const { data: jobPhotos } = await supabase
          .from("job_photo_entries")
          .select("id, url, ai_detected_stage, ai_category, created_at")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });

        if (jobPhotos) {
          const photoIds = jobPhotos.map((p) => p.id);
          const { data: explanations } = await supabase
            .from("photo_explanations")
            .select("*")
            .in("job_photo_entry_id", photoIds);

          photos = jobPhotos.map((photo) => {
            const explanation = explanations?.find(
              (e) => e.job_photo_entry_id === photo.id
            );
            return {
              ...photo,
              category: photo.ai_detected_stage || photo.ai_category || "general",
              explanation: explanation?.homeowner_explanation || null,
            };
          });
        }
      }
    } catch (e) {
      console.error("Error fetching photos:", e);
    }

    // Organize photos by category (before/during/after)
    const photosByCategory = {
      before: photos.filter((p) => p.category === "before"),
      during: photos.filter((p) => p.category === "during" || p.category === "tear_off" || p.category === "underlayment" || p.category === "install"),
      after: photos.filter((p) => p.category === "after" || p.category === "completed"),
      other: photos.filter(
        (p) =>
          !["before", "during", "after", "tear_off", "underlayment", "install", "completed"].includes(
            p.category
          )
      ),
    };

    // Get documents (contract, warranty, change orders, etc.)
    let documents: any[] = [];
    try {
      // Try multiple document tables
      const { data: jobDocs } = await supabase
        .from("job_documents")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (jobDocs) {
        documents = jobDocs;
      } else {
        // Try attachments
        const { data: attachments } = await supabase
          .from("attachments")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });
        documents = attachments || [];
      }
    } catch (e) {
      // Documents may not exist
    }

    // Get homeowner messages
    const { data: messages } = await supabase
      .from("homeowner_messages")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    // Get service requests
    const { data: serviceRequests } = await supabase
      .from("service_requests")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Get warranty claims
    const { data: warrantyClaims } = await supabase
      .from("warranty_claims")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Calculate progress percentage
    let progress = 0;
    if (job.status === "completed") {
      progress = 100;
    } else if (job.status === "in_progress") {
      progress = job.progress || 50;
    } else if (job.status === "scheduled") {
      progress = 25;
    } else {
      progress = 10;
    }

    // Get company/workspace info
    let company: any = null;
    if (job.company_id) {
      const { data: roofingCompany } = await supabase
        .from("roofing_companies")
        .select("id, name, logo_url, phone, email")
        .eq("id", job.company_id)
        .single();
      company = roofingCompany;
    }

    return NextResponse.json({
      ok: true,
      homeowner: {
        id: homeownerAccount.id,
        email: homeownerAccount.email,
        phone: homeownerAccount.phone,
        first_name: homeownerAccount.first_name,
        last_name: homeownerAccount.last_name,
      },
      job: {
        ...job,
        progress,
        company,
      },
      progressTimeline: progressTimeline || milestones,
      photos: photosByCategory,
      allPhotos: photos,
      documents,
      messages: messages || [],
      serviceRequests: serviceRequests || [],
      warrantyClaims: warrantyClaims || [],
    });
  } catch (error: any) {
    console.error("Error in homeowner portal API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























