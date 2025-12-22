import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Main copilot action handler
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const body = await req.json();
    const { action_type, input_config } = body;

    // Get campaign and workspace info
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, workspace_id, name")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Create copilot action record
    const { data: action, error: actionError } = await supabase
      .from("outbound_copilot_actions")
      .insert({
        workspace_id: campaign.workspace_id,
        campaign_id: campaignId,
        action_type,
        input_config: input_config || {},
        status: "processing",
        created_by: user.id,
      })
      .select()
      .single();

    if (actionError) {
      return NextResponse.json(
        { error: "Failed to create action" },
        { status: 500 }
      );
    }

    // Route to appropriate handler
    let result;
    try {
      switch (action_type) {
        case "create_sequence":
          result = await handleCreateSequence(supabase, campaignId, campaign.workspace_id, input_config, action.id);
          break;
        case "rewrite_sequence":
          result = await handleRewriteSequence(supabase, campaignId, campaign.workspace_id, input_config, action.id);
          break;
        case "fix_underperforming_steps":
          result = await handleFixUnderperformingSteps(supabase, campaignId, campaign.workspace_id, action.id);
          break;
        case "shorten_steps":
          result = await handleShortenSteps(supabase, campaignId, campaign.workspace_id, action.id);
          break;
        case "expand_multichannel":
          result = await handleExpandMultichannel(supabase, campaignId, campaign.workspace_id, input_config, action.id);
          break;
        case "inject_personalization":
          result = await handleInjectPersonalization(supabase, campaignId, campaign.workspace_id, action.id);
          break;
        case "rewrite_for_icp":
          result = await handleRewriteForICP(supabase, campaignId, campaign.workspace_id, input_config, action.id);
          break;
        case "optimize_subject_lines":
          result = await handleOptimizeSubjectLines(supabase, campaignId, campaign.workspace_id, action.id);
          break;
        case "fix_deliverability":
          result = await handleFixDeliverability(supabase, campaignId, campaign.workspace_id, action.id);
          break;
        case "add_high_intent_step":
          result = await handleAddHighIntentStep(supabase, campaignId, campaign.workspace_id, input_config, action.id);
          break;
        case "auto_optimize_all":
          result = await handleAutoOptimizeAll(supabase, campaignId, campaign.workspace_id, action.id);
          break;
        default:
          throw new Error(`Unknown action type: ${action_type}`);
      }

      // Update action as completed
      await supabase
        .from("outbound_copilot_actions")
        .update({
          status: "completed",
          output_data: result,
          completed_at: new Date().toISOString(),
        })
        .eq("id", action.id);

      return NextResponse.json({ success: true, action_id: action.id, result });
    } catch (error: any) {
      // Update action as failed
      await supabase
        .from("outbound_copilot_actions")
        .update({
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", action.id);

      return NextResponse.json(
        { error: error.message || "Action failed" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Copilot action error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Get copilot actions for a campaign
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    const { data: actions, error } = await supabase
      .from("outbound_copilot_actions")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch actions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ actions: actions || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleCreateSequence(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  config: any,
  actionId: string
) {
  const {
    icp_industry,
    icp_role,
    icp_company_size,
    sequence_length = 5,
    channels = ["email"],
    tone = "professional",
    aggression = "balanced",
  } = config;

  // Get campaign details for context
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, offer, value_prop, cta")
    .eq("id", campaignId)
    .single();

  // Generate sequence using AI
  const prompt = buildSequenceGenerationPrompt({
    campaign,
    icp: { industry: icp_industry, role: icp_role, company_size: icp_company_size },
    sequence_length,
    channels,
    tone,
    aggression,
  });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot, an expert AI SDR that creates high-converting multi-step outreach sequences.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const generated = JSON.parse(completion.choices[0]?.message?.content || "{}");
  
  // Create steps in database
  const steps = generated.steps || [];
  const createdSteps = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const { data: stepData, error: stepError } = await supabase
      .from("campaign_steps")
      .insert({
        campaign_id: campaignId,
        step_no: i + 1,
        step_type: step.channel || "email",
        subject: step.subject || "",
        body_html: step.body || "",
        delay_days: step.delay_days || (i === 0 ? 0 : 3),
        copilot_generated: true,
        copilot_generation_id: actionId,
        step_config: step.config || {},
      })
      .select()
      .single();

    if (!stepError && stepData) {
      createdSteps.push(stepData);
      
      // Log activity
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "step_created",
        p_message: `AI Copilot created ${step.channel || "email"} step ${i + 1}`,
        p_entity_type: "step",
        p_entity_id: stepData.id,
      });
    }
  }

  return {
    steps_created: createdSteps.length,
    steps: createdSteps,
    sequence_structure: generated.structure || {},
  };
}

async function handleRewriteSequence(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  config: any,
  actionId: string
) {
  // Get existing steps
  const { data: existingSteps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  if (!existingSteps || existingSteps.length === 0) {
    throw new Error("No steps found to rewrite");
  }

  // Get campaign context
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, offer, value_prop, cta")
    .eq("id", campaignId)
    .single();

  // Generate rewritten steps
  const prompt = buildRewritePrompt({
    campaign,
    existingSteps,
    config,
  });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Rewrite email sequences to improve clarity, remove spam words, sharpen hooks, and optimize CTAs while preserving personalization placeholders.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const rewritten = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const rewrittenSteps = rewritten.steps || [];

  const updatedSteps = [];
  for (let i = 0; i < Math.min(existingSteps.length, rewrittenSteps.length); i++) {
    const original = existingSteps[i];
    const rewritten = rewrittenSteps[i];

    const { data: updated, error } = await supabase
      .from("campaign_steps")
      .update({
        subject: rewritten.subject || original.subject,
        body_html: rewritten.body || original.body_html,
        copilot_generated: true,
        copilot_generation_id: actionId,
      })
      .eq("id", original.id)
      .select()
      .single();

    if (!error && updated) {
      updatedSteps.push(updated);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "step_rewritten",
        p_message: `AI Copilot rewrote step ${original.step_no}`,
        p_entity_type: "step",
        p_entity_id: original.id,
        p_changes: {
          before: { subject: original.subject, body: original.body_html },
          after: { subject: rewritten.subject, body: rewritten.body },
        },
      });
    }
  }

  return {
    steps_rewritten: updatedSteps.length,
    steps: updatedSteps,
  };
}

async function handleFixUnderperformingSteps(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  actionId: string
) {
  // Get step stats
  const { data: stepStats } = await supabase.rpc("get_campaign_step_stats", {
    p_campaign_id: campaignId,
  });

  if (!stepStats || stepStats.length === 0) {
    throw new Error("No step stats found");
  }

  // Identify underperforming steps (score < 50)
  const underperforming = stepStats.filter((s: any) => {
    const score = calculateStepScore(s);
    return score < 50;
  });

  if (underperforming.length === 0) {
    return { message: "No underperforming steps found", fixed: [] };
  }

  // Get step details
  const stepIds = underperforming.map((s: any) => s.step_id);
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .in("id", stepIds);

  // Generate fixes using AI
  const prompt = buildFixUnderperformingPrompt({ steps, stats: underperforming });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Analyze underperforming steps and rewrite them to improve performance metrics.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const fixes = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const fixedSteps = [];

  for (const fix of fixes.fixes || []) {
    const step = steps?.find((s: any) => s.id === fix.step_id);
    if (!step) continue;

    const { data: updated, error } = await supabase
      .from("campaign_steps")
      .update({
        subject: fix.subject || step.subject,
        body_html: fix.body || step.body_html,
        copilot_generated: true,
        copilot_generation_id: actionId,
      })
      .eq("id", step.id)
      .select()
      .single();

    if (!error && updated) {
      fixedSteps.push(updated);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "step_rewritten",
        p_message: `AI Copilot fixed underperforming step ${step.step_no} (score: ${calculateStepScore(underperforming.find((s: any) => s.step_id === step.id))})`,
        p_entity_type: "step",
        p_entity_id: step.id,
      });
    }
  }

  return {
    fixed: fixedSteps.length,
    steps: fixedSteps,
    recommendations: fixes.recommendations || [],
  };
}

