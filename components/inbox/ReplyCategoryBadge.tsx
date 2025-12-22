"use client";

import { Badge } from "@/components/ui/badge";

const CATEGORY_COLORS: Record<string, string> = {
  meeting: "bg-blue-700 text-white",
  positive: "bg-emerald-700 text-white",
  negative: "bg-rose-700 text-white",
  neutral: "bg-slate-700 text-white",
  interested: "bg-emerald-700 text-white",
  not_interested: "bg-rose-700 text-white",
  referral: "bg-purple-700 text-white",
  out_of_office: "bg-amber-700 text-white",
  ooo: "bg-amber-700 text-white",
  unsubscribe: "bg-zinc-800 text-white border border-zinc-700",
  objection: "bg-orange-700 text-white",
  wrong_person: "bg-gray-500 text-white",
  bounce: "bg-red-700 text-white",
  spam: "bg-red-800 text-white",
  unclear: "bg-gray-400 text-white",
};

export function ReplyCategoryBadge({ category }: { category: string | null | undefined }) {
  if (!category) return null;

  return (
    <Badge
      className={`px-2 py-1 rounded text-[10px] font-medium ${
        CATEGORY_COLORS[category] || "bg-gray-500 text-white"
      }`}
    >
      {category}
    </Badge>
  );
}







