/**
 * Email tracking injection utilities
 * Injects open tracking pixel and rewrites links with tracking tokens
 */

/**
 * Add an open tracking pixel to HTML email
 * This is a simplified version that uses query params - 
 * your existing token-based system in withTracking.ts should be used instead
 * 
 * @deprecated Use the token-based tracking from withTracking.ts
 */
export function addOpenPixel(
  html: string,
  baseUrl: string,
  cid: string,
  lid: string,
  mid?: string
): string {
  const params = new URLSearchParams({
    cid: cid,
    lid: lid,
  });
  if (mid) params.append("mid", mid);

  const src = `${baseUrl}/api/o.gif?${params.toString()}`;
  const pixel = `<img src="${src}" width="1" height="1" alt="" style="display:none;"/>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Rewrite links with tracking tokens
 * Returns the modified HTML and calls register for each link found
 */
export async function rewriteLinks(
  html: string,
  baseUrl: string,
  cid: string,
  lid: string,
  mid?: string,
  register?: (token: string, url: string) => Promise<void>
): Promise<string> {
  // Naive regex for href=; for robust parsing use an HTML parser
  const linkRe = /href=(["'])(https?:\/\/[^"']+)\1/g;
  const matches: Array<{ match: string; quote: string; url: string }> = [];
  let m;
  
  while ((m = linkRe.exec(html)) !== null) {
    const quote = m[1];
    const url = m[2];
    if (/^https?:\/\//i.test(url)) {
      matches.push({ match: m[0], quote, url });
    }
  }
  
  // Process all matches
  const replacements = await Promise.all(
    matches.map(async ({ match, quote, url }) => {
      const token = generateToken();
      if (register) {
        await register(token, url);
      }
      const tracked = `${baseUrl}/r/${token}`;
      return { match, replacement: `href=${quote}${tracked}${quote}` };
    })
  );
  
  // Apply replacements
  let result = html;
  for (const { match, replacement } of replacements) {
    result = result.replace(match, replacement);
  }
  
  return result;
}

/**
 * Generate a short URL-safe token
 */
function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

