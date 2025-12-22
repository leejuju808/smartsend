export function RepliedBadge({ replied }: { replied: boolean }) {
  if (!replied) return null;
  return (
    <span className="ml-2 rounded-full bg-green-600/10 text-green-500 text-xs px-2 py-0.5">
      Replied ✅
    </span>
  );
}

