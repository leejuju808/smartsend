import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { createClient } = await import('npm:@supabase/supabase-js')
  const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

  try {
    // Get auth token from headers
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify token and get user
    const { data: { user: authUser }, error: authError } = await sb.auth.getUser(token)
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { project_id, email, role, inviter_id } = await req.json()

    if (!project_id || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields: project_id, email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Use authenticated user as inviter if not provided
    const actualInviterId = inviter_id || authUser.id

    // Verify inviter is admin/owner of the project
    const { data: inviterCheck, error: checkError } = await sb
      .from('project_members')
      .select('role')
      .eq('project_id', project_id)
      .eq('user_id', actualInviterId)
      .eq('accepted', true)
      .single()

    if (checkError || !inviterCheck) {
      return new Response(JSON.stringify({ error: 'Inviter not authorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!['owner', 'admin'].includes(inviterCheck.role)) {
      return new Response(JSON.stringify({ error: 'Only owners and admins can invite members' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Look up user by email using admin API
    // First try profiles table if it exists
    let userId: string | null = null
    
    try {
      const { data: profile } = await sb
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle()
      
      if (profile?.id) {
        userId = profile.id
      }
    } catch (e) {
      // profiles table might not exist or have email column, continue to admin API
    }

    // If not found in profiles, use admin API to search users
    if (!userId) {
      try {
        const { data: { users }, error: listError } = await sb.auth.admin.listUsers()
        
        if (!listError && users) {
          const matchingUser = users.find(u => 
            u.email?.toLowerCase() === email.toLowerCase()
          )
          if (matchingUser) {
            userId = matchingUser.id
          }
        }
      } catch (e) {
        console.error('Error querying users via admin API:', e)
      }
    }

    // If user doesn't exist, return error - they need to sign up first
    if (!userId) {
      return new Response(JSON.stringify({ 
        error: 'User with this email does not exist. They must sign up first.',
        user_exists: false
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if membership already exists
    const { data: existing } = await sb
      .from('project_members')
      .select('id')
      .eq('project_id', project_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      // Update existing membership if needed
      const { error: updateError } = await sb
        .from('project_members')
        .update({
          role: role || 'member',
          invited_by: actualInviterId,
          invited_at: new Date().toISOString(),
          accepted: false // Reset acceptance if re-inviting
        })
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      // Insert new membership
      const { error: insertError } = await sb
        .from('project_members')
        .insert({
          project_id,
          user_id: userId,
          role: role || 'member',
          invited_by: actualInviterId,
          invited_at: new Date().toISOString(),
          accepted: false
        })

      if (insertError) throw insertError
    }

    return new Response(JSON.stringify({ 
      ok: true,
      message: 'Invite sent successfully',
      user_id: userId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e: any) {
    console.error('Error in invite_member:', e)
    return new Response(JSON.stringify({ 
      error: String(e.message || e) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

