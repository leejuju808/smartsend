import { z } from "zod";

export const LIBRARY_KINDS = ["nudge_preset", "rewrite_preset", "saved_view", "preflight_preset"] as const;
export const LIBRARY_STATUSES = ["draft", "published", "archived"] as const;
export const ADOPTION_MODES = ["clone", "inherit"] as const;

export const libraryKindSchema = z.enum(LIBRARY_KINDS);
export const libraryStatusSchema = z.enum(LIBRARY_STATUSES);
export const adoptionModeSchema = z.enum(ADOPTION_MODES);

export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];
export type AdoptionMode = (typeof ADOPTION_MODES)[number];






