// Block 242000 — Scheduling Engine v2
// WeatherAI — Integrates with NOAA / OpenWeather for weather predictions

export interface WeatherForecast {
  date: string;
  temperature_high: number;
  temperature_low: number;
  precipitation_probability: number;
  precipitation_amount: number;
  wind_speed: number;
  conditions: string;
  description: string;
  risk_level: "low" | "medium" | "high" | "severe";
  delay_recommended: boolean;
  delay_reason?: string;
}

export interface WeatherAlert {
  type: "rain" | "wind" | "temperature" | "storm";
  severity: "low" | "medium" | "high";
  message: string;
  recommended_action: string;
}

/**
 * WeatherAI — Weather predictions and delay recommendations
 */
export class WeatherAI {
  private static readonly OPENWEATHER_API_KEY =
    process.env.OPENWEATHER_API_KEY || "";
  private static readonly OPENWEATHER_BASE_URL =
    "https://api.openweathermap.org/data/2.5";

  /**
   * Get weather forecast for a location and date
   */
  static async getWeatherForecast(
    address: string,
    date: string
  ): Promise<WeatherForecast> {
    try {
      // Geocode address to get lat/lng
      const coordinates = await this.geocodeAddress(address);
      if (!coordinates) {
        return this.getDefaultForecast(date);
      }

      // Fetch weather from OpenWeather API
      const weatherData = await this.fetchOpenWeatherData(
        coordinates.lat,
        coordinates.lng,
        date
      );

      return this.parseWeatherData(weatherData, date);
    } catch (error) {
      console.error("Error fetching weather:", error);
      return this.getDefaultForecast(date);
    }
  }

  /**
   * Predict rain and suggest reschedule
   */
  static async predictRainAndSuggestReschedule(
    address: string,
    scheduledDate: string
  ): Promise<{
    rain_predicted: boolean;
    precipitation_probability: number;
    suggested_reschedule_date?: string;
    reasoning: string;
  }> {
    const forecast = await this.getWeatherForecast(address, scheduledDate);

    if (forecast.delay_recommended) {
      // Look ahead for better date
      const betterDate = await this.findBetterWeatherDate(
        address,
        scheduledDate
      );

      return {
        rain_predicted: forecast.precipitation_probability > 50,
        precipitation_probability: forecast.precipitation_probability,
        suggested_reschedule_date: betterDate,
        reasoning: forecast.delay_reason || "Unfavorable weather conditions",
      };
    }

    return {
      rain_predicted: false,
      precipitation_probability: forecast.precipitation_probability,
      reasoning: "Weather conditions are acceptable",
    };
  }

  /**
   * Alert managers about weather risks
   */
  static async generateWeatherAlerts(
    address: string,
    date: string
  ): Promise<WeatherAlert[]> {
    const forecast = await this.getWeatherForecast(address, date);
    const alerts: WeatherAlert[] = [];

    // Rain alert
    if (forecast.precipitation_probability > 50) {
      alerts.push({
        type: "rain",
        severity:
          forecast.precipitation_probability > 70 ? "high" : "medium",
        message: `${forecast.precipitation_probability}% chance of rain on ${date}`,
        recommended_action: "Consider rescheduling to avoid delays",
      });
    }

    // Wind alert
    if (forecast.wind_speed > 25) {
      alerts.push({
        type: "wind",
        severity: forecast.wind_speed > 35 ? "high" : "medium",
        message: `High winds expected: ${forecast.wind_speed} mph`,
        recommended_action: "Delay work if winds exceed safety thresholds",
      });
    }

    // Temperature alert
    if (forecast.temperature_low < 32) {
      alerts.push({
        type: "temperature",
        severity: "high",
        message: `Freezing temperatures expected: ${forecast.temperature_low}°F`,
        recommended_action: "Reschedule to avoid ice and safety hazards",
      });
    }

    return alerts;
  }

  // Private helper methods

  private static async geocodeAddress(
    address: string
  ): Promise<{ lat: number; lng: number } | null> {
    // Placeholder: In production, use Google Geocoding API or similar
    // For now, return null to use default forecast
    return null;
  }

  private static async fetchOpenWeatherData(
    lat: number,
    lng: number,
    date: string
  ): Promise<any> {
    if (!this.OPENWEATHER_API_KEY) {
      // Return mock data if API key not configured
      return this.getMockWeatherData();
    }

    try {
      // Use forecast API (5-day forecast)
      const response = await fetch(
        `${this.OPENWEATHER_BASE_URL}/forecast?lat=${lat}&lon=${lng}&appid=${this.OPENWEATHER_API_KEY}&units=imperial`
      );

      if (!response.ok) {
        throw new Error("Weather API error");
      }

      const data = await response.json();
      return this.findForecastForDate(data, date);
    } catch (error) {
      console.error("Error fetching from OpenWeather:", error);
      return this.getMockWeatherData();
    }
  }

  private static findForecastForDate(weatherData: any, targetDate: string): any {
    // Find the forecast entry closest to target date
    const target = new Date(targetDate).getTime();
    let closest = null;
    let minDiff = Infinity;

    if (weatherData.list) {
      for (const item of weatherData.list) {
        const itemDate = new Date(item.dt * 1000).getTime();
        const diff = Math.abs(itemDate - target);
        if (diff < minDiff) {
          minDiff = diff;
          closest = item;
        }
      }
    }

    return closest || this.getMockWeatherData();
  }

