import { z } from "zod";

export const leadRowSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  first_name: z.string().optional().transform(v => (v ?? "").trim()),
  last_name: z.string().optional().transform(v => (v ?? "").trim()),
  company: z.string().optional().transform(v => (v ?? "").trim()),
});

export type LeadRow = z.infer<typeof leadRowSchema>;

export const mappedPayloadSchema = z.object({
  campaignId: z.string().min(1),
  rows: z.array(leadRowSchema).min(1).max(10_000),
});


