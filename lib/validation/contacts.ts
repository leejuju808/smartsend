import { z } from "zod";

export const contactSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
});

export const contactsPayloadSchema = z.object({
  userEmail: z.string().email(),           // who's importing (we look up profile_id)
  skipSuppressed: z.boolean().default(true),
  dryRun: z.boolean().default(true),
  contacts: z.array(contactSchema).min(1),
});

export type ContactsPayload = z.infer<typeof contactsPayloadSchema>;
