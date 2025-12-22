export function makeRFC822(from: string, to: string, subject: string, body: string) {
  const str = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\n')
  return Buffer.from(str).toString('base64url')
}











