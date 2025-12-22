// components/leads/EnrichBadge.tsx
export function EnrichBadge({ status }: { status?: string | null }) {
  const map: Record<string, { className: string; label: string }> = {
    queued: { className: 'bg-amber-100 text-amber-800', label: 'Queued' },
    processing: { className: 'bg-blue-100 text-blue-800', label: 'Processing' },
    done: { className: 'bg-green-100 text-green-800', label: 'Done' },
    error: { className: 'bg-red-100 text-red-800', label: 'Error' },
    none: { className: 'bg-gray-100 text-gray-700', label: 'None' }
  }

  if (!status) return null

  const config = map[status] || { className: 'bg-muted', label: status }

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${config.className}`}>
      {config.label}
    </span>
  )
}






