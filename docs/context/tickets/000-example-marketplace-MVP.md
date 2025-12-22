# Template Marketplace – MVP
## Goal & Why
Differentiate + retention via sharable templates; drives Pro conversion.

## Smallest Valuable Slice
- Public browse list (title, tags, last updated)
- Detail page (preview + variables list)
- Save to "My Templates"

Out of scope: payments/revenue share, reviews.

## UX Notes
- Empty states; loading skeletons; error toasts.

## Data Model & Policies
Tables: templates(id, owner_id, title, body, variables[], tags[], visibility)
RLS: owner can read/write own; public visible read for all.

## API Contract
GET /api/templates?visibility=public
GET /api/templates/:id
POST /api/templates/save (body: {templateId})

## Env / Secrets
None new for MVP.

## Test Plan
- List shows public items
- Detail renders variables
- Save works for authed user

## Rollout
Simple migration; monitor errors/logs. 