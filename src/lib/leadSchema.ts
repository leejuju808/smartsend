import { z } from "zod";

export const leadSchema = z.object({
  email: z.string().email("Invalid email address"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  meta: z.record(z.any()).optional(),
});

export type LeadInput = z.infer<typeof leadSchema>; 