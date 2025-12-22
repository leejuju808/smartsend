import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    // Get all scheduled posts that are due to be published
    const now = new Date().toISOString();
    const { data: posts, error: fetchError } = await supabase
      .from("marketing_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("publish_date", now);

    if (fetchError) {
      console.error("Error fetching scheduled posts:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch scheduled posts", details: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, published: 0, message: "No posts due for publishing" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const post of posts) {
      try {
        if (post.type === "thread") {
          // Publish to X/Twitter
          const xBearerToken = Deno.env.get("X_BEARER_TOKEN");
          if (!xBearerToken) {
            console.warn("X_BEARER_TOKEN not set, skipping thread publication");
            await supabase
              .from("marketing_posts")
              .update({ status: "failed", metrics: { ...post.metrics, error: "X_BEARER_TOKEN not configured" } })
              .eq("id", post.id);
            results.push({ id: post.id, type: post.type, success: false, error: "X_BEARER_TOKEN not configured" });
            continue;
          }

          const xResponse = await fetch("https://api.x.com/v2/tweets", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${xBearerToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: post.content }),
          });

          if (!xResponse.ok) {
            const errorText = await xResponse.text();
            console.error(`Failed to publish thread ${post.id}:`, errorText);
            await supabase
              .from("marketing_posts")
              .update({ status: "failed", metrics: { ...post.metrics, error: errorText } })
              .eq("id", post.id);
            results.push({ id: post.id, type: post.type, success: false, error: errorText });
            continue;
          }

          const xData = await xResponse.json();
          await supabase
            .from("marketing_posts")
            .update({
              status: "published",
              metrics: {
                ...post.metrics,
                tweet_id: xData.data?.id,
                published_at: now,
              },
            })
            .eq("id", post.id);
          results.push({ id: post.id, type: post.type, success: true, tweet_id: xData.data?.id });
        } else if (post.type === "email") {
          // Send email broadcast to waitlist/users
          const emailBroadcastUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-broadcast`;
          const broadcastResponse = await fetch(emailBroadcastUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              subject: post.title || "Update from SmartSend",
              body: post.content,
              post_id: post.id,
            }),
          });

          if (!broadcastResponse.ok) {
            const errorText = await broadcastResponse.text();
            console.error(`Failed to send email broadcast ${post.id}:`, errorText);
            await supabase
              .from("marketing_posts")
              .update({ status: "failed", metrics: { ...post.metrics, error: errorText } })
              .eq("id", post.id);
            results.push({ id: post.id, type: post.type, success: false, error: errorText });
            continue;
          }

          const broadcastData = await broadcastResponse.json();
          await supabase
            .from("marketing_posts")
            .update({
              status: "published",
              metrics: {
                ...post.metrics,
                emails_sent: broadcastData.sent || 0,
                published_at: now,
              },
            })
            .eq("id", post.id);
          results.push({ id: post.id, type: post.type, success: true, emails_sent: broadcastData.sent });
        } else if (post.type === "video") {
          // For video posts, just mark as published (manual upload assumed)
          // In the future, could integrate with YouTube/TikTok APIs
          await supabase
            .from("marketing_posts")
            .update({
              status: "published",
              metrics: {
                ...post.metrics,
                published_at: now,
              },
            })
            .eq("id", post.id);
          results.push({ id: post.id, type: post.type, success: true, message: "Marked as published (manual upload)" });
        }
      } catch (error) {
        console.error(`Error processing post ${post.id}:`, error);
        await supabase
          .from("marketing_posts")
          .update({
            status: "failed",
            metrics: {
              ...post.metrics,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          })
          .eq("id", post.id);
        results.push({
          id: post.id,
          type: post.type,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        published: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in marketing-publisher:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