async function handleShortenSteps(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  actionId: string
) {
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  if (!steps || steps.length === 0) {
    throw new Error("No steps found");
  }

  const prompt = buildShortenPrompt({ steps });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Shorten email bodies while preserving key messages and CTAs. Target 70-120 words per email.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    response_format: { type: "json_object" },
  });

  const shortened = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const updatedSteps = [];

  for (const short of shortened.steps || []) {
    const step = steps.find((s: any) => s.id === short.step_id);
    if (!step) continue;

    const { data: updated, error } = await supabase
      .from("campaign_steps")
      .update({
        body_html: short.body || step.body_html,
        copilot_generated: true,
        copilot_generation_id: actionId,
      })
      .eq("id", step.id)
      .select()
      .single();

    if (!error && updated) {
      updatedSteps.push(updated);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "step_rewritten",
        p_message: `AI Copilot shortened step ${step.step_no}`,
        p_entity_type: "step",
        p_entity_id: step.id,
      });
    }
  }

  return { shortened: updatedSteps.length, steps: updatedSteps };
}

async function handleExpandMultichannel(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  config: any,
  actionId: string
) {
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  const channels = config.channels || ["sms", "linkedin"];
  const insertAfter = config.insert_after_step || 2;

  // Generate multichannel steps
  const prompt = buildMultichannelPrompt({ steps, channels, insertAfter });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Generate multichannel steps (SMS, LinkedIn, call tasks) that complement email sequences.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const expanded = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const newSteps = [];

  for (const newStep of expanded.steps || []) {
    const { data: created, error } = await supabase
      .from("campaign_steps")
      .insert({
        campaign_id: campaignId,
        step_no: newStep.step_no,
        step_type: newStep.channel,
        subject: newStep.subject || "",
        body_html: newStep.body || "",
        delay_days: newStep.delay_days || 0,
        copilot_generated: true,
        copilot_generation_id: actionId,
        step_config: newStep.config || {},
        sms_body: newStep.sms_body,
        linkedin_action: newStep.linkedin_action,
        linkedin_message_text: newStep.linkedin_message,
        call_script: newStep.call_script,
      })
      .select()
      .single();

    if (!error && created) {
      newSteps.push(created);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "multichannel_expanded",
        p_message: `AI Copilot added ${newStep.channel} step`,
        p_entity_type: "step",
        p_entity_id: created.id,
      });
    }
  }

  return { added: newSteps.length, steps: newSteps };
}

