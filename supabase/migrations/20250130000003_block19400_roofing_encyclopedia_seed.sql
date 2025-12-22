-- =========================================================
-- Block 19400 — SmartSend Roofing Encyclopedia v1
-- SEED DATA: Comprehensive Roofing Terminology
-- =========================================================

-- ============================================================================
-- 1. COMPONENTS DATA
-- ============================================================================

-- Ridge Cap
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Ridge Cap',
  'ridge_cap',
  'The covering installed along the peak of a roof where two roof slopes meet. Typically made of shingles, metal, or tile cut to fit the ridge.',
  'Protects the ridge from water intrusion and provides a finished appearance. Allows for ventilation in vented ridge systems.',
  'Located at the highest point of the roof, running along the peak where roof slopes converge.',
  '["wind_uplift", "cracking", "thermal_splitting", "granule_loss", "loose_nails"]'::jsonb,
  '["Missing shingles", "Cracked or split shingles", "Lifted edges", "Nail pops", "Granule loss"]'::jsonb,
  '["Check for lifted edges", "Inspect for cracks", "Look for missing shingles", "Check nail integrity"]'::jsonb,
  '["From ground looking up at ridge", "Close-up of damaged areas", "Along entire ridge line"]'::jsonb,
  '{"min": 300, "max": 800}'::jsonb,
  '{"min": 800, "max": 2000}'::jsonb,
  'medium',
  '["asphalt_shingle", "metal", "tile", "slate"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Valleys
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Valley',
  'valley',
  'The internal angle formed by two intersecting roof slopes. The most critical area for water management on a roof.',
  'Channels water from two roof slopes into a single drainage path. Must be properly sealed to prevent leaks.',
  'Located where two roof sections meet at an internal angle, creating a V-shaped channel.',
  '["granule_displacement", "water_channeling_failure", "flashing_tear", "debris_accumulation", "shingle_damage"]'::jsonb,
  '["Missing granules", "Exposed underlayment", "Water stains", "Debris buildup", "Damaged shingles"]'::jsonb,
  '["Check for proper shingle installation", "Inspect flashing integrity", "Look for granule loss", "Check for debris"]'::jsonb,
  '["Down the valley line", "Close-up of valley intersection", "From above looking down"]'::jsonb,
  '{"min": 500, "max": 1500}'::jsonb,
  '{"min": 1500, "max": 4000}'::jsonb,
  'high',
  '["asphalt_shingle", "metal", "tile"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Drip Edge
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Drip Edge',
  'drip_edge',
  'Metal flashing installed along the edges of the roof to direct water away from the fascia and into the gutters.',
  'Prevents water from running behind the fascia board and protects the roof deck edge from water damage.',
  'Installed along the eaves (lower edge) and rakes (side edges) of the roof.',
  '["separation", "rust", "improper_installation", "missing_sections"]'::jsonb,
  '["Gaps between sections", "Rust spots", "Water stains on fascia", "Missing sections"]'::jsonb,
  '["Check for gaps", "Inspect for rust", "Verify proper overlap", "Check installation"]'::jsonb,
  '["Close-up of edge", "Along entire eave line", "Corner details"]'::jsonb,
  '{"min": 200, "max": 600}'::jsonb,
  '{"min": 600, "max": 1500}'::jsonb,
  'medium',
  '["asphalt_shingle", "metal", "tile", "all_materials"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Flashing
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Flashing',
  'flashing',
  'Metal or rubber material used to seal joints and prevent water intrusion around roof penetrations and transitions.',
  'Creates a watertight seal around chimneys, vents, skylights, walls, and other roof penetrations.',
  'Installed around chimneys, vents, skylights, walls, valleys, and roof-to-wall intersections.',
  '["corrosion", "separation", "improper_installation", "cracking", "lifting"]'::jsonb,
  '["Rust or corrosion", "Gaps or separation", "Lifted edges", "Cracks", "Water stains"]'::jsonb,
  '["Check all flashing joints", "Inspect for corrosion", "Verify proper overlap", "Look for gaps"]'::jsonb,
  '["Close-up of flashing", "Around penetrations", "Wall intersections"]'::jsonb,
  '{"min": 150, "max": 500}'::jsonb,
  '{"min": 500, "max": 1200}'::jsonb,
  'high',
  '["all_materials"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Pipe Boot
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Pipe Boot',
  'pipe_boot',
  'Rubber or metal boot that seals around plumbing vents and other pipes penetrating the roof.',
  'Prevents water from entering around pipe penetrations. Critical for preventing interior leaks.',
  'Located wherever pipes or vents penetrate through the roof deck.',
  '["cracking", "deterioration", "seal_failure", "improper_fit"]'::jsonb,
  '["Cracks in rubber", "Brittle or deteriorated material", "Water stains around pipe", "Loose fit"]'::jsonb,
  '["Check for cracks", "Inspect seal integrity", "Verify proper fit", "Look for water stains"]'::jsonb,
  '["Close-up of boot", "From multiple angles", "Check seal area"]'::jsonb,
  '{"min": 100, "max": 300}'::jsonb,
  '{"min": 200, "max": 500}'::jsonb,
  'high',
  '["all_materials"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Skylight
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Skylight',
  'skylight',
  'Window installed in the roof to provide natural light. Requires specialized flashing and sealing.',
  'Provides natural light and ventilation. Must be properly sealed to prevent leaks.',
  'Installed in roof deck, typically in living spaces below.',
  '["seal_failure", "flashing_damage", "glass_cracking", "condensation"]'::jsonb,
  '["Water stains around frame", "Damaged flashing", "Cracked glass", "Condensation inside"]'::jsonb,
  '["Check flashing integrity", "Inspect seal", "Look for cracks", "Check for water stains"]'::jsonb,
  '["Close-up of flashing", "Frame details", "From inside if accessible"]'::jsonb,
  '{"min": 300, "max": 800}'::jsonb,
  '{"min": 1500, "max": 5000}'::jsonb,
  'high',
  '["all_materials"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Chimney
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Chimney',
  'chimney',
  'Vertical structure extending through the roof. Requires specialized flashing (step flashing and counter flashing) to prevent leaks.',
  'Vents smoke and gases from fireplace or heating system. Must be properly flashed where it penetrates the roof.',
  'Extends vertically through the roof deck, typically near the peak or side of roof.',
  '["flashing_failure", "mortar_deterioration", "crown_damage", "step_flashing_issues"]'::jsonb,
  '["Water stains around base", "Damaged flashing", "Cracked mortar", "Missing counter flashing"]'::jsonb,
  '["Check step flashing", "Inspect counter flashing", "Look for mortar damage", "Check for water stains"]'::jsonb,
  '["All sides of chimney", "Flashing details", "Base of chimney"]'::jsonb,
  '{"min": 500, "max": 1500}'::jsonb,
  '{"min": 2000, "max": 8000}'::jsonb,
  'high',
  '["all_materials"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Ice/Water Shield
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Ice/Water Shield',
  'ice_water_shield',
  'Self-adhering waterproof membrane installed in critical areas to prevent ice dam damage and water intrusion.',
  'Provides extra protection in valleys, eaves, and around penetrations. Prevents water backup from ice dams.',
  'Installed along eaves (typically 3-6 feet up), in valleys, and around penetrations.',
  '["adhesion_failure", "tearing", "improper_coverage", "age_deterioration"]'::jsonb,
  '["Lifted edges", "Tears or holes", "Insufficient coverage", "Brittle material"]'::jsonb,
  '["Check adhesion", "Verify coverage", "Look for tears", "Inspect edges"]'::jsonb,
  '["Eave area", "Valley coverage", "Around penetrations"]'::jsonb,
  '{"min": 400, "max": 1000}'::jsonb,
  '{"min": 1000, "max": 3000}'::jsonb,
  'high',
  '["asphalt_shingle", "metal", "tile"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- Ridge Vent
