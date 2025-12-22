// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { workspace_id, test_email_body } = payload;

  if (!workspace_id) {
    return new Response(JSON.stringify({ error: "workspace_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Get domain from sending_domains table for this workspace
  const { data: domainData, error: domainError } = await supabase
    .from("sending_domains")
    .select("domain, dkim_selector")
    .eq("workspace_id", workspace_id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (domainError || !domainData) {
    return new Response(
      JSON.stringify({ error: "No active sending domain found for workspace" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const domain = domainData.domain;
  const dkimSelector = domainData.dkim_selector || "default";

  // 1. Check DNS Records
  const spf_pass = await checkTXT(domain, "v=spf1");
  const dkim_pass = await checkTXT(`${dkimSelector}._domainkey.${domain}`, "v=DKIM1");
  const dmarc_pass = await checkTXT(`_dmarc.${domain}`, "v=DMARC1");

  // 2. Spam Word Detection
  const spam_words = findSpamWords(test_email_body || "");

  // 3. Inbox Placement Test (seed)
  const inbox_placement = await runSeedTest(test_email_body || "", domain);

  // 4. Warm-up Recommendation
  const warmup_recommended = !spf_pass || !dkim_pass || !dmarc_pass;

  // 5. Calculate Score
  let score = 100;
  if (!spf_pass) score -= 25;
  if (!dkim_pass) score -= 25;
  if (!dmarc_pass) score -= 25;
  if (spam_words.length > 0) score -= 10;
  if (inbox_placement?.spam > 2) score -= 15;
  score = Math.max(0, score); // Ensure score doesn't go below 0

  // 6. Insert report
  const { error: insertError } = await supabase.from("deliverability_reports").insert({
    workspace_id,
    score,
    spf_pass,
    dkim_pass,
    dmarc_pass,
    spam_words,
    inbox_placement,
    warmup_recommended,
  });

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      score,
      spf_pass,
      dkim_pass,
      dmarc_pass,
      spam_words,
      inbox_placement,
      warmup_recommended,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
});

// --- Helpers ---

async function checkTXT(domain: string, needle: string): Promise<boolean> {
  try {
    const records = await Deno.resolveDns(domain, "TXT");
    if (!records || records.length === 0) return false;
    
    // Deno.resolveDns returns string[][] for TXT records
    return records.some((record) => {
      if (Array.isArray(record)) {
        const txt = record.join("").replace(/^"+|"+$/g, "");
        return txt.includes(needle);
      }
      return String(record).includes(needle);
    });
  } catch (err) {
    console.error(`DNS lookup failed for ${domain}:`, err);
    return false;
  }
}

function findSpamWords(body: string): string[] {
  const bad = [
    "free",
    "guaranteed",
    "act now",
    "risk-free",
    "money",
    "urgent",
    "click here",
    "limited time",
    "buy now",
    "discount",
    "winner",
    "congratulations",
    "no obligation",
    "call now",
  ];

  const lowerBody = body.toLowerCase();
  return bad.filter((w) => lowerBody.includes(w.toLowerCase()));
}

async function runSeedTest(body: string, domain: string): Promise<{
  inbox: number;
  promotions: number;
  spam: number;
}> {
  // v1 stub → v2 will integrate with 3rd-party seed network
  // For now, return mock data based on basic heuristics
  const hasSpamWords = findSpamWords(body).length > 0;
  const bodyLength = body.length;
  const hasLinks = /https?:\/\//i.test(body);
  
  // Simple heuristic scoring
  let inbox = 3;
  let promotions = 1;
  let spam = 1;

  if (hasSpamWords) {
    spam += 1;
    inbox -= 1;
  }

  if (bodyLength < 50) {
    spam += 1;
  }

  if (hasLinks && hasSpamWords) {
    spam += 1;
    inbox -= 1;
  }

  return {
    inbox: Math.max(0, inbox),
    promotions: Math.max(0, promotions),
    spam: Math.max(0, spam),
  };
}

