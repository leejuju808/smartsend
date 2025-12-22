/**
 * Block 255000 — Priority Field Crew Routing
 * Optimizes crew assignments and routes for storm response
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CrewLocation {
  crewId: string;
  crewName: string;
  currentLatitude: number;
  currentLongitude: number;
  available: boolean;
}

export interface InspectionLocation {
  predictionId: string;
  leadId?: string;
  address: string;
  latitude: number;
  longitude: number;
  priority: number; // 1-10, higher = more urgent
  zone: 'red' | 'yellow' | 'green';
  estimatedValue?: number;
}

export interface OptimizedRoute {
  crewId: string;
  crewName: string;
  routeName: string;
  inspections: InspectionLocation[];
  totalHomes: number;
  highRiskHomes: number;
  estimatedDriveTime: number; // minutes
  estimatedInspectionTime: number; // hours
  routePolygon: any; // GeoJSON
  waypoints: Array<{ lat: number; lon: number; address: string }>;
}

/**
 * Generate optimized crew routes for a storm
 */
export async function generateCrewRoutes(
  stormId: string,
  teamId: string,
  crews: CrewLocation[]
): Promise<{ routes: OptimizedRoute[]; errors: number }> {
  // Fetch all high-priority inspections
  const { data: predictions, error: predError } = await supabase
    .from('storm_damage_predictions')
    .select(`
      id,
      property_address,
      property_latitude,
      property_longitude,
      zone,
      probability,
      inspection_scheduled
    `)
    .eq('storm_id', stormId)
    .eq('team_id', teamId)
    .eq('inspection_scheduled', false)
    .order('probability', { ascending: false });

  if (predError || !predictions) {
    console.error('Error fetching damage predictions:', predError);
    return { routes: [], errors: 1 };
  }

  // Convert to inspection locations
  const inspections: InspectionLocation[] = predictions
    .filter(p => p.property_latitude && p.property_longitude)
    .map(p => ({
      predictionId: p.id,
      address: p.property_address || 'Unknown',
      latitude: p.property_latitude!,
      longitude: p.property_longitude!,
      priority: calculatePriority(p.zone, p.probability),
      zone: p.zone as 'red' | 'yellow' | 'green'
    }));

  // Group inspections by geographic area
  const areas = groupByArea(inspections);

  // Assign crews to areas (closest crew to area center)
  const routes: OptimizedRoute[] = [];
  const availableCrews = crews.filter(c => c.available);
  
  if (availableCrews.length === 0) {
    return { routes: [], errors: 0 };
  }

  // Sort areas by priority (red zones first, then by number of high-risk homes)
  const sortedAreas = Object.entries(areas).sort((a, b) => {
    const aRed = a[1].filter(i => i.zone === 'red').length;
    const bRed = b[1].filter(i => i.zone === 'red').length;
    if (aRed !== bRed) return bRed - aRed;
    return b[1].length - a[1].length;
  });

  for (let i = 0; i < sortedAreas.length && i < availableCrews.length; i++) {
    const [areaName, areaInspections] = sortedAreas[i];
    const crew = availableCrews[i % availableCrews.length];

    // Optimize route for this area
    const optimized = optimizeRouteForArea(
      crew,
      areaInspections,
      areaName
    );

    routes.push(optimized);
  }

  // Save routes to database
  let errors = 0;
  for (const route of routes) {
    try {
      await saveCrewRoute(stormId, teamId, route);
    } catch (error) {
      console.error(`Error saving route for ${route.crewName}:`, error);
      errors++;
    }
  }

  return { routes, errors };
}

/**
 * Calculate priority score (1-10)
 */
function calculatePriority(zone: string, probability: number): number {
  const zoneWeight = zone === 'red' ? 10 : zone === 'yellow' ? 6 : 3;
  const probWeight = Math.round(probability * 10);
  return Math.min(10, Math.max(1, Math.round((zoneWeight + probWeight) / 2)));
}

/**
 * Group inspections by geographic area (simplified - uses city/neighborhood)
 */
function groupByArea(inspections: InspectionLocation[]): Record<string, InspectionLocation[]> {
  const areas: Record<string, InspectionLocation[]> = {};

  for (const inspection of inspections) {
    // Extract area name from address (simplified)
    const areaName = extractAreaName(inspection.address);
    
    if (!areas[areaName]) {
      areas[areaName] = [];
    }
    areas[areaName].push(inspection);
  }

  return areas;
}

/**
 * Extract area name from address
 */
function extractAreaName(address: string): string {
  // Try to extract neighborhood/city from address
  const parts = address.split(',');
  if (parts.length >= 2) {
    return parts[parts.length - 2].trim(); // Usually city
  }
  return 'Unknown Area';
}

/**
 * Optimize route for a specific area
 */
