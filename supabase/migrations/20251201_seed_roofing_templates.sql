-- =========================================================
-- Seed: Insert All 4 Roofing Templates + Steps
-- =========================================================

-- =========================================================
-- Storm Damage Outreach
-- =========================================================
DO $$
DECLARE
  storm_id uuid;
BEGIN
  INSERT INTO public.roofing_templates (name, description, recommended_for)
  VALUES ('Storm Damage Outreach', 'Reach homeowners after wind, hail, or heavy storms to offer an inspection.', 'storm_damage')
  RETURNING id INTO storm_id;

  INSERT INTO public.roofing_template_steps (template_id, step_order, delay_days, subject, body)
  VALUES
    (storm_id, 1, 0,
      'Quick question about your roof on {street}',
      'Hi {homeowner_name},

With the recent {storm_type} in {city}, many roofs in your area took damage without homeowners realizing it.

We''re offering a **free storm inspection** this week.

Would you like me to put you on the schedule?

– {sender_name}'),
    (storm_id, 2, 2,
      'A lot of roofs in {city} had damage…',
      'Hey {homeowner_name},

Not sure if you saw — but **several roofs on {street} had wind/hail damage** that wasn''t visible from the ground.

We''re knocking out inspections this week.

Want us to swing by yours?

– {sender_name}'),
    (storm_id, 3, 4,
      'Before the insurance deadline hits…',
      'Hi {homeowner_name},

Most insurance companies have short deadlines for storm claims.

If you want, I can send a tech to take photos + document everything.

Want me to reserve a spot for you?

– {sender_name}');
END $$;

-- =========================================================
-- Annual Inspection / Maintenance
-- =========================================================
DO $$
DECLARE
  inspect_id uuid;
BEGIN
  INSERT INTO public.roofing_templates (name, description, recommended_for)
  VALUES ('Annual Roof Inspection', 'Perfect for maintenance plans or yearly homeowner check-ins.', 'inspection')
  RETURNING id INTO inspect_id;

  INSERT INTO public.roofing_template_steps (template_id, step_order, delay_days, subject, body)
  VALUES
    (inspect_id, 1, 0,
      'Quick yearly roof check?',
      'Hi {homeowner_name},

It''s about that time of year when we do **annual roof inspections** for homeowners in {city}.

Takes 10–15 minutes, and we give you a full condition report.

Want me to put your home on the list this week?

– {sender_name}'),
    (inspect_id, 2, 3,
      'Just following up on your roof check',
      'Hey {homeowner_name},

We''re still in {city} doing annual inspections.

Let me know if you''d like us to stop by — no cost.

– {sender_name}'),
    (inspect_id, 3, 5,
      'Before we close out the routes…',
      'Hi {homeowner_name},

We''re finishing inspections for this season.

If you want a free check before we wrap up, let me know and I''ll add you.

– {sender_name}');
END $$;

-- =========================================================
-- Old Quotes Reactivation
-- =========================================================
DO $$
DECLARE
  react_id uuid;
BEGIN
  INSERT INTO public.roofing_templates (name, description, recommended_for)
  VALUES ('Old Quote Reactivation', 'Re-engage homeowners who requested quotes but never booked the job.', 'reactivation')
  RETURNING id INTO react_id;

  INSERT INTO public.roofing_template_steps (template_id, step_order, delay_days, subject, body)
  VALUES
    (react_id, 1, 0,
      'Still thinking about the roof project?',
      'Hi {homeowner_name},

A while back you requested a quote from us for roof work.

We''re doing a follow-up round this week.

Would you like updated pricing or availability?

– {sender_name}'),
    (react_id, 2, 3,
      'We have openings this week',
      'Hey {homeowner_name},

Not sure if this is still on your radar — but we have crews open in {city}.

If you need the roof done before weather shifts, we can prioritize you.

Want me to check availability for you?

– {sender_name}'),
    (react_id, 3, 6,
      'Before we close out your quote',
      'Hi {homeowner_name},

We''ll be closing out old quotes soon.

If you still need roof work done, we can refresh pricing.

– {sender_name}');
END $$;

-- =========================================================
-- Neighborhood Canvas / "We Just Did a Job Near You"
-- =========================================================
DO $$
DECLARE
  canvas_id uuid;
BEGIN
  INSERT INTO public.roofing_templates (name, description, recommended_for)
  VALUES ('We Just Did a Roof Nearby', 'Perfect for canvassing neighborhoods after completing a job on the block.', 'canvas')
  RETURNING id INTO canvas_id;

  INSERT INTO public.roofing_template_steps (template_id, step_order, delay_days, subject, body)
  VALUES
    (canvas_id, 1, 0,
      'We just finished a roof on {street}',
      'Hi {homeowner_name},

We just completed a roof project **right on your street**.

While the crew is still nearby, we''re offering free checks to other homeowners.

Want me to swing by yours?

– {sender_name}'),
    (canvas_id, 2, 2,
      'Before our crew leaves your area…',
      'Hey {homeowner_name},

We''re packing up at the job we just finished on {street}.

If you want your roof inspected before we head out, let me know.

– {sender_name}');
END $$;


























































