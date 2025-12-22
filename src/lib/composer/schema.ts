import { z } from 'zod';

export const StepSchema = z.object({
  step_no: z.number().int().positive(),
  wait_seconds: z.number().int().nonnegative().default(0),
  subject_template: z.string().optional(),
  text_template: z.string().optional(),
  html_template: z.string().optional(),
});

export const SequenceDraftSchema = z.object({
  name: z.string(),
  timezone: z.string().default(process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'),
  stop_on_reply: z.boolean().default(true),
  send_window: z.object({
    days: z.array(z.number().int().min(0).max(6)).default([1,2,3,4,5]),
    start_hour: z.number().int().min(0).max(23).default(9),
    end_hour: z.number().int().min(1).max(24).default(17),
  }).default({ days:[1,2,3,4,5], start_hour:9, end_hour:17 }),
  throttle_per_tick: z.number().int().min(1).max(1000).default(40),
  steps: z.array(StepSchema).min(1).max(10),
});

export type SequenceDraft = z.infer<typeof SequenceDraftSchema>;
export type Step = z.infer<typeof StepSchema>; 