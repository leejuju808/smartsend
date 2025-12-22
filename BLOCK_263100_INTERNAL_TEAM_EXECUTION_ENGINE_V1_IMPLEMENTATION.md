# BLOCK 263100 — SmartSend Internal Team, Founder Leverage & Kill‑Mode Execution Engine v1

**STATUS: BLUEPRINT LOCKED IN — IMPLEMENTATION READY 🚀**

Build the company that builds SmartSend. This block makes sure **SmartSend itself never becomes the bottleneck** — founder is leveraged, ops are disciplined, support is a revenue shield, and everything is run on SmartSend so we practice what we preach.

---

## 🎯 Core Outcome

At BLOCK 263100, SmartSend runs like the elite roofing companies we serve:

- **Founder is a force multiplier, not the system**
- **Support and CS protect revenue, not just “close tickets”**
- **Internal execution is run on SmartSend itself (dogfooding)**
- **Churn is treated like a five‑alarm fire with a defined kill‑chain**
- **Roadmap is ruthless and aligned to roofer money, time, and risk**
- **AI Ops watches the system before customers feel pain**

Result: Roofers can say, **“These guys run their company like they tell us to run ours.”**

---

## 📦 What This Block Covers (v1 Surface Area)

1. **Founder Role Isolation** — CEO ≠ Operator ≠ Support
2. **Internal SOPs on SmartSend** — timelines, tasks, alerts, dashboards
3. **Customer Success Kill‑Chain** — health scoring + auto‑escalation
4. **Support as Revenue Protection** — not help desk, but ROI guardians
5. **Internal Metrics Mirroring Roofer Metrics** — same discipline we sell
6. **Roadmap Discipline & Feature Gatekeeping** — no feature bloat
7. **Founder Time Leverage Rules** — systemize → delegate → delete
8. **Internal AI Ops Agent** — dogfood AI before we ship it
9. **Quality Control & Release Discipline** — safe, boring releases
10. **“We Practice What We Preach” Proof Layer** — visible, provable habits

This block is **not a single feature**. It is a **company operating system** pinned to concrete artifacts inside this repo so it can be run, audited, and improved.

---

## 1️⃣ Founder Role Isolation (Founder Stops Being the System)

**Goal:** Founder never gets pulled into work a roofer would never do for life.

- **Explicit Role Stack**
  - **Vision / Strategy** → Narrative, positioning, long‑term bets, pricing power
  - **Sales Authority** → Founder‑led sales for high‑value deals, key logos, partners
  - **Product Direction** → Final call on "what we build" and "what we never build"
- **Forbidden Tasks for Founder**
  - ❌ Support tickets
  - ❌ Manual onboarding
  - ❌ CSV clean‑up, list imports, admin glue
  - ❌ Feature firefighting / debugging for individual accounts
- **Implementation Mechanics**
  - Create an **internal "Founder Guardrails" page** in the internal workspace (run on SmartSend) listing:
    - Allowed work (revenue, positioning, key product calls)
    - Forbidden work (anything a roofer would never do forever)
  - Any new founder task must be tagged as:
    - `SYSTEMIZE` → Write a micro‑SOP + checklist
    - `DELEGATE` → Assign to team w/ owner + SLA
    - `DELETE` → Explicitly decline and log why

**Acceptance:** Founder calendar is ≥80% "Leverage" blocks (strategy/sales/product), ≤20% reactive.

---

## 2️⃣ Internal SOPs — Run SmartSend on SmartSend

**Goal:** Every critical internal process runs on SmartSend like we tell roofers to run their companies.

- **Internal Workspace**
  - Dedicated **"SmartSend HQ" workspace** used only for internal operations
  - All internal sequences, tasks, and pipelines live here
- **Use SmartSend Features Internally For:**
  - **Outreach tracking** → investor updates, partner outreach, hiring outreach
  - **Onboarding timelines** → new roofer onboarding = a sequence + pipeline stage moves
  - **Customer success workflows** → health‑check tasks, QBRs, renewal motions
  - **Churn prevention** → risk alerts create tasks and sequences automatically
  - **Feature rollout tracking** → internal campaigns for early adopter cohorts
- **Concrete Artifacts (v1):**
  - `HQ – New Customer Onboarding` sequence
  - `HQ – Renewal / Expansion` sequence
  - `HQ – At‑Risk Save Motion` sequence
  - `HQ – Internal Ops Pipeline` (stages: Intake → Triaged → In Progress → Waiting on Customer → Done)

**Acceptance:** If it matters to SmartSend, there is **a SmartSend timeline where it lives.**

---

## 3️⃣ Customer Success Kill‑Chain (Zero Churn Bias)