async function handleInjectPersonalization(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  actionId: string
) {
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  const prompt = buildPersonalizationPrompt({ steps });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Inject smart personalization placeholders like {{industry_pain_point}}, {{geo_note}}, {{role_specific_trigger}}, {{case_study_nearest}} into email templates.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const personalized = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const updatedSteps = [];

  for (const pers of personalized.steps || []) {
    const step = steps?.find((s: any) => s.id === pers.step_id);
    if (!step) continue;

    const { data: updated, error } = await supabase
      .from("campaign_steps")
      .update({
        body_html: pers.body || step.body_html,
        copilot_generated: true,
        copilot_generation_id: actionId,
      })
      .eq("id", step.id)
      .select()
      .single();

    if (!error && updated) {
      updatedSteps.push(updated);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "personalization_added",
        p_message: `AI Copilot injected personalization into step ${step.step_no}`,
        p_entity_type: "step",
        p_entity_id: step.id,
      });
    }
  }

  return { personalized: updatedSteps.length, steps: updatedSteps };
}

async function handleRewriteForICP(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  config: any,
  actionId: string
) {
  const { icp_industry, icp_role, icp_company_size } = config;
  
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  const prompt = buildICPRewritePrompt({ steps, icp: { industry: icp_industry, role: icp_role, company_size: icp_company_size } });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Rewrite sequences to match specific ICP (Ideal Customer Profile) characteristics, pain points, and language.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const rewritten = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const updatedSteps = [];

  for (const rewrite of rewritten.steps || []) {
    const step = steps?.find((s: any) => s.id === rewrite.step_id);
    if (!step) continue;

    const { data: updated, error } = await supabase
      .from("campaign_steps")
      .update({
        subject: rewrite.subject || step.subject,
        body_html: rewrite.body || step.body_html,
        copilot_generated: true,
        copilot_generation_id: actionId,
      })
      .eq("id", step.id)
      .select()
      .single();

    if (!error && updated) {
      updatedSteps.push(updated);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "icp_targeted",
        p_message: `AI Copilot rewrote step ${step.step_no} for ICP: ${icp_industry} ${icp_role}`,
        p_entity_type: "step",
        p_entity_id: step.id,
      });
    }
  }

  return { rewritten: updatedSteps.length, steps: updatedSteps };
}

