// components/inbox/LabelPill.tsx
export function LabelPill({ label, intent }: { label?: string | null; intent?: string | null }) {
  if (!label) return null;

  const base = "text-xs px-2 py-0.5 rounded-full border";
  const m: Record<string, string> = {
    positive: base + " bg-green-50 text-green-700 border-green-200",
    neutral: base + " bg-gray-50 text-gray-700 border-gray-200",
    negative: base + " bg-red-50 text-red-700 border-red-200",
    unsubscribe: base + " bg-orange-50 text-orange-700 border-orange-200",
    ooo: base + " bg-blue-50 text-blue-700 border-blue-200",
    bounce: base + " bg-red-50 text-red-700 border-red-200",
    other: base + " bg-gray-50 text-gray-700 border-gray-200",
  };

  return (
    <span className={m[label] || base}>
      {label}
      {intent && ` · ${intent}`}
    </span>
  );
}



