/**
 * DNS Checker Service
 * Checks SPF, DKIM, and DMARC records for a domain
 */

export interface DNSStatus {
  has_spf: boolean;
  has_dkim: boolean;
  has_dmarc: boolean;
  spf_record?: string;
  dkim_record?: string;
  dmarc_record?: string;
  checked_at: string;
  errors?: string[];
}

/**
 * Check DNS records for a domain
 * This is a simplified version - in production, you'd use a DNS resolver library
 * or call an external DNS checking service
 */
export async function checkDNSRecords(domain: string): Promise<DNSStatus> {
  const errors: string[] = [];
  let has_spf = false;
  let has_dkim = false;
  let has_dmarc = false;
  let spf_record: string | undefined;
  let dkim_record: string | undefined;
  let dmarc_record: string | undefined;

  try {
    // In a real implementation, you would:
    // 1. Use a DNS resolver library (like dns.promises.resolveTxt)
    // 2. Or call an external DNS checking API (like MXToolbox, DNS Checker API)
    // 3. Or use your email provider's DNS diagnostics API
    
    // For now, we'll return a placeholder that indicates DNS check needs to be done
    // The actual DNS checking should be implemented server-side using Node.js dns module
    // or an external service
    
    // Example implementation would look like:
    // const dns = require('dns').promises;
    // const txtRecords = await dns.resolveTxt(domain);
    // 
    // for (const record of txtRecords) {
    //   const recordText = record.join('');
    //   if (recordText.startsWith('v=spf1')) {
    //     has_spf = true;
    //     spf_record = recordText;
    //   }
    //   if (recordText.startsWith('v=DKIM1')) {
    //     has_dkim = true;
    //     dkim_record = recordText;
    //   }
    // }
    // 
    // const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    // if (dmarcRecords.length > 0) {
    //   has_dmarc = true;
    //   dmarc_record = dmarcRecords[0].join('');
    // }

    // Placeholder: Return that DNS check needs to be done
    // In production, implement actual DNS lookup here or call external service
    return {
      has_spf: false,
      has_dkim: false,
      has_dmarc: false,
      checked_at: new Date().toISOString(),
      errors: ['DNS check not yet implemented - will be done server-side'],
    };
  } catch (error: any) {
    errors.push(error.message || 'DNS check failed');
    return {
      has_spf,
      has_dkim,
      has_dmarc,
      checked_at: new Date().toISOString(),
      errors,
    };
  }
}

/**
 * Server-side DNS checker using Node.js dns module
 * This should be called from an API route or edge function
 */
export async function checkDNSRecordsServer(domain: string): Promise<DNSStatus> {
  const errors: string[] = [];
  let has_spf = false;
  let has_dkim = false;
  let has_dmarc = false;
  let spf_record: string | undefined;
  let dkim_record: string | undefined;
  let dmarc_record: string | undefined;

  try {
    // Dynamic import for Node.js dns module (only works server-side)
    const dns = await import('dns').then(m => m.promises);
    
    // Check SPF (in TXT records)
    try {
      const txtRecords = await dns.resolveTxt(domain);
      for (const record of txtRecords) {
        const recordText = record.join('');
        if (recordText.toLowerCase().includes('v=spf1')) {
          has_spf = true;
          spf_record = recordText;
          break;
        }
      }
    } catch (err: any) {
      // No TXT records or domain doesn't exist
      if (err.code !== 'ENOTFOUND' && err.code !== 'ENODATA') {
        errors.push(`SPF check error: ${err.message}`);
      }
    }

    // Check DKIM (typically in selector._domainkey.domain)
    // Common selectors: default, google, selector1, etc.
    const dkimSelectors = ['default', 'google', 'selector1', 'selector2', 'dkim'];
    for (const selector of dkimSelectors) {
      try {
        const dkimDomain = `${selector}._domainkey.${domain}`;
        const dkimRecords = await dns.resolveTxt(dkimDomain);
        if (dkimRecords.length > 0) {
          const recordText = dkimRecords[0].join('');
          if (recordText.includes('v=DKIM1')) {
            has_dkim = true;
            dkim_record = recordText;
            break;
          }
        }
      } catch (err: any) {
        // Continue checking other selectors
        continue;
      }
    }

    // Check DMARC (in _dmarc.domain)
    try {
      const dmarcDomain = `_dmarc.${domain}`;
      const dmarcRecords = await dns.resolveTxt(dmarcDomain);
      if (dmarcRecords.length > 0) {
        const recordText = dmarcRecords[0].join('');
        if (recordText.toLowerCase().includes('v=dmarc1')) {
          has_dmarc = true;
          dmarc_record = recordText;
        }
      }
    } catch (err: any) {
      // No DMARC record
      if (err.code !== 'ENOTFOUND' && err.code !== 'ENODATA') {
        errors.push(`DMARC check error: ${err.message}`);
      }
    }

    return {
      has_spf,
      has_dkim,
      has_dmarc,
      spf_record,
      dkim_record,
      dmarc_record,
      checked_at: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error: any) {
    errors.push(error.message || 'DNS check failed');
    return {
      has_spf,
      has_dkim,
      has_dmarc,
      checked_at: new Date().toISOString(),
      errors,
    };
  }
}





























