**Goal:** Churn is treated like a fire. Every account has a health score and a defined, automatic response.

- **Health Model (v1)**
  - Inputs (from existing product analytics):
    - **Usage trend** (logins, campaigns sent, replies, pipeline movement)
    - **Time to value** (time from signup → first campaign → first reply/meeting)
    - **ROI signal** (won jobs tagged, invoices / revenue logged if available)
    - **Support history** (blocked by bugs vs. "not using it")
  - Output:
    - **Health score 0–100**
    - **Risk band**: `HEALTHY`, `WATCH`, `AT_RISK`, `CRITICAL`
- **Kill‑Chain Automation (Internal Playbook)**
  - When account enters `AT_RISK` or `CRITICAL`:
    - **AUTO‑ACTION:**
      - Create **CS task** in `HQ – Internal Ops Pipeline` with SLA (24–48h)
      - Send **ROI summary email** to owner (what they’ve gotten so far)
      - Attach **suggested fix** (playbook link + recommended calls/sequences)
- **Implementation Details (non‑code v1):**
  - Define **manual health scoring rubric** in a doc (then automate later)
  - Weekly **"Churn War Room"** review of all `AT_RISK`/`CRITICAL` accounts
  - Every lost account gets a **post‑mortem** logged with cause + prevention note

**Acceptance:** No account quietly churns without:
1) A visible health drop, and 2) A concrete, timestamped save attempt.

---

## 4️⃣ Support = Revenue Protection (Not Ticket Triage)

**Goal:** Support protects revenue and trust. Every interaction moves a roofer closer to ROI, not just closure.

- **Support Positioning**
  - Internal language: **"Revenue Protection"**, not "Support"
  - SLAs defined by **revenue impact**, not "priority labels"
- **Support Principles**
  - Never say: "That’s not supported."
  - Always say: **"Here’s how SmartSend handles that."** (or "Here’s the closest pattern, and what’s on the roadmap.")
- **Implementation Mechanics:**
  - All support conversations are **tied to accounts and timelines** in SmartSend (no orphan tickets)
  - For every resolved issue, support selects:
    - **Impact tag**: `UNBLOCKED_USAGE`, `PREVENTED_CHURN`, `EXPANSION_OPP`, `BUG_WORKAROUND`
    - **Owner**: CS / Product for follow‑through if needed
  - Support has **clear escalation paths**:
    - Product bug → product owner with SLA
    - Missing primitive → roadmap triage
    - Training gap → CS playbook / Loom recorded

**Acceptance:** Support dashboard can answer: **“What revenue did we protect this week?”**

---

## 5️⃣ Internal Metrics That Mirror Roofer Metrics

**Goal:** We hold ourselves to the **same metrics** we expect from roofers, so the product and culture stay aligned.

- **Mirror Metrics (Internal ↔ Roofer)**
  - **Response SLAs** ↔ Lead response time / homeowner response time
  - **Onboarding time** ↔ Time from contract signed → first install / first check
  - **Customer ROI achieved** ↔ Jobs won, revenue touched by SmartSend
  - **Churn causes** ↔ Internal post‑mortem categories
  - **Feature adoption** ↔ How many customers are actually using Block‑level features
- **Implementation Mechanics (v1):**
  - Build an **"HQ – Internal Ops Dashboard"** (run on existing analytics infra) with tiles for:
    - Time to onboard new accounts
    - % of accounts using key SmartSend pillars (Sequences, Inbox, Pipeline, Payments, etc.)
    - Support SLA performance
    - Churn by cause (and whether a kill‑chain was executed)
  - Review this dashboard in the **same weekly rhythm** we recommend to roofers.

**Acceptance:** We can show a roofer **our own numbers** when we tell them what "good" looks like.

---

## 6️⃣ Roadmap Discipline & Feature Gatekeeping

**Goal:** No feature bloat. Every build increases money, time saved, or reduced chaos for roofers.

- **Hard Gatekeeping Questions**
  - Does this **make roofers more money?**
  - Does this **save roofers meaningful time?**
  - Does this **reduce risk or chaos** in their operation?
  - If not → **killed immediately** or parked in an explicit "Not Now / Not Ever" list.
- **Implementation Mechanics:**
  - Every roadmap item must have:
    - **Block ID** it rolls up into (e.g., 26110, 253300, 255100, 263100)
    - **Primary value axis**: Money / Time / Risk
    - **Customer quotes or usage data** supporting the need
  - **Feature council**: Product + CS + Support + Founder. No single person can sneak in a pet feature.
  - Maintain a **"Graveyard"** of killed ideas with reasons → protects focus.

**Acceptance:** Roadmap doc is a **ranked list of bets**, not a dumping ground of ideas.

---

## 7️⃣ Founder Time Leverage Rules

