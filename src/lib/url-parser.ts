/**
 * Parse URL utility function for extracting domain, path, and full URL
 * Used in email event processing to extract click tracking data
 */

export interface ParsedUrl {
  url: string | null
  domain: string | null
  path: string | null
}

/**
 * Parse a URL string and extract domain, path, and full URL
 * @param urlString - The URL string to parse
 * @returns ParsedUrl object with url, domain, and path
 */
export function parseUrl(urlString: string | null | undefined): ParsedUrl {
  if (!urlString || typeof urlString !== 'string') {
    return { url: null, domain: null, path: null }
  }

  try {
    // Clean up the URL string
    let cleanUrl = urlString.trim()
    
    // Add protocol if missing
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }

    const url = new URL(cleanUrl)
    
    return {
      url: url.href,
      domain: url.hostname,
      path: url.pathname + url.search + url.hash
    }
  } catch (error) {
    // If URL parsing fails, try to extract basic domain/path info
    try {
      // Remove protocol if present
      let url = urlString.replace(/^https?:\/\//, '')
      
      // Split by first slash to get domain and path
      const [domain, ...pathParts] = url.split('/')
      const path = pathParts.length > 0 ? '/' + pathParts.join('/') : '/'
      
      return {
        url: urlString,
        domain: domain || null,
        path: path || null
      }
    } catch {
      return { url: urlString, domain: null, path: null }
    }
  }
}

/**
 * Extract URL from various provider-specific fields
 * @param event - The event object from email provider
 * @param provider - The provider name (sendgrid, postmark, mailgun, etc.)
 * @returns ParsedUrl object
 */
export function extractUrlFromEvent(event: any, provider: string): ParsedUrl {
  let urlString: string | null = null

  switch (provider) {
    case 'sendgrid':
      urlString = event?.url || event?.["url"] || event?.["sg_url"]
      break
    
    case 'postmark':
      urlString = event?.OriginalLink || event?.Link || event?.Metadata?.link
      break
    
    case 'mailgun':
      urlString = event?.url || event?.message?.headers?.["List-Unsubscribe"]
      break
    
    case 'resend':
      urlString = event?.data?.url || event?.url
      break
    
    case 'ses':
      urlString = event?.click?.link || event?.url
      break
    
    default:
      // Generic fallback
      urlString = event?.url || event?.link || event?.clicked_url
  }

  return parseUrl(urlString)
}