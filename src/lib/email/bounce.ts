export type ParsedBounce = {
  isBounce: boolean
  type: "hard" | "soft" | "unknown"
  reason: string
}

const HARD_PATTERNS = [
  /user unknown/i,
  /no such user/i,
  /recipient address rejected/i,
  /mailbox unavailable/i,
  /550[ -].* (5\.1\.1|5\.1\.0|5\.0\.0)/i,
  /domain not found/i,
]

const SOFT_PATTERNS = [
  /mailbox full/i,
  /quota exceeded/i,
  /temporarily deferred/i,
  /try again later/i,
  /4\d\d[ -].*5\.\d\.\d/i,    // 4xx class
  /greylist/i,
]

export function parseBounce(subject?: string | null, snippet?: string | null, fromEmail?: string | null): ParsedBounce {
  const text = `${subject ?? ""}\n${snippet ?? ""}`

  const isMailerDaemon = !!fromEmail?.match(/mailer-daemon|postmaster/i) ||
                         /delivery status notification/i.test(text) ||
                         /undeliverable|delivery failure|returned mail/i.test(text)

  if (!isMailerDaemon) return { isBounce: false, type: "unknown", reason: "" }

  if (HARD_PATTERNS.some(r => r.test(text))) return { isBounce: true, type: "hard", reason: "Hard bounce detected" }
  if (SOFT_PATTERNS.some(r => r.test(text))) return { isBounce: true, type: "soft", reason: "Soft bounce detected" }
  return { isBounce: true, type: "unknown", reason: "Bounce (unclassified)" }
}