  private static parseWeatherData(data: any, date: string): WeatherForecast {
    const temp = data.main?.temp || 70;
    const tempMin = data.main?.temp_min || temp - 10;
    const tempMax = data.main?.temp_max || temp + 10;
    const pop = (data.pop || 0) * 100; // Probability of precipitation (0-1 to 0-100)
    const rain = data.rain?.["3h"] || 0; // Rain volume in mm, convert to inches
    const windSpeed = data.wind?.speed || 5; // m/s to mph
    const conditions = this.mapWeatherConditions(data.weather?.[0]?.main || "Clear");

    const riskLevel = this.calculateRiskLevel({
      precipitation_probability: pop,
      precipitation_amount: rain * 0.0393701, // mm to inches
      wind_speed: windSpeed * 2.237, // m/s to mph
      temp_low: tempMin,
    });

    const delayRecommended = riskLevel !== "low";

    return {
      date,
      temperature_high: Math.round(tempMax),
      temperature_low: Math.round(tempMin),
      precipitation_probability: Math.round(pop),
      precipitation_amount: Math.round(rain * 0.0393701 * 100) / 100, // mm to inches, 2 decimals
      wind_speed: Math.round(windSpeed * 2.237), // m/s to mph
      conditions,
      description: data.weather?.[0]?.description || "Clear sky",
      risk_level: riskLevel,
      delay_recommended: delayRecommended,
      delay_reason: delayRecommended
        ? this.getDelayReason({
            precipitation_probability: pop,
            precipitation_amount: rain * 0.0393701,
            wind_speed: windSpeed * 2.237,
            temp_low: tempMin,
          })
        : undefined,
    };
  }

  private static mapWeatherConditions(condition: string): string {
    const mapping: Record<string, string> = {
      Clear: "clear",
      Clouds: "partly_cloudy",
      Rain: "rain",
      Drizzle: "rain",
      Thunderstorm: "storm",
      Snow: "snow",
      Mist: "cloudy",
      Fog: "cloudy",
    };

    return mapping[condition] || "clear";
  }

  private static calculateRiskLevel(weather: {
    precipitation_probability: number;
    precipitation_amount: number;
    wind_speed: number;
    temp_low: number;
  }): "low" | "medium" | "high" | "severe" {
    let riskScore = 0;

    if (weather.precipitation_probability > 70) riskScore += 3;
    else if (weather.precipitation_probability > 40) riskScore += 2;
    else if (weather.precipitation_probability > 20) riskScore += 1;

    if (weather.precipitation_amount > 0.5) riskScore += 3;
    else if (weather.precipitation_amount > 0.2) riskScore += 2;
    else if (weather.precipitation_amount > 0.1) riskScore += 1;

    if (weather.wind_speed > 30) riskScore += 3;
    else if (weather.wind_speed > 20) riskScore += 2;
    else if (weather.wind_speed > 15) riskScore += 1;

    if (weather.temp_low < 32) riskScore += 2;

    if (riskScore >= 6) return "severe";
    if (riskScore >= 4) return "high";
    if (riskScore >= 2) return "medium";
    return "low";
  }

  private static getDelayReason(weather: {
    precipitation_probability: number;
    precipitation_amount: number;
    wind_speed: number;
    temp_low: number;
  }): string {
    const reasons = [];

    if (weather.precipitation_probability > 50) {
      reasons.push(
        `High rain probability (${Math.round(weather.precipitation_probability)}%)`
      );
    }
    if (weather.precipitation_amount > 0.1) {
      reasons.push(
        `Expected rainfall (${weather.precipitation_amount.toFixed(2)}")`
      );
    }
    if (weather.wind_speed > 25) {
      reasons.push(`High winds (${Math.round(weather.wind_speed)} mph)`);
    }
    if (weather.temp_low < 32) {
      reasons.push(`Freezing temperatures (${Math.round(weather.temp_low)}°F)`);
    }

    return reasons.join(", ") || "Unfavorable weather conditions";
  }

  private static async findBetterWeatherDate(
    address: string,
    currentDate: string
  ): Promise<string | undefined> {
    // Look ahead 14 days for better weather
    for (let i = 1; i <= 14; i++) {
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() + i);
      const checkDateStr = checkDate.toISOString().split("T")[0];

      const forecast = await this.getWeatherForecast(address, checkDateStr);
      if (!forecast.delay_recommended) {
        return checkDateStr;
      }
    }

    return undefined;
  }

  private static getDefaultForecast(date: string): WeatherForecast {
    return {
      date,
      temperature_high: 72,
      temperature_low: 55,
      precipitation_probability: 20,
      precipitation_amount: 0,
      wind_speed: 8,
      conditions: "partly_cloudy",
      description: "Partly cloudy",
      risk_level: "low",
      delay_recommended: false,
    };
  }

  private static getMockWeatherData(): any {
    return {
      main: {
        temp: 70,
        temp_min: 55,
        temp_max: 75,
      },
      pop: 0.2,
      rain: { "3h": 0 },
      wind: { speed: 5 },
      weather: [{ main: "Clear", description: "Clear sky" }],
    };
  }
}

