INSERT INTO public.roofing_components (
  component_name, component_type, description, function_description, location_description,
  common_failures, failure_symptoms, inspection_points, photo_angles,
  typical_repair_cost, typical_replacement_cost, repair_urgency, compatible_materials
) VALUES (
  'Ridge Vent',
  'hip_ridge_vent',
  'Ventilation system installed along the roof ridge to allow hot air to escape from the attic.',
  'Provides continuous ventilation along the ridge. Works with soffit vents to create proper airflow.',
  'Installed along the ridge line, replacing or supplementing ridge cap.',
  '["blockage", "improper_installation", "damage", "insufficient_coverage"]'::jsonb,
  '["Blocked vents", "Improper installation", "Physical damage", "Insufficient coverage"]'::jsonb,
  '["Check for blockages", "Verify installation", "Look for damage", "Check coverage"]'::jsonb,
  '["Along ridge line", "Close-up of vent", "Check for blockages"]'::jsonb,
  '{"min": 600, "max": 1500}'::jsonb,
  '{"min": 1500, "max": 4000}'::jsonb,
  'medium',
  '["asphalt_shingle", "metal", "tile"]'::jsonb
) ON CONFLICT (component_name) DO NOTHING;

-- ============================================================================
-- 2. MATERIALS DATA
-- ============================================================================

