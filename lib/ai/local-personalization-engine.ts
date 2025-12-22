/**
 * Block 13100 — SmartSend Local Personalization Engine v1
 * 
 * Automatically injects local references into SmartSend emails:
 * - City-based personalization
 * - Neighborhood personalization
 * - Weather personalization (rain, wind, hail, snow, heat)
 * - Seasonal personalization
 * - Recent storm detection
 * - Property-type personalization
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

export interface LocalPersonalizationContext {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  neighborhood?: string | null;
  property_type?: 'single-family' | 'multi-family' | 'commercial' | 'unknown' | null;
}

export interface LocalPersonalizationTokens {
  city: string;
  neighborhood: string;
  local_intro: string; // "Working with a lot of homeowners in {{city}} lately..."
  local_weather: string; // Weather-related phrase
  local_context: string; // Combined local context
  weather_trigger: string; // Specific weather event mention
  seasonal_hint: string; // Seasonal reference
  storm_alert: string; // Storm detection message
}

interface WeatherData {
  events: Array<{
    type: 'rain' | 'wind' | 'hail' | 'snow' | 'heat' | 'freeze';
    date: string;
    intensity: 'light' | 'moderate' | 'heavy' | 'severe';
    description: string;
  }>;
  conditions: {
    current_temp?: number;
    wind_speed?: number;
    precipitation?: number;
  };
  storm_detected: boolean;
  storm_type?: 'hail' | 'wind' | 'rain' | 'snow' | 'hurricane';
  storm_date?: string;
}

/**
 * Get current month for seasonal personalization
 */
function getCurrentMonth(): number {
  return new Date().getMonth() + 1; // 1-12
}

/**
 * Get seasonal hint based on current month
 */
function getSeasonalHint(month: number, city: string): string {
  const cityRef = city ? ` in ${city}` : '';
  
  switch (month) {
    case 12:
    case 1:
    case 2:
      // Winter
      return `With winter freeze season here${cityRef}, a lot of roofs need inspection for ice damage.`;
    case 3:
    case 4:
    case 5:
      // Spring
      return `Now that spring's here${cityRef}, it's a good time to check your roof before summer storms.`;
    case 6:
    case 7:
    case 8:
      // Summer
      return `That summer heat${cityRef ? ` in ${city}` : ''} can really stress roofs — want me to check ventilation?`;
    case 9:
    case 10:
    case 11:
      // Fall
      return `With fall coming in${cityRef}, a lot of people are getting roofs inspected before winter.`;
    default:
      return '';
  }
}

/**
 * Fetch weather data from OpenWeatherMap API
 * Falls back to WeatherAPI if OpenWeatherMap key not available
 */
async function fetchWeatherData(
  city: string,
  state?: string | null,
  zip?: string | null
): Promise<WeatherData> {
  const weatherApiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
  
  if (!weatherApiKey) {
    console.warn('No weather API key configured. Using fallback weather data.');
    return {
      events: [],
      conditions: {},
      storm_detected: false,
    };
  }

  try {
    // Try OpenWeatherMap first (if OPENWEATHER_API_KEY is set)
    if (process.env.OPENWEATHER_API_KEY) {
      return await fetchOpenWeatherData(city, state, zip, process.env.OPENWEATHER_API_KEY);
    }
    
    // Otherwise use WeatherAPI.com
    if (process.env.WEATHER_API_KEY) {
      return await fetchWeatherAPIData(city, state, zip, process.env.WEATHER_API_KEY);
    }
  } catch (error) {
    console.error('Weather API fetch failed:', error);
  }

  return {
    events: [],
    conditions: {},
    storm_detected: false,
  };
}

/**
 * Fetch weather data from OpenWeatherMap
 */
