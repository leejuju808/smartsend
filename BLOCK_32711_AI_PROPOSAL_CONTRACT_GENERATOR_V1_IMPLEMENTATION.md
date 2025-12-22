# Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1

**Implementation Complete**

## Overview

This block implements a complete proposal-to-contract pipeline for roofing companies:
- AI-powered proposal generation
- Dynamic contract generation
- E-signature integration
- Engagement tracking
- Version control
- Job pipeline integration

## Files Created

### Database Migration
- `supabase/migrations/20250130000001_block32711_ai_proposal_contract_generator_v1.sql`
  - Extends `proposals` table with contract fields
  - Creates `proposal_versions` table for version history
  - Creates `contract_documents` table for contracts
  - Creates `proposal_engagement` table for tracking
  - Creates `proposal_templates` table for templates
  - Adds triggers for auto-versioning and job creation
  - Adds RLS policies

### Edge Functions
- `supabase/functions/create-proposal-ai/index.ts`
  - Generates AI proposals using OpenAI
  - Pulls lead and job data
  - Creates proposal with version history

- `supabase/functions/proposal-viewed/index.ts`
  - Tracks proposal engagement events
  - Updates proposal status on first view

### API Routes
- `src/app/api/proposals/create/route.ts` - Create AI proposal
- `src/app/api/proposals/list/route.ts` - List proposals
- `src/app/api/proposals/[id]/route.ts` - Get/Update proposal
- `src/app/api/proposals/[id]/track/route.ts` - Track engagement
- `src/app/api/proposals/[id]/contract/route.ts` - Convert to contract
- `src/app/api/contracts/[id]/sign/route.ts` - Sign contract

### UI Components
- `src/components/proposals/ProposalBuilder.tsx` - AI proposal generator
- `src/components/proposals/ProposalViewer.tsx` - Proposal viewer with tracking
- `src/components/proposals/ContractSigner.tsx` - E-signature component

### Pages
- `src/app/dashboard/proposals/page.tsx` - Proposals list
- `src/app/dashboard/proposals/[id]/page.tsx` - View proposal

## Features Implemented

### 1. AI-Powered Proposal Generator
- ✅ Pulls homeowner details from leads
- ✅ Pulls job data (roof type, scope, price, warranty)
- ✅ Generates professional proposal content using OpenAI
- ✅ Includes all required sections (intro, scope, deliverables, timeline, pricing, payment terms, warranty, next steps)

### 2. Dynamic Contract Generator
- ✅ Converts proposals to legally compliant contracts
- ✅ Auto-populates contractor and homeowner info
- ✅ Includes acceptance terms, cancellation rights, payment structure
- ✅ Supports insurance and storm-specific language
- ✅ Generates HTML contract (ready for PDF conversion)

### 3. Integrated E-Signature
- ✅ Canvas-based signature drawing
- ✅ Stores signature data
- ✅ Updates contract status on signing
- ✅ Mobile-friendly interface

### 4. Proposal Engagement Tracking
- ✅ Tracks when proposal is opened
- ✅ Tracks section views
- ✅ Tracks financing link clicks
- ✅ Tracks warranty section views
- ✅ Updates proposal status automatically

### 5. Proposal Versioning
- ✅ Auto-increments version on content changes
- ✅ Saves version history
- ✅ Tracks who created each version

### 6. Proposal → Job Pipeline Integration
- ✅ Auto-creates job when contract is signed
- ✅ Updates lead status to "won"
- ✅ Sets job stage to "approved"
- ✅ Sets contract value on job

## Database Schema

### Extended Tables
- `proposals` - Added: `lead_id`, `job_id`, `contractor_id`, `title`, `content`, `price`, `viewed_at`, `signed_at`, `signature_url`, `version`

### New Tables
- `proposal_versions` - Version history
- `contract_documents` - Contract storage and signatures
- `proposal_engagement` - Engagement tracking
- `proposal_templates` - Template storage

## Setup Instructions

### 1. Apply Database Migration
```bash
supabase db push
```

Or apply manually in Supabase SQL Editor:
```sql
-- Run: supabase/migrations/20250130000001_block32711_ai_proposal_contract_generator_v1.sql
```

### 2. Deploy Edge Functions
```bash
supabase functions deploy create-proposal-ai
supabase functions deploy proposal-viewed
```

### 3. Environment Variables
Ensure these are set in Supabase Dashboard → Edge Functions:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `OPENAI_API_KEY` - OpenAI API key

### 4. Usage

#### Create AI Proposal
```typescript
POST /api/proposals/create
{
  "lead_id": "uuid",
  "workspace_id": "uuid",
  "job_details": {
    "roof_type": "Asphalt Shingle",
    "scope": "Full roof replacement",
    "price": 25000,
    "warranty": "10-year workmanship, 30-year manufacturer",
    "insurance": false,
    "storm_job": false
  }
}
```

#### Track Engagement
```typescript
POST /api/proposals/[id]/track
{
  "event_type": "opened" | "section_viewed" | "financing_clicked" | "warranty_viewed",
  "section": "optional section name"
}
```

#### Convert to Contract
```typescript
POST /api/proposals/[id]/contract
{
  "contract_type": "standard" | "insurance" | "storm" | "repair"
}
```

#### Sign Contract
```typescript
POST /api/contracts/[id]/sign
{
  "signature_data_url": "data:image/png;base64,...",
  "signed_by_name": "John Doe",
  "signed_by_email": "john@example.com"
}
```

## Integration Points

### With Job Pipeline
When a contract is signed:
1. Proposal status → "signed"
2. Lead status → "won"
3. Job created (if doesn't exist) or updated
4. Job stage → "approved"
5. Contract value set on job

### With Lead System
- Proposals linked to leads
- Engagement tracked per proposal
- Status updates flow to leads

## Next Steps (Future Enhancements)

1. **PDF Generation**: Integrate with PDF service (Puppeteer, @react-pdf/renderer, or PDFShift)
2. **Email Integration**: Auto-send proposals via email
3. **Template Customization**: UI for editing proposal templates
4. **Advanced Analytics**: Dashboard for proposal performance
5. **Financing Integration**: Connect with financing providers
6. **Mobile App**: Native mobile signature experience

## Notes

- The contract HTML generation is basic - in production, use a proper PDF generation service
- Signature storage is currently in database - consider moving to storage bucket for large signatures
- Engagement tracking is lightweight - can be enhanced with more detailed analytics
- Version history is automatic - no manual version management needed

## Testing

1. Create a proposal for a lead
2. View the proposal (should track engagement)
3. Convert proposal to contract
4. Sign the contract
5. Verify job was created/updated
6. Verify lead status changed to "won"

---

**Status**: ✅ Complete
**Date**: 2025-01-30
**Block**: 32711

































