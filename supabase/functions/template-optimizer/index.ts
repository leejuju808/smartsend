// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async () => {
  try {
    // First, update performance metrics for all templates
    await supabase.rpc("update_ai_template_performance");

    // Find underperforming active templates (reply_rate < 12%)
    const { data: templates, error: templatesError } = await supabase
      .from("ai_templates")
      .select("*")
      .eq("status", "active")
      .lt("(performance->>'reply_rate')::float", 12.0);

    if (templatesError) {
      console.error("Error fetching templates:", templatesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch templates", details: templatesError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No underperforming templates to optimize" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const rewritten = [];

    // Rewrite each underperforming template
    for (const template of templates) {
      try {
        const prompt = `You are an expert B2B cold email copywriter.

Rewrite this outreach template for higher reply rates:

---
${template.body}
---

Rules:
- Keep under 90 words
- Include clear call to action
- Preserve original tone
- Make it more compelling and personalized

Return the improved version only.`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.8,
        });

        const newBody = response.choices[0].message?.content?.trim();

        if (!newBody) {
          console.error(`No response from OpenAI for template ${template.id}`);
          continue;
        }

        // Create new test variant
        const { data: inserted, error: insertError } = await supabase
          .from("ai_template_tests")
          .insert({
            template_id: template.id,
            variant_body: newBody,
            variant_version: template.version + 1,
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting variant for template ${template.id}:`, insertError);
          continue;
        }

        rewritten.push({
          template_id: template.id,
          template_name: template.name,
          variant_id: inserted.id,
          variant_version: inserted.variant_version,
        });

        console.log(`Created variant v${inserted.variant_version} for template ${template.id}`);
      } catch (error: any) {
        console.error(`Error processing template ${template.id}:`, error);
        continue;
      }
    }

    // Check for winners and promote them
    const processedTemplates = new Set(rewritten.map((r: any) => r.template_id));
    for (const templateId of processedTemplates) {
      try {
        await supabase.rpc("promote_ai_template_winner", { p_template_id: templateId });
      } catch (error: any) {
        console.error(`Error promoting winner for template ${templateId}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Template rewrites generated",
        templates_processed: templates.length,
        variants_created: rewritten.length,
        variants: rewritten,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in template-optimizer:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