-- Architectural Shingles
INSERT INTO public.roofing_materials (
  material_name, material_type, shingle_type, description,
  expected_lifespan_years, typical_cost_per_sq, pitch_constraints,
  storm_vulnerability, hail_resistance, wind_resistance,
  visual_characteristics, common_damage_types, inspect_points,
  insurance_approval_likelihood, code_requirements
) VALUES (
  'Architectural Shingles',
  'asphalt_shingle',
  'architectural',
  'Premium asphalt shingles with multiple layers and dimensional appearance. Also called dimensional or laminate shingles.',
  25,
  '{"min": 300, "max": 550}'::jsonb,
  '{"min_pitch": 4, "max_pitch": null}'::jsonb,
  'medium',
  'medium',
  'high',
  '["Dimensional appearance", "Multiple layers", "Varied color tones", "Thicker than 3-tab"]'::jsonb,
  '["hail_bruising", "wind_uplift", "granule_loss", "thermal_splitting", "cupping"]'::jsonb,
  '["Check for granule loss", "Look for bruising", "Inspect for lifting", "Check for cupping"]'::jsonb,
  'high',
  '[]'::jsonb
) ON CONFLICT (material_name) DO NOTHING;

-- 3-Tab Shingles
INSERT INTO public.roofing_materials (
  material_name, material_type, shingle_type, description,
  expected_lifespan_years, typical_cost_per_sq, pitch_constraints,
  storm_vulnerability, hail_resistance, wind_resistance,
  visual_characteristics, common_damage_types, inspect_points,
  insurance_approval_likelihood, code_requirements
) VALUES (
  '3-Tab Shingles',
  'asphalt_shingle',
  '3_tab',
  'Traditional single-layer asphalt shingles with three tabs. Most common and economical shingle type.',
  20,
  '{"min": 200, "max": 350}'::jsonb,
  '{"min_pitch": 4, "max_pitch": null}'::jsonb,
  'high',
  'low',
  'medium',
  '["Single layer", "Three tabs per shingle", "Flat appearance", "Uniform pattern"]'::jsonb,
  '["hail_bruising", "wind_uplift", "granule_loss", "thermal_splitting", "torn_shingles"]'::jsonb,
  '["Check for granule loss", "Look for bruising", "Inspect for lifting", "Check for tears"]'::jsonb,
  'medium',
  '[]'::jsonb
) ON CONFLICT (material_name) DO NOTHING;

-- Standing Seam Metal
INSERT INTO public.roofing_materials (
  material_name, material_type, metal_type, description,
  expected_lifespan_years, typical_cost_per_sq, pitch_constraints,
  storm_vulnerability, hail_resistance, wind_resistance,
  visual_characteristics, common_damage_types, inspect_points,
  insurance_approval_likelihood, code_requirements
) VALUES (
  'Standing Seam Metal',
  'metal',
  'standing_seam',
  'Premium metal roofing with raised seams that interlock. Highly durable and weather-resistant.',
  50,
  '{"min": 600, "max": 1200}'::jsonb,
  '{"min_pitch": 2, "max_pitch": null}'::jsonb,
  'low',
  'high',
  'high',
  '["Raised vertical seams", "Smooth panels", "Modern appearance", "Various colors"]'::jsonb,
  '["denting", "seam_failure", "scratching", "corrosion"]'::jsonb,
  '["Check for dents", "Inspect seams", "Look for scratches", "Check for corrosion"]'::jsonb,
  'high',
  '[]'::jsonb
) ON CONFLICT (material_name) DO NOTHING;

