export type RequiredField = "email";

export type OptionalField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "company"
  | "title"
  | "phone"
  | "website"
  | "linkedin"
  | "notes";

export type LeadRow = Record<string, string | undefined>;

export type LeadMappedRow = {
  campaign_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  notes?: string | null;
  status?: "new" | "queued" | "sending" | "sent" | "failed" | "replied";
};

