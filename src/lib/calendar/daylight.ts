// Block 18400 — Daylight Hours Calculation Service
// Calculates sunrise/sunset times for a given date and location

export interface DaylightTimes {
  sunrise: Date;
  sunset: Date;
  daylightHours: number;
}

// Simple daylight calculation based on date and approximate latitude
// For production, use a proper sunrise/sunset API or PostGIS
export function calculateDaylightTimes(
  date: Date,
  latitude?: number,
  longitude?: number,
  zipCode?: string
): DaylightTimes {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  // Approximate daylight hours based on month
  // This is a simplified version - should be replaced with actual calculation
  let sunriseHour = 7;
  let sunriseMinute = 0;
  let sunsetHour = 17;
  let sunsetMinute = 0;

  // Adjust based on season (Northern Hemisphere approximation)
  if (month >= 4 && month <= 9) {
    // Spring/Summer: longer days
    sunriseHour = 5;
    sunriseMinute = 30;
    sunsetHour = 20;
    sunsetMinute = 30;
  } else if (month >= 10 || month <= 2) {
    // Fall/Winter: shorter days
    sunriseHour = 7;
    sunriseMinute = 0;
    sunsetHour = 17;
    sunsetMinute = 0;
  } else {
    // March: transition
    sunriseHour = 6;
    sunriseMinute = 30;
    sunsetHour = 18;
    sunsetMinute = 30;
  }

  // Adjust for latitude (simplified)
  if (latitude) {
    // Higher latitude = more variation between seasons
    const latAdjustment = Math.abs(latitude - 40) / 10; // 40°N as baseline
    if (month >= 4 && month <= 9) {
      // Summer: higher latitude = earlier sunrise, later sunset
      sunriseHour -= Math.floor(latAdjustment * 0.5);
      sunsetHour += Math.floor(latAdjustment * 0.5);
    } else {
      // Winter: higher latitude = later sunrise, earlier sunset
      sunriseHour += Math.floor(latAdjustment * 0.5);
      sunsetHour -= Math.floor(latAdjustment * 0.5);
    }
  }

  const sunrise = new Date(date);
  sunrise.setHours(sunriseHour, sunriseMinute, 0, 0);

  const sunset = new Date(date);
  sunset.setHours(sunsetHour, sunsetMinute, 0, 0);

  const daylightHours = (sunset.getTime() - sunrise.getTime()) / (1000 * 60 * 60);

  return {
    sunrise,
    sunset,
    daylightHours: Math.round(daylightHours * 100) / 100,
  };
}

// Check if a time slot is within daylight hours
export function isDaylightSafe(
  startTime: Date,
  endTime: Date,
  daylightTimes: DaylightTimes,
  bufferMinutes: number = 30
): boolean {
  const safeStart = new Date(daylightTimes.sunrise);
  safeStart.setMinutes(safeStart.getMinutes() + bufferMinutes);

  const safeEnd = new Date(daylightTimes.sunset);
  safeEnd.setMinutes(safeEnd.getMinutes() - bufferMinutes);

  return startTime >= safeStart && endTime <= safeEnd;
}

// Get daylight times for a date (with caching)
export async function getDaylightTimes(
  supabase: any,
  date: Date,
  zipCode?: string,
  latitude?: number,
  longitude?: number
): Promise<DaylightTimes> {
  // For now, use simple calculation
  // In production, could cache results or use an API
  return calculateDaylightTimes(date, latitude, longitude, zipCode);
}





















