function optimizeRouteForArea(
  crew: CrewLocation,
  inspections: InspectionLocation[],
  areaName: string
): OptimizedRoute {
  // Sort by priority (highest first)
  const sorted = [...inspections].sort((a, b) => b.priority - a.priority);

  // Simple nearest-neighbor routing (would use proper TSP solver in production)
  const waypoints: Array<{ lat: number; lon: number; address: string }> = [];
  const route: InspectionLocation[] = [];
  
  let currentLat = crew.currentLatitude;
  let currentLon = crew.currentLongitude;
  const remaining = [...sorted];

  while (remaining.length > 0) {
    // Find nearest unvisited inspection
    let nearestIdx = 0;
    let nearestDist = distance(currentLat, currentLon, remaining[0].latitude, remaining[0].longitude);

    for (let i = 1; i < remaining.length; i++) {
      const dist = distance(currentLat, currentLon, remaining[i].latitude, remaining[i].longitude);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const next = remaining.splice(nearestIdx, 1)[0];
    route.push(next);
    waypoints.push({
      lat: next.latitude,
      lon: next.longitude,
      address: next.address
    });

    currentLat = next.latitude;
    currentLon = next.longitude;
  }

  // Calculate metrics
  const highRiskHomes = route.filter(i => i.zone === 'red').length;
  const totalDriveTime = calculateTotalDriveTime(crew, waypoints);
  const inspectionTime = route.length * 0.5; // 30 min per inspection

  // Generate route polygon (bounding box of all waypoints)
  const routePolygon = generateRoutePolygon(waypoints);

  return {
    crewId: crew.crewId,
    crewName: crew.crewName,
    routeName: areaName,
    inspections: route,
    totalHomes: route.length,
    highRiskHomes,
    estimatedDriveTime: totalDriveTime,
    estimatedInspectionTime: inspectionTime,
    routePolygon,
    waypoints
  };
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate total drive time for route
 */
function calculateTotalDriveTime(
  crew: CrewLocation,
  waypoints: Array<{ lat: number; lon: number }>
): number {
  if (waypoints.length === 0) return 0;

  let totalDistance = 0;
  let currentLat = crew.currentLatitude;
  let currentLon = crew.currentLongitude;

  for (const waypoint of waypoints) {
    totalDistance += distance(currentLat, currentLon, waypoint.lat, waypoint.lon);
    currentLat = waypoint.lat;
    currentLon = waypoint.lon;
  }

  // Assume average speed of 30 mph in urban areas
  return Math.round((totalDistance / 30) * 60); // minutes
}

/**
 * Generate route polygon (bounding box)
 */
function generateRoutePolygon(
  waypoints: Array<{ lat: number; lon: number }>
): any {
  if (waypoints.length === 0) {
    return { type: 'Polygon', coordinates: [[]] };
  }

  const lats = waypoints.map(w => w.lat);
  const lons = waypoints.map(w => w.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Add buffer
  const buffer = 0.01; // ~0.7 miles
  return {
    type: 'Polygon',
    coordinates: [[
      [minLon - buffer, minLat - buffer],
      [maxLon + buffer, minLat - buffer],
      [maxLon + buffer, maxLat + buffer],
      [minLon - buffer, maxLat + buffer],
      [minLon - buffer, minLat - buffer]
    ]]
  };
}

/**
 * Save crew route to database
 */
async function saveCrewRoute(
  stormId: string,
  teamId: string,
  route: OptimizedRoute
): Promise<void> {
  const inspectionIds = route.inspections.map(i => i.predictionId);
  const leadIds = route.inspections
    .map(i => i.leadId)
    .filter((id): id is string => id !== undefined);

  await supabase.from('crew_routes').insert({
    storm_id: stormId,
    team_id: teamId,
    crew_name: route.crewName,
    crew_id: route.crewId,
    route_name: route.routeName,
    route_priority: 1, // Could be calculated based on high-risk homes
    target_area: route.routeName,
    total_homes: route.totalHomes,
    high_risk_homes: route.highRiskHomes,
    medium_risk_homes: route.inspections.filter(i => i.zone === 'yellow').length,
    estimated_drive_time_minutes: route.estimatedDriveTime,
    estimated_inspection_time_hours: route.estimatedInspectionTime,
    assigned_inspection_ids: inspectionIds,
    assigned_lead_ids: leadIds.length > 0 ? leadIds : null,
    route_polygon: route.routePolygon,
    optimized_route: {
      waypoints: route.waypoints,
      total_distance_miles: calculateRouteDistance(route.waypoints)
    },
    status: 'pending'
  });
}

/**
 * Calculate total route distance
 */
function calculateRouteDistance(
  waypoints: Array<{ lat: number; lon: number }>
): number {
  if (waypoints.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += distance(
      waypoints[i - 1].lat,
      waypoints[i - 1].lon,
      waypoints[i].lat,
      waypoints[i].lon
    );
  }
  return Math.round(total * 10) / 10; // Round to 1 decimal
}

/**
 * Get crew routes for a storm
 */
export async function getCrewRoutes(
  stormId: string,
  teamId: string
): Promise<OptimizedRoute[]> {
  const { data: routes, error } = await supabase
    .from('crew_routes')
    .select('*')
    .eq('storm_id', stormId)
    .eq('team_id', teamId)
    .order('route_priority', { ascending: true });

  if (error || !routes) {
    console.error('Error fetching crew routes:', error);
    return [];
  }

  // Transform to OptimizedRoute format
  return routes.map(r => ({
    crewId: r.crew_id || '',
    crewName: r.crew_name,
    routeName: r.route_name,
    inspections: [], // Would fetch from assigned_inspection_ids
    totalHomes: r.total_homes,
    highRiskHomes: r.high_risk_homes,
    estimatedDriveTime: r.estimated_drive_time_minutes,
    estimatedInspectionTime: r.estimated_inspection_time_hours,
    routePolygon: r.route_polygon,
    waypoints: r.optimized_route?.waypoints || []
  }));
}






















