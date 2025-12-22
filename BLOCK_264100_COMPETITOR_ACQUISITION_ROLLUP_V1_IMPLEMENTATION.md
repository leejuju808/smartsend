# BLOCK 264100 — SmartSend Competitor Acquisition, Roll-Up & Market Absorption Engine v1

## 0. Purpose & End State

**Goal**: Turn competitor tools into *inventory* that feeds SmartSend’s product, data, and moat — without public price wars, feature races, or visible M&A drama.

**End state**:
- **Fewer choices, one standard**: Roofers default to SmartSend as the category standard.
- **Competitors -> Feedstock**: Feature clones, small vertical SaaS, and tired brands become:
  - feature inputs
  - data inputs
  - talent inputs
  - distribution inputs
- **Roofers feel stupid not using SmartSend** because:
  - they never have to migrate again
  - they always end up on the winning infrastructure
  - their tools don’t disappear on them

This document defines the **systems, data models, workflows, and guardrails** to operate this as an ongoing engine.

---

## 1. System Overview

### 1.1 Core Components

We implement a **Competitor Acquisition & Absorption Engine** made of:

1. **Competitor Intelligence Layer**
   - Competitor registry & classification matrix
   - Signals: funding, product releases, pricing, churn risk
   - Tagging by category (CRM, scheduler, point-tool, etc.)

2. **Acquisition Pipeline Layer**
   - Deal pipeline tracking (sourcing → LOI → diligence → closed)
   - Silent acquisition criteria enforcement
   - Standardized data room & diligence checklist

3. **Absorption Engine**
   - Feature absorption decision tree (absorb vs ignore)
   - Product shutdown & brand sunset workflows
   - Customer migration playbooks & runbooks
   - Talent & IP capture plans

4. **Pricing & Market Control Layer**
   - Pricing neutralization workflows
   - Tier mapping templates
   - Discount dismantling schedules

5. **Data & Moat Layer**
   - Ingestion pipelines for:
     - product usage events
     - billing history
     - job/pricing data
   - Centralized models and dashboards for acquisition ROI & moat depth

6. **Compliance & Risk Guardrails**
   - Anti-trust safe language & configuration
   - Rules around opt-ins, migrations, and exclusivity

### 1.2 Operating Model

- Internally, this is run as a **continuous M&A product**:
  - Always-on sourcing of A/B/C/D competitors
  - Standard templates for every phase
  - Clear handoffs between BD, Product, Eng, CS, and Legal
- The **product and data infrastructure** is designed so that:
  - Any acquired system can be mapped to SmartSend’s core data schema quickly
  - Any customer can be migrated with minimal friction
  - Any brand can be sunset on a predictable timeline

---

## 2. Competitor Classification Matrix (System)

### 2.1 Data Model: Competitor Registry

We create a `competitors` registry in our internal DB (can live in our existing `orgs`/`accounts` schema or as its own schema):

- **Table `competitors`**
  - `id`: UUID
  - `name`: text
  - `category`: enum (`"feature_tool" | "vertical_saas" | "crm" | "scheduler" | "review_tool" | "other"`)
  - `segment`: enum (`"roofing_only" | "multi-trade" | "general_contractor" | "horizontal"`)
  - `classification_bucket`: enum (`"A_feature_tool" | "B_vertical_saas_weak_moat" | "C_strong_brand_weak_product" | "D_true_threat"`)
  - `primary_geo`: text
  - `est_customers`: integer (rough estimate)
  - `est_arr`: numeric
  - `price_positioning`: enum (`"cheap" | "mid" | "premium"`)
  - `moat_strength`: enum (`"weak" | "medium" | "strong"`)
  - `ops_depth`: enum (`"shallow" | "medium" | "deep"`)
  - `data_depth`: enum (`"shallow" | "medium" | "deep"`)
  - `founder_fatigue_score`: integer (0–10, manually assessed)
  - `product_quality_score`: integer (0–10)
  - `brand_strength_score`: integer (0–10)
  - `integration_depth_with_roofer_ops`: enum (`"low" | "medium" | "high"`)
  - `status`: enum (`"watched" | "active_pipeline" | "acquired" | "passed"`)
  - `notes`: text

