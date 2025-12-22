// Block 254900 — SmartSend Marketing Engine v1
// Before/After Photo Builder
// Automatically creates before/after photo galleries and comparison images

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id, gallery_id } = await req.json();

    if (!job_id && !gallery_id) {
      return new Response(
        JSON.stringify({ error: "job_id or gallery_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let gallery;
    let job;

    if (gallery_id) {
      // Get existing gallery
      const { data: existingGallery, error: galleryError } = await supabase
        .from("before_after_galleries")
        .select("*")
        .eq("id", gallery_id)
        .single();

      if (galleryError || !existingGallery) {
        return new Response(
          JSON.stringify({ error: "Gallery not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      gallery = existingGallery;
      job_id = gallery.job_id;
    }

    // 1. Get job details
    const { data: jobData, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        roofing_company_id,
        address,
        city,
        state,
        roof_material,
        roof_color,
        roof_squares,
        completed_at
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !jobData) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    job = jobData;

    // 2. Get before and after photos
    const { data: beforePhotos, error: beforeError } = await supabase
      .from("job_field_photos")
      .select("id, storage_path, tag, caption, created_at")
      .eq("job_id", job_id)
      .eq("tag", "before")
      .order("created_at", { ascending: true });

    const { data: afterPhotos, error: afterError } = await supabase
      .from("job_field_photos")
      .select("id, storage_path, tag, caption, created_at")
      .eq("job_id", job_id)
      .eq("tag", "after")
      .order("created_at", { ascending: true });

    if (beforeError || afterError) {
      throw beforeError || afterError;
    }

    if ((!beforePhotos || beforePhotos.length === 0) && (!afterPhotos || afterPhotos.length === 0)) {
      return new Response(
        JSON.stringify({ error: "No before or after photos found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get photo URLs
    const getPhotoUrls = (photos: any[]) => {
      return photos.map((photo) => {
        const { data } = supabase.storage
          .from("field-photos")
          .getPublicUrl(photo.storage_path);
        return data.publicUrl;
      });
    };

    const beforeUrls = getPhotoUrls(beforePhotos || []);
    const afterUrls = getPhotoUrls(afterPhotos || []);

    const beforePhotoIds = (beforePhotos || []).map((p) => p.id);
    const afterPhotoIds = (afterPhotos || []).map((p) => p.id);

    // 4. Generate gallery title and description
    const location = job.city && job.state ? `${job.city}, ${job.state}` : job.state || "";
    const title = `${job.roof_squares || ""} SQ ${job.roof_material || "Roof"}${location ? ` — ${location}` : ""}`.trim();
    const description = `Before and after photos from a ${job.roof_material || "roofing"} project${location ? ` in ${location}` : ""}.`;

    // 5. Generate SEO keywords
    const keywords: string[] = [];
    if (job.city) keywords.push(`roofing ${job.city}`);
    if (job.state) keywords.push(`roofing ${job.state}`);
    if (job.roof_material) keywords.push(`${job.roof_material} roofing`);
    if (location) {
      keywords.push(`roofing contractor ${location}`);
      keywords.push(`roof replacement ${location}`);
    }

    // 6. Generate comparison image (split before/after)
    // TODO: Use image processing library to create split comparison image
    // For now, we'll use the first before and after photo URLs
    const comparisonImageUrl =
      beforeUrls.length > 0 && afterUrls.length > 0
        ? `${beforeUrls[0]}|${afterUrls[0]}` // Placeholder - would be actual generated image URL
        : null;

    // 7. Create or update gallery
    if (gallery) {
      // Update existing gallery
      const { data: updatedGallery, error: updateError } = await supabase
        .from("before_after_galleries")
        .update({
          title: title || gallery.title,
          description: description || gallery.description,
          before_photo_ids: beforePhotoIds,
          before_photo_urls: beforeUrls,
          after_photo_ids: afterPhotoIds,
          after_photo_urls: afterUrls,
          comparison_image_url: comparisonImageUrl,
          roof_material: job.roof_material || gallery.roof_material,
          roof_color: job.roof_color || gallery.roof_color,
          roof_squares: job.roof_squares || gallery.roof_squares,
          location: location || gallery.location,
          seo_keywords: keywords.length > 0 ? keywords : gallery.seo_keywords,
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", gallery_id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          gallery: updatedGallery,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Create new gallery
      const { data: newGallery, error: createError } = await supabase
        .from("before_after_galleries")
        .insert({
          job_id: job_id,
          workspace_id: job.workspace_id,
          roofing_company_id: job.roofing_company_id,
          title,
          description,
          before_photo_ids: beforePhotoIds,
          before_photo_urls: beforeUrls,
          after_photo_ids: afterPhotoIds,
          after_photo_urls: afterUrls,
          comparison_image_url: comparisonImageUrl,
          roof_material: job.roof_material,
          roof_color: job.roof_color,
          roof_squares: job.roof_squares,
          completion_date: job.completed_at ? new Date(job.completed_at).toISOString().split("T")[0] : null,
          location,
          seo_keywords: keywords,
          status: "ready",
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          gallery: newGallery,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Error building before/after gallery:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});






















