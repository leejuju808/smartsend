import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type UpsertPayload = {
  // resource identity
  id?: string
  owner_id: string
  scope: 'account' | 'campaign'
  campaign_id?: string | null
  kind: 'nudge_preset' | 'rewrite_preset' | 'saved_view' | 'preflight_preset'
  name: string
  description?: string | null
  status?: 'draft' | 'active' | 'archived'

  // version blob to write as "next version"
  data: Record<string, unknown>
  author_id: string

  // permissions to enforce after write
  permissions?: Array<{ user_id: string; role: 'viewer' | 'editor' | 'owner' }>
}

Deno.serve(async (req) => {
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })

  let payload: UpsertPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // 1) Upsert resource row (idempotent by id or (owner_id, scope, campaign_id, kind, name))
  let resourceId = payload.id
  if (!resourceId) {
    // Try find existing unique by (owner_id, scope, campaign_id, kind, name)
    const { data: existing, error: findErr } = await supabase
      .from('shared_resources')
      .select('id')
      .eq('owner_id', payload.owner_id)
      .eq('scope', payload.scope)
      .eq('kind', payload.kind)
      .eq('name', payload.name)
      .is('campaign_id', payload.campaign_id ?? null)
      .maybeSingle()
    if (findErr) return new Response(JSON.stringify({ error: findErr.message }), { status: 500 })
    resourceId = existing?.id
  }

  if (resourceId) {
    const { error: updErr } = await supabase
      .from('shared_resources')
      .update({
        description: payload.description ?? null,
        status: payload.status ?? 'active',
        campaign_id: payload.campaign_id ?? null
      })
      .eq('id', resourceId)
    if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500 })
  } else {
    const { data: ins, error: insErr } = await supabase
      .from('shared_resources')
      .insert({
        owner_id: payload.owner_id,
        scope: payload.scope,
        campaign_id: payload.campaign_id ?? null,
        kind: payload.kind,
        name: payload.name,
        description: payload.description ?? null,
        status: payload.status ?? 'active'
      })
      .select('id')
      .single()
    if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500 })
    resourceId = ins.id
  }

  // 2) Compute next version and insert
  const { data: maxv, error: maxErr } = await supabase
    .from('shared_resource_versions')
    .select('version')
    .eq('resource_id', resourceId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) return new Response(JSON.stringify({ error: maxErr.message }), { status: 500 })

  const nextVersion = (maxv?.version ?? 0) + 1
  const { error: verErr } = await supabase
    .from('shared_resource_versions')
    .insert({
      resource_id: resourceId,
      version: nextVersion,
      data: payload.data,
      author_id: payload.author_id
    })
  if (verErr) return new Response(JSON.stringify({ error: verErr.message }), { status: 500 })

  // 3) Sync permissions (replace set atomically)
  if (payload.permissions) {
    // wipe non-owners (keep at least one owner: creator) then insert new set
    const { error: delErr } = await supabase
      .from('shared_resource_permissions')
      .delete()
      .eq('resource_id', resourceId)
    if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 500 })

    const unique = dedupe(payload.permissions.map(p => ({ ...p, role: normalizeRole(p.role) })))
    if (unique.length) {
      const { error: permErr } = await supabase
        .from('shared_resource_permissions')
        .insert(unique.map(p => ({ resource_id: resourceId, ...p })))
      if (permErr) return new Response(JSON.stringify({ error: permErr.message }), { status: 500 })
    }
  }

  // 4) Return latest view
  const { data: view, error: viewErr } = await supabase
    .from('v_shared_resources')
    .select('*')
    .eq('id', resourceId)
    .single()
  if (viewErr) return new Response(JSON.stringify({ error: viewErr.message }), { status: 500 })

  return new Response(JSON.stringify({ ok: true, resource: view, version: nextVersion }), {
    headers: { 'content-type': 'application/json' }
  })
})

function normalizeRole(r: string): 'viewer' | 'editor' | 'owner' {
  return r === 'owner' ? 'owner' : r === 'editor' ? 'editor' : 'viewer'
}
function dedupe<T extends { user_id: string }>(arr: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of arr) if (!seen.has(x.user_id)) { seen.add(x.user_id); out.push(x) }
  return out
}






