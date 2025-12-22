-- =========================================================
-- Block 19300 — State Law Engine Seed Data
-- Initial state law data for key roofing states
-- =========================================================

-- ============================================================================
-- WASHINGTON STATE
-- ============================================================================

INSERT INTO public.state_rules (
  state_code, state_name,
  requires_roofing_license, license_type, license_details,
  contractor_can_negotiate_claim, contractor_can_document_damage, contractor_can_interpret_policy, contractor_can_show_damage,
  claim_filing_deadline_days, door_to_door_solicitation_allowed, same_day_solicitation_after_storm, solicitation_cooling_off_period_hours,
  last_updated, source
) VALUES (
  'WA', 'Washington',
  true, 'state', 'Washington requires a state roofing contractor license',
  false, true, false, true,
  365, true, true, 0,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET
  requires_roofing_license = EXCLUDED.requires_roofing_license,
  contractor_can_negotiate_claim = EXCLUDED.contractor_can_negotiate_claim,
  contractor_can_interpret_policy = EXCLUDED.contractor_can_interpret_policy,
  updated_at = now();

INSERT INTO public.state_deductible_laws (
  state_code,
  deductible_waiving_illegal, deductible_assistance_allowed, deductible_payment_rules,
  financing_allowed, payment_plans_allowed,
  last_updated, source
) VALUES (
  'WA',
  true, true, 'Deductible waiving is illegal. Financing and payment plans are allowed.',
  true, true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET
  deductible_waiving_illegal = EXCLUDED.deductible_waiving_illegal,
  updated_at = now();

INSERT INTO public.state_matching_laws (
  state_code,
  matching_requirement_type, affects_replacement_value, affects_supplement_potential,
  matching_details,
  last_updated, source
) VALUES (
  'WA',
  'like_kind_required', true, true,
  'Washington requires like-kind matching. If shingles cannot be matched, full replacement may be required.',
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET
  matching_requirement_type = EXCLUDED.matching_requirement_type,
  updated_at = now();

INSERT INTO public.state_code_requirements (
  state_code,
  ventilation_code_required, ventilation_code_details,
  ice_water_shield_code_required, ice_water_shield_valleys_required, ice_water_shield_code_details,
  flashing_code_required, flashing_code_details,
  code_upgrades_payable_by_insurance,
  last_updated, source
) VALUES (
  'WA',
  true, 'Ventilation upgrades required per Washington building code',
  true, true, 'Ice & Water Shield required in valleys per code',
  true, 'Flashing code upgrades required',
  true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET
  ice_water_shield_valleys_required = EXCLUDED.ice_water_shield_valleys_required,
  updated_at = now();

INSERT INTO public.state_restrictions (
  state_code,
  policy_interpretation_prohibited, negotiation_language_prohibited, deductible_waiving_prohibited,
  prohibited_phrases, prohibited_keywords,
  compliant_alternatives,
  last_updated, source
) VALUES (
  'WA',
  true, true, true,
  ARRAY[
    'We can help you negotiate with your insurance',
    'We''ll waive your deductible',
    'Your policy says',
    'We''ll negotiate your claim'
  ],
  ARRAY['negotiate', 'waive deductible', 'policy says'],
  '{
    "We can help you negotiate with your insurance": "We can document the damage and help you understand your options",
    "We''ll waive your deductible": "We offer financing options for your deductible",
    "Your policy says": "You may want to review your policy with your insurance agent",
    "We''ll negotiate your claim": "We can document the damage for your insurance claim"
  }'::jsonb,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET
  prohibited_phrases = EXCLUDED.prohibited_phrases,
  compliant_alternatives = EXCLUDED.compliant_alternatives,
  updated_at = now();

-- ============================================================================
-- TEXAS STATE
-- ============================================================================

INSERT INTO public.state_rules (
  state_code, state_name,
  requires_roofing_license, license_type, license_details,
  contractor_can_negotiate_claim, contractor_can_document_damage, contractor_can_interpret_policy, contractor_can_show_damage,
  claim_filing_deadline_days, door_to_door_solicitation_allowed, same_day_solicitation_after_storm,
  last_updated, source
) VALUES (
  'TX', 'Texas',
  false, 'none', 'Texas does not require a state roofing license (check local requirements)',
  false, true, false, true,
  365, true, true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET
  requires_roofing_license = EXCLUDED.requires_roofing_license,
  updated_at = now();

INSERT INTO public.state_deductible_laws (
  state_code,
  deductible_waiving_illegal, deductible_assistance_allowed,
  financing_allowed, payment_plans_allowed,
  last_updated, source
) VALUES (
  'TX',
  true, true,
  true, true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_matching_laws (
  state_code,
  matching_requirement_type,
  matching_details,
  last_updated, source
) VALUES (
  'TX',
  'no_matching_rule',
  'Texas has no specific matching requirement',
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_restrictions (
  state_code,
  policy_interpretation_prohibited, negotiation_language_prohibited, deductible_waiving_prohibited,
  prohibited_phrases,
  compliant_alternatives,
  last_updated, source
) VALUES (
  'TX',
  true, true, true,
  ARRAY['We can help you negotiate with your insurance', 'We''ll waive your deductible'],
  '{
    "We can help you negotiate with your insurance": "We can document the damage and help you understand your options",
    "We''ll waive your deductible": "We offer financing options for your deductible"
  }'::jsonb,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

-- ============================================================================
-- FLORIDA STATE
-- ============================================================================

INSERT INTO public.state_rules (
  state_code, state_name,
  requires_roofing_license, license_type, license_details,
  contractor_can_negotiate_claim, contractor_can_document_damage, contractor_can_interpret_policy,
  claim_filing_deadline_days, door_to_door_solicitation_allowed, same_day_solicitation_after_storm,
  last_updated, source
) VALUES (
  'FL', 'Florida',
  true, 'state', 'Florida requires a state roofing contractor license',
  false, true, false,
  365, true, false, -- Florida has restrictions on same-day solicitation
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET
  same_day_solicitation_after_storm = EXCLUDED.same_day_solicitation_after_storm,
  updated_at = now();

INSERT INTO public.state_deductible_laws (
  state_code,
  deductible_waiving_illegal, deductible_assistance_allowed,
  financing_allowed, payment_plans_allowed,
  last_updated, source
) VALUES (
  'FL',
  true, true,
  true, true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_matching_laws (
  state_code,
  matching_requirement_type,
  matching_details,
  last_updated, source
) VALUES (
  'FL',
  'full_replacement_required',
  'Florida requires full roof replacement if shingles cannot be matched',
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_code_requirements (
  state_code,
  ice_water_shield_code_required, ice_water_shield_code_details,
  code_upgrades_payable_by_insurance,
  last_updated, source
) VALUES (
  'FL',
  true, 'Ice & Water Shield required per Florida building code (hurricane zones)',
  true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_restrictions (
  state_code,
  policy_interpretation_prohibited, negotiation_language_prohibited, deductible_waiving_prohibited,
  prohibited_phrases,
  compliant_alternatives,
  last_updated, source
) VALUES (
  'FL',
  true, true, true,
  ARRAY['We can help you negotiate with your insurance', 'We''ll waive your deductible', 'We''re in your area now'],
  '{
    "We can help you negotiate with your insurance": "We can document the damage and help you understand your options",
    "We''ll waive your deductible": "We offer financing options for your deductible",
    "We''re in your area now": "We are helping homeowners in your ZIP understand recent storm damage"
  }'::jsonb,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

-- ============================================================================
-- CALIFORNIA STATE
-- ============================================================================

INSERT INTO public.state_rules (
  state_code, state_name,
  requires_roofing_license, license_type, license_details,
  contractor_can_negotiate_claim, contractor_can_document_damage, contractor_can_interpret_policy,
  claim_filing_deadline_days, door_to_door_solicitation_allowed, same_day_solicitation_after_storm,
  last_updated, source
) VALUES (
  'CA', 'California',
  true, 'state', 'California requires a state contractor license (C-39 Roofing)',
  false, true, false,
  365, true, true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_deductible_laws (
  state_code,
  deductible_waiving_illegal, deductible_assistance_allowed,
  financing_allowed, payment_plans_allowed,
  last_updated, source
) VALUES (
  'CA',
  true, true,
  true, true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_matching_laws (
  state_code,
  matching_requirement_type,
  matching_details,
  last_updated, source
) VALUES (
  'CA',
  'like_kind_required',
  'California requires like-kind matching',
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_restrictions (
  state_code,
  policy_interpretation_prohibited, negotiation_language_prohibited, deductible_waiving_prohibited,
  prohibited_phrases,
  compliant_alternatives,
  last_updated, source
) VALUES (
  'CA',
  true, true, true,
  ARRAY['We can help you negotiate with your insurance', 'We''ll waive your deductible'],
  '{
    "We can help you negotiate with your insurance": "We can document the damage and help you understand your options",
    "We''ll waive your deductible": "We offer financing options for your deductible"
  }'::jsonb,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

-- ============================================================================
-- COLORADO STATE
-- ============================================================================

INSERT INTO public.state_rules (
  state_code, state_name,
  requires_roofing_license, license_type,
  contractor_can_negotiate_claim, contractor_can_document_damage, contractor_can_interpret_policy,
  last_updated, source
) VALUES (
  'CO', 'Colorado',
  false, 'none',
  false, true, false,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_deductible_laws (
  state_code,
  deductible_waiving_illegal, deductible_assistance_allowed,
  financing_allowed, payment_plans_allowed,
  last_updated, source
) VALUES (
  'CO',
  true, true,
  true, true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_matching_laws (
  state_code,
  matching_requirement_type,
  last_updated, source
) VALUES (
  'CO',
  'no_matching_rule',
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_code_requirements (
  state_code,
  ice_water_shield_code_required, ice_water_shield_valleys_required,
  code_upgrades_payable_by_insurance,
  last_updated, source
) VALUES (
  'CO',
  true, true,
  true,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

INSERT INTO public.state_restrictions (
  state_code,
  policy_interpretation_prohibited, negotiation_language_prohibited, deductible_waiving_prohibited,
  prohibited_phrases,
  compliant_alternatives,
  last_updated, source
) VALUES (
  'CO',
  true, true, true,
  ARRAY['We can help you negotiate with your insurance', 'We''ll waive your deductible'],
  '{
    "We can help you negotiate with your insurance": "We can document the damage and help you understand your options",
    "We''ll waive your deductible": "We offer financing options for your deductible"
  }'::jsonb,
  now(), 'Initial seed data'
) ON CONFLICT (state_code) DO UPDATE SET updated_at = now();

-- ============================================================================
-- Add some region intelligence examples
-- ============================================================================

-- Hurricane zones in Florida
INSERT INTO public.region_intelligence (
  state_code, region_type, region_name, region_code,
  hurricane_zone, affects_value_estimates, affects_code_suggestions, affects_material_recommendations,
  last_updated, source
) VALUES
('FL', 'zone', 'Hurricane Zone 1', 'FL_HZ1', true, true, true, true, now(), 'Initial seed data'),
('FL', 'zone', 'Hurricane Zone 2', 'FL_HZ2', true, true, true, true, now(), 'Initial seed data'),
('FL', 'county', 'Miami-Dade County', '12086', true, true, true, true, now(), 'Initial seed data')
ON CONFLICT DO NOTHING;

-- Wildfire zones in California
INSERT INTO public.region_intelligence (
  state_code, region_type, region_name,
  wildfire_zone, affects_value_estimates, affects_code_suggestions, affects_material_recommendations,
  last_updated, source
) VALUES
('CA', 'zone', 'Wildfire Zone', 'CA_WF', true, true, true, true, now(), 'Initial seed data')
ON CONFLICT DO NOTHING;

-- Snow load zones in Colorado
INSERT INTO public.region_intelligence (
  state_code, region_type, region_name,
  snow_load_zone, affects_value_estimates, affects_code_suggestions,
  last_updated, source
) VALUES
('CO', 'zone', 'High Snow Load Zone', 'CO_SL', true, true, true, now(), 'Initial seed data')
ON CONFLICT DO NOTHING;





















































