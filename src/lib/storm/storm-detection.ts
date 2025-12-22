/**
 * Block 255000 — Storm Detection Service
 * Automatically detects storms from weather APIs and creates storm_events
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface StormDetectionResult {
  stormDetected: boolean;
  stormType?: 'hail' | 'wind' | 'tornado' | 'heavy_rain' | 'snow' | 'ice';
  severity?: 'light' | 'moderate' | 'severe' | 'extreme';
  hailSize?: number;
  windSpeed?: number;
  rainfall?: number;
  affectedArea?: {
    center: { lat: number; lon: number };
    radius: number; // miles
    zips: string[];
    cities: string[];
    states: string[];
    polygon: any; // GeoJSON polygon
  };
  weatherData?: any;
}

/**
 * Detect storms from weather API data
 */
export async function detectStormFromWeatherData(
  weatherData: any,
  location: { zip?: string; city?: string; state?: string; lat?: number; lon?: number }
): Promise<StormDetectionResult> {
  const result: StormDetectionResult = { stormDetected: false };

  // Check for hail
  const hailSize = extractHailSize(weatherData);
  if (hailSize && hailSize >= 0.75) {
    result.stormDetected = true;
    result.stormType = 'hail';
    result.hailSize = hailSize;
    result.severity = determineSeverity('hail', hailSize);
  }

  // Check for high winds
  const windSpeed = extractWindSpeed(weatherData);
  if (windSpeed && windSpeed >= 50) {
    result.stormDetected = true;
    result.stormType = result.stormType || 'wind';
    result.windSpeed = windSpeed;
    if (!result.severity) {
      result.severity = determineSeverity('wind', windSpeed);
    }
  }

  // Check for heavy rain
  const rainfall = extractRainfall(weatherData);
  if (rainfall && rainfall >= 2.0) {
    result.stormDetected = true;
    result.stormType = result.stormType || 'heavy_rain';
    result.rainfall = rainfall;
    if (!result.severity) {
      result.severity = determineSeverity('rain', rainfall);
    }
  }

  // Check for tornado warnings
  if (hasTornadoWarning(weatherData)) {
    result.stormDetected = true;
    result.stormType = 'tornado';
    result.severity = 'extreme';
  }

  if (result.stormDetected && location.lat && location.lon) {
    // Estimate affected area (simplified - would use actual storm tracking data)
    result.affectedArea = {
      center: { lat: location.lat, lon: location.lon },
      radius: estimateAffectedRadius(result),
      zips: location.zip ? [location.zip] : [],
      cities: location.city ? [location.city] : [],
      states: location.state ? [location.state] : [],
      polygon: generateAffectedPolygon(location.lat, location.lon, estimateAffectedRadius(result))
    };
  }

  result.weatherData = weatherData;
  return result;
}

/**
 * Create a storm event in the database
 */
