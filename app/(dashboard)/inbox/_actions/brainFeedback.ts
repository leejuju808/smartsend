"use server";

import { createClient } from "@/utils/supabase/server";
import { z } from "zod";

const Schema = z.object({
  inferenceId: z.string().uuid(),
  correct_intent: z.string().optional(),
  correct_action: z.string().optional(),
  note: z.string().optional()
});

export async function submitBrainFeedback(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const data = Schema.parse({
    inferenceId: formData.get("inferenceId"),
    correct_intent: formData.get("correct_intent") || undefined,
    correct_action: formData.get("correct_action") || undefined,
    note: formData.get("note") || undefined
  });

  const { data: inf } = await sb.from("reply_brain_inferences").select("account_id").eq("id", data.inferenceId).single();
  
  if (!inf) throw new Error("Inference not found");

  const { error } = await sb.from("reply_brain_feedback").insert({
    inference_id: data.inferenceId,
    account_id: inf.account_id,
    correct_intent: data.correct_intent as any,
    correct_action: data.correct_action as any,
    note: data.note,
    user_id: user.id
  });

  if (error) throw error;

  return { ok: true };
}















