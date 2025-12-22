/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Local Targeting Helper Functions
 * 
 * Functions for filtering contacts/leads by ZIP, neighborhood, county, storm path, etc.
 */

import { createClient } from "@/lib/supabase/server";

export interface LocalTargetingConfig {
  targeting_type: "zip" | "neighborhood" | "county" | "storm_path" | "customer_cluster" | "radius";
  zip_codes?: string[];
  neighborhoods?: string[];
  counties?: string[];
  center_latitude?: number;
  center_longitude?: number;
  radius_miles?: number;
  min_completed_jobs?: number;
  cluster_radius_miles?: number;
}

/**
 * Find contacts matching local targeting criteria
 */
export async function findContactsByTargeting(
  workspaceId: string,
  config: LocalTargetingConfig
): Promise<any[]> {
  const supabase = createClient();
  let query = supabase
    .from("contacts")
    .select("id, email, first_name, last_name, postal_code, zip, city, state")
    .eq("workspace_id", workspaceId);

  switch (config.targeting_type) {
    case "zip":
      if (config.zip_codes && config.zip_codes.length > 0) {
        query = query.in("postal_code", config.zip_codes);
      }
      break;

    case "neighborhood":
      if (config.neighborhoods && config.neighborhoods.length > 0) {
        // Check if neighborhood is stored in tags or enrichment
        query = query.contains("tags", config.neighborhoods);
      }
      break;

    case "county":
      // County targeting would require ZIP-to-county mapping or separate county field
      // This is a placeholder - implement based on your schema
      break;

    case "radius":
      if (config.center_latitude && config.center_longitude && config.radius_miles) {
        // Use PostGIS or calculate distance
        // This requires geographic coordinates in contacts table
        // Placeholder for now
      }
      break;

    case "customer_cluster":
      // Find areas with multiple completed jobs
      // This would require joining with jobs table
      break;

    case "storm_path":
      // Filter by storm-affected areas
      // This would require joining with storm_events table
      break;
  }

  const { data: contacts, error } = await query;

  if (error) {
    console.error("Error finding contacts by targeting:", error);
    return [];
  }

  return contacts || [];
}

/**
 * Find leads matching local targeting criteria
 */
export async function findLeadsByTargeting(
  workspaceId: string,
  config: LocalTargetingConfig
): Promise<any[]> {
  const supabase = createClient();
  
  // Get workspace user IDs
  const { data: workspaceMembers } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  if (!workspaceMembers || workspaceMembers.length === 0) {
    return [];
  }

  const userIds = workspaceMembers.map((m) => m.user_id);

  let query = supabase
    .from("leads")
    .select("id, email, first_name, last_name, zip, city, state")
    .in("user_id", userIds);

  switch (config.targeting_type) {
    case "zip":
      if (config.zip_codes && config.zip_codes.length > 0) {
        query = query.in("zip", config.zip_codes);
      }
      break;

    case "neighborhood":
      // Similar to contacts - check tags or enrichment
      break;

    case "storm_path":
      // Filter by storm-affected ZIPs
      if (config.zip_codes && config.zip_codes.length > 0) {
        query = query.in("zip", config.zip_codes);
      }
      break;
  }

  const { data: leads, error } = await query;

  if (error) {
    console.error("Error finding leads by targeting:", error);
    return [];
  }

  return leads || [];
}

/**
 * Find contacts in customer clusters (areas with multiple completed jobs)
 */
export async function findContactsInCustomerClusters(
  workspaceId: string,
  minJobs: number = 3,
  radiusMiles: number = 2
): Promise<any[]> {
  const supabase = createClient();

  // Find ZIPs with multiple completed jobs
  const { data: jobClusters } = await supabase
    .from("roofing_jobs")
    .select("zip, count")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .group("zip")
    .having("count(*) >= ?", minJobs);

  if (!jobClusters || jobClusters.length === 0) {
    return [];
  }

  const zipCodes = jobClusters.map((cluster: any) => cluster.zip).filter(Boolean);

  // Find contacts in those ZIPs
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, email, first_name, last_name, postal_code, zip, city, state")
    .eq("workspace_id", workspaceId)
    .in("postal_code", zipCodes);

  return contacts || [];
}

/**
 * Find contacts affected by storm events
 */
export async function findContactsInStormPath(
  workspaceId: string,
  stormEventId: string
): Promise<any[]> {
  const supabase = createClient();

  // Get storm event details
  const { data: stormEvent } = await supabase
    .from("storm_events")
    .select("affected_zip, affected_city, affected_state, affected_county")
    .eq("id", stormEventId)
    .single();

  if (!stormEvent) {
    return [];
  }

  // Build query based on storm event data
  let query = supabase
    .from("contacts")
    .select("id, email, first_name, last_name, postal_code, zip, city, state")
    .eq("workspace_id", workspaceId);

  if (stormEvent.affected_zip) {
    query = query.eq("postal_code", stormEvent.affected_zip);
  } else if (stormEvent.affected_city && stormEvent.affected_state) {
    query = query
      .eq("city", stormEvent.affected_city)
      .eq("state", stormEvent.affected_state);
  }

  const { data: contacts } = await query;

  return contacts || [];
}

/**
 * Get ZIP codes within radius of a point
 */
export async function getZipsInRadius(
  centerLat: number,
  centerLon: number,
  radiusMiles: number
): Promise<string[]> {
  // This would require PostGIS or a ZIP code database with coordinates
  // For now, return empty array - implement based on your geographic data
  return [];
}




































