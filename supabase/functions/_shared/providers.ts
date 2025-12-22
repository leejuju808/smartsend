// Shared provider interface and utilities
// supabase/functions/_shared/providers.ts

export type SendResult = { ok: true; id: string } | { ok: false; code?: string; message?: string }

export interface EmailProvider {
  ensureToken(): Promise<void>
  send(opts: { from: string; to: string; subject: string; html: string }): Promise<SendResult>
}

export type Mailbox = {
  id: string; user_id: string; provider: 'gmail'|'outlook';
  access_token: string|null; refresh_token: string|null; token_expires_at: string|null;
  provider_email: string|null; scopes?: string[]|null;
}

/** Utility: refresh if expiring within N seconds */
export function isExpiring(expiresAt?: string|null, skewSec = 60) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() - Date.now() < skewSec*1000
}