-- Tile
INSERT INTO public.roofing_materials (
  material_name, material_type, tile_type, description,
  expected_lifespan_years, typical_cost_per_sq, pitch_constraints,
  storm_vulnerability, hail_resistance, wind_resistance,
  visual_characteristics, common_damage_types, inspect_points,
  insurance_approval_likelihood, code_requirements
) VALUES (
  'Tile Roof',
  'tile',
  'clay',
  'Clay or concrete tiles providing excellent durability and classic appearance. Common in Mediterranean and Spanish-style architecture.',
  50,
  '{"min": 800, "max": 1500}'::jsonb,
  '{"min_pitch": 4, "max_pitch": null}'::jsonb,
  'low',
  'high',
  'high',
  '["Individual tiles", "Curved or flat", "Terracotta color", "Heavy weight"]'::jsonb,
  '["cracked_tiles", "displaced_tiles", "underlayment_failure", "ridge_damage"]'::jsonb,
  '["Check for cracks", "Look for displaced tiles", "Inspect underlayment", "Check ridge"]'::jsonb,
  'high',
  '[]'::jsonb
) ON CONFLICT (material_name) DO NOTHING;

-- TPO
INSERT INTO public.roofing_materials (
  material_name, material_type, flat_type, description,
  expected_lifespan_years, typical_cost_per_sq, pitch_constraints,
  storm_vulnerability, hail_resistance, wind_resistance,
  visual_characteristics, common_damage_types, inspect_points,
  insurance_approval_likelihood, code_requirements
) VALUES (
  'TPO Roof',
  'tpo',
  'tpo',
  'Thermoplastic Polyolefin single-ply membrane roofing system. Common on commercial and low-slope residential roofs.',
  20,
  '{"min": 400, "max": 800}'::jsonb,
  '{"min_pitch": 0.25, "max_pitch": 3}'::jsonb,
  'medium',
  'medium',
  'medium',
  '["White or light colored", "Seamed membrane", "Smooth surface", "Reflective"]'::jsonb,
  '["membrane_pulling", "seam_failure", "punctures", "UV_deterioration"]'::jsonb,
  '["Check seams", "Look for punctures", "Inspect for pulling", "Check UV damage"]'::jsonb,
  'medium',
  '[]'::jsonb
) ON CONFLICT (material_name) DO NOTHING;

-- ============================================================================
-- 3. DAMAGE TYPES DATA
-- ============================================================================

-- Wind Uplift
INSERT INTO public.roofing_damage_types (
  damage_name, damage_type, description, visual_description, causes,
  insurance_claim_category, insurance_approval_probability,
  recommended_photo_angles, detection_methods,
  repair_cost_range, replacement_cost_range, urgency_level,
  supplement_potential, code_requirements, recommended_action, next_step_messaging,
  affects_materials
) VALUES (
  'Wind Uplift',
  'wind',
  'Shingles or roofing materials lifted or torn away by wind forces. Can expose underlayment and lead to water intrusion.',
  'Lifted shingle edges, missing shingles, exposed underlayment, torn shingles, creased shingles.',
  '["High winds", "Improper installation", "Aged shingles", "Insufficient fastening"]'::jsonb,
  'storm',
  'high',
  '["From ground looking up", "Close-up of lifted edges", "Missing shingle areas", "Windward side"]'::jsonb,
  '["Visual inspection", "Check for lifted edges", "Look for missing shingles", "Inspect fasteners"]'::jsonb,
  '{"min": 200, "max": 800}'::jsonb,
  '{"min": 8000, "max": 25000}'::jsonb,
  'high',
  'medium',
  '[]'::jsonb,
  'Schedule inspection immediately. Document all damage with photos. Check for interior leaks.',
  '["Document damage immediately", "Check for interior water damage", "Schedule inspection", "Contact insurance"]'::jsonb,
  '["asphalt_shingle", "metal", "tile"]'::jsonb
) ON CONFLICT (damage_name) DO NOTHING;

