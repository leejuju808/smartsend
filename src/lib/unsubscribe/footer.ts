/**
 * Adds unsubscribe footer to email HTML templates
 * 
 * Usage in templates:
 * {{unsubscribe_token}} - Will be replaced with the actual unsubscribe token URL
 * 
 * Or use directly:
 * import { addUnsubscribeFooter } from '@/lib/unsubscribe/footer'
 * const htmlWithFooter = addUnsubscribeFooter(html, unsubscribeToken)
 */
export function addUnsubscribeFooter(html: string, unsubscribeToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const unsubscribeUrl = `${baseUrl}/u/${unsubscribeToken}`
  
  const footer = `
    <!-- smartsend_unsubscribe_footer_v1 -->
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
    <p style="font-size:12px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      Opt out: <a href="${unsubscribeUrl}" style="color:#3b82f6;text-decoration:underline">unsubscribe</a>.
    </p>
  `

  // Try to inject before </body> if exists, else append
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`)
  } else {
    return html + footer
  }
}

type ComplianceFooter = {
  businessName?: string | null
  location?: string | null // city/state or service area
}

/**
 * Compliance-by-default footer:
 * - Business name
 * - City/state (or service area)
 * - Simple opt-out
 */
export function addComplianceFooterHtml(
  html: string,
  unsubscribeUrl: string,
  meta: ComplianceFooter
): string {
  if (!html) return html
  if (html.includes('smartsend_compliance_footer_v1')) return html

  const businessName = String(meta.businessName || '').trim()
  const location = String(meta.location || '').trim()

  const idLine = [businessName, location].filter(Boolean).join(' • ')

  const footer = `
    <!-- smartsend_compliance_footer_v1 -->
    <hr style="margin-top:24px;margin-bottom:12px;border:none;border-top:1px solid #e5e7eb;" />
    <div style="font-size:12px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.4">
      ${idLine ? `<div>${escapeHtml(idLine)}</div>` : ``}
      <div style="margin-top:6px">
        Opt out: <a href="${unsubscribeUrl}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;text-decoration:underline">unsubscribe</a>.
      </div>
    </div>
  `

  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${footer}</body>`)
  return html + footer
}

export function addComplianceFooterText(
  text: string,
  unsubscribeUrl: string,
  meta: ComplianceFooter
): string {
  if (!text) return text
  if (text.includes('smartsend_compliance_footer_v1')) return text

  const businessName = String(meta.businessName || '').trim()
  const location = String(meta.location || '').trim()
  const idLine = [businessName, location].filter(Boolean).join(' • ')

  const lines = [
    '---',
    'smartsend_compliance_footer_v1',
    idLine ? idLine : null,
    `Opt out: ${unsubscribeUrl}`,
  ].filter(Boolean)

  return `${text}\n\n${lines.join('\n')}`
}

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/**
 * Template variable replacement for {{unsubscribe_token}}
 * This should be used when rendering templates before sending
 */
export function replaceUnsubscribeToken(html: string, unsubscribeToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const unsubscribeUrl = `${baseUrl}/u/${unsubscribeToken}`
  
  return html.replace(/\{\{unsubscribe_token\}\}/g, unsubscribeUrl)
}

