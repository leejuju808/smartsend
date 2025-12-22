// Time window utilities for business hours checking

export function isWithinWindow(
  now: Date,
  tz: string,
  start: string,
  end: string
): boolean {
  // Parse start and end times (HH:MM format)
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  // Convert current time to the specified timezone
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  
  const h = localTime.getHours();
  const m = localTime.getMinutes();

  // Check if we're after start time and before end time
  const afterStart = h > sh || (h === sh && m >= sm);
  const beforeEnd = h < eh || (h === eh && m <= em);

  return afterStart && beforeEnd;
}

