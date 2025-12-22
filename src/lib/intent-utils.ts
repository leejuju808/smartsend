// Intent badge utility
export const intentColor: Record<string, string> = {
  interested: "bg-amber-100 text-amber-800",
  meeting: "bg-blue-100 text-blue-800",
  referral: "bg-emerald-100 text-emerald-800",
  not_now: "bg-slate-100 text-slate-700",
  unsubscribe: "bg-red-100 text-red-800",
  ooo: "bg-purple-100 text-purple-800",
  bounce: "bg-rose-100 text-rose-800",
  question: "bg-gray-100 text-gray-800",
  unknown: "bg-zinc-100 text-zinc-700"
};

export const intentLabel: Record<string, string> = {
  interested: "Interested",
  meeting: "Meeting",
  referral: "Referral",
  not_now: "Not Now",
  unsubscribe: "Unsubscribe",
  ooo: "Out of Office",
  bounce: "Bounce",
  question: "Question",
  unknown: "Unknown"
};

export function getIntentColor(intent: string | null | undefined): string {
  if (!intent) return intentColor.unknown;
  return intentColor[intent] || intentColor.unknown;
}

export function getIntentLabel(intent: string | null | undefined): string {
  if (!intent) return "Unknown";
  return intentLabel[intent] || intent;
}

