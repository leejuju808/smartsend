import Link from 'next/link'
import UsageBadge from '@/components/billing/UsageBadge'
import { getUserSubscriptionStatus, isPro } from '@/lib/usage'
import { getOrCreateDefaultOrgForUser, seatLimitForOrg } from '@/lib/org'
import { createAdminClient } from '@/lib/supabase'
import { removeMember } from '@/app/actions/team'
import InviteMemberForm from '@/components/InviteMemberForm'
import AddSeatButton from '@/components/team/AddSeatButton'
import { CityAccessIndicator } from '@/components/CityAccessIndicator'

export default async function AccountPage() {
  const { user, status } = await getUserSubscriptionStatus()
  if (!user) {
    return (
      <div className="p-6">
        Please <Link href="/login" className="text-blue-600 underline">sign in</Link> to view your account.
      </div>
    )
  }

  // Team/Seats
  const { org } = await getOrCreateDefaultOrgForUser()
  let members: any[] | null = null
  let limit: number | null = null
  if (org?.id) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('org_members')
      .select('user_id, role, created_at, profiles:profiles!inner(id,email)')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true })
    members = data as any[] | null
    limit = await seatLimitForOrg(org.id)
  }

  return (
    <div className="max-w-2xl mx-auto py-10 space-y-6">
      {/* City Access (soft scarcity) */}
      {/* @ts-expect-error Client component */}
      <CityAccessIndicator />
      <div className="rounded-2xl border p-6 bg-white space-y-2">
        <div className="text-sm text-slate-500">Subscription status</div>
        <div className="text-lg font-semibold flex items-center gap-2">
          {isPro(status) ? 'Pro' : 'Free'}
          {/* @ts-expect-error Server Component */}
          <UsageBadge />
        </div>
        {!isPro(status) && (
          <div className="text-sm text-slate-500">
            Upgrade on the <Link href="/dashboard/billing" className="text-blue-600 underline">Billing</Link> page for higher limits.
          </div>
        )}
      </div>
      <div className="rounded-2xl border p-6 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">Team</div>
            <div className="text-lg font-semibold">
              {(members?.length ?? 1)} seat{(members?.length ?? 1) === 1 ? '' : 's'}{limit !== null ? ` (limit ${limit})` : ''}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* @ts-expect-error Client component */}
            <AddSeatButton currentSeats={(members?.length ?? 1)} />
            {!isPro(status) ? (
              <div className="w-44">
                <Link className="text-blue-600 underline" href="/dashboard/billing">Upgrade for more</Link>
              </div>
            ) : null}
          </div>
        </div>
        {limit !== null && (members?.length ?? 1) >= limit ? (
          <div className="rounded-lg border bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            You’re at your seat limit. <a className="underline" href={`/dashboard/billing?from=seat_limit&need=1`}>Increase seats</a>.
          </div>
        ) : null}
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Joined</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(members || []).map((m: any) => (
                <tr key={m.user_id}>
                  <td className="px-3 py-2">{m.profiles?.email ?? m.user_id}</td>
                  <td className="px-3 py-2">{m.role}</td>
                  <td className="px-3 py-2">{new Date(m.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    {m.user_id === user.id ? (
                      <span className="text-xs text-slate-400">You</span>
                    ) : (
                      <form action={removeMember}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <button className="text-xs underline">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-2">
          {/* @ts-expect-error Client component */}
          <InviteMemberForm />
          <p className="text-xs text-slate-500 mt-1">Adding teammates increases your billed seats.</p>
        </div>
      </div>
    </div>
  )
}

