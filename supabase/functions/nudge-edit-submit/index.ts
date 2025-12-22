import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration for nudge-edit-submit");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

function wc(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function paraCount(text: string): number {
  return text.trim().split(/\n{1,}/).filter((p) => p.trim()).length;
}

function linkCount(text: string): number {
  return (text.match(/https?:\/\/|cal\.com|zoom\.us|meet\.google|hubspot\.com\/meetings/gi) || []).length;
}

function emojiCount(text: string): number {
  return (text.match(/\p{Extended_Pictographic}/gu) || []).length;
}

function politeness(text: string): number {
  return /(please|thank you|appreciate|happy to)/i.test(text) ? 1 : 0;
}

function directCTA(text: string): number {
  return /(book|schedule|pick a time|grab a slot|calendar)/i.test(text) ? 1 : 0;
}

type FeatureVector = {
  brevity: number;
  formality: number;
  empathy: number;
  cta_directness: number;
  para_count: number;
  link_tolerance: number;
  emoji_tolerance: number;
  politeness: number;
};

function extractFeatures(before: string, after: string): FeatureVector {
  const wordsBefore = wc(before);
  const wordsAfter = wc(after);

  const brevity = wordsBefore
    ? Math.min(1, Math.max(0, (wordsBefore - wordsAfter) / Math.max(1, wordsBefore)))
    : 0.5;

  const formality = /(?:hey|hi\b)/i.test(after)
    ? 0.3
    : /(?:dear|regards|sincerely)/i.test(after)
    ? 0.8
    : 0.5;

  const empathy = /(understand|totally get|no worries|happy to work around)/i.test(after) ? 0.8 : 0.4;
  const ctaDirectness = directCTA(after) ? 0.8 : 0.4;

  return {
    brevity,
    formality,
    empathy,
    cta_directness: ctaDirectness,
    para_count: paraCount(after),
    link_tolerance: linkCount(after) > 0 ? 0.8 : 0.3,
    emoji_tolerance: emojiCount(after) > 0 ? 0.7 : 0.0,
    politeness: politeness(after)
  };
}

async function upsertProfile(ownerId: string, features: FeatureVector, alpha = 0.25) {
  const { data: existing, error } = await supabase
    .from("style_profile")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  let profile = existing;

  if (!profile) {
    const { data: inserted, error: insertError } = await supabase
      .from("style_profile")
      .insert([{ owner_id: ownerId }])
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    profile = inserted;
  }

  const updated = {
    formality: profile.formality * (1 - alpha) + features.formality * alpha,
    brevity: profile.brevity * (1 - alpha) + features.brevity * alpha,
    empathy: profile.empathy * (1 - alpha) + features.empathy * alpha,
    cta_directness: profile.cta_directness * (1 - alpha) + features.cta_directness * alpha,
    para_count_avg: profile.para_count_avg * (1 - alpha) + features.para_count * alpha,
    link_tolerance: profile.link_tolerance * (1 - alpha) + features.link_tolerance * alpha,
    emoji_tolerance: profile.emoji_tolerance * (1 - alpha) + features.emoji_tolerance * alpha,
    updated_at: new Date().toISOString()
  };

  const { error: updateError } = await supabase
    .from("style_profile")
    .update(updated)
    .eq("owner_id", ownerId);

  if (updateError) {
    throw updateError;
  }

  return updated;
}

type RequestPayload = {
  owner_id?: string;
  event_id?: string;
  draft_before?: string;
  draft_after?: string;
  accepted?: boolean;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const ownerId = payload.owner_id;
  const eventId = payload.event_id;
  const draftBefore = payload.draft_before;
  const draftAfter = payload.draft_after;
  const accepted = payload.accepted ?? true;

  if (!ownerId || !eventId || !draftBefore || !draftAfter) {
    return new Response(JSON.stringify({ error: "Missing params" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const features = extractFeatures(draftBefore, draftAfter);

    const { error: insertError } = await supabase.from("nudge_edits").insert([
      {
        owner_id: ownerId,
        event_id: eventId,
        draft_before: draftBefore,
        draft_after: draftAfter,
        features,
        accepted
      }
    ]);

    if (insertError) {
      throw insertError;
    }

    const profile = accepted ? await upsertProfile(ownerId, features) : null;

    return new Response(
      JSON.stringify({
        ok: true,
        features,
        profile
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("nudge-edit-submit error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});

