**Goal:** Founder stays in kill mode — only high‑leverage, non‑replaceable work.

- **Allowed Work**
  - Deep sales conversations with whales / marquee brands
  - Category narrative, pricing strategy, and market positioning
  - Deciding **which** problems become blocks and which are ignored
  - Negotiating strategic partnerships / distribution
- **Everything Else:**
  - **SYSTEMIZE** → Write a 1‑page SOP and checklist
  - **DELEGATE** → Assign to a functional owner with a metric
  - **DELETE** → If it doesn’t move revenue, positioning, or learning
- **Implementation Mechanics:**
  - Founder has **weekly time audit**: calendar is tagged by work type and reviewed in a 15‑min block
  - Any recurring low‑ROI task is documented once, then delegated or killed

**Acceptance:** There is a written **"Founder Leverage SOP"** and a simple audit log proving we follow it.

---

## 8️⃣ Internal AI Ops Agent (Dogfood the Product)

**Goal:** SmartSend’s own AI Ops agent watches our system the same way we promise to watch a roofer’s.

- **Responsibilities (v1):**
  - **Flags churn risk**: accounts whose usage/ROI/CS signals look bad
  - **Suggests roadmap priorities** based on repeated pain in support and CS notes
  - **Detects support bottlenecks**: queues backing up, repeated questions
  - **Predicts infra strain**: send volumes, storage, and heavy blocks that may need scaling
- **Implementation Concept (anchored in this repo, even if incremental):**
  - Input data sources:
    - Existing product analytics tables
    - Support/CS timelines tagged by account
    - Billing/usage events
  - Agent runs as a **scheduled job** (cron / server job) that:
    - Reads signals
    - Produces a **daily "HQ Ops Briefing"** summary into the internal workspace (SmartSend sequence or dashboard note)
    - Logs "alerts" that can be clicked into timelines/tasks
- **Dogfooding Rule:**
  - **Any AI capability we sell to roofers must first be used internally for at least one full sprint** before GA.

**Acceptance:** There is a **single place** where the AI ops agent’s daily briefing lands, and we actually read it.

---

## 9️⃣ Quality Control & Release Discipline

**Goal:** SmartSend updates are boring in the best way: **no surprise outages, no chaos for roofers.**

- **Release Rules (v1):**
  - All major changes behind **feature flags by tier** (Free, Growth, Domination, Internal)
  - **Founder / internal accounts** see changes first (dogfood window)
  - **Rollback path is defined** for every deploy (what we revert, how)
  - **No breaking changes mid‑week** for core flows (sending, inbox, billing)
- **Implementation Mechanics:**
  - Maintain a **Release Runbook**:
    - Pre‑deploy checklist
    - Post‑deploy smoke tests
    - Rollback procedure
  - Map **critical paths** (what must never break):
    - Sending engine
    - Inbox and reply detection
    - Billing, entitlement checks, login/auth

**Acceptance:** Roofers experience SmartSend as **stable and predictable**, even while we ship fast.

---

## 🔟 “We Practice What We Preach” Proof Layer

**Goal:** Make our internal discipline **visible and provable** to roofers and prospects.

- **Proof Artifacts:**
  - Screenshots / Looms of **SmartSend running SmartSend**:
    - Internal onboarding timeline
    - Internal CS kill‑chain pipeline
    - Internal ops dashboard mirroring roofer metrics
  - Case studies written from **our own internal use** of sequences, pipeline, AI, and dashboards
- **Go‑to‑Market Hooks:**
  - Sales line: **"We run SmartSend on SmartSend. We literally use the same playbooks you get."**
  - Support line: **"Here’s the internal dashboard we use to hold ourselves to the same SLAs."**

**Acceptance:** For any claim in marketing/sales, we can show an **internal screen or SOP** that backs it up.

---

## ✅ Block 263100 Completion Criteria (v1)

This block is considered **v1 complete** when:

1. **Founder Leverage SOP** is written, reviewed, and visible to the team.
2. **Internal SmartSend HQ workspace** runs onboarding, CS, and churn workflows.
3. **Customer Success Kill‑Chain** is defined and run for every at‑risk account.
4. **Support = Revenue Protection** is codified in a short playbook and tracked.
5. **Internal Ops Dashboard** exists mirroring key roofer metrics.
6. **Roadmap Gatekeeping** is enforced via a lightweight, repeatable process.
7. **AI Ops Agent v1** (even if manual) produces a daily/weekly HQ ops brief.
8. **Release Discipline** is written down and followed for at least one full sprint.
9. We have **at least one sales/marketing asset** proving we practice what we preach.

When these are true, SmartSend no longer risks dying from its own success. **We become the operators operating the operating system.**











