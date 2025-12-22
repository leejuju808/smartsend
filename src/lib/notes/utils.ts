/**
 * Utility functions for notes and mentions
 */

/**
 * Extract @mentions from note body
 * Matches @username patterns (alphanumeric, dots, dashes, underscores)
 * Returns array of usernames (without @ symbol)
 */
export function extractMentions(body: string): string[] {
  const regex = /@([\w\.\-\_]+)/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = regex.exec(body))) {
    mentions.push(match[1]);
  }
  
  return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Render mentions in note body as clickable links or styled text
 * Replaces @username with styled span
 */
export function renderMentions(body: string): string {
  return body.replace(/@([\w\.\-\_]+)/g, '<span class="mention">@$1</span>');
}










