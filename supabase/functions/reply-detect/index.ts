import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Label = {
  is_real_reply: boolean;
  kind: 'positive'|'neutral'|'negative'|'meeting'|'unsubscribe'|'bounce'|'ooo'|'other';
  confidence: number; // 0..1
  model: string;      // e.g., 'gpt-4o-mini' or 'rules'
  version: string;    // prompt pack version (Day 25)
  notes?: string;
};

function quickRules(text: string): Label {
  const t = (text || "").toLowerCase();
  
  // Unsubscribe detection
  if (/unsubscribe|remove me|opt out|opt-out|stop emailing|stop sending/.test(t)) {
    return { 
      is_real_reply: true, 
      kind: 'unsubscribe', 
      confidence: 0.98, 
      model: 'rules', 
      version: 'v1' 
    };
  }
  
  // Negative reply detection
  if (/not interested|no thanks|stop contacting|don't contact|not looking|not now|not at this time/.test(t)) {
    return { 
      is_real_reply: true, 
      kind: 'negative', 
      confidence: 0.85, 
      model: 'rules', 
      version: 'v1' 
    };
  }
  
  // Meeting detection - look for scheduling keywords with time/date indicators
  if (/(schedule|book|meet|call|zoom|teams|calendly|meeting|coffee|chat)/.test(t) && 
      /(next|tomorrow|\bmon|\btue|\bwed|\bthu|\bfri|\bsat|\bsun|\d{1,2}(:\d{2})?\s?(am|pm)?|available|free)/.test(t)) {
    return { 
      is_real_reply: true, 
      kind: 'meeting', 
      confidence: 0.80, 
      model: 'rules', 
      version: 'v1' 
    };
  }
  
  // Bounce detection
  if (/(mailer-daemon|delivery[ -]?status|bounce|undeliverable|returned mail|delivery failure)/.test(t)) {
    return { 
      is_real_reply: false, 
      kind: 'bounce', 
      confidence: 0.99, 
      model: 'rules', 
      version: 'v1' 
    };
  }
  
  // Out of office detection
  if (/(out of office|auto.?reply|vacation|away|ooo|out until|back on|returning)/.test(t)) {
    return { 
      is_real_reply: false, 
      kind: 'ooo', 
      confidence: 0.95, 
      model: 'rules', 
      version: 'v1' 
    };
  }
  
  // Positive indicators
  if (/(yes|interested|sounds good|let's|let us|sure|definitely|absolutely|love to|would like)/.test(t)) {
    return { 
      is_real_reply: true, 
      kind: 'positive', 
      confidence: 0.75, 
      model: 'rules', 
      version: 'v1' 
    };
  }
  
  // Default to neutral if no clear signal
  return { 
    is_real_reply: true, 
    kind: 'neutral', 
    confidence: 0.55, 
    model: 'rules', 
    version: 'v1' 
  };
}

serve(async (req) => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!, 
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  const { reply_id } = await req.json().catch(() => ({}));
  
  if (!reply_id) {
    return new Response(JSON.stringify({ error: "reply_id required" }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Fetch reply with campaign and contact info
  const { data: r, error } = await sb
    .from("replies")
    .select("id, campaign_id, contact_id, reply_text, body_text, body, from_email, to_email")
    .eq("id", reply_id)
    .single();
    
  if (error || !r) {
    return new Response(JSON.stringify({ error: "not_found" }), { 
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Extract text from reply (try multiple fields)
  const replyText = r.reply_text || r.body_text || r.body || "";
  
  // Get campaign_id and contact_id
  // If contact_id is not directly on replies, we may need to join through campaign_contacts
  let campaignId = r.campaign_id;
  let contactId = r.contact_id;
  
  // If contact_id is missing, try to find it via campaign_contacts using from_email
  if (!contactId && campaignId) {
    const { data: cc } = await sb
      .from("campaign_contacts")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .limit(1)
      .single();
    
    if (cc) {
      contactId = cc.contact_id;
    }
  }
  
  // If still missing, try to find contact by email
  if (!contactId && r.from_email) {
    const { data: contact } = await sb
      .from("contacts")
      .select("id")
      .eq("email", r.from_email)
      .limit(1)
      .single();
    
    if (contact) {
      contactId = contact.id;
    }
  }
  
  if (!campaignId || !contactId) {
    return new Response(JSON.stringify({ 
      error: "missing_campaign_or_contact",
      campaign_id: campaignId,
      contact_id: contactId
    }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 1) Rules fast-path
  let label: Label = quickRules(replyText);

  // 2) (Optional) LLM refinement if confidence < 0.8
  // TODO: Call your LLM here with Day-25 policy pack; stubbed:
  // if (label.confidence < 0.8) {
  //   const refined = await llmRefine(replyText)
  //   label = refined.confidence > label.confidence ? refined : label;
  // }

  // 3) Get campaign settings
  const { data: campaign } = await sb
    .from("campaigns")
    .select("reply_auto_mark, reply_confidence_min, reply_shadow_mode")
    .eq("id", campaignId)
    .single();
  
  const autoMark = campaign?.reply_auto_mark ?? true;
  const confidenceMin = campaign?.reply_confidence_min ?? 0.70;
  const shadowMode = campaign?.reply_shadow_mode ?? false;

  // 4) Persist classification
  await sb.from("reply_classifications").upsert({
    reply_id: r.id,
    campaign_id: campaignId,
    contact_id: contactId,
    kind: label.kind,
    is_real_reply: label.is_real_reply,
    confidence: label.confidence,
    model: label.model,
    version: label.version,
    notes: label.notes ?? null,
  }, { onConflict: "reply_id" });

  // 5) Side effects based on campaign settings
  const shouldStop = autoMark && !shadowMode && label.confidence >= confidenceMin;
  const shouldCreateReviewTask = autoMark && !shadowMode && label.confidence < confidenceMin;

  // Handle bounce
  if (label.kind === 'bounce') {
    await sb.from("campaign_contacts").update({ 
      is_paused: true, 
      pause_reason: 'bounce', 
      stop_reason: 'bounce' 
    })
      .eq("campaign_id", campaignId)
      .eq("contact_id", contactId);
    
    if (shouldStop) {
      await sb.rpc('cancel_future_sends_for_contact', { 
        p_campaign_id: campaignId, 
        p_contact_id: contactId, 
        p_reason: 'bounce' 
      });
    }
  }

  // Handle unsubscribe
  if (label.kind === 'unsubscribe') {
    await sb.from("campaign_contacts").update({ 
      is_paused: true, 
      stop_reason: 'unsubscribe' 
    })
      .eq("campaign_id", campaignId)
      .eq("contact_id", contactId);
    
    if (shouldStop) {
      await sb.rpc('cancel_future_sends_for_contact', { 
        p_campaign_id: campaignId, 
        p_contact_id: contactId, 
        p_reason: 'unsubscribe' 
      });
    }
    
    // Optional: add to global suppression table
    // await sb.from("suppressions").upsert({
    //   email: r.from_email,
    //   reason: 'unsubscribed',
    //   ...
    // });
  }

  // If it's a real human reply → mark replied, cancel future sends
  if (label.is_real_reply && !['unsubscribe','bounce','ooo'].includes(label.kind)) {
    if (shouldStop) {
      await sb.from("campaign_contacts").update({
        replied_at: new Date().toISOString(),
        last_reply_kind: label.kind,
        reply_confidence: label.confidence,
        is_paused: true,
        stop_reason: 'replied'
      }).eq("campaign_id", campaignId)
        .eq("contact_id", contactId);

      // Cancel any future scheduled sends for this campaign/contact
      await sb.rpc('cancel_future_sends_for_contact', { 
        p_campaign_id: campaignId, 
        p_contact_id: contactId, 
        p_reason: 'replied' 
      });
    } else if (shadowMode) {
      // Shadow mode: just log, don't stop
      await sb.from("campaign_contacts").update({
        replied_at: new Date().toISOString(),
        last_reply_kind: label.kind,
        reply_confidence: label.confidence,
        // Don't set is_paused or stop_reason in shadow mode
      }).eq("campaign_id", campaignId)
        .eq("contact_id", contactId);
    }
  }

  // Create review task if confidence is below threshold
  if (shouldCreateReviewTask && label.is_real_reply) {
    // TODO: Create inbox task "Review possible reply"
    // This would typically go to a tasks/inbox_items table
    // For now, we'll just log it
    console.log(`Low confidence reply (${label.confidence}) needs review for campaign ${campaignId}, contact ${contactId}`);
  }

  return new Response(JSON.stringify({ ok: true, label, shadow_mode: shadowMode }), { 
    headers: { "Content-Type": "application/json" }
  });
});
