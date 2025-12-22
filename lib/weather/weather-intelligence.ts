/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * Weather API Service for Hourly Risk Scoring
 */

export interface WeatherRiskScore {
  risk_score: number; // 0-100
  risk_category: 'safe' | 'mild_caution' | 'moderate_risk' | 'high_risk' | 'severe_dangerous';
  risk_factors: string[];
  recommendation: 'proceed' | 'caution' | 'reschedule' | 'block';
  precipitation_probability: number;
  wind_speed_mph: number;
  wind_gusts_mph: number;
  lightning_risk: number;
  hail_probability: number;
  temperature_f: number;
  storm_nearby: boolean;
}

export interface WeatherForecastHour {
  datetime: string;
  precipitation_probability: number;
  wind_speed_mph: number;
  wind_gusts_mph: number;
  lightning_risk: number;
  hail_probability: number;
  temperature_f: number;
  storm_nearby: boolean;
}

export interface WeatherLocation {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lon?: number;
}

/**
 * Fetch hourly weather forecast from OpenWeatherMap or WeatherAPI
 */
export async function fetchHourlyWeatherForecast(
  location: WeatherLocation,
  date: Date,
  hours: number = 24
): Promise<WeatherForecastHour[]> {
  const weatherApiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
  
  if (!weatherApiKey) {
    console.warn('No weather API key configured');
    return [];
  }

  try {
    if (process.env.OPENWEATHER_API_KEY) {
      return await fetchOpenWeatherHourly(location, date, hours, process.env.OPENWEATHER_API_KEY);
    } else if (process.env.WEATHER_API_KEY) {
      return await fetchWeatherAPIHourly(location, date, hours, process.env.WEATHER_API_KEY);
    }
  } catch (error) {
    console.error('Weather API fetch failed:', error);
  }

  return [];
}

/**
 * Fetch hourly forecast from OpenWeatherMap
 */
async function fetchOpenWeatherHourly(
  location: WeatherLocation,
  date: Date,
  hours: number,
  apiKey: string
): Promise<WeatherForecastHour[]> {
  // Build query
  let query = '';
  if (location.zip) {
    query = location.zip;
  } else if (location.city && location.state) {
    query = `${location.city},${location.state},US`;
  } else if (location.city) {
    query = location.city;
  } else if (location.lat && location.lon) {
    query = `${location.lat},${location.lon}`;
  } else {
    throw new Error('Location required (zip, city+state, or lat/lon)');
  }

  // Fetch 5-day forecast (3-hour intervals)
  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(query)}&appid=${apiKey}&units=imperial`;
  const response = await fetch(forecastUrl);
  
  if (!response.ok) {
    throw new Error(`OpenWeather API error: ${response.status}`);
  }

  const data = await response.json();
  const forecast: WeatherForecastHour[] = [];
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  // Process forecast data
  if (data.list) {
    for (const item of data.list) {
      const itemDate = new Date(item.dt * 1000);
      const itemDateOnly = new Date(itemDate);
      itemDateOnly.setHours(0, 0, 0, 0);

      // Only include hours for target date
      if (itemDateOnly.getTime() === targetDate.getTime()) {
        forecast.push({
          datetime: itemDate.toISOString(),
          precipitation_probability: item.pop ? item.pop * 100 : 0, // Convert to percentage
          wind_speed_mph: item.wind?.speed || 0,
          wind_gusts_mph: item.wind?.gust || 0,
          lightning_risk: item.weather?.[0]?.main === 'Thunderstorm' ? 70 : 0, // Simple heuristic
          hail_probability: item.weather?.[0]?.description?.toLowerCase().includes('hail') ? 50 : 0,
          temperature_f: item.main?.temp || 0,
          storm_nearby: (item.wind?.speed || 0) > 25 || item.weather?.[0]?.main === 'Thunderstorm',
        });
      }
    }
  }

  return forecast;
}

/**
 * Fetch hourly forecast from WeatherAPI.com
 */
async function fetchWeatherAPIHourly(
  location: WeatherLocation,
  date: Date,
  hours: number,
  apiKey: string
): Promise<WeatherForecastHour[]> {
  // Build query
  let query = '';
  if (location.zip) {
    query = location.zip;
  } else if (location.city && location.state) {
    query = `${location.city},${location.state}`;
  } else if (location.city) {
    query = location.city;
  } else if (location.lat && location.lon) {
    query = `${location.lat},${location.lon}`;
  } else {
    throw new Error('Location required');
  }

  // Fetch forecast (hourly for 24 hours)
  const forecastUrl = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(query)}&days=2&hourly=24`;
  const response = await fetch(forecastUrl);
  
  if (!response.ok) {
    throw new Error(`WeatherAPI error: ${response.status}`);
  }

  const data = await response.json();
  const forecast: WeatherForecastHour[] = [];
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  // Process hourly forecast
  if (data.forecast?.forecastday) {
    for (const day of data.forecast.forecastday) {
      const dayDate = new Date(day.date);
      dayDate.setHours(0, 0, 0, 0);

      if (dayDate.getTime() === targetDate.getTime() && day.hour) {
        for (const hour of day.hour) {
          const hourDate = new Date(hour.time);
          forecast.push({
            datetime: hourDate.toISOString(),
            precipitation_probability: hour.chance_of_rain || 0,
            wind_speed_mph: hour.wind_mph || 0,
            wind_gusts_mph: hour.gust_mph || 0,
            lightning_risk: hour.condition?.text?.toLowerCase().includes('thunder') ? 70 : 0,
            hail_probability: hour.condition?.text?.toLowerCase().includes('hail') ? 50 : 0,
            temperature_f: hour.temp_f || 0,
            storm_nearby: (hour.wind_mph || 0) > 25 || hour.condition?.text?.toLowerCase().includes('thunder'),
          });
        }
      }
    }
  }

  return forecast;
}

