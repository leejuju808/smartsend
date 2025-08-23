export type Tone = "direct" | "friendly" | "consultative";
export type Vars = { first_name?: string; company?: string; my_name?: string; calendly?: string };

function t(s: string, v: Vars) {
  return s
    .replace(/\{\{first_name\}\}/g, v.first_name || "there")
    .replace(/\{\{company\}\}/g, v.company || "your team")
    .replace(/\{\{my_name\}\}/g, v.my_name || "my team")
    .replace(/\{\{calendly\}\}/g, v.calendly || "");
}

const BASE: Record<string, { direct: string; friendly: string; consultative: string }> = {
  price: {
    direct:
`Totally fair, {{first_name}}. Most teams say that before they see the lift.
If we can show a net-positive week 1, is it worth a 15-min look?
{{calendly}}`,
    friendly:
`I hear you on budget, {{first_name}}. Quick win: we auto-add Calendly + .ics to "let's talk" replies and it books calls you're already earning.
Open to a 15-min peek to see if it pays for itself?
{{calendly}}`,
    consultative:
`Thanks for the candor, {{first_name}}. Budget makes sense. We typically start by measuring reply→meeting lift with a tiny pilot.
If the data says "keep," great—if not, we part friends. 15-min to scope?
{{calendly}}`,
  },
  not_interested: {
    direct:
`All good. If "not now" = "no problem," I'll close the loop.
If reply→meeting lift in week 1 would change your mind, 15-min?
{{calendly}}`,
    friendly:
`Appreciate the quick reply, {{first_name}}. If timing changes, keep this link handy:
{{calendly}}
(We only focus on "book more meetings from replies"—happy to show if useful.)`,
    consultative:
`Totally fair. Before I go: teams use us only for one job—turning positive replies into booked calls automatically.
If that becomes a priority, here's a zero-prep 15-min:
{{calendly}}`,
  },
  send_more_info: {
    direct:
`Link with 2-min overview + examples:
https://yourdomain.com
Want me to tailor a 15-min to {{company}}'s inbox flow?
{{calendly}}`,
    friendly:
`Absolutely—here's a 2-min overview:
https://yourdomain.com
If helpful, I can walk through how it fits {{company}}'s current reply flow.
{{calendly}}`,
    consultative:
`Sharing a quick primer below. If you send 2–3 recent replies (redacted), I'll annotate exactly where we add lift, then walk through it live.
{{calendly}}`,
  },
  bad_timing: {
    direct:
`Understood. I'll circle back. Want me to drop something on your calendar next month?
{{calendly}}`,
    friendly:
`Got it—busy season. I'll nudge later. If it helps, here's a pick-a-time link for whenever frees up:
{{calendly}}`,
    consultative:
`Timing noted. When it's right, we start with a 15-min "map your reply→meeting flow," then a tiny pilot.
Keep this handy:
{{calendly}}`,
  },
  already_using: {
    direct:
`Nice—curious what you use. A few teams pair us with their sequencer to capture "let's talk" replies automatically.
Worth a 15-min compare?
{{calendly}}`,
    friendly:
`Love that you're set up. We usually layer in where tools stop—auto-inserting Calendly + .ics when intent shows up.
Happy to show side-by-side in 15:
{{calendly}}`,
    consultative:
`Great. We slot into the reply stage only (no overlap): detect meeting intent → add link + .ics → booked.
If sharing your flow is easy, we'll mark exactly where we'd help. 15-min?
{{calendly}}`,
  },
  who_are_you: {
    direct:
`We help teams turn positive replies into booked meetings—auto-adding Calendly + .ics when intent appears.
15-min show-and-tell?
{{calendly}}`,
    friendly:
`We're a small tool that turns "let's talk" replies into calendar events—no manual back-and-forth.
Want a 15-min walkthrough?
{{calendly}}`,
    consultative:
`We focus on one KPI: reply→meeting conversion. We detect intent and attach logistics so calls land without friction.
If you share 2–3 replies, I'll annotate how it would work at {{company}}.
{{calendly}}`,
  },
};

export function craftReply(type: keyof typeof BASE, tone: Tone, vars: Vars): string {
  const template = BASE[type]?.[tone] ?? BASE[type]?.direct;
  return t(template || "", vars);
} 