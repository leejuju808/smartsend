import 'server-only'
import React from 'react'
import { getOrCreateDefaultOrgForUser, requireOrgRole } from '@/lib/org'

export default async function RequireRole({
  children,
  roles = ['owner', 'admin'] as Array<'owner' | 'admin'>,
}: {
  children: React.ReactNode
  roles?: Array<'owner' | 'admin'>
}) {
  const { user, org } = await getOrCreateDefaultOrgForUser()
  if (!user || !org) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="rounded-2xl border p-6 bg-white space-y-3">
          <h2 className="text-xl font-semibold">Sign in required</h2>
          <p className="text-sm text-slate-600"><a href="/login" className="underline">Sign in</a> to continue.</p>
        </div>
      </div>
    )
  }
  try {
    await requireOrgRole((org as any).id as string, (user as any).id as string, roles)
    return <>{children}</>
  } catch {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="rounded-2xl border p-6 bg-white space-y-3">
          <h2 className="text-xl font-semibold">Not allowed</h2>
          <p className="text-sm text-slate-600">You need {roles.join(' or ')} permissions to access this section.</p>
        </div>
      </div>
    )
  }
}

