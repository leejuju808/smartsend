export function ReplyBadge({ label }: { label?: string | null }) {
  if (!label) return null

  const map: Record<string, string> = {
    positive: 'bg-green-100 text-green-700',
    neutral: 'bg-gray-100 text-gray-700',
    negative: 'bg-red-100 text-red-700',
    ooh: 'bg-blue-100 text-blue-700',
    unsubscribe: 'bg-yellow-100 text-yellow-800',
    bounce: 'bg-orange-100 text-orange-800',
    unknown: 'bg-muted text-foreground'
  }

  return <span className={`text-xs px-2 py-0.5 rounded ${map[label] || 'bg-muted'}`}>{label}</span>
}