-- Hail Bruising
INSERT INTO public.roofing_damage_types (
  damage_name, damage_type, description, visual_description, causes,
  insurance_claim_category, insurance_approval_probability,
  recommended_photo_angles, detection_methods,
  repair_cost_range, replacement_cost_range, urgency_level,
  supplement_potential, code_requirements, recommended_action, next_step_messaging,
  affects_materials
) VALUES (
  'Hail Bruising',
  'hail',
  'Circular indentations or bruises in shingles caused by hail impact. Can compromise shingle integrity and lead to premature failure.',
  'Circular indentations, dark spots, granule loss at impact points, soft spots when pressed.',
  '["Hail storms", "Large hail stones", "Impact force"]'::jsonb,
  'storm',
  'high',
  '["Close-up of bruises", "Multiple angles", "With coin for scale", "Entire roof surface"]'::jsonb,
  '["Visual inspection", "Touch test for soft spots", "Check granule loss", "Count impacts"]'::jsonb,
  '{"min": 0, "max": 0}'::jsonb,
  '{"min": 8000, "max": 25000}'::jsonb,
  'medium',
  'high',
  '[]'::jsonb,
  'Document all hail damage. Count impacts per square. Check for functional damage. Insurance often approves replacement.',
  '["Document all hail impacts", "Count impacts per square", "Check for functional damage", "Contact insurance adjuster"]'::jsonb,
  '["asphalt_shingle", "metal"]'::jsonb
) ON CONFLICT (damage_name) DO NOTHING;

-- Granule Loss
INSERT INTO public.roofing_damage_types (
  damage_name, damage_type, description, visual_description, causes,
  insurance_claim_category, insurance_approval_probability,
  recommended_photo_angles, detection_methods,
  repair_cost_range, replacement_cost_range, urgency_level,
  supplement_potential, code_requirements, recommended_action, next_step_messaging,
  affects_materials
) VALUES (
  'Granule Loss',
  'wear_tear',
  'Loss of protective granules from asphalt shingles, exposing the asphalt layer to UV damage and reducing shingle life.',
  'Bare spots on shingles, granules in gutters, exposed asphalt layer, discolored areas.',
  '["Aging", "Storm damage", "Foot traffic", "Manufacturing defect"]'::jsonb,
  'wear_tear',
  'low',
  '["Close-up of bare spots", "Gutters showing granules", "Overall roof condition"]'::jsonb,
  '["Visual inspection", "Check gutters", "Look for bare spots", "Assess overall condition"]'::jsonb,
  '{"min": 0, "max": 0}'::jsonb,
  '{"min": 8000, "max": 25000}'::jsonb,
  'low',
  'low',
  '[]'::jsonb,
  'Monitor condition. If extensive and combined with other factors, replacement may be warranted.',
  '["Monitor roof condition", "Check for other damage", "Consider age of roof"]'::jsonb,
  '["asphalt_shingle"]'::jsonb
) ON CONFLICT (damage_name) DO NOTHING;

-- Pipe Boot Crack
INSERT INTO public.roofing_damage_types (
  damage_name, damage_type, description, visual_description, causes,
  insurance_claim_category, insurance_approval_probability,
  recommended_photo_angles, detection_methods,
  repair_cost_range, replacement_cost_range, urgency_level,
  supplement_potential, code_requirements, recommended_action, next_step_messaging,
  affects_materials
) VALUES (
  'Pipe Boot Crack',
  'water',
  'Cracks or deterioration in the rubber boot sealing around plumbing vents, allowing water intrusion.',
  'Visible cracks in rubber boot, water stains around pipe, deteriorated or brittle material.',
  '["UV exposure", "Age", "Temperature extremes", "Improper installation"]'::jsonb,
  'emergency_leak',
  'high',
  '["Close-up of boot", "Around pipe base", "Check seal area"]'::jsonb,
  '["Visual inspection", "Check for cracks", "Look for water stains", "Test seal integrity"]'::jsonb,
  '{"min": 100, "max": 300}'::jsonb,
  '{"min": 200, "max": 500}'::jsonb,
  'medium',
  'none',
  '[]'::jsonb,
  'Replace boot immediately to prevent water intrusion. Check for interior damage.',
  '["Replace boot immediately", "Check for interior water damage", "Prevent further damage"]'::jsonb,
  '["all_materials"]'::jsonb
) ON CONFLICT (damage_name) DO NOTHING;

