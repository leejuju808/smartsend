import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type GuardResult = { 
  allowed: boolean; 
  reason?: string; 
  caps?: { todayCap: number; domainCap: number; globalCap: number } 
};

export async function preflightGuard(workspaceId: string, toEmail: string): Promise<GuardResult> {
  const sb = supabaseAdmin;
  await sb.rpc('app.set_workspace', { id: workspaceId });

  const domain = toEmail.toLowerCase().split('@')[1];
  const today = new Date();
  const dayStr = today.toISOString().slice(0,10);

  // Load policy (or defaults)
  const { data: polRows } = await sb.from('send_policies').select('*').eq('workspace_id', workspaceId).limit(1);
  const pol = polRows?.[0] || {
    warmup_enabled: true,
    ramp_start_per_day: 25,
    weekly_increment: 25,
    ramp_max_per_day: 500,
    domain_max_per_day: 200,
    global_max_per_day: 1000,
    ramp_start_date: dayStr,
    bounce_window_days: 7,
    bounce_rate_threshold: 0.05,
    cooldown_minutes: 1440,
  };

  // Compute today cap from warm‑up schedule
  const { data: capRows } = await sb.rpc('app.allowed_cap', {
    p_ramp_start_per_day: pol.ramp_start_per_day,
    p_weekly_increment: pol.weekly_increment,
    p_ramp_max_per_day: pol.ramp_max_per_day,
    p_ramp_start_date: pol.ramp_start_date,
    p_today: dayStr,
  });
  const todayCap: number = (Array.isArray(capRows) ? capRows[0] : capRows) as unknown as number;

  // Check cooldown
  const { data: ctr } = await sb
    .from('send_counters')
    .select('cooldown_until')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .eq('day', dayStr)
    .maybeSingle();
  if (ctr?.cooldown_until && new Date(ctr.cooldown_until).getTime() > Date.now()) {
    return { allowed: false, reason: `cooldown until ${new Date(ctr.cooldown_until).toISOString()}` };
  }

  // Bounce rate checks
  const { data: wsStats } = await sb.rpc('app.bounce_stats', { p_workspace: workspaceId, p_domain: '', p_window_days: pol.bounce_window_days });
  const { data: dmStats } = await sb.rpc('app.bounce_stats', { p_workspace: workspaceId, p_domain: domain, p_window_days: pol.bounce_window_days });
  const wsRate = wsStats?.rate ?? 0; 
  const dmRate = dmStats?.rate ?? 0;
  
  if (wsRate >= pol.bounce_rate_threshold || dmRate >= pol.bounce_rate_threshold) {
    // set cooldown
    const until = new Date(Date.now() + pol.cooldown_minutes * 60_000).toISOString();
    await sb
      .from('send_counters')
      .upsert({ workspace_id: workspaceId, domain, day: dayStr, cooldown_until: until }, { onConflict: 'workspace_id,domain,day' });
    return { allowed: false, reason: `high bounce rate (ws=${(wsRate*100).toFixed(1)}%, domain=${(dmRate*100).toFixed(1)}%), cooldown ${pol.cooldown_minutes}m` };
  }

  // Compute per‑domain cap (min of warm‑up todayCap and domain_max_per_day)
  const domainCap = Math.min(todayCap, pol.domain_max_per_day);
  // (Optional) global cap enforcement: you can track per‑workspace totals across domains; omitted here for simplicity.
  const globalCap = pol.global_max_per_day;

  return { allowed: true, caps: { todayCap, domainCap, globalCap } };
}

export async function reserveAndSend(
  workspaceId: string,
  toEmail: string,
  sender: (args: { toEmail: string }) => Promise<void>
): Promise<GuardResult> {
  const pre = await preflightGuard(workspaceId, toEmail);
  const domain = toEmail.toLowerCase().split('@')[1];
  const dayStr = new Date().toISOString().slice(0,10);
  const sb = supabaseAdmin;
  await sb.rpc('app.set_workspace', { id: workspaceId });

  if (!pre.allowed) {
    await sb.from('sending_audit').insert({ workspace_id: workspaceId, domain, to_email: toEmail, allowed: false, reason: pre.reason || 'blocked' });
    return pre;
  }

  // Try reservation atomically
  const limit = pre.caps!.domainCap;
  const { data: ok } = await sb.rpc('app.reserve_send', { p_workspace: workspaceId, p_domain: domain, p_day: dayStr, p_limit: limit });
  if (!ok) {
    const reason = `cap reached (${limit}/day for ${domain})`;
    await sb.from('sending_audit').insert({ workspace_id: workspaceId, domain, to_email: toEmail, allowed: false, reason });
    return { allowed: false, reason };
  }

  // Perform send via provided sender
  try {
    await sender({ toEmail });
    await sb.from('sending_audit').insert({ workspace_id: workspaceId, domain, to_email: toEmail, allowed: true, reason: 'sent' });
    return { allowed: true, caps: pre.caps };
  } catch (e: any) {
    await sb.from('sending_audit').insert({ workspace_id: workspaceId, domain, to_email: toEmail, allowed: false, reason: `send error: ${e?.message || 'unknown'}` });
    return { allowed: false, reason: e?.message || 'send failed' };
  }
} 