- **Table `competitor_signals`**
  - `id`: UUID
  - `competitor_id`: FK to `competitors`
  - `type`: enum (`"funding" | "price_change" | "feature_launch" | "outage" | "layoffs" | "churn_rumor" | "strategic_review" | "other"`)
  - `source`: text (link or description)
  - `signal_strength`: enum (`"weak" | "medium" | "strong"`)
  - `created_at`: timestamp
  - `notes`: text

### 2.2 Classification Logic

- **Bucket A — Feature Tools**
  - `category in ("feature_tool", "scheduler", "review_tool")`
  - `moat_strength = "weak"`
  - `ops_depth != "deep"`

- **Bucket B — Vertical SaaS (Weak Moat)**
  - `category = "vertical_saas"`
  - `segment = "roofing_only"`
  - `moat_strength = "weak" or "medium"`
  - `ops_depth != "deep"`

- **Bucket C — Strong Brand, Weak Product**
  - `brand_strength_score >= 8`
  - `product_quality_score <= 6`

- **Bucket D — True Threat**
  - `moat_strength = "strong"`
  - `ops_depth = "deep"`
  - `data_depth = "deep"`

We build an internal **Competitor Matrix dashboard** in the analytics UI:
- Matrix view with **X-axis**: Product/Ops Depth, **Y-axis**: Brand Strength
- Color by classification bucket A/B/C/D
- Quick filters for: `roofing_only`, ARR band, fatigue score

---

## 3. Silent Acquisition Criteria Engine

### 3.1 Eligibility Rules (Systematized)

We codify the “buy boredom, not brilliance” criteria into an **eligibility score** stored on `competitors` and updated via internal tooling:

- **Eligibility conditions** (boolean flags on `competitors`):
  - `has_paying_customers` (required)
  - `has_churn_or_plateau` (required)
  - `lacks_deep_ops_integration` (required; derived from `integration_depth_with_roofer_ops != "high"`)
  - `founders_tired_or_stuck` (required; manual assessment field)
  - `price_multiple_under_2x_arr` (required; based on indicative expectation)

- **Eligibility score**
  - `eligibility_score` (0–100) computed by internal script or SQL view:
    - +20 if `has_paying_customers`
    - +20 if `has_churn_or_plateau`
    - +15 if `lacks_deep_ops_integration`
    - +25 if `founder_fatigue_score >= 7`
    - +20 if `price_multiple_under_2x_arr`

**Rule**: Only show as **“Acquisition Candidate”** in the pipeline view when `eligibility_score >= 70` and classification bucket is A/B/C.

### 3.2 Deal Pipeline Tracking

We add an internal **Acquisition Pipeline** (e.g., in a `acquisition_deals` table):

- `id`: UUID
- `competitor_id`: FK
- `stage`: enum (`"sourcing" | "contacted" | "exploring" | "LOI" | "diligence" | "closing" | "closed_won" | "closed_lost"`)
- `deal_type`: enum (`"feature_acq" | "product_rollup" | "brand_rollup" | "talent_acq" | "strategic_partner"`)
- `indicative_price_multiple`: numeric
- `estimated_arr`: numeric
- `flag_silent_acquisition`: boolean (must be true by default)
- `expected_timeline_months`: integer
- `lead_internal_sponsor`: text
- `created_at`, `updated_at`

We build an **internal pipeline board** (similar to deals CRM) where:
- Only internal admins can see it
- Each deal shows:
  - classification bucket
  - eligibility score
  - expected acquisition outcome (feature absorption, brand sunset, etc.)

No public communication is generated from this system—**all views are internal only**.

---

## 4. Feature Absorption vs Product Shutdown Engine

### 4.1 Decision Tree (Operationalized)

For each acquired product, we record a **Product Absorption Plan**.

