// Block 18400 — Travel Time Calculation Service
// Uses Google Maps API to calculate travel time between addresses

export interface TravelTimeResult {
  travelTimeMinutes: number;
  distanceMiles: number;
  distanceMeters: number;
  routeSummary?: string;
  trafficCondition?: "light" | "moderate" | "heavy" | "severe";
}

export async function calculateTravelTime(
  fromAddress: string,
  toAddress: string,
  departureTime?: Date
): Promise<TravelTimeResult | null> {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey) {
    console.warn("[Travel Time] Google Maps API key not configured");
    return null;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", fromAddress);
    url.searchParams.set("destinations", toAddress);
    url.searchParams.set("key", googleMapsApiKey);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("mode", "driving");

    // Add departure time if provided (for traffic-aware estimates)
    if (departureTime) {
      url.searchParams.set("departure_time", Math.floor(departureTime.getTime() / 1000).toString());
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status !== "OK" || !data.rows?.[0]?.elements?.[0]) {
      console.error("[Travel Time] Google Maps API error:", data);
      return null;
    }

    const element = data.rows[0].elements[0];

    if (element.status !== "OK") {
      console.error("[Travel Time] Route not found:", element.status);
      return null;
    }

    const travelTimeSeconds = element.duration_in_traffic?.value || element.duration.value;
    const travelTimeMinutes = Math.ceil(travelTimeSeconds / 60);
    const distanceMeters = element.distance.value;
    const distanceMiles = element.distance.value / 1609.34; // Convert meters to miles

    // Determine traffic condition based on duration_in_traffic vs duration
    let trafficCondition: "light" | "moderate" | "heavy" | "severe" | undefined;
    if (element.duration_in_traffic) {
      const trafficMultiplier = element.duration_in_traffic.value / element.duration.value;
      if (trafficMultiplier >= 1.5) {
        trafficCondition = "severe";
      } else if (trafficMultiplier >= 1.3) {
        trafficCondition = "heavy";
      } else if (trafficMultiplier >= 1.1) {
        trafficCondition = "moderate";
      } else {
        trafficCondition = "light";
      }
    }

    return {
      travelTimeMinutes,
      distanceMiles: Math.round(distanceMiles * 100) / 100,
      distanceMeters,
      trafficCondition,
    };
  } catch (error) {
    console.error("[Travel Time] Error calculating travel time:", error);
    return null;
  }
}

// Get travel time from cache or calculate
export async function getTravelTimeWithCache(
  supabase: any,
  workspaceId: string,
  fromAddress: string,
  toAddress: string,
  departureTime?: Date
): Promise<TravelTimeResult | null> {
  // Check cache first
  const { data: cached } = await supabase
    .from("route_estimates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("from_address", fromAddress)
    .eq("to_address", toAddress)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (cached) {
    return {
      travelTimeMinutes: cached.travel_time_minutes,
      distanceMiles: cached.distance_miles,
      distanceMeters: cached.distance_meters,
      trafficCondition: cached.traffic_condition,
      routeSummary: cached.route_summary,
    };
  }

  // Calculate using API
  const result = await calculateTravelTime(fromAddress, toAddress, departureTime);

  if (result) {
    // Cache the result
    await supabase.from("route_estimates").upsert({
      workspace_id: workspaceId,
      from_address: fromAddress,
      to_address: toAddress,
      travel_time_minutes: result.travelTimeMinutes,
      distance_miles: result.distanceMiles,
      distance_meters: result.distanceMeters,
      traffic_condition: result.trafficCondition,
      route_summary: result.routeSummary,
      estimated_at_time: departureTime?.toISOString() || null,
      is_peak_hour: departureTime
        ? departureTime.getHours() >= 7 && departureTime.getHours() <= 9
        : false,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    });
  }

  return result;
}





















































