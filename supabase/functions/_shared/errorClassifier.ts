// Shared error classifier with local heuristics fallback
// Used when DB classifier is unavailable or as a convenience helper

export type NormalizedError = {
  kind: 'rate_limit'|'server_error'|'auth_error'|'quota_exceeded'|
        'invalid_recipient'|'spam_block'|'policy_violation'|
        'temporary_deferral'|'network'|'unknown';
  action: 'retry'|'dead_letter'|'suppress_recipient'|'pause_account'|'escalate';
  permanent: boolean;
};

export function localHeuristics(code = '', message = ''): NormalizedError {
  const m = (message || '').toLowerCase();
  const c = (code || '').toLowerCase();

  if (/429|rate limit|too many|throttle|quota/.test(c + ' ' + m))
    return { kind: 'rate_limit', action: 'retry', permanent: false };

  if (/5\d{2}|server error|temporary|try again/.test(c + ' ' + m))
    return { kind: 'server_error', action: 'retry', permanent: false };

  if (/auth|unauthorized|invalid credentials|not permitted|forbidden/.test(m))
    return { kind: 'auth_error', action: 'pause_account', permanent: true };

  if (/550|554|user unknown|no such user|mailbox unavailable|invalid address|invalid recipient/.test(m))
    return { kind: 'invalid_recipient', action: 'suppress_recipient', permanent: true };

  if (/spam|junk|content rejected|content filtered/.test(m))
    return { kind: 'spam_block', action: 'dead_letter', permanent: true };

  if (/policy/.test(m))
    return { kind: 'policy_violation', action: 'escalate', permanent: true };

  return { kind: 'unknown', action: 'retry', permanent: false };
}














