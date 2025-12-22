// AI Content Bot Edge Function
// Automates AUREV's blog + case study pipeline with weekly AI-generated posts

import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

Deno.serve(async (req) => {
  try {
    console.log("Starting AI content generation...");

    // Check if we should generate content (weekly schedule)
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Check for recent posts
    const { data: recentPosts, error: checkError } = await supabase
      .from("marketing_posts")
      .select("created_at")
      .gte("created_at", lastWeek.toISOString())
      .limit(1);

    if (checkError) {
      console.error("Error checking recent posts:", checkError);
      return new Response(
        JSON.stringify({ ok: false, error: checkError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate content types if we need new posts
    const contentTypes = [
      {
        category: "blog",
        prompt: `Write a 500-word SEO blog post about how small and medium businesses (SMBs) use AUREV OS to automate their outreach and operations. Include practical examples, benefits, and a clear call-to-action. Make it engaging and valuable for business owners looking to scale.`,
        titleTemplate: "Automating Growth with AUREV OS"
      },
      {
        category: "case_study",
        prompt: `Write a 300-word case study about a fictional construction company that uses AUREV OS to automate their lead follow-up. Include specific metrics like "reduced response time by 80%" and "increased qualified meetings by 45%". Make it compelling and results-focused.`,
        titleTemplate: "Case Study: How [Company] Scaled with AUREV OS"
      },
      {
        category: "tutorial",
        prompt: `Write a 400-word tutorial-style post explaining "How to Set Up Your First Automated Email Sequence with AUREV OS". Include step-by-step instructions, best practices, and tips for maximizing open rates. Write in a friendly, accessible tone.`,
        titleTemplate: "Tutorial: Setting Up Automated Email Sequences"
      }
    ];

    const results = [];
    let postsCreated = 0;
    let errors = 0;

    // Generate content for each type
    for (const contentType of contentTypes) {
      try {
        // Check if we already have this type published recently
        const { data: existingPosts } = await supabase
          .from("marketing_posts")
          .select("id")
          .eq("category", contentType.category)
          .eq("status", "published")
          .gte("published_at", lastWeek.toISOString())
          .limit(1);

        if (existingPosts && existingPosts.length > 0) {
          console.log(`Skipping ${contentType.category} - already published this week`);
          continue;
        }

        // Call OpenAI for content generation
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert content writer for business software. Write engaging, informative content that helps SMB owners understand how automation can transform their operations."
            },
            {
              role: "user",
              content: contentType.prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          console.error(`Failed to generate content for ${contentType.category}`);
          errors++;
          continue;
        }

        // Extract SEO keywords from content (simple approach)
        const keywordCandidates = content
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 4)
          .filter((word, index, arr) => arr.indexOf(word) === index)
          .slice(0, 5);

        // Store in marketing_posts table
        const { data: post, error: insertError } = await supabase
          .from("marketing_posts")
          .insert({
            title: contentType.titleTemplate,
            body: content,
            status: "draft",
            category: contentType.category,
            seo_keywords: keywordCandidates,
            author: "AUREV AI"
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting ${contentType.category} post:`, insertError);
          errors++;
          continue;
        }

        postsCreated++;
        results.push({
          id: post.id,
          category: contentType.category,
          title: post.title,
          status: "draft",
          words: content.split(/\s+/).length
        });

      } catch (error) {
        console.error(`Error processing ${contentType.category}:`, error);
        errors++;
        results.push({
          category: contentType.category,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        posts_created: postsCreated,
        errors: errors,
        results: results,
        message: `Generated ${postsCreated} new content pieces`
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Error in content-bot:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
});