-- ============================================================================
-- 4. STORM INDICATORS DATA
-- ============================================================================

-- Hail Sizes
INSERT INTO public.roofing_storm_indicators (
  indicator_name, indicator_type, description, measurement_units,
  value_ranges, severity_mapping, detection_method, visual_indicators,
  insurance_significance, claim_approval_correlation, documentation_requirements
) VALUES (
  'Hail Size',
  'hail_size',
  'Diameter of hail stones measured in inches. Larger hail causes more significant damage.',
  'inches',
  '[
    {"range": "0.75-1.0", "description": "Quarter to ping pong ball", "damage_level": "minor"},
    {"range": "1.0-1.5", "description": "Ping pong to golf ball", "damage_level": "moderate"},
    {"range": "1.5-2.0", "description": "Golf ball to hen egg", "damage_level": "significant"},
    {"range": "2.0+", "description": "Hen egg or larger", "damage_level": "severe"}
  ]'::jsonb,
  '{"minor": "low", "moderate": "medium", "significant": "high", "severe": "high"}'::jsonb,
  'Measure actual hail stones or use reference objects (coins, balls) for comparison.',
  '["Hail stones", "Dents in metal", "Bruises on shingles", "Impact marks"]'::jsonb,
  'Larger hail significantly increases likelihood of insurance approval for roof replacement.',
  'high',
  '["Measure and document hail size", "Take photos with reference objects", "Count impacts per square"]'::jsonb
) ON CONFLICT (indicator_name) DO NOTHING;

-- Wind Speeds
INSERT INTO public.roofing_storm_indicators (
  indicator_name, indicator_type, description, measurement_units,
  value_ranges, severity_mapping, detection_method, visual_indicators,
  insurance_significance, claim_approval_correlation, documentation_requirements
) VALUES (
  'Wind Speed',
  'wind_speed',
  'Wind velocity measured in miles per hour. Higher speeds cause more significant roof damage.',
  'mph',
  '[
    {"range": "50-60", "description": "Strong wind", "damage_level": "minor"},
    {"range": "60-75", "description": "Severe wind", "damage_level": "moderate"},
    {"range": "75-90", "description": "Hurricane force", "damage_level": "significant"},
    {"range": "90+", "description": "Major hurricane", "damage_level": "severe"}
  ]'::jsonb,
  '{"minor": "low", "moderate": "medium", "significant": "high", "severe": "high"}'::jsonb,
  'Check weather reports, wind damage patterns, or use anemometer if available.',
  '["Lifted shingles", "Missing shingles", "Tree damage", "Debris patterns"]'::jsonb,
  'Wind speeds above 60 mph significantly increase insurance claim approval likelihood.',
  'high',
  '["Document wind speeds from weather reports", "Photograph wind damage patterns", "Note direction of damage"]'::jsonb
) ON CONFLICT (indicator_name) DO NOTHING;

-- ============================================================================
-- 5. INSURANCE TERMS DATA
-- ============================================================================

-- RCV
INSERT INTO public.roofing_insurance_terms (
  term_name, term_type, definition, detailed_explanation, homeowner_friendly_explanation,
  legal_status, state_specific_rules, when_used, common_misunderstandings,
  related_insurance_terms, messaging_guidance, avoid_phrases
) VALUES (
  'RCV',
  'payment_type',
  'Replacement Cost Value - The full cost to replace damaged property with materials of like kind and quality, without deduction for depreciation.',
  'RCV represents what it would cost to replace your roof today at current market prices. Insurance pays RCV minus your deductible. You receive the full RCV amount once the work is completed and verified.',
  'RCV is the full amount your insurance will pay to replace your roof (minus your deductible). You get the full amount once the work is done.',
  'legal',
  '{}'::jsonb,
  'Used in insurance estimates and claim settlements. Appears on the insurance scope of loss.',
  '["Confusing RCV with ACV", "Thinking RCV is the final payment amount", "Not understanding depreciation"]'::jsonb,
  '["ACV", "depreciation", "deductible"]'::jsonb,
  'Explain that RCV is the full replacement cost, and they receive it after work completion. Always mention the deductible.',
  '["Guaranteed payment", "Cash payment", "You get this amount"]'::jsonb
) ON CONFLICT (term_name) DO NOTHING;

