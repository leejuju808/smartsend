import { openai } from "@/lib/openai";

type WorkspaceProfile = {
  company_name: string | null;
  niche: string | null;
  primary_city: string | null;
  service_area: string | null;
  typical_job_types: string | null;
  avg_job_value: number | null;
  tone_style: string | null;
};

type StepDraft = {
  step_order: number;
  delay_days: number;
  subject: string;
  body: string;
};

export async function personalizeCampaignCopy(params: {
  workspaceProfile: WorkspaceProfile;
  campaignName: string;
  steps: StepDraft[];
}) {
  const { workspaceProfile, campaignName, steps } = params;

  const system = `
You are SmartSend's roofing outreach copy assistant.

Goal: Rewrite cold email sequences for LOCAL ROOFING COMPANIES.
- Audience: homeowners
- Niche: roofing (storm damage, leaks, replacements, maintenance)
- Style: clear, simple, human, no buzzwords.
- Length: keep emails short and skimmable.

Rules:
- Use plain language, 5th–8th grade reading level.
- Include LOCAL references (city / area) when relevant.
- Make the call-to-action about booking an estimate / inspection.
- Do NOT change placeholders like {{contact.first_name}} or {{city}}.
- Do NOT invent discounts or fake claims.
- Keep subjects punchy, under ~8 words when possible.
`.trim();

  const profileText = `
Company name: ${workspaceProfile.company_name || "Your roofing company"}
Primary city: ${workspaceProfile.primary_city || "your city"}
Service area: ${workspaceProfile.service_area || "local area"}
Job types: ${workspaceProfile.typical_job_types || "roof repair and replacement"}
Avg job value: ${workspaceProfile.avg_job_value || "Not specified"}
Tone: ${workspaceProfile.tone_style || "direct and friendly"}
`.trim();

  const stepsText = steps
    .map((s) => {
      return `
Step ${s.step_order} (send after ${s.delay_days} days):
Subject:
${s.subject}

Body:
${s.body}
`;
    })
    .join("\n\n---\n\n");

  const user = `
Campaign name: ${campaignName}

Workspace profile:
${profileText}

Original steps:
${stepsText}

TASK:
Rewrite each step's SUBJECT and BODY to fit this local roofing company.
Preserve placeholders like {{contact.first_name}}, {{city}}, {{sender.signature}}.
Respond in JSON with this shape:

{
  "steps": [
    {
      "step_order": 1,
      "subject": "...",
      "body": "..."
    }
  ]
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw) as { steps: StepDraft[] };

  return parsed.steps;
}