- Table `acquired_products`:
  - `id`: UUID
  - `competitor_id`: FK
  - `name`: text
  - `user_count`: integer
  - `core_use_cases`: text
  - `feature_value_score`: integer (0–10)
  - `brand_value_score`: integer (0–10)
  - `team_value_score`: integer (0–10)
  - `tech_value_score`: integer (0–10)
  - `decision_feature`: enum (`"absorb" | "ignore"`)
  - `decision_brand`: enum (`"sunset_fast" | "sunset_slow" | "retain_sub_brand"`)
  - `decision_team`: enum (`"retain_key" | "selective" | "none"`)
  - `decision_tech`: enum (`"migrate_data_kill_code" | "integrate" | "retain_isolated"`)
  - `target_smartsend_feature_area`: enum (e.g., `"inbox" | "pipeline" | "scheduling" | "analytics" | "billing" | "other"`)
  - `planned_shutdown_date`: date (for UI shutdown)
  - `status`: enum (`"planning" | "in_progress" | "completed"`)

**Decision rules**:

- **Feature valuable? → absorb into SmartSend**
  - `feature_value_score >= 7` → `decision_feature = "absorb"`

- **Brand valuable? → sunset slowly**
  - `brand_value_score >= 7` → `decision_brand = "sunset_slow"` with 6–12 month horizon

- **Team valuable? → hire selectively**
  - `team_value_score >= 7` → `decision_team = "retain_key"`

- **Tech valuable? → migrate data, kill code**
  - `tech_value_score >= 6` and `feature_value_score < 7` → `decision_tech = "migrate_data_kill_code"`

### 4.2 Feature Absorption Implementation

For each feature being absorbed:
- Map it to an existing **SmartSend feature area**.
- Define an **equivalence map**:
  - `old_feature_name` → `smartsend_feature_name`
  - `old_event_type` → `smartsend_event_type`

We create a `feature_mappings` config (could live as a JSON/YAML in repo or DB table) used by:
- **Template migration scripts**
- **UI tooltips** that explain “this was called X in [old tool], here it’s Y in SmartSend.”

### 4.3 Product Shutdown Workflow

We standardize a **Product Shutdown Workflow** per acquired product:

- Stage 1 — **Freeze roadmap**
  - Mark product as **maintenance mode only** in internal tools.

- Stage 2 — **Interoperability bridge**
  - Build one-way syncs or export tools into SmartSend (contacts, jobs, templates, sequences, analytics).

- Stage 3 — **Migration window**
  - Offer white-glove migration.
  - Enable “Migrate to SmartSend” call-to-actions in the acquired product UI.

- Stage 4 — **Read-only mode**
  - Disable new signups.
  - Existing users see banners and links to SmartSend.

- Stage 5 — **Shutdown**
  - Turn off core functionality after agreed date.
  - Keep data access via SmartSend.

All these stages and dates are recorded in `acquired_products` and surfaced in an internal **Acquisition Command Center** dashboard.

---

## 5. Customer Migration Without Churn

### 5.1 Migration Promise

We codify the migration play into a standard Customer Narrative:
- Honor existing pricing for a defined period
- Personal onboarding
- Clear mapping of old → new
- Immediate value demonstration

This is implemented as:

- **Standard Email + In-App Messaging Templates**:
  - "You’re not losing software. You’re upgrading infrastructure."
  - Emphasis on continuity of data and support

### 5.2 Migration Mechanics

For each acquisition:

1. **Pricing Mirror Period**
   - `mirror_pricing_until`: date field per acquired account (in `orgs` or `subscriptions` table)
   - Logic in billing to **override SmartSend list price** with old competitor pricing until this date.

2. **White-Glove Onboarding Flag**
   - `requires_white_glove_onboarding`: boolean on each migrated customer.
   - Triggers **tasks** in CS tooling to:
     - schedule onboarding calls
     - perform data verification

3. **Feature Map UX**
   - The `feature_mappings` from §4.2 drives:
     - onboarding checklist: “In [Old Tool], you used X; in SmartSend, you’ll use Y.”
     - help center articles for that acquisition

4. **Churn Guardrails**
   - For the first 90 days post-migration, any **churn request** from acquired customers triggers:
     - additional review workflow (requires manager approval)
     - optional **retention offer** (credits, extra onboarding, etc.)

### 5.3 Migration Metrics

We track per-acquisition:

