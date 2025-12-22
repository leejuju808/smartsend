"use client"
export default function EmailConnect() {
  return (
    <div className="flex items-center gap-3">
      <a
        href="/api/oauth/google/start"
        className="px-4 py-2 rounded-xl border border-neutral-700 hover:border-neutral-500"
      >
        Connect Gmail
      </a>
      <p className="text-sm text-neutral-400">Enables auto-reply detection + inbox sync.</p>
    </div>
  )
} 