// Block 19400 — SmartSend Roofing Encyclopedia v1
// Helper functions for accessing the roofing encyclopedia

import { createSupabaseServer } from "@/lib/supabaseServer";

export interface EncyclopediaSearchResult {
  id: string;
  term: string;
  category: string;
  definition: string;
  short_description?: string;
  match_type: string;
  match_score: number;
  relatedData?: any;
}

export interface TermMatch {
  term_id: string;
  term: string;
  category: string;
  match_confidence: number;
  source: string;
  encyclopedia?: any;
  fullData?: any;
}

/**
 * Search the roofing encyclopedia
 */
export async function searchEncyclopedia(
  query: string,
  category?: string,
  limit: number = 20
): Promise<EncyclopediaSearchResult[]> {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc("search_roofing_encyclopedia", {
    p_query: query,
    p_category: category || null,
    p_limit: limit,
  });

  if (error) {
    console.error("Error searching encyclopedia:", error);
    return [];
  }

  return (data || []) as EncyclopediaSearchResult[];
}

/**
 * Match a term from input text (fuzzy matching)
 */
export async function matchRoofingTerm(
  text: string,
  category?: string
): Promise<TermMatch[]> {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc("match_roofing_term", {
    p_input_text: text,
    p_category: category || null,
  });

  if (error) {
    console.error("Error matching term:", error);
    return [];
  }

  return (data || []) as TermMatch[];
}

/**
 * Get component information
 */
export async function getComponent(componentName: string) {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("roofing_components")
    .select("*")
    .eq("component_name", componentName)
    .single();

  if (error) {
    console.error("Error getting component:", error);
    return null;
  }

  return data;
}

/**
 * Get material information
 */
export async function getMaterial(materialName: string) {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("roofing_materials")
    .select("*")
    .eq("material_name", materialName)
    .single();

  if (error) {
    console.error("Error getting material:", error);
    return null;
  }

  return data;
}

/**
 * Get damage type information
 */
export async function getDamageType(damageName: string) {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("roofing_damage_types")
    .select("*")
    .eq("damage_name", damageName)
    .single();

  if (error) {
    console.error("Error getting damage type:", error);
    return null;
  }

  return data;
}

/**
 * Get insurance term information
 */
export async function getInsuranceTerm(termName: string) {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("roofing_insurance_terms")
    .select("*")
    .eq("term_name", termName)
    .single();

  if (error) {
    console.error("Error getting insurance term:", error);
    return null;
  }

  return data;
}

/**
 * Get common failures for a component
 */
export async function getComponentFailures(componentId: string) {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("component_failure_mappings")
    .select(
      `
      *,
      damage_type:roofing_damage_types(*)
    `
    )
    .eq("component_id", componentId);

  if (error) {
    console.error("Error getting component failures:", error);
    return [];
  }

  return data || [];
}

/**
 * Get common damage types for a material
 */
export async function getMaterialDamageTypes(materialId: string) {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("material_damage_mappings")
    .select(
      `
      *,
      damage_type:roofing_damage_types(*)
    `
    )
    .eq("material_id", materialId);

  if (error) {
    console.error("Error getting material damage types:", error);
    return [];
  }

  return data || [];
}

/**
 * Get damage → insurance → action mapping
 */
export async function getDamageActionMapping(damageName: string) {
  const damage = await getDamageType(damageName);

  if (!damage) {
    return null;
  }

  return {
    damage,
    insuranceCategory: damage.insurance_claim_category,
    insuranceApprovalProbability: damage.insurance_approval_probability,
    repairCostRange: damage.repair_cost_range,
    replacementCostRange: damage.replacement_cost_range,
    urgencyLevel: damage.urgency_level,
    supplementPotential: damage.supplement_potential,
    codeRequirements: damage.code_requirements,
    recommendedAction: damage.recommended_action,
    nextStepMessaging: damage.next_step_messaging,
  };
}

/**
 * Get material → cost → vulnerability mapping
 */
export async function getMaterialVulnerabilityMapping(materialName: string) {
  const material = await getMaterial(materialName);

  if (!material) {
    return null;
  }

  return {
    material,
    expectedLifespan: material.expected_lifespan_years,
    typicalCost: material.typical_cost_per_sq,
    pitchConstraints: material.pitch_constraints,
    stormVulnerability: material.storm_vulnerability,
    hailResistance: material.hail_resistance,
    windResistance: material.wind_resistance,
    insuranceApprovalLikelihood: material.insurance_approval_likelihood,
    codeRequirements: material.code_requirements,
    inspectPoints: material.inspect_points,
  };
}

/**
 * Get component → common failures mapping
 */
export async function getComponentFailuresMapping(componentName: string) {
  const component = await getComponent(componentName);

  if (!component) {
    return null;
  }

  const failures = await getComponentFailures(component.id);

  return {
    component,
    commonFailures: component.common_failures,
    failureSymptoms: component.failure_symptoms,
    failures,
  };
}





















