- `migration_rate` = % of existing competitor customers activated in SmartSend
- `churn_90d` = churn within 90 days post-migration
- `expansion_180d` = expansion revenue in 6 months
- `csat_after_migration` = satisfaction scores from targeted surveys

These metrics feed an **Acquisition ROI Dashboard**.

---

## 6. Talent & IP Capture Playbook

### 6.1 Talent Mapping

For each acquisition, we create a **Talent Inventory**:

- `acquired_people` table:
  - `id`: UUID
  - `acquisition_id`: FK
  - `role`: enum (`"founder" | "pm" | "engineer" | "support" | "sales" | "cs" | "other"`)
  - `ops_experience_level`: enum (`"low" | "medium" | "high"`)
  - `will_join_smartsend`: boolean
  - `target_team`: text (e.g., `"product_ops"`, `"roofing_ai"`)
  - `engagement_type`: enum (`"full_time" | "contract" | "advisor"`)

We prioritize:
- **Ops-savvy PMs** → Product & playbooks
- **Industry-experienced engineers** → deep integrations
- **Customer-obsessed support leads** → CS & onboarding

### 6.2 IP Inventory

We log all IP assets into an `acquired_ip_assets` table:

- `id`: UUID
- `acquisition_id`: FK
- `type`: enum (`"code" | "data" | "brand" | "domain" | "documentation" | "playbook" | "other"`)
- `description`: text
- `priority`: enum (`"high" | "medium" | "low"`)
- `status`: enum (`"to_review" | "integrating" | "integrated" | "archived"`)

Rules:
- **Brains over brands**: prioritize bringing over expertise, data, and playbooks rather than entire organizations.
- Keep founders either:
  - **short-term** for transition
  - or **clean exit** with clear handoff.

---

## 7. Pricing Neutralization Strategy

### 7.1 Immediate Post-Acquisition Pricing Rules

For each acquired customer:

- `legacy_pricing_source`: enum (`"competitor_X" | ...`)
- `legacy_monthly_price`: numeric
- `pricing_neutralization_status`: enum (`"mirrored" | "transitioning" | "fully_on_smartsend"`)

Rules:

1. **Freeze Competitor Pricing**
   - For a defined period (e.g., 6–12 months), mirror old pricing using `legacy_monthly_price`.
2. **Migrate to SmartSend Tiers**
   - Map usage & features to nearest SmartSend tier.
   - After mirror period, shift to SmartSend pricing structure.
3. **Show ROI Justification**
   - Deliver in-product dashboards showing:
     - increased booked jobs
     - fewer missed leads
     - higher close rates
   - Use this to rationalize price uplift.
4. **Remove Discounts Quietly**
   - As contracts renew, fold temporary discounts into standard pricing.

**Market effect**: Price wars end because **there is no independent competitor left** in that slice.

---

## 8. Brand Sunset Framework

### 8.1 Sunset Timeline Model

For brands with meaningful recognition (Bucket C):

- **Month 0–3: “Powered by SmartSend”**
  - Co-branding in UI: “Powered by SmartSend” footer/badge.
  - Shared support + help center content.

- **Month 3–6: “Migrating to SmartSend”**
  - UI banners and emails: “We’re upgrading to SmartSend.”
  - One-click migration buttons.

- **Month 6+: Brand Retired**
  - Domain redirects to SmartSend.
  - Brand exists only as historical note in legal docs.

All key dates per brand stored in:

- `brand_sunsets` table:
  - `id`: UUID
  - `competitor_id`: FK
  - `phase_1_start`, `phase_1_end`
  - `phase_2_start`, `phase_2_end`
  - `phase_3_start`
  - `status`: enum (`"co_branded" | "migrating" | "retired"`)

### 8.2 Customer Experience Guardrails

Messaging principle:
- **No abandonment, only upgrade.**

We template:
- Email sequences
- In-app banners
- Help center articles

All emphasize:
- continuity of data
- continuity of support
- tangible new capabilities on SmartSend

---

## 9. Data Consolidation & Moat Deepening

### 9.1 Data Types Ingested

Every acquisition must ship **data ingestion** before or in parallel with UI changes:

- **Historical job data**
  - jobs, estimates, invoices, schedules
