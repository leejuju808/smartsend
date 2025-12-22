/**
 * Schedule helpers for email sequences
 * Computes next send time based on wait days, business hours, and weekdays
 */

export type Window = { 
  tz: string; 
  start: string; 
  end: string; 
  weekdays: number[] 
}; // 1=Mon..7=Sun

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number);
  return { h, m };
}

/**
 * Calculate the next send datetime respecting timezone, business hours, and weekdays
 * 
 * @param afterISO - Base datetime to calculate from (ISO string)
 * @param waitDays - Days to wait before the next send
 * @param window - Send window configuration (timezone, hours, weekdays)
 * @returns ISO string of the next send time
 */
export function nextSendAt(afterISO: string, waitDays: number, window: Window): string {
  const base = new Date(afterISO);
  
  // Move to candidate day
  const candidate = new Date(base);
  candidate.setDate(candidate.getDate() + Math.max(0, waitDays));

  // Helper to check if a date is within the send window
  const fmt = new Intl.DateTimeFormat('en-US', { 
    timeZone: window.tz, 
    hour12: false,
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long'
  });
  
  function inWindow(d: Date): boolean {
    const { h: sh, m: sm } = parseHHMM(window.start);
    const { h: eh, m: em } = parseHHMM(window.end);
    
    // Get local time in the specified timezone
    const localStr = d.toLocaleString('en-US', { timeZone: window.tz });
    const local = new Date(localStr);
    
    const wd = ((local.getDay() + 6) % 7) + 1; // Mon=1..Sun=7
    if (!window.weekdays.includes(wd)) return false;
    
    const mins = local.getHours() * 60 + local.getMinutes();
    const sMins = sh * 60 + sm;
    const eMins = eh * 60 + em;
    
    return mins >= sMins && mins <= eMins;
  }

  // Set to window start on candidate day
  const { h: sh, m: sm } = parseHHMM(window.start);
  let local = new Date(candidate.toLocaleString('en-US', { timeZone: window.tz }));
  local.setHours(sh, sm, 0, 0);

  // Find next valid weekday
  let attempts = 0;
  while (!inWindow(local) && attempts < 7) {
    const wd = ((local.getDay() + 6) % 7) + 1;
    if (!window.weekdays.includes(wd)) {
      local.setDate(local.getDate() + 1);
      local.setHours(sh, sm, 0, 0);
    }
    attempts++;
  }

  // Convert local(tz) back to UTC ISO string
  // Note: This is a simplified conversion. For production, consider using a library like date-fns-tz
  const backToUTC = new Date(local.toLocaleString('en-US', { timeZone: 'UTC' }));
  
  return backToUTC.toISOString();
}
