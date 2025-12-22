// supabase/functions/followup-scheduler/index.ts
// Block 21707 — SmartSend Roofing Follow-Up Scheduler Engine v1
// Backend logic that actually sends the follow-ups on autopilot

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

type FollowUpStage = "none" | "fu_1" | "fu_2" | "fu_3" | "fu_4";

Deno.serve(async (req) => {
  try {
    // 1) Fetch due follow-up profiles
    const { data: profiles, error } = await supabase
      .from("follow_up_profiles")
      .select(
        `
        id,
        company_id,
        campaign_id,
        contact_id,
        current_stage,
        status,
        next_run_at
      `
      )
      .eq("status", "active")
      .lte("next_run_at", new Date().toISOString())
      .limit(100); // safety limit per run

    if (error) {
      console.error("Error fetching profiles:", error);
      return new Response("Error", { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return new Response("No profiles due", { status: 200 });
    }

    for (const profile of profiles) {
      await handleProfile(profile);
    }

    return new Response("Processed follow-ups", { status: 200 });
  } catch (e) {
    console.error("Unexpected error in followup-scheduler:", e);
    return new Response("Error", { status: 500 });
  }
});

async function handleProfile(profile: any) {
  const stage = profile.current_stage as FollowUpStage;

  // Fetch campaign follow-up settings (Block 21709)
  const { data: settings } = await supabase
    .from("campaign_follow_up_settings")
    .select("*")
    .eq("campaign_id", profile.campaign_id)
    .maybeSingle();

  // Check if follow-ups are enabled
  if (settings && !settings.enabled) {
    // Follow-ups disabled, mark as paused
    await supabase
      .from("follow_up_profiles")
      .update({
        status: "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    return;
  }

  // Get max follow-ups from settings (default: 4)
  const maxFollowUps = settings?.max_follow_ups ?? 4;

  // Check if we've reached the max follow-ups limit
  const stageNumber = stage === "none" ? 0 : parseInt(stage.replace("fu_", ""));
  if (stageNumber >= maxFollowUps) {
    // Reached max follow-ups, mark as completed
    await supabase
      .from("follow_up_profiles")
      .update({
        status: "completed",
        current_stage: `fu_${maxFollowUps}` as FollowUpStage,
        next_run_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    await supabase.from("follow_up_logs").insert({
      follow_up_profile_id: profile.id,
      company_id: profile.company_id,
      campaign_id: profile.campaign_id,
      contact_id: profile.contact_id,
      from_stage: stage,
      to_stage: `fu_${maxFollowUps}` as FollowUpStage,
      action: "marked_completed",
      notes: `Reached max follow-ups limit (${maxFollowUps})`,
    });

    return;
  }

  // Decide next stage + template + delay (using dynamic settings)
  const next = getNextFollowUp(stage, settings);
  if (!next) {
    // No more follow-ups, mark as cold/completed
    await supabase
      .from("follow_up_profiles")
      .update({
        status: "cold",
        current_stage: "fu_4",
        next_run_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    await supabase.from("follow_up_logs").insert({
      follow_up_profile_id: profile.id,
      company_id: profile.company_id,
      campaign_id: profile.campaign_id,
      contact_id: profile.contact_id,
      from_stage: stage,
      to_stage: "fu_4",
      action: "marked_cold",
      notes: "No more follow-ups scheduled",
    });

    return;
  }

  const { nextStage, subject, bodyTemplate, delayHours } = next;

  // Fetch contact + personalization fields
  const { data: contactRow } = await supabase
    .from("contacts")
    .select("email, first_name, city")
    .eq("id", profile.contact_id)
    .single();

  if (!contactRow) return;

  // Fetch campaign to get sender name
  const { data: campaignRow } = await supabase
    .from("campaigns")
    .select("from_name, name")
    .eq("id", profile.campaign_id)
    .single();

  const toEmail = contactRow.email;
  const context = {
    first_name: contactRow.first_name ?? "there",
    city: contactRow.city ?? "",
    sender_name: campaignRow?.from_name ?? campaignRow?.name ?? "SmartSend Team",
  };

  const subjectFilled = fillTemplate(subject, context);
  const bodyFilled = fillTemplate(bodyTemplate, context);

  // 1) Queue email
  const { error: queueError } = await supabase.from("email_send_queue").insert({
    company_id: profile.company_id,
    campaign_id: profile.campaign_id,
    contact_id: profile.contact_id,
    follow_up_profile_id: profile.id,
    follow_up_stage: nextStage,
    to_email: toEmail,
    subject: subjectFilled,
    body: bodyFilled,
    status: "pending",
    scheduled_at: new Date().toISOString(),
  });

  if (queueError) {
    console.error("Error queuing email:", queueError);
    await supabase
      .from("follow_up_profiles")
      .update({
        status: "error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    return;
  }

  // 2) Update follow_up_profile next_run_at + stage
  const nextRun = new Date();
  nextRun.setHours(nextRun.getHours() + delayHours);

  await supabase
    .from("follow_up_profiles")
    .update({
      current_stage: nextStage,
      next_run_at: nextStage === "fu_4" ? null : nextRun.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  // 3) Insert log
  await supabase.from("follow_up_logs").insert({
    follow_up_profile_id: profile.id,
    company_id: profile.company_id,
    campaign_id: profile.campaign_id,
    contact_id: profile.contact_id,
    from_stage: stage,
    to_stage: nextStage,
    action: `scheduled_${nextStage}`,
  });
}

function getNextFollowUp(stage: FollowUpStage, settings?: any) {
  // Use dynamic delay hours from settings if available, otherwise use defaults
  const getDelayHours = (stageNum: number): number => {
    if (!settings) {
      // Default delays
      const defaults = [48, 48, 72, 168];
      return defaults[stageNum - 1] || 48;
    }
    
    switch (stageNum) {
      case 1: return settings.fu_1_delay_hours ?? 48;
      case 2: return settings.fu_2_delay_hours ?? 96;
      case 3: return settings.fu_3_delay_hours ?? 168;
      case 4: return settings.fu_4_delay_hours ?? 336;
      default: return 48;
    }
  };

  switch (stage) {
    case "none":
      return {
        nextStage: "fu_1" as FollowUpStage,
        subject: "Quick follow-up",
        delayHours: getDelayHours(1),
        bodyTemplate: `
Hey {{first_name}}, just wanted to circle back in case my last message got buried.

If you still need someone to take a look at your roof, I can get you a free estimate this week.

No pressure — just reply here and I'll get you on the schedule.

– {{sender_name}}
        `,
      };
    case "fu_1":
      return {
        nextStage: "fu_2" as FollowUpStage,
        subject: "Still need help with your roof?",
        delayHours: getDelayHours(2),
        bodyTemplate: `
Hi {{first_name}},

Wanted to check in — we've been helping a lot of homeowners in {{city}} with roof issues lately (leaks, wind damage, missing shingles).

If you'd like, I can swing by for a quick inspection and give you a straightforward quote.
Takes about 10–15 minutes.

Would tomorrow or Thursday work for you?

– {{sender_name}}
        `,
      };
    case "fu_2":
      return {
        nextStage: "fu_3" as FollowUpStage,
        subject: "Should I close your file?",
        delayHours: getDelayHours(3),
        bodyTemplate: `
Hey {{first_name}},

Did you still want a quote for the roof?
Totally fine either way — I just don't want to bother you if you've already handled it.

Let me know and I'll update my notes.

– {{sender_name}}
        `,
      };
    case "fu_3":
      return {
        nextStage: "fu_4" as FollowUpStage,
        subject: "Last check-in",
        delayHours: getDelayHours(4),
        bodyTemplate: `
Hi {{first_name}},

This will be my last follow-up — if you still need help with the roof, I'm happy to take a look.
If not, just ignore this and I'll close things out on my end.

All the best,
{{sender_name}}
        `,
      };
    case "fu_4":
    default:
      return null;
  }
}

function fillTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => {
    const k = String(key).trim();
    return context[k] ?? "";
  });
}