- **User behavior patterns**
  - logins, feature usage, sequences run, reply rates
- **Pricing benchmarks**
  - line-item prices, regional patterns, discounting behavior
- **Failure cases**
  - dropped leads, lost jobs, non-responsive customers

### 9.2 Ingestion Architecture

We build a **standard ingestion pipeline** per acquired system:

1. **Export Layer**
   - ETL scripts or APIs pulling from acquired system.
2. **Staging Layer**
   - Raw tables in a **`acquisitions_raw`** schema.
3. **Normalization Layer**
   - Transform scripts mapping to SmartSend’s core tables: `leads`, `jobs`, `emails`, `sequences`, etc.
4. **Attribution Layer**
   - Tag rows with `source_acquisition_id` and `legacy_system_id`.

### 9.3 Moat Metrics

We compute per acquisition:

- **Data depth increase**
  - # of new jobs, # of new leads, # of new pricing events
- **Coverage expansion**
  - # of new zip codes / regions now covered
- **Model improvement**
  - lifts in AI models (reply prediction, scheduling optimization, pricing recommendations) after adding data.

These feed a **Moat Dashboard** showing how each acquisition widens SmartSend’s advantage.

---

## 10. Regulatory & Anti-Trust Awareness

### 10.1 Guardrail Rules

We bake compliance into language and configuration:

- No forced migrations: always allow an **opt-out** path.
- No exclusivity contracts preventing roofers from using other software.
- No public monopolistic language in marketing or sales.
- Internal docs and dashboards frame this as **“preferred provider”** and **“standard infrastructure”**, not monopoly.

### 10.2 Implementation

- All **external-facing copy** for acquisitions passes through a **compliance review** checklist.
- Internal tools avoid:
  - labels like “market kill,” “monopoly,” “kill zone.”
  - Instead: “standardization,” “consolidation,” “preferred platform.”

---

## 11. Acquisition Command Center (Internal UI)

We implement an internal **Command Center** inside SmartSend (admin-only):

- **Views**:
  - Competitor Matrix (A/B/C/D grid)
  - Acquisition Pipeline (deal stages)
  - Migration Progress per acquisition
  - Brand Sunset timelines
  - Data Moat metrics

- **Users**:
  - Founders, strategy
  - Product & Eng leads
  - CS leadership

- **Primary KPIs**:
  - # of acquisitions by bucket
  - Migration rate vs churn for each
  - Net ARR added
  - Moat depth indicators

---

## 12. Rollout Plan

### 12.1 Phase 1 — Foundation (0–60 days)

- Implement `competitors` registry and classification matrix.
- Build basic internal dashboard for A/B/C/D buckets.
- Define eligibility scoring and acquisition pipeline tables.
- Draft standard legal and comms templates.

### 12.2 Phase 2 — First Acquisitions (60–180 days)

- Target **A & B bucket** companies with high eligibility scores.
- Run 1–3 small acquisitions to:
  - test migration playbook
  - test brand sunset framework
  - validate the pricing neutralization workflow.

### 12.3 Phase 3 — Scale & Normalize (180–540 days)

- Systematize ingestion and migration tooling.
- Establish predictable timelines:
  - data ingestion (< 30 days)
  - customer migration window (90 days)
  - brand sunset (6–12 months).
- Integrate moat metrics into core company dashboards.

### 12.4 Phase 4 — Market Absorption

- Repeat the cycle until:
  - feature tools disappear into SmartSend
  - weak vertical SaaS tools roll up
  - strong legacy brands point into SmartSend as the backend
- The roofer’s default question becomes:
  - **“How fast can we get on SmartSend?”**

---

## 13. Success Definition

SmartSend knows BLOCK 264100 is working when:

- Roofers report: “All our old tools just… disappeared into SmartSend.”
- Independently:
  - churn for acquired customers is **lower** than baseline
  - acquisitions increase **data depth** and model performance
  - competitors stop engaging in price wars because there is **no meaningful alternative** in the roofing vertical.

At that point, SmartSend is not just another SaaS—it is the **infrastructure layer** for roofing operations, and competitors are simply **inventory** fueling the moat.










