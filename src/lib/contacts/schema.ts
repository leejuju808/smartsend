// TODO: Install zod with: npm install zod
// import { z } from "zod";

// export const ContactInput = z.object({
//   email: z.string().email(),
//   name: z.string().optional().nullable(),
//   company: z.string().optional().nullable(),
//   tags: z.array(z.string()).optional().default([]),
// });

// export type ContactInput = z.infer<typeof ContactInput>;

export interface ContactInput {
  email: string;
  name?: string | null;
  company?: string | null;
  tags?: string[];
}

// Basic validation function
export function validateContactInput(data: any): ContactInput | null {
  if (!data || typeof data !== 'object') return null;
  
  const email = data.email;
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  
  return {
    email: email.trim().toLowerCase(),
    name: data.name ? String(data.name).trim() : null,
    company: data.company ? String(data.company).trim() : null,
    tags: Array.isArray(data.tags) ? data.tags : [],
  };
}

// Once zod is installed, you can replace the above with:
/*
import { z } from "zod";

export const ContactInput = z.object({
  email: z.string().email(),
  name: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
});

export type ContactInput = z.infer<typeof ContactInput>;

export function validateContactInput(data: any): ContactInput | null {
  const result = ContactInput.safeParse(data);
  return result.success ? result.data : null;
}
*/ 