async function fetchOpenWeatherData(
  city: string,
  state: string | null | undefined,
  zip: string | null | undefined,
  apiKey: string
): Promise<WeatherData> {
  // Build query: prefer zip, then city+state, then city
  let query = '';
  if (zip) {
    query = zip;
  } else if (city && state) {
    query = `${city},${state},US`;
  } else if (city) {
    query = city;
  } else {
    throw new Error('City or zip required');
  }

  // Fetch current weather
  const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${apiKey}&units=imperial`;
  const currentRes = await fetch(currentUrl);
  
  if (!currentRes.ok) {
    throw new Error(`OpenWeather API error: ${currentRes.status}`);
  }

  const currentData = await currentRes.json();
  
  // Fetch 5-day forecast for storm detection
  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(query)}&appid=${apiKey}&units=imperial`;
  const forecastRes = await fetch(forecastUrl);
  const forecastData = forecastRes.ok ? await forecastRes.json() : null;

  const events: WeatherData['events'] = [];
  let stormDetected = false;
  let stormType: WeatherData['storm_type'];
  let stormDate: string | undefined;

  // Analyze current conditions
  const windSpeed = currentData.wind?.speed || 0;
  const precipitation = currentData.rain?.['1h'] || currentData.snow?.['1h'] || 0;
  const weatherMain = currentData.weather?.[0]?.main?.toLowerCase() || '';
  const weatherDesc = currentData.weather?.[0]?.description?.toLowerCase() || '';

  // Check for high winds (storm indicator)
  if (windSpeed > 25) {
    events.push({
      type: 'wind',
      date: new Date().toISOString().split('T')[0],
      intensity: windSpeed > 40 ? 'severe' : windSpeed > 30 ? 'heavy' : 'moderate',
      description: `High winds (${Math.round(windSpeed)} mph)`,
    });
    if (windSpeed > 30) {
      stormDetected = true;
      stormType = 'wind';
      stormDate = new Date().toISOString().split('T')[0];
    }
  }

  // Check for precipitation
  if (precipitation > 0.1) {
    const isHail = weatherDesc.includes('hail');
    const isSnow = weatherMain === 'snow' || weatherDesc.includes('snow');
    
    if (isHail) {
      events.push({
        type: 'hail',
        date: new Date().toISOString().split('T')[0],
        intensity: precipitation > 0.5 ? 'heavy' : 'moderate',
        description: 'Hail detected',
      });
      stormDetected = true;
      stormType = 'hail';
      stormDate = new Date().toISOString().split('T')[0];
    } else if (isSnow) {
      events.push({
        type: 'snow',
        date: new Date().toISOString().split('T')[0],
        intensity: precipitation > 0.3 ? 'heavy' : 'moderate',
        description: 'Snow/freezing conditions',
      });
    } else {
      events.push({
        type: 'rain',
        date: new Date().toISOString().split('T')[0],
        intensity: precipitation > 0.5 ? 'heavy' : precipitation > 0.2 ? 'moderate' : 'light',
        description: `Rain (${precipitation.toFixed(2)} in)`,
      });
      if (precipitation > 0.5) {
        stormDetected = true;
        stormType = 'rain';
        stormDate = new Date().toISOString().split('T')[0];
      }
    }
  }

  // Analyze forecast for recent storms (last 7 days)
  if (forecastData?.list) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    forecastData.list.forEach((item: any) => {
      const itemDate = new Date(item.dt * 1000);
      if (itemDate < sevenDaysAgo) return; // Only look at recent data
      
      const itemWind = item.wind?.speed || 0;
      const itemPrecip = item.rain?.['3h'] || item.snow?.['3h'] || 0;
      const itemWeather = item.weather?.[0]?.main?.toLowerCase() || '';
      
      if (itemWind > 30 && !stormDetected) {
        stormDetected = true;
        stormType = 'wind';
        stormDate = itemDate.toISOString().split('T')[0];
      }
      
      if (itemPrecip > 0.5 && itemWeather.includes('hail') && !stormDetected) {
        stormDetected = true;
        stormType = 'hail';
        stormDate = itemDate.toISOString().split('T')[0];
      }
    });
  }

  return {
    events,
    conditions: {
      current_temp: currentData.main?.temp,
      wind_speed: windSpeed,
      precipitation,
    },
    storm_detected: stormDetected,
    storm_type: stormType,
    storm_date: stormDate,
  };
}

/**
 * Fetch weather data from WeatherAPI.com
 */
