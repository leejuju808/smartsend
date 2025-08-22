import 'server-only'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export default async function CancelFeedbackAdmin() {
  const supabase = createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = (user as any)?.email as string | undefined
  if (!isAdminEmail(email)) notFound()
  const sb = admin()
  const { data } = await sb
    .from('cancellation_feedback')
    .select('created_at, user_id, reason, note')
    .order('created_at', { ascending: false })
    .limit(500)
  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Cancellation feedback (latest)</h1>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data || []).map((r: any, i: number) => (
              <tr key={`${r.user_id}-${i}-${r.created_at}`}>
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.user_id}</td>
                <td className="px-3 py-2">{String(r.reason).replace(/_/g,' ')}</td>
                <td className="px-3 py-2">{r.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