export async function createStormEvent(
  teamId: string,
  detection: StormDetectionResult
): Promise<{ id: string; error?: any }> {
  if (!detection.stormDetected || !detection.affectedArea) {
    return { id: '', error: 'Invalid storm detection data' };
  }

  const { data, error } = await supabase
    .from('storm_events')
    .insert({
      team_id: teamId,
      storm_type: detection.stormType,
      severity: detection.severity,
      detected_at: new Date().toISOString(),
      detected_by: 'auto',
      geo: {
        type: 'Polygon',
        coordinates: detection.affectedArea.polygon
      },
      max_wind_speed_mph: detection.windSpeed,
      hail_size_inches: detection.hailSize,
      rainfall_inches: detection.rainfall,
      affected_radius_miles: detection.affectedArea.radius,
      affected_zips: detection.affectedArea.zips,
      affected_cities: detection.affectedArea.cities,
      affected_states: detection.affectedArea.states,
      center_latitude: detection.affectedArea.center.lat,
      center_longitude: detection.affectedArea.center.lon,
      weather_api_data: detection.weatherData,
      status: 'active'
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating storm event:', error);
    return { id: '', error };
  }

  return { id: data.id };
}

/**
 * Extract hail size from weather data
 */
function extractHailSize(weatherData: any): number | null {
  // Try various fields where hail size might be stored
  if (weatherData.current?.hail_inches) return weatherData.current.hail_inches;
  if (weatherData.current?.hail_cm) return weatherData.current.hail_cm / 2.54;
  
  // Parse from description
  const desc = JSON.stringify(weatherData).toLowerCase();
  const hailMatch = desc.match(/(\d+\.?\d*)\s*(?:inch|in|")\s*(?:hail|diameter)/i);
  if (hailMatch) return parseFloat(hailMatch[1]);
  
  // Check alerts
  if (weatherData.alerts) {
    for (const alert of weatherData.alerts) {
      const alertDesc = (alert.description || '').toLowerCase();
      const match = alertDesc.match(/(\d+\.?\d*)\s*(?:inch|in|")\s*(?:hail|diameter)/i);
      if (match) return parseFloat(match[1]);
    }
  }
  
  return null;
}

/**
 * Extract wind speed from weather data
 */
function extractWindSpeed(weatherData: any): number | null {
  if (weatherData.current?.wind_mph) return weatherData.current.wind_mph;
  if (weatherData.current?.wind_kph) return weatherData.current.wind_kph * 0.621371;
  if (weatherData.current?.wind_speed) return weatherData.current.wind_speed;
  
  // Check gusts (often higher)
  if (weatherData.current?.gust_mph) return weatherData.current.gust_mph;
  if (weatherData.current?.gust_kph) return weatherData.current.gust_kph * 0.621371;
  
  return null;
}

/**
 * Extract rainfall from weather data
 */
function extractRainfall(weatherData: any): number | null {
  if (weatherData.current?.precip_in) return weatherData.current.precip_in;
  if (weatherData.current?.precip_mm) return weatherData.current.precip_mm / 25.4;
  
  // Check forecast for accumulated rain
  if (weatherData.forecast?.forecastday) {
    let totalRain = 0;
    for (const day of weatherData.forecast.forecastday) {
      if (day.day?.totalprecip_in) totalRain += day.day.totalprecip_in;
      if (day.day?.totalprecip_mm) totalRain += day.day.totalprecip_mm / 25.4;
    }
    if (totalRain > 0) return totalRain;
  }
  
  return null;
}

/**
 * Check for tornado warnings
 */
function hasTornadoWarning(weatherData: any): boolean {
  const desc = JSON.stringify(weatherData).toLowerCase();
  return desc.includes('tornado') || desc.includes('tornadic');
}

/**
 * Determine storm severity based on type and intensity
 */
function determineSeverity(
  type: 'hail' | 'wind' | 'rain' | 'tornado',
  intensity: number
): 'light' | 'moderate' | 'severe' | 'extreme' {
  if (type === 'hail') {
    if (intensity >= 2.0) return 'extreme';
    if (intensity >= 1.5) return 'severe';
    if (intensity >= 1.0) return 'moderate';
    return 'light';
  }
  
  if (type === 'wind') {
    if (intensity >= 75) return 'extreme';
    if (intensity >= 60) return 'severe';
    if (intensity >= 50) return 'moderate';
    return 'light';
  }
  
  if (type === 'rain') {
    if (intensity >= 4.0) return 'extreme';
    if (intensity >= 3.0) return 'severe';
    if (intensity >= 2.0) return 'moderate';
    return 'light';
  }
  
  return 'extreme'; // Tornado is always extreme
}

/**
 * Estimate affected radius based on storm type and severity
 */
function estimateAffectedRadius(detection: StormDetectionResult): number {
  if (detection.stormType === 'hail' && detection.hailSize) {
    // Hail storms typically affect 5-20 mile radius
    if (detection.hailSize >= 2.0) return 20;
    if (detection.hailSize >= 1.5) return 15;
    if (detection.hailSize >= 1.0) return 10;
    return 5;
  }
  
  if (detection.stormType === 'wind' && detection.windSpeed) {
    // Wind storms can be more widespread
    if (detection.windSpeed >= 75) return 30;
    if (detection.windSpeed >= 60) return 20;
    if (detection.windSpeed >= 50) return 15;
    return 10;
  }
  
  if (detection.stormType === 'tornado') {
    // Tornadoes have narrow but long paths
    return 5; // 5 mile radius around path
  }
  
  // Default
  return 10;
}

/**
 * Generate a GeoJSON polygon for affected area (simplified circle)
 */
function generateAffectedPolygon(lat: number, lon: number, radiusMiles: number): number[][][] {
  // Convert miles to degrees (approximate)
  const radiusDegrees = radiusMiles / 69; // 1 degree ≈ 69 miles
  
  // Generate a simple square polygon (would use proper circle in production)
  const points: number[][] = [
    [lon - radiusDegrees, lat - radiusDegrees], // SW
    [lon + radiusDegrees, lat - radiusDegrees], // SE
    [lon + radiusDegrees, lat + radiusDegrees], // NE
    [lon - radiusDegrees, lat + radiusDegrees], // NW
    [lon - radiusDegrees, lat - radiusDegrees]  // Close polygon
  ];
  
  return [points];
}






















