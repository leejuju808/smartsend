// lib/templating.ts
// Server-safe merge-tags helper for email templating

type Dict = Record<string, any>;

const re = /\{\{\s*([a-zA-Z0-9_.|]+)\s*\}\}/g;

function get(obj: Dict, path: string): any {
  return path.split(".").reduce((o, k) => (o?.[k] ?? ""), obj) ?? "";
}

export function renderTemplate(tpl: string, data: Dict): string {
  return tpl.replace(re, (_, key) => {
    // Support {{var | fallback}} syntax
    const parts = key.split('|').map(s => s.trim());
    const path = parts[0];
    const fallback = parts[1] || '';
    
    const value = get(data, path);
    return String(value || fallback);
  });
}

// Helper function to validate template syntax
export function validateTemplate(tpl: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const matches = tpl.match(re);
  
  if (matches) {
    matches.forEach(match => {
      const key = match.replace(/\{\{\s*|\s*\}\}/g, '');
      if (!/^[a-zA-Z0-9_.|]+$/.test(key)) {
        errors.push(`Invalid template variable: ${match}`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Helper function to extract all template variables from a template
export function extractTemplateVariables(tpl: string): string[] {
  const matches = tpl.match(re);
  if (!matches) return [];
  
  return matches.map(match => {
    const key = match.replace(/\{\{\s*|\s*\}\}/g, '');
    // Extract just the variable name, not the fallback
    return key.split('|')[0].trim();
  });
}

// Sanitize HTML by removing dangerous scripts and event handlers
export function stripDangerous(html?: string | null): string | null {
  if (!html) return null;

  // Remove script tags
  let sanitized = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\son\w+="[^"]*"/gi, '');
  
  return sanitized;
}