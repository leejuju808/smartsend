/**
 * Utility functions for campaign management
 */

/**
 * Split a comma-separated string into an array of trimmed values
 */
export function split(s: string): string[] { 
  return s.split(/[,\s]+/).map(x => x.trim()).filter(Boolean); 
}

/**
 * Convert plain text with newlines to HTML with <br/> tags
 */
export function toHtml(s: string): string { 
  return s.replace(/\n/g, "<br/>"); 
} 