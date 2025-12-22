import { z } from "zod";
import { adoptionModeSchema, libraryKindSchema, libraryStatusSchema } from "./constants";

export const libraryQuerySchema = z.object({
  kind: libraryKindSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const publishResourceSchema = z.object({
  content: z.unknown(),
  changelog: z
    .string()
    .trim()
    .min(1, "changelog must not be empty")
    .max(2000, "changelog must be shorter than 2000 characters")
    .optional(),
  status: libraryStatusSchema.optional(),
});

export const adoptResourceSchema = z.object({
  campaignId: z.string().uuid(),
  mode: adoptionModeSchema.default("clone"),
});

export const updateStatusQuerySchema = z.object({
  campaignId: z.string().uuid(),
});

export const applyUpdateSchema = z.object({
  campaignId: z.string().uuid(),
});

export const forkResourceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
});

export const diffQuerySchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
});

export const resourceParamSchema = z.object({
  id: z.string().uuid(),
});