async function fetchWeatherAPIData(
  city: string,
  state: string | null | undefined,
  zip: string | null | undefined,
  apiKey: string
): Promise<WeatherData> {
  // Build query: prefer zip, then city+state
  let query = '';
  if (zip) {
    query = zip;
  } else if (city && state) {
    query = `${city},${state}`;
  } else if (city) {
    query = city;
  } else {
    throw new Error('City or zip required');
  }

  // Fetch current weather
  const currentUrl = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(query)}`;
  const currentRes = await fetch(currentUrl);
  
  if (!currentRes.ok) {
    throw new Error(`WeatherAPI error: ${currentRes.status}`);
  }

  const currentData = await currentRes.json();
  
  // Fetch forecast for storm detection
  const forecastUrl = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(query)}&days=7`;
  const forecastRes = await fetch(forecastUrl);
  const forecastData = forecastRes.ok ? await forecastRes.json() : null;

  const events: WeatherData['events'] = [];
  let stormDetected = false;
  let stormType: WeatherData['storm_type'];
  let stormDate: string | undefined;

  // Analyze current conditions
  const windSpeed = currentData.current?.wind_mph || 0;
  const precipitation = currentData.current?.precip_in || 0;
  const conditionText = currentData.current?.condition?.text?.toLowerCase() || '';

  // Check for high winds
  if (windSpeed > 25) {
    events.push({
      type: 'wind',
      date: new Date().toISOString().split('T')[0],
      intensity: windSpeed > 40 ? 'severe' : windSpeed > 30 ? 'heavy' : 'moderate',
      description: `High winds (${Math.round(windSpeed)} mph)`,
    });
    if (windSpeed > 30) {
      stormDetected = true;
      stormType = 'wind';
      stormDate = new Date().toISOString().split('T')[0];
    }
  }

  // Check for precipitation and storms
  if (precipitation > 0.1) {
    const isHail = conditionText.includes('hail');
    const isSnow = conditionText.includes('snow') || conditionText.includes('ice');
    
    if (isHail) {
      events.push({
        type: 'hail',
        date: new Date().toISOString().split('T')[0],
        intensity: precipitation > 0.5 ? 'heavy' : 'moderate',
        description: 'Hail detected',
      });
      stormDetected = true;
      stormType = 'hail';
      stormDate = new Date().toISOString().split('T')[0];
    } else if (isSnow) {
      events.push({
        type: 'snow',
        date: new Date().toISOString().split('T')[0],
        intensity: precipitation > 0.3 ? 'heavy' : 'moderate',
        description: 'Snow/freezing conditions',
      });
    } else {
      events.push({
        type: 'rain',
        date: new Date().toISOString().split('T')[0],
        intensity: precipitation > 0.5 ? 'heavy' : precipitation > 0.2 ? 'moderate' : 'light',
        description: `Rain (${precipitation.toFixed(2)} in)`,
      });
      if (precipitation > 0.5) {
        stormDetected = true;
        stormType = 'rain';
        stormDate = new Date().toISOString().split('T')[0];
      }
    }
  }

  // Analyze forecast for recent storms
  if (forecastData?.forecast?.forecastday) {
    forecastData.forecast.forecastday.forEach((day: any) => {
      const dayDate = day.date;
      const dayWind = day.day?.maxwind_mph || 0;
      const dayPrecip = day.day?.totalprecip_in || 0;
      const dayCondition = day.day?.condition?.text?.toLowerCase() || '';
      
      if (dayWind > 30 && !stormDetected) {
        stormDetected = true;
        stormType = 'wind';
        stormDate = dayDate;
      }
      
      if (dayPrecip > 0.5 && (dayCondition.includes('hail') || dayCondition.includes('storm')) && !stormDetected) {
        stormDetected = true;
        stormType = dayCondition.includes('hail') ? 'hail' : 'rain';
        stormDate = dayDate;
      }
    });
  }

  return {
    events,
    conditions: {
      current_temp: currentData.current?.temp_f,
      wind_speed: windSpeed,
      precipitation,
    },
    storm_detected: stormDetected,
    storm_type: stormType,
    storm_date: stormDate,
  };
}

/**
 * Get or fetch local context from database
 */
async function getLocalContext(
  city: string,
  state?: string | null,
  zip?: string | null
): Promise<WeatherData> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Try to get cached context from database
  const { data: cached, error } = await supabaseAdmin
    .rpc('get_local_context', {
      p_city: city,
      p_state: state || null,
      p_zip: zip || null,
    });

  if (error) {
    console.error('Error fetching local context:', error);
  }

  // If cached and not expired, use it
  if (cached && cached.expires_at && new Date(cached.expires_at) > new Date()) {
    return {
      events: cached.last_weather?.events || [],
      conditions: cached.last_weather?.conditions || {},
      storm_detected: cached.storm_flag || false,
      storm_type: cached.storm_type || undefined,
      storm_date: cached.storm_date || undefined,
    };
  }

  // Otherwise, fetch fresh weather data
  const weatherData = await fetchWeatherData(city, state, zip);

  // Cache it in the database
  await supabaseAdmin.rpc('update_local_context_weather', {
    p_city: city,
    p_state: state || null,
    p_zip: zip || null,
    p_weather_data: {
      events: weatherData.events,
      conditions: weatherData.conditions,
    },
    p_storm_flag: weatherData.storm_detected,
    p_storm_type: weatherData.storm_type || null,
    p_storm_date: weatherData.storm_date || null,
  });

  return weatherData;
}