async function handleOptimizeSubjectLines(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  actionId: string
) {
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("step_type", "email")
    .order("step_no", { ascending: true });

  const prompt = buildSubjectLinePrompt({ steps });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot Subject Line Brain. Generate 10 optimized subject lines per step that are short, punchy, anti-spam shaped, and personalization-aware.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.8,
    response_format: { type: "json_object" },
  });

  const optimized = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const updatedSteps = [];

  for (const opt of optimized.steps || []) {
    const step = steps?.find((s: any) => s.id === opt.step_id);
    if (!step) continue;

    const { data: updated, error } = await supabase
      .from("campaign_steps")
      .update({
        subject: opt.subject || step.subject,
        copilot_generated: true,
        copilot_generation_id: actionId,
      })
      .eq("id", step.id)
      .select()
      .single();

    if (!error && updated) {
      updatedSteps.push(updated);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "subject_line_optimized",
        p_message: `AI Copilot optimized subject line for step ${step.step_no}`,
        p_entity_type: "step",
        p_entity_id: step.id,
      });
    }
  }

  return {
    optimized: updatedSteps.length,
    steps: updatedSteps,
    alternatives: optimized.alternatives || {},
  };
}

async function handleFixDeliverability(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  actionId: string
) {
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  // Check deliverability issues
  const issues = [];
  for (const step of steps || []) {
    const body = step.body_html || "";
    const subject = step.subject || "";
    
    // Check for spam words
    const spamWords = ["guarantee", "free!!!", "limited time", "act now", "click here"];
    const foundSpam = spamWords.filter(word => 
      body.toLowerCase().includes(word.toLowerCase()) || 
      subject.toLowerCase().includes(word.toLowerCase())
    );
    
    if (foundSpam.length > 0) {
      issues.push({ step_id: step.id, step_no: step.step_no, type: "spam_words", words: foundSpam });
    }
    
    // Check for long paragraphs
    const paragraphs = body.split(/\n\n/);
    const longParagraphs = paragraphs.filter(p => p.length > 200);
    if (longParagraphs.length > 0) {
      issues.push({ step_id: step.id, step_no: step.step_no, type: "long_paragraphs" });
    }
    
    // Check for too many links
    const linkCount = (body.match(/https?:\/\//g) || []).length;
    if (linkCount > 3) {
      issues.push({ step_id: step.id, step_no: step.step_no, type: "too_many_links", count: linkCount });
    }
  }

  if (issues.length === 0) {
    return { message: "No deliverability issues found", fixed: [] };
  }

  const prompt = buildDeliverabilityFixPrompt({ steps, issues });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Fix deliverability issues by removing spam words, shortening paragraphs, reducing links, and ensuring compliance.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    response_format: { type: "json_object" },
  });

  const fixes = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const fixedSteps = [];

  for (const fix of fixes.fixes || []) {
    const step = steps?.find((s: any) => s.id === fix.step_id);
    if (!step) continue;

    const { data: updated, error } = await supabase
      .from("campaign_steps")
      .update({
        subject: fix.subject || step.subject,
        body_html: fix.body || step.body_html,
        copilot_generated: true,
        copilot_generation_id: actionId,
      })
      .eq("id", step.id)
      .select()
      .single();

    if (!error && updated) {
      fixedSteps.push(updated);
      
      await supabase.rpc("log_copilot_activity", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_action_id: actionId,
        p_activity_type: "deliverability_fixed",
        p_message: `AI Copilot fixed deliverability issues in step ${step.step_no}`,
        p_entity_type: "step",
        p_entity_id: step.id,
      });
    }
  }

  return { fixed: fixedSteps.length, steps: fixedSteps, issues_found: issues.length };
}

