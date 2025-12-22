export type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export const roofingTemplates: Template[] = [
  {
    id: "roof-estimate",
    name: "Roof Estimate (Homeowner)",
    subject: "Quick Question About Your Roof",
    body: `Hi {{name}}, 

We've been helping homeowners in {{city}} with roof repairs and replacements.

Would you like a no-pressure estimate for your place?

-Julian 
SmartSend Roofing Outreach`,
  },
  {
    id: "storm-damage",
    name: "Storm Damage (Insurance)",
    subject: "Storm Damage Check-Up",
    body: `Hi {{name}}, 

The recent weather has caused roof issues across {{city}}.

If you'd like a quick inspection and help with insurance, we can send someone out.

-Julian`,
  },
  {
    id: "replacement-upgrade",
    name: "Roof Replacement (Upgrade)",
    subject: "Thinking About a New Roof?",
    body: `Hi {{name}}, 

If you've been considering a roof upgrade, we can show options that last 20+ years.

Want details?

-Julian`,
  },
];

























