/**
 * Generate weather trigger phrase based on weather events
 */
function generateWeatherTrigger(weatherData: WeatherData, city: string): string {
  if (!weatherData.events || weatherData.events.length === 0) {
    return '';
  }

  const cityRef = city ? ` in ${city}` : '';
  
  // Prioritize storms
  const hailEvent = weatherData.events.find(e => e.type === 'hail');
  if (hailEvent) {
    return `There was hail${cityRef} recently — want me to check for bruised shingles?`;
  }

  const windEvent = weatherData.events.find(e => e.type === 'wind' && e.intensity !== 'light');
  if (windEvent) {
    return `Noticed the windstorms${cityRef} last week — want me to take a look at your roof?`;
  }

  const rainEvent = weatherData.events.find(e => e.type === 'rain' && e.intensity !== 'light');
  if (rainEvent) {
    return `Quick check — any leaks with this rain${cityRef}?`;
  }

  const snowEvent = weatherData.events.find(e => e.type === 'snow');
  if (snowEvent) {
    return `With the freeze${cityRef}, want me to check for ice damage?`;
  }

  return '';
}

/**
 * Generate storm alert message
 */
function generateStormAlert(weatherData: WeatherData, city: string): string {
  if (!weatherData.storm_detected || !weatherData.storm_type) {
    return '';
  }

  const cityRef = city ? ` in ${city}` : '';
  
  switch (weatherData.storm_type) {
    case 'hail':
      return `Heavy hail passed through${cityRef} — do you want a quick inspection to check for damage?`;
    case 'wind':
      return `Those wind gusts${cityRef} can cause shingle damage — want me to take a look?`;
    case 'rain':
      return `Heavy rain${cityRef} can reveal roof issues — noticed any leaks?`;
    case 'snow':
      return `The freeze${cityRef} can cause ice dams — want me to check your roof?`;
    default:
      return '';
  }
}

/**
 * Generate local intro phrase
 */
function generateLocalIntro(city: string, neighborhood?: string | null): string {
  if (neighborhood) {
    return `We're doing a few roofs in ${neighborhood} this week —`;
  }
  if (city) {
    return `Working with a lot of homeowners in ${city} lately —`;
  }
  return '';
}

/**
 * Main function: Generate local personalization tokens
 */
export async function generateLocalPersonalizationTokens(
  context: LocalPersonalizationContext
): Promise<LocalPersonalizationTokens> {
  const { city, state, zip, neighborhood, property_type } = context;

  if (!city) {
    // Return empty tokens if no city
    return {
      city: '',
      neighborhood: '',
      local_intro: '',
      local_weather: '',
      local_context: '',
      weather_trigger: '',
      seasonal_hint: '',
      storm_alert: '',
    };
  }

  // Get weather data (from cache or API)
  const weatherData = await getLocalContext(city, state, zip);

  // Generate tokens
  const cityToken = city || '';
  const neighborhoodToken = neighborhood || '';
  const localIntro = generateLocalIntro(city, neighborhood);
  const weatherTrigger = generateWeatherTrigger(weatherData, city);
  const stormAlert = generateStormAlert(weatherData, city);
  const seasonalHint = getSeasonalHint(getCurrentMonth(), city);

  // Combine local context (prioritize storm > weather > seasonal)
  let localContext = '';
  if (stormAlert) {
    localContext = stormAlert;
  } else if (weatherTrigger) {
    localContext = weatherTrigger;
  } else if (seasonalHint) {
    localContext = seasonalHint;
  } else if (localIntro) {
    localContext = localIntro;
  }

  // Generate weather phrase (general weather reference)
  let localWeather = '';
  if (weatherData.events && weatherData.events.length > 0) {
    const recentEvent = weatherData.events[weatherData.events.length - 1];
    if (recentEvent.type === 'wind' && recentEvent.intensity !== 'light') {
      localWeather = `With those wind gusts recently, anyone on your block have missing shingles?`;
    } else if (recentEvent.type === 'rain' && recentEvent.intensity !== 'light') {
      localWeather = `Quick check — any leaks with this rain?`;
    } else if (recentEvent.type === 'hail') {
      localWeather = `There was hail in your area. Want me to check for bruised shingles?`;
    }
  }

  return {
    city: cityToken,
    neighborhood: neighborhoodToken,
    local_intro: localIntro,
    local_weather: localWeather,
    local_context: localContext,
    weather_trigger: weatherTrigger,
    seasonal_hint: seasonalHint,
    storm_alert: stormAlert,
  };
}





















































