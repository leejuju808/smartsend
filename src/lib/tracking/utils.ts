import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

function sbAdmin() {
  return new (createClient as any)(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function tok(n = 16) { 
  return randomBytes(n).toString('base64url'); 
}

function addUtm(original: string, extra: Record<string,string>) {
  try {
    const u = new URL(original);
    for (const [k,v] of Object.entries(extra)) if (v) u.searchParams.set(k, v);
    return u.toString();
  } catch { 
    return original; 
  }
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
}

const URL_REGEX = /(https?:\/\/[^\s"<>]+)/gi;

export async function injectTracking({
  workspaceId,
  email,
  subscriberId,
  sequenceId,
  stepNo,
  html,
  text,
}: {
  workspaceId: string; 
  email: string; 
  subscriberId?: string; 
  sequenceId?: string; 
  stepNo?: number; 
  html: string; 
  text: string;
}) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: workspaceId });

  // Create an open token
  const openToken = tok();
  await sb.from('open_tokens').insert({ 
    token: openToken, 
    workspace_id: workspaceId, 
    email: email.toLowerCase(), 
    subscriber_id: subscriberId || null, 
    sequence_id: sequenceId || null 
  });

  // UTM defaults
  const utm = {
    utm_source: process.env.DEFAULT_UTM_SOURCE || 'smartsend',
    utm_medium: process.env.DEFAULT_UTM_MEDIUM || 'email',
    utm_campaign: sequenceId || '',
    utm_content: stepNo ? String(stepNo) : '',
  };

  // 1) HTML: rewrite anchor hrefs and append pixel
  let htmlOut = html;
  
  // To use the queue above, we need two passes. Let's do a DOM-less two-pass safely:
  const pendingLinks: { token: string; url: string }[] = [];
  const anchorRegex = /<a\s+[^>]*href=\"([^\"]+)\"[^>]*>/gi;
  
  htmlOut = htmlOut.replace(anchorRegex, (m, href) => {
    if (!/^https?:\/\//i.test(href)) return m;
    const urlWithUtm = addUtm(href, utm);
    const token = tok();
    pendingLinks.push({ token, url: urlWithUtm });
    const tracked = `${baseUrl()}/api/t/${token}`;
    return m.replace(href, tracked);
  });

  if (pendingLinks.length) {
    const rows = pendingLinks.map(({ token, url }) => ({ 
      token, 
      workspace_id: workspaceId, 
      url, 
      email: email.toLowerCase(), 
      subscriber_id: subscriberId || null, 
      sequence_id: sequenceId || null, 
      step_no: stepNo || null 
    }));
    await sb.from('tracking_links').insert(rows);
  }

  // Append open pixel
  const pixel = `<img src="${baseUrl()}/api/open?t=${openToken}" alt="" width="1" height="1" style="display:none;" />`;
  if (/(<\/body>)/i.test(htmlOut)) {
    htmlOut = htmlOut.replace(/<\/body>/i, pixel + '</body>');
  } else {
    htmlOut += pixel;
  }

  // 2) TEXT: rewrite bare URLs to tracked redirects with UTM
  let textOut = text || '';
  const textUrls = textOut.match(URL_REGEX) || [];
  
  if (textUrls.length) {
    for (const url of textUrls) {
      const urlWithUtm = addUtm(url, utm);
      const token = tok();
      await sb.from('tracking_links').insert({ 
        token, 
        workspace_id: workspaceId, 
        url: urlWithUtm, 
        email: email.toLowerCase(), 
        subscriber_id: subscriberId || null, 
        sequence_id: sequenceId || null, 
        step_no: stepNo || null 
      });
      textOut = textOut.replace(url, `${baseUrl()}/api/t/${token}`);
    }
  }

  return { html: htmlOut, text: textOut };
} 