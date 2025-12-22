"use client";

import { useMemo } from "react";

interface HTMLPreviewProps {
  subject: string;
  body: string;
}

// Demo values for variables
const DEMO_VALUES: Record<string, string> = {
  first_name: "John",
  last_name: "Smith",
  full_name: "John Smith",
  email: "john.smith@example.com",
  phone: "(555) 123-4567",
  city: "Denver",
  state: "CO",
  zip: "80202",
  county: "Denver County",
  storm_region: "Rocky Mountain",
  roof_type_guess: "Asphalt Shingle",
  property_type_guess: "Single Family",
  company_name: "Smith Roofing",
  company_phone: "(555) 987-6543",
  owner_name: "John Smith",
};

function resolveVariables(text: string): string {
  let resolved = text;
  Object.entries(DEMO_VALUES).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    resolved = resolved.replace(regex, value);
  });
  return resolved;
}

export function HTMLPreview({ subject, body }: HTMLPreviewProps) {
  const resolvedSubject = useMemo(() => resolveVariables(subject), [subject]);
  const resolvedBody = useMemo(() => resolveVariables(body), [body]);

  return (
    <div className="border rounded-lg p-4 bg-white space-y-4">
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Subject</div>
        <div className="text-sm font-medium">{resolvedSubject || "(empty)"}</div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Body</div>
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: resolvedBody || "<p>(empty)</p>" }}
        />
      </div>
    </div>
  );
}




























































