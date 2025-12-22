// Block 203 — Thread State System v1
// State badge component for displaying thread state

export function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-blue-600 text-white" },
    needs_reply: { label: "Needs Reply", className: "bg-red-600 text-white" },
    replied: { label: "Replied", className: "bg-green-600 text-white" },
    closed: { label: "Closed", className: "bg-gray-500 text-white" },
  };

  const config = map[state] || map.open;

  return (
    <span className={`px-2 py-1 rounded text-white text-xs ${config.className}`}>
      {config.label}
    </span>
  );
}










