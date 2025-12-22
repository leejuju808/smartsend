/**
 * Shared MIME builder utility
 * Builds RFC822-compliant email messages with multipart/alternative content
 */

export function buildMime({
  fromName, fromEmail, to, subject, html, text, headers = {}
}: {
  fromName: string, fromEmail: string, to: string, subject: string,
  html: string, text?: string, headers?: Record<string,string>
}) {
  const boundary = `b_${crypto.randomUUID()}`
  const baseHeaders = {
    From: `${fromName} <${fromEmail}>`,
    To: to,
    Subject: subject,
    'MIME-Version': '1.0',
    'Content-Type': `multipart/alternative; boundary="${boundary}"`,
    ...headers
  }
  const headerStr = Object.entries(baseHeaders).map(([k,v]) => `${k}: ${v}`).join('\r\n')
  const plain = text ?? ''
  const parts = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    qp(plain),
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    qp(html),
    `--${boundary}--`,
    ``
  ].join('\r\n')
  const raw = `${headerStr}\r\n\r\n${parts}`
  return raw
}

/**
 * Quoted-printable encoding
 */
function qp(s: string) {
  return s
    .replace(/[\t ]+$/gm, (m) => m.split('').map(c => '=' + c.charCodeAt(0).toString(16).toUpperCase()).join(''))
    .replace(/[\u0080-\uFFFF]/g, (c) => {
      const enc = new TextEncoder().encode(c)
      return Array.from(enc).map(b => '=' + b.toString(16).toUpperCase().padStart(2,'0')).join('')
    })
}

