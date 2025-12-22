export type Attachment = {
  filename: string;
  content: Buffer | Uint8Array;
  contentType: string;
  contentId?: string;
  isInline?: boolean;
};

// Build RFC 2046 multipart/alternative email and return base64url raw (for Gmail)
export function buildMultipartAlternative(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string | null | undefined>;
  attachments?: Attachment[];
}): string {
  const { from, to, subject, text, html, headers, attachments } = params;
  const hasAttachments = attachments && attachments.length > 0;
  
  let rootBoundary = '----=_Part_' + Math.random().toString(36).slice(2);
  let altBoundary = hasAttachments ? '----=_Part_' + Math.random().toString(36).slice(2) : rootBoundary;

  // Standard headers
  const lines: string[] = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');

  // Optional threading headers
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }

  // Set root content type based on whether we have attachments
  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${rootBoundary}"`);
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  }
  lines.push('');

  // If we have attachments, wrap in multipart/mixed
  if (hasAttachments) {
    lines.push(`--${rootBoundary}`);
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push('');
  }

  // text part
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: quoted-printable');
  lines.push('');
  lines.push(encodeQuotedPrintable(text || ''));
  lines.push('');

  // html part
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: quoted-printable');
  lines.push('');
  lines.push(encodeQuotedPrintable(html || ''));
  lines.push('');

  // closing alternative boundary
  lines.push(`--${altBoundary}--`);

  // Add attachments if present
  if (hasAttachments) {
    lines.push(''); // Empty line before attachments
    for (const att of attachments) {
      lines.push(`--${rootBoundary}`);
      lines.push(`Content-Type: ${att.contentType}`);
      lines.push('Content-Transfer-Encoding: base64');
      if (att.contentId) {
        lines.push(`Content-ID: <${att.contentId}>`);
      }
      if (att.isInline) {
        lines.push('Content-Disposition: inline');
      } else {
        lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      }
      lines.push('');
      
      // Base64 encode attachment content
      const content = Buffer.isBuffer(att.content) 
        ? att.content.toString('base64')
        : Buffer.from(att.content).toString('base64');
      
      // Split into 76-character lines as per RFC
      for (let i = 0; i < content.length; i += 76) {
        lines.push(content.slice(i, i + 76));
      }
      lines.push('');
    }
    
    // closing root boundary
    lines.push(`--${rootBoundary}--`);
  }

  const raw = lines.join('\r\n');
  const b64 = Buffer.from(raw).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeQuotedPrintable(input: string): string {
  // Minimal QP: escape = and non-ASCII; wrap long lines softly
  const utf8 = Buffer.from(input, 'utf8');
  let out = '';
  let lineLen = 0;
  for (const byte of utf8) {
    const ch = String.fromCharCode(byte);
    const safe = byte === 0x09 || byte === 0x20 || (byte >= 33 && byte <= 126 && byte !== 61); // 61 '='
    const token = safe ? ch : '=' + byte.toString(16).toUpperCase().padStart(2, '0');
    // Soft wrap at 76 chars as per RFC 2045
    if (lineLen + token.length > 73) { // account for =CRLF
      out += '='+"\r\n";
      lineLen = 0;
    }
    out += token;
    lineLen += token.length;
  }
  return out;
}
