// app/(app)/replies/page.tsx
import RepliesList from '@/components/inbox/RepliesList'

export default function RepliesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Replies</h1>
      <RepliesList />
    </div>
  )
}