/**
 * Calculate weather risk score for a single hour
 * Uses the same logic as the database function
 */
export function calculateWeatherRiskScore(
  precipitation_probability: number,
  wind_speed_mph: number,
  wind_gusts_mph: number,
  lightning_risk: number,
  hail_probability: number,
  temperature_f: number,
  storm_nearby: boolean = false
): WeatherRiskScore {
  let score = 0;
  const factors: string[] = [];

  // Precipitation risk (0-30 points)
  if (precipitation_probability >= 80) {
    score += 30;
    factors.push('heavy_rain');
  } else if (precipitation_probability >= 60) {
    score += 20;
    factors.push('moderate_rain');
  } else if (precipitation_probability >= 40) {
    score += 10;
    factors.push('light_rain');
  }

  // Wind risk (0-25 points)
  if (wind_gusts_mph >= 40 || wind_speed_mph >= 35) {
    score += 25;
    factors.push('severe_wind');
  } else if (wind_gusts_mph >= 30 || wind_speed_mph >= 25) {
    score += 18;
    factors.push('high_wind');
  } else if (wind_gusts_mph >= 20 || wind_speed_mph >= 15) {
    score += 10;
    factors.push('moderate_wind');
  }

  // Lightning risk (0-20 points)
  if (lightning_risk >= 70) {
    score += 20;
    factors.push('lightning');
  } else if (lightning_risk >= 50) {
    score += 12;
    factors.push('moderate_lightning');
  } else if (lightning_risk >= 30) {
    score += 6;
  }

  // Hail risk (0-15 points)
  if (hail_probability >= 60) {
    score += 15;
    factors.push('hail');
  } else if (hail_probability >= 40) {
    score += 10;
    factors.push('moderate_hail');
  } else if (hail_probability >= 20) {
    score += 5;
  }

  // Temperature risk (0-10 points)
  if (temperature_f < 40) {
    score += 10;
    factors.push('cold_temp');
  } else if (temperature_f > 95) {
    score += 8;
    factors.push('hot_temp');
  }

  // Storm nearby bonus (0-10 points)
  if (storm_nearby) {
    score += 10;
    factors.push('storm_nearby');
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine category and recommendation
  let category: WeatherRiskScore['risk_category'];
  let recommendation: WeatherRiskScore['recommendation'];

  if (score >= 80) {
    category = 'severe_dangerous';
    recommendation = 'block';
  } else if (score >= 60) {
    category = 'high_risk';
    recommendation = 'reschedule';
  } else if (score >= 40) {
    category = 'moderate_risk';
    recommendation = 'caution';
  } else if (score >= 20) {
    category = 'mild_caution';
    recommendation = 'proceed';
  } else {
    category = 'safe';
    recommendation = 'proceed';
  }

  return {
    risk_score: score,
    risk_category: category,
    risk_factors: factors,
    recommendation,
    precipitation_probability,
    wind_speed_mph,
    wind_gusts_mph,
    lightning_risk,
    hail_probability,
    temperature_f,
    storm_nearby,
  };
}

/**
 * Get recommended alternative dates (next 7 days with low risk)
 */
export async function getRecommendedAlternativeDates(
  location: WeatherLocation,
  excludeDate: Date,
  days: number = 7
): Promise<Date[]> {
  const alternatives: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i <= days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);

    // Skip excluded date
    if (checkDate.getTime() === excludeDate.getTime()) {
      continue;
    }

    // Fetch forecast for this date
    const forecast = await fetchHourlyWeatherForecast(location, checkDate, 24);
    
    if (forecast.length === 0) {
      continue;
    }

    // Calculate max risk for the day
    let maxRisk = 0;
    for (const hour of forecast) {
      const risk = calculateWeatherRiskScore(
        hour.precipitation_probability,
        hour.wind_speed_mph,
        hour.wind_gusts_mph,
        hour.lightning_risk,
        hour.hail_probability,
        hour.temperature_f,
        hour.storm_nearby
      );
      maxRisk = Math.max(maxRisk, risk.risk_score);
    }

    // If max risk < 40, it's a good alternative
    if (maxRisk < 40) {
      alternatives.push(checkDate);
    }
  }

  return alternatives;
}




