async function handleAddHighIntentStep(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  config: any,
  actionId: string
) {
  const { intent_type = "interested" } = config;
  
  // Get campaign context
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, offer, value_prop, cta")
    .eq("id", campaignId)
    .single();

  const prompt = buildHighIntentStepPrompt({ campaign, intent_type });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are SmartSend's Outbound Copilot. Generate high-intent steps for leads showing interest, including conversion push, nurture, referral ask, and redirect follow-up templates.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const generated = JSON.parse(completion.choices[0]?.message?.content || "{}");
  
  // Get max step_no
  const { data: maxStep } = await supabase
    .from("campaign_steps")
    .select("step_no")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: false })
    .limit(1)
    .single();

  const nextStepNo = (maxStep?.step_no || 0) + 1;

  const { data: created, error } = await supabase
    .from("campaign_steps")
    .insert({
      campaign_id: campaignId,
      step_no: nextStepNo,
      step_type: "email",
      subject: generated.subject || "",
      body_html: generated.body || "",
      delay_days: 0,
      copilot_generated: true,
      copilot_generation_id: actionId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create step: ${error.message}`);
  }

  await supabase.rpc("log_copilot_activity", {
    p_workspace_id: workspaceId,
    p_campaign_id: campaignId,
    p_action_id: actionId,
    p_activity_type: "step_created",
    p_message: `AI Copilot added high-intent step for ${intent_type} leads`,
    p_entity_type: "step",
    p_entity_id: created.id,
  });

  return { step: created };
}

async function handleAutoOptimizeAll(
  supabase: any,
  campaignId: string,
  workspaceId: string,
  actionId: string
) {
  // This combines multiple optimizations
  const results = {
    underperforming: await handleFixUnderperformingSteps(supabase, campaignId, workspaceId, actionId),
    deliverability: await handleFixDeliverability(supabase, campaignId, workspaceId, actionId),
    subject_lines: await handleOptimizeSubjectLines(supabase, campaignId, workspaceId, actionId),
  };

  return {
    optimizations_applied: Object.keys(results).length,
    results,
  };
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildSequenceGenerationPrompt(config: any): string {
  return `Generate a ${config.sequence_length}-step multi-channel outreach sequence.

Campaign: ${config.campaign?.name || "Unknown"}
Offer: ${config.campaign?.offer || ""}
Value Prop: ${config.campaign?.value_prop || ""}
CTA: ${config.campaign?.cta || "Reply to book a call"}

ICP:
- Industry: ${config.icp?.industry || "General"}
- Role: ${config.icp?.role || "Decision Maker"}
- Company Size: ${config.icp?.company_size || "Mid-size"}

Tone: ${config.tone}
Aggression: ${config.aggression}
Channels: ${config.channels.join(", ")}

Generate steps with:
- Subject lines (under 55 chars)
- Email bodies (70-120 words)
- SMS templates (if SMS included)
- LinkedIn tasks (if LinkedIn included)
- Call scripts (if call included)
- Timing (delay_days)
- Personalization placeholders ({{first_name}}, {{company}}, etc.)

Return JSON:
{
  "structure": { "description": "..." },
  "steps": [
    {
      "step_no": 1,
      "channel": "email",
      "subject": "...",
      "body": "...",
      "delay_days": 0,
      "config": {}
    }
  ]
}`;
}

function buildRewritePrompt(config: any): string {
  return `Rewrite the following email sequence to improve clarity, remove spam words, sharpen hooks, and optimize CTAs.

Campaign: ${config.campaign?.name || "Unknown"}
Current Steps:
${config.existingSteps.map((s: any, i: number) => `
Step ${s.step_no}:
Subject: ${s.subject}
Body: ${s.body_html}
`).join("\n")}

Return JSON:
{
  "steps": [
    {
      "step_id": "...",
      "subject": "...",
      "body": "..."
    }
  ]
}`;
}

function buildFixUnderperformingPrompt(config: any): string {
  return `Fix underperforming steps based on these stats:

${config.stats.map((s: any) => `
Step ${s.step_no}:
- Open Rate: ${s.open_rate}%
- Reply Rate: ${s.reply_rate}%
- Score: ${calculateStepScore(s)}
`).join("\n")}

Current Steps:
${config.steps.map((s: any) => `
Step ${s.step_no}:
Subject: ${s.subject}
Body: ${s.body_html}
`).join("\n")}

Return JSON:
{
  "fixes": [
    {
      "step_id": "...",
      "subject": "...",
      "body": "...",
      "reason": "..."
    }
  ],
  "recommendations": ["..."]
}`;
}

function buildShortenPrompt(config: any): string {
  return `Shorten these email bodies to 70-120 words while preserving key messages:

${config.steps.map((s: any) => `
Step ${s.step_no}:
${s.body_html}
`).join("\n---\n")}

Return JSON:
{
  "steps": [
    {
      "step_id": "...",
      "body": "..."
    }
  ]
}`;
}

function buildMultichannelPrompt(config: any): string {
  return `Generate multichannel steps to expand this email sequence:

Current Steps:
${config.steps.map((s: any) => `Step ${s.step_no}: ${s.subject}`).join("\n")}

Insert ${config.channels.join(", ")} steps after step ${config.insertAfter}.

Return JSON:
{
  "steps": [
    {
      "step_no": ...,
      "channel": "sms|linkedin|call",
      "subject": "...",
      "body": "...",
      "sms_body": "...",
      "linkedin_action": "...",
      "linkedin_message": "...",
      "call_script": "...",
      "delay_days": ...
    }
  ]
}`;
}

function buildPersonalizationPrompt(config: any): string {
  return `Inject smart personalization placeholders into these steps:

${config.steps.map((s: any) => `
Step ${s.step_no}:
${s.body_html}
`).join("\n---\n")}

Use placeholders like:
- {{industry_pain_point}}
- {{geo_note}}
- {{role_specific_trigger}}
- {{case_study_nearest}}
- {{company_size_insight}}

Return JSON:
{
  "steps": [
    {
      "step_id": "...",
      "body": "..."
    }
  ]
}`;
}

function buildICPRewritePrompt(config: any): string {
  return `Rewrite this sequence for ICP:
- Industry: ${config.icp?.industry}
- Role: ${config.icp?.role}
- Company Size: ${config.icp?.company_size}

Current Steps:
${config.steps.map((s: any) => `
Step ${s.step_no}:
Subject: ${s.subject}
Body: ${s.body_html}
`).join("\n---\n")}

Return JSON:
{
  "steps": [
    {
      "step_id": "...",
      "subject": "...",
      "body": "..."
    }
  ]
}`;
}

function buildSubjectLinePrompt(config: any): string {
  return `Generate 10 optimized subject lines for each step:

${config.steps.map((s: any) => `
Step ${s.step_no}:
Current: ${s.subject}
Body context: ${(s.body_html || "").substring(0, 200)}
`).join("\n---\n")}

Return JSON:
{
  "steps": [
    {
      "step_id": "...",
      "subject": "..."
    }
  ],
  "alternatives": {
    "step_id": ["alt1", "alt2", ...]
  }
}`;
}

function buildDeliverabilityFixPrompt(config: any): string {
  return `Fix deliverability issues in these steps:

Issues Found:
${config.issues.map((i: any) => `Step ${i.step_no}: ${i.type} - ${JSON.stringify(i)}`).join("\n")}

Current Steps:
${config.steps.map((s: any) => `
Step ${s.step_no}:
Subject: ${s.subject}
Body: ${s.body_html}
`).join("\n---\n")}

Return JSON:
{
  "fixes": [
    {
      "step_id": "...",
      "subject": "...",
      "body": "...",
      "fixes_applied": ["..."]
    }
  ]
}`;
}

function buildHighIntentStepPrompt(config: any): string {
  return `Generate a high-intent step for ${config.intent_type} leads.

Campaign: ${config.campaign?.name || "Unknown"}
Offer: ${config.campaign?.offer || ""}
CTA: ${config.campaign?.cta || "Book a call"}

Intent Type: ${config.intent_type}
- interested: conversion push
- maybe: nurture
- not_now: referral ask
- wrong_person: redirect follow-up

Return JSON:
{
  "subject": "...",
  "body": "..."
}`;
}

function calculateStepScore(stat: any): number {
  const openWeight = 0.3;
  const replyWeight = 0.5;
  const clickWeight = 0.2;
  
  const openScore = Math.min(stat.open_rate || 0, 50) / 50 * 100;
  const replyScore = Math.min(stat.reply_rate || 0, 10) / 10 * 100;
  const clickScore = Math.min(stat.click_rate || 0, 5) / 5 * 100;
  
  return Math.round(
    openScore * openWeight +
    replyScore * replyWeight +
    clickScore * clickWeight
  );
}



