// app/dashboard/replies/_components/IntentPill.tsx

import Link from "next/link";

type IntentType = "hot" | "warm" | "not_interested" | "unclassified";

interface IntentPillProps {
  intent: IntentType;
  label: string;
  count: number;
  isActive: boolean;
}

function getIntentClasses(intent: IntentType, isActive: boolean): string {
  const base =
    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition";

  const colorMap: Record<IntentType, string> = {
    hot: "border-red-600 text-red-600 bg-red-500/20",
    warm: "border-yellow-600 text-yellow-600 bg-yellow-500/20",
    not_interested: "border-gray-600 text-gray-400 bg-gray-500/20",
    unclassified: "border-blue-600 text-blue-600 bg-blue-500/20",
  };

  const inactive =
    "opacity-70 hover:opacity-100 hover:shadow-sm hover:-translate-y-[1px]";

  return `${base} ${colorMap[intent]} ${isActive ? "ring-1 ring-offset-1 ring-offset-background" : inactive}`;
}

export default function IntentPill({
  intent,
  label,
  count,
  isActive,
}: IntentPillProps) {
  return (
    <Link
      href={{
        pathname: "/dashboard/replies",
        query: { intent },
      }}
      scroll={false}
      className={getIntentClasses(intent, isActive)}
    >
      <span>{label}</span>
      <span className="rounded-full bg-background/60 px-2 py-[1px] text-[10px]">
        {count}
      </span>
    </Link>
  );
}

