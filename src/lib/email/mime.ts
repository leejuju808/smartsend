/**
 * MIME utilities for Gmail API
 * Provides base64url encoding and HTML MIME message building
 */

/**
 * Converts a string to base64url format (RFC 4648 Section 5)
 * Replaces + with -, / with _, and removes padding =
 */
export function base64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Builds an HTML MIME message for Gmail API
 * Returns base64url encoded message ready for Gmail API send
 * 
 * @param fromEmail - Sender email address
 * @param toEmail - Recipient email address
 * @param subject - Email subject
 * @param html - HTML content of the email
 * @returns base64url encoded MIME message
 */
export function buildHtmlMime(
  fromEmail: string,
  toEmail: string,
  subject: string,
  html: string
): string {
  const msg = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html
  ].join('\r\n');

  return base64url(msg);
}

