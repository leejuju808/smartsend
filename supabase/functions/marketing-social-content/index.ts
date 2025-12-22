// Block 254900 — SmartSend Marketing Engine v1
// AI Social Media Content Generator
// Generates social media posts from job photos using AI

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
    const { job_id, platform = "instagram" } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["facebook", "instagram", "tiktok", "linkedin", "twitter"].includes(platform)) {
      return new Response(
        JSON.stringify({ error: "Invalid platform" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        roofing_company_id,
        homeowner_name,
        address,
        city,
        state,
        roof_material,
        roof_color,
        roof_squares,
        completed_at,
        final_revenue
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get job photos
    const { data: photos, error: photosError } = await supabase
      .from("job_field_photos")
      .select("id, storage_path, tag, caption")
      .eq("job_id", job_id)
      .in("tag", ["before", "after"])
      .order("created_at", { ascending: true });

    if (photosError) {
      throw photosError;
    }

    if (!photos || photos.length === 0) {
      return new Response(
        JSON.stringify({ error: "No photos found for this job" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get photo URLs
    const photoUrls = photos.map((photo) => {
      const { data } = supabase.storage
        .from("field-photos")
        .getPublicUrl(photo.storage_path);
      return data.publicUrl;
    });

    // 4. Get company details
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("name, brand_color_primary, messaging_style")
      .eq("id", job.roofing_company_id)
      .single();

    // 5. Build AI prompt for content generation
    const prompt = `Generate a ${platform} social media post for a roofing company.

Job Details:
- Location: ${job.city || ""}, ${job.state || ""}
- Roof Material: ${job.roof_material || "N/A"}
- Roof Color: ${job.roof_color || "N/A"}
- Roof Size: ${job.roof_squares || "N/A"} squares
- Completed: ${job.completed_at ? new Date(job.completed_at).toLocaleDateString() : "N/A"}

Company Name: ${company?.name || "Our Team"}
Messaging Style: ${company?.messaging_style || "professional"}

Platform: ${platform}
- Instagram: Use emojis, hashtags, engaging captions
- Facebook: More detailed, community-focused
- TikTok: Short, energetic, transformation-focused
- LinkedIn: Professional, business-focused
- Twitter: Concise, engaging

Generate:
1. Caption (platform-appropriate length)
2. Hashtags (10-15 relevant hashtags)
3. Call-to-action

Return JSON with: caption, hashtags (array), call_to_action`;

    // 6. Call AI to generate content
    // TODO: Integrate with AI service (OpenAI, Anthropic, etc.)
    // For now, we'll generate a simple template-based post
    const generatedContent = generateContentTemplate(
      job,
      company,
      platform,
      photos.length
    );

    // 7. Create marketing post record
    const { data: marketingPost, error: postError } = await supabase
      .from("marketing_posts")
      .insert({
        job_id: job_id,
        workspace_id: job.workspace_id,
        roofing_company_id: job.roofing_company_id,
        platform: platform,
        caption: generatedContent.caption,
        hashtags: generatedContent.hashtags,
        call_to_action: generatedContent.call_to_action,
        media_urls: photoUrls,
        media_type: photoUrls.length > 1 ? "carousel" : "photo",
        ai_generated: true,
        status: "draft",
      })
      .select()
      .single();

    if (postError) {
      throw postError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        post: marketingPost,
        generated_content: generatedContent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating social media content:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Template-based content generator (until AI integration is added)
function generateContentTemplate(
  job: any,
  company: any,
  platform: string,
  photoCount: number
) {
  const location = job.city && job.state ? `${job.city}, ${job.state}` : job.state || "";
  const material = job.roof_material || "new roof";
  const squares = job.roof_squares ? `${job.roof_squares} SQ` : "";

  let caption = "";
  let hashtags: string[] = [];
  let callToAction = "";

  switch (platform) {
    case "instagram":
      caption = `Another beautiful roof transformation! 🏠✨

${squares} ${material}${job.roof_color ? ` in ${job.roof_color}` : ""}${location ? ` in ${location}` : ""}

Lifetime warranty. Full tear-off + underlayment upgrade.
Serving ${location || "our community"} with pride.

${company?.name || ""}`;

      hashtags = [
        "#Roofing",
        "#HomeImprovement",
        "#RoofReplacement",
        location ? `#${location.replace(/\s+/g, "")}Roofing` : "#Roofing",
        "#BeforeAndAfter",
        "#HomeRenovation",
        "#Construction",
        "#RoofingContractor",
        "#QualityWork",
        "#ProfessionalRoofing",
      ];

      callToAction = "Ready for your own transformation? DM us for a free estimate!";
      break;

    case "facebook":
      caption = `We're proud to share another completed project!

${squares ? `Size: ${squares}` : ""}
${material ? `Material: ${material}` : ""}
${location ? `Location: ${location}` : ""}

Our team worked hard to deliver a quality roof installation with full warranty coverage. Thank you for trusting ${company?.name || "us"} with your home!`;

      hashtags = [
        "Roofing",
        "HomeImprovement",
        location ? `${location}Roofing` : "Roofing",
      ];

      callToAction = "Need roofing services? Contact us for a free estimate!";
      break;

    case "tiktok":
      caption = `POV: Your roof transformation is complete 🎉

${material}${location ? ` in ${location}` : ""}
Before ➡️ After
${squares}

#RoofingTikTok #Transformation #BeforeAndAfter`;

      hashtags = [
        "#RoofingTikTok",
        "#Transformation",
        "#BeforeAndAfter",
        "#Roofing",
        "#HomeImprovement",
        "#Construction",
      ];

      callToAction = "Book your free estimate! Link in bio 🔗";
      break;

    default:
      caption = `Completed: ${squares} ${material}${location ? ` — ${location}` : ""}

Quality roofing installation with lifetime warranty.`;

      hashtags = ["#Roofing", "#HomeImprovement"];
      callToAction = "Contact us for a free estimate!";
  }

  return {
    caption,
    hashtags,
    call_to_action: callToAction,
  };
}






