-- ACV
INSERT INTO public.roofing_insurance_terms (
  term_name, term_type, definition, detailed_explanation, homeowner_friendly_explanation,
  legal_status, state_specific_rules, when_used, common_misunderstandings,
  related_insurance_terms, messaging_guidance, avoid_phrases
) VALUES (
  'ACV',
  'payment_type',
  'Actual Cash Value - The replacement cost minus depreciation. Represents the current value of the damaged property.',
  'ACV is what your roof is worth today, accounting for age and wear. It is RCV minus depreciation. Some policies pay ACV initially, then the remainder (recoverable depreciation) after work completion.',
  'ACV is what your roof is worth right now, considering its age. It is less than the full replacement cost because your roof has aged.',
  'legal',
  '{}'::jsonb,
  'Used in initial claim payments, especially for older roofs. May be the only payment for wear-and-tear claims.',
  '["Thinking ACV is the final amount", "Not understanding recoverable depreciation", "Confusing with RCV"]'::jsonb,
  '["RCV", "depreciation", "recoverable_depreciation"]'::jsonb,
  'Explain that ACV accounts for age. If recoverable depreciation applies, they get the remainder after work completion.',
  '["This is all you get", "Final payment", "Settlement amount"]'::jsonb
) ON CONFLICT (term_name) DO NOTHING;

-- Deductible
INSERT INTO public.roofing_insurance_terms (
  term_name, term_type, definition, detailed_explanation, homeowner_friendly_explanation,
  legal_status, state_specific_rules, when_used, common_misunderstandings,
  related_insurance_terms, messaging_guidance, avoid_phrases
) VALUES (
  'Deductible',
  'coverage_type',
  'The amount the policyholder must pay out-of-pocket before insurance coverage begins.',
  'Your deductible is your share of the claim cost. If your claim is $10,000 and your deductible is $1,000, insurance pays $9,000. Deductibles cannot be waived or paid by contractors in most states.',
  'Your deductible is the amount you pay before insurance covers the rest. It is your portion of the claim cost.',
  'legal',
  '{"illegal_to_waive": ["TX", "FL", "CA", "CO"]}'::jsonb,
  'Appears on every insurance claim. Must be paid by homeowner before insurance payment.',
  '["Thinking contractor can pay it", "Not understanding it applies to every claim", "Confusing with out-of-pocket costs"]'::jsonb,
  '["RCV", "ACV", "claim_amount"]'::jsonb,
  'Always explain that the deductible is the homeowner responsibility. Never offer to pay it (illegal in many states).',
  '["We can pay your deductible", "Deductible waiver", "No out-of-pocket cost"]'::jsonb
) ON CONFLICT (term_name) DO NOTHING;

-- ============================================================================
-- 6. SALES TERMS DATA
-- ============================================================================

-- Emergency Appointment
INSERT INTO public.roofing_sales_terms (
  term_name, term_type, definition, context_description,
  script_templates, talking_points, process_step_order, prerequisites, next_steps,
  typical_value_range, pricing_guidance, appointment_prep_checklist
) VALUES (
  'Emergency Appointment',
  'appointment_type',
  'Urgent inspection scheduled within 24-48 hours due to active leaks, severe damage, or safety concerns.',
  'Used when homeowner reports active water intrusion, missing shingles exposing interior, or safety hazards.',
  '["We can get someone out today/tomorrow to assess the situation", "This is urgent - lets get it inspected right away"]'::jsonb,
  '["Active leak", "Safety concern", "Prevent further damage", "Quick response"]'::jsonb,
  1,
  '[]'::jsonb,
  '["Inspection", "Documentation", "Estimate", "Insurance claim if applicable"]'::jsonb,
  '{"min": 0, "max": 0}'::jsonb,
  'Emergency appointments are typically free inspections. Focus on preventing further damage.',
  '["Camera ready", "Access to roof", "List of concerns", "Insurance info if available"]'::jsonb
) ON CONFLICT (term_name) DO NOTHING;

