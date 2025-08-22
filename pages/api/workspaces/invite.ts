import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { canManageMembers } from '../../../src/utils/permissions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed')

  try {
    const { workspaceId, email, role } = req.body as { workspaceId: string; email: string; role?: string }
    if (!workspaceId || !email) return res.status(400).json({ error: 'workspaceId and email are required' })

    // Authenticate caller via Supabase access token (pages/api context)
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: authedUser } = await supabase.auth.getUser(token)
    const callerId = (authedUser?.user as any)?.id as string | undefined
    if (!callerId) return res.status(401).json({ error: 'Unauthorized' })

    // Check caller membership role for this workspace
    const { data: callerMembership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', callerId)
      .maybeSingle()
    const callerRole = (callerMembership as any)?.role as string | undefined
    if (!callerRole || !canManageMembers(callerRole)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const desiredRole = (role || 'member') as string
    if (!['owner', 'admin', 'member'].includes(desiredRole)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    // Enforce seat limit before inviting
    const { data: ws } = await supabase
      .from('workspaces')
      .select('id, seat_limit, member_count')
      .eq('id', workspaceId)
      .maybeSingle()
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    if ((ws as any).member_count >= (ws as any).seat_limit) {
      return res.status(403).json({ error: 'Seat limit reached. Upgrade your plan to add more members.' })
    }

    // Find user by email in profiles
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (!user) return res.status(404).json({ error: 'User not found' })

    const { error } = await supabase.from('workspace_members').insert([
      { workspace_id: workspaceId, user_id: (user as any).id, role: desiredRole },
    ])
    if (error) return res.status(500).json({ error: error.message })

    // Increment member_count on success (best-effort)
    await supabase
      .from('workspaces')
      .update({ member_count: ((ws as any).member_count ?? 0) + 1 })
      .eq('id', workspaceId)

    return res.status(200).json({ success: true })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal error' })
  }
}

