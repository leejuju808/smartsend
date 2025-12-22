/**
 * Timezone utilities for Smart Scheduler v2
 * Converts UTC times to local timezone for send window enforcement
 */

/**
 * Convert a UTC date to a specific timezone and return a Date object representing local time
 * Note: This creates a Date object that represents the local time in the target timezone,
 * but the Date object itself is still in the system's local timezone.
 * For time comparisons, we use the formatted time components.
 */
export function convertToTimezone(date: Date, timezone: string): Date {
  try {
    // Use Intl.DateTimeFormat to get the time components in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find(p => p.type === 'year')!.value);
    const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1; // JS months are 0-indexed
    const day = parseInt(parts.find(p => p.type === 'day')!.value);
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value);
    const minute = parseInt(parts.find(p => p.type === 'minute')!.value);
    const second = parseInt(parts.find(p => p.type === 'second')!.value);

    // Create a Date object with these components (interpreted as local time)
    // This works for our use case since we only need hour/minute for window checks
    return new Date(year, month, day, hour, minute, second);
  } catch (e) {
    // Fallback to UTC if timezone is invalid
    console.warn(`Invalid timezone ${timezone}, using UTC`);
    return date;
  }
}

/**
 * Check if current time is within send window (local time)
 * @param localNow - Current time in lead's timezone
 * @param windowStart - Start time (HH:mm format)
 * @param windowEnd - End time (HH:mm format)
 */
export function isWithinSendWindow(
  localNow: Date,
  windowStart: string,
  windowEnd: string
): boolean {
  try {
    const [startHour, startMin] = windowStart.split(':').map(Number);
    const [endHour, endMin] = windowEnd.split(':').map(Number);

    const nowHour = localNow.getHours();
    const nowMin = localNow.getMinutes();
    const nowTime = nowHour * 60 + nowMin;
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    return nowTime >= startTime && nowTime <= endTime;
  } catch (e) {
    console.error('Error checking send window:', e);
    return true; // Default to allowing send if parsing fails
  }
}

/**
 * Check if current day is a weekend
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if current time is nighttime (outside business hours)
 * Default: before 6 AM or after 10 PM
 */
export function isNighttime(date: Date, startHour = 6, endHour = 22): boolean {
  const hour = date.getHours();
  return hour < startHour || hour >= endHour;
}