-- Re-deck
INSERT INTO public.roofing_sales_terms (
  term_name, term_type, definition, context_description,
  script_templates, talking_points, process_step_order, prerequisites, next_steps,
  typical_value_range, pricing_guidance, appointment_prep_checklist
) VALUES (
  'Re-deck',
  'process_step',
  'Replacement of the roof decking (plywood or OSB) when it is damaged, rotted, or does not meet code requirements.',
  'Required when decking is damaged, has soft spots, or does not meet current building codes. Adds significant cost to project.',
  '["The decking needs to be replaced", "We found some soft spots that need addressing", "Code requires new decking"]'::jsonb,
  '["Safety", "Code compliance", "Prevents future issues", "Structural integrity"]'::jsonb,
  3,
  '["Inspection completed", "Decking condition assessed"]'::jsonb,
  '["Material delivery", "Crew scheduling", "Installation"]'::jsonb,
  '{"min": 3000, "max": 8000}'::jsonb,
  'Re-decking adds $3-8K depending on roof size. Often covered by insurance if storm-related. Explain code requirements.',
  '["Inspection report", "Photos of decking", "Code requirements"]'::jsonb
) ON CONFLICT (term_name) DO NOTHING;

-- ============================================================================
-- 7. ENCYCLOPEDIA ENTRIES (Main Table)
-- ============================================================================

-- Create encyclopedia entries for key terms
INSERT INTO public.roofing_encyclopedia (
  term, category, subcategory, definition, short_description,
  related_terms, synonyms, homeowner_phrases, usage_context,
  common_misconceptions, importance_level
)
SELECT 
  component_name,
  'component',
  component_type,
  description,
  function_description,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  location_description,
  '[]'::jsonb,
  'high'
FROM public.roofing_components
ON CONFLICT DO NOTHING;

INSERT INTO public.roofing_encyclopedia (
  term, category, subcategory, definition, short_description,
  related_terms, synonyms, homeowner_phrases, usage_context,
  common_misconceptions, importance_level
)
SELECT 
  material_name,
  'material',
  material_type,
  description,
  description,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'Material selection and installation',
  '[]'::jsonb,
  'high'
FROM public.roofing_materials
ON CONFLICT DO NOTHING;

INSERT INTO public.roofing_encyclopedia (
  term, category, subcategory, definition, short_description,
  related_terms, synonyms, homeowner_phrases, usage_context,
  common_misconceptions, importance_level
)
SELECT 
  damage_name,
  'damage_type',
  damage_type,
  description,
  visual_description,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'Damage assessment and insurance claims',
  '[]'::jsonb,
  'critical'
FROM public.roofing_damage_types
ON CONFLICT DO NOTHING;

INSERT INTO public.roofing_encyclopedia (
  term, category, subcategory, definition, short_description,
  related_terms, synonyms, homeowner_phrases, usage_context,
  common_misconceptions, importance_level
)
SELECT 
  term_name,
  'insurance_term',
  term_type,
  definition,
  homeowner_friendly_explanation,
  related_insurance_terms,
  '[]'::jsonb,
  '[]'::jsonb,
  when_used,
  common_misunderstandings,
  'critical'
FROM public.roofing_insurance_terms
ON CONFLICT DO NOTHING;

-- Update component and material tables with encyclopedia IDs
UPDATE public.roofing_components c
SET encyclopedia_id = e.id
FROM public.roofing_encyclopedia e
WHERE e.term = c.component_name AND e.category = 'component';

UPDATE public.roofing_materials m
SET encyclopedia_id = e.id
FROM public.roofing_encyclopedia e
WHERE e.term = m.material_name AND e.category = 'material';

UPDATE public.roofing_damage_types d
SET encyclopedia_id = e.id
FROM public.roofing_encyclopedia e
WHERE e.term = d.damage_name AND e.category = 'damage_type';

UPDATE public.roofing_insurance_terms i
SET encyclopedia_id = e.id
FROM public.roofing_encyclopedia e
WHERE e.term = i.term_name AND e.category = 'insurance_term';





















































