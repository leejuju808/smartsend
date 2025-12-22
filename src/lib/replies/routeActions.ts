import { supabaseAdmin } from "@/server/supabase";
import type { ReplyIntent } from "@/lib/ai/classifyReply";

export async function applyReplyOutcome(args: {
  lead_id: string;
  email_log_id: string;
  intent: ReplyIntent;
  confidence: number;
  summary: string;
  raw: any;
  from_email?: string | null;
}) {
  // 1) persist classification
  await supabaseAdmin.from("reply_classifications").insert({
    email_log_id: args.email_log_id,
    lead_id: args.lead_id,
    intent: args.intent,
    confidence: args.confidence,
    summary: args.summary,
    raw: args.raw
  });

  // 2) base updates
  await supabaseAdmin.from("email_logs").update({ replied: true }).eq("id", args.email_log_id);

  // 3) outcomes
  switch (args.intent) {
    case "unsubscribe":
      if (args.from_email) {
        await supabaseAdmin.from("suppression_list").upsert({ email: args.from_email, reason: "user_unsubscribed" }, { onConflict: "email" });
        await supabaseAdmin.from("leads").update({ status: "unsubscribed" }).eq("id", args.lead_id);
      }
      break;
    case "not_interested":
    case "spam":
      await supabaseAdmin.from("leads").update({ status: "closed_lost" }).eq("id", args.lead_id);
      break;
    case "ooo":
      // optionally reschedule campaign step + add note
      await supabaseAdmin.from("leads").update({ status: "ooo" }).eq("id", args.lead_id);
      break;
    case "scheduling":
    case "interested":
    case "referral":
      await supabaseAdmin.from("leads").update({ status: "qualified" }).eq("id", args.lead_id);
      // create follow-up task
      await supabaseAdmin.from("tasks").insert({
        lead_id: args.lead_id,
        title: args.intent === "scheduling" ? "Send calendar link" : "Craft tailored follow-up",
        due_at: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(), // +6h
        source: "ai_reply_detection"
      });
      break;
    default:
      // neutral/unknown -> just mark replied
      await supabaseAdmin.from("leads").update({ status: "replied" }).eq("id", args.lead_id);
  }
}