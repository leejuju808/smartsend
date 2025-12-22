// Block 18: Role Account Hygiene
// SmartSend — Helper to detect role accounts during CSV import

const ROLE_PREFIXES = [
  'admin',
  'support',
  'info',
  'sales',
  'contact',
  'help',
  'hello',
  'hi',
  'billing',
  'accounts',
  'noreply',
  'no-reply',
  'donotreply',
  'donot-reply',
]

/**
 * Check if an email looks like a role account
 * Used during CSV import to optionally suppress role accounts
 */
export function looksLikeRoleAccount(email: string): boolean {
  if (!email || !email.includes('@')) {
    return false
  }

  const local = email.split('@')[0]?.toLowerCase().trim()
  if (!local) {
    return false
  }

  return ROLE_PREFIXES.includes(local)
}

/**
 * Validate email format
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

