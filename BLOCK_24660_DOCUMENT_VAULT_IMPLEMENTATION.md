# Block 24660 — SmartSend Roofing Document Vault v1 Implementation

## Overview

Complete document storage, organization, and protection system for roofing jobs. This feature makes SmartSend the "all-in-one" job folder roofers always needed.

## Features Implemented

### 1. Database Schema (`supabase/migrations/20250130000001_block24660_document_vault_v1.sql`)

- **Enhanced `job_documents` table** with:
  - Expanded document categories (30+ types)
  - Folder-based organization (estimates, insurance, permits, photos, receipts, contracts, warranty, notes)
  - AI auto-categorization fields
  - Document versioning support
  - Full-text search capability
  - Document linking to other features
  - View tracking
  - Soft delete support

- **`job_document_history` table**: Complete audit trail of all document actions
- **`job_document_views` table**: Tracks who viewed which documents and when
- **`job_document_vault_summary` view**: Aggregated statistics per job

### 2. AI Auto-Categorization (`lib/ai/documentCategorizer.ts`)

- Heuristic-based fast categorization (confidence ≥ 0.85)
- AI-powered categorization for ambiguous cases using GPT-4o-mini
- Extracts structured data (claim numbers, amounts, dates, permit numbers, etc.)
- Maps document types to folder categories automatically

### 3. Enhanced Upload API (`app/api/jobs/upload-document/route.ts`)

- Auto-categorization on upload
- Extracts searchable text
- Stores extracted metadata
- Auto-links documents to Insurance Flow, Payment Tracking, etc.
- Supports multiple file uploads

### 4. Document Search (`app/api/jobs/[jobId]/documents-vault/route.ts`)

- Full-text search across documents
- Filter by folder, document type, date range
- Returns grouped results by folder
- Generates signed URLs for secure access

### 5. Enhanced UI (`app/(dashboard)/jobs/[jobId]/components/DocumentVaultTab.tsx`)

- **Folder-based organization**: 8 folders with icons and colors
- **Drag & drop upload**: Multiple files at once
- **Search functionality**: Real-time search across all documents
- **Document cards**: Enhanced with:
  - AI categorization badges
  - Extracted data badges (claim numbers, amounts, etc.)
  - Link indicators (Insurance, Payment)
  - View counts
  - Uploader information

### 6. Document Linking Service (`lib/services/documentLinking.ts`)

- Auto-links documents to Insurance Flow
- Auto-links documents to Payment Tracking
- Auto-links warranty documents to Job Health
- Manual linking functions available
- Query functions to get linked documents

### 7. Pipeline Automation (`lib/services/pipelineDocumentRequirements.ts`)

- Defines required documents per pipeline stage
- Checks if job has all required documents
- Returns missing vs. present documents
- Can be integrated into pipeline stage transitions

## Document Categories

### Estimates & Proposals
- `estimate_roofr`
- `estimate_xactimate`
- `estimate_smartsend`
- `pricing_breakdown`
- `proposal`

### Insurance Documents
- `insurance_claim_form`
- `insurance_adjuster_summary`
- `insurance_supplement`
- `insurance_approval_letter`
- `insurance_depreciation_statement`
- `insurance_acv_rcv_calculation`
- `insurance_scope_of_loss`
- `insurance_check`

### Permits & Municipal
- `permit_city`
- `permit_hoa_approval`
- `permit_inspection_status`

### Photos & Videos
- `photo_before`
- `photo_damage`
- `photo_inspection`
- `photo_crew_arrival`
- `photo_progress`
- `photo_completed`
- `video_before`
- `video_damage`
- `video_progress`
- `video_completed`

### Material Receipts
- `receipt_supplier`
- `receipt_delivery_confirmation`
- `receipt_supplemental`

### Contracts & Signatures
- `contract_signed`
- `contract_digital_signature_log`

### Warranty & Post-Job
- `warranty_manufacturer`
- `warranty_workmanship`
- `warranty_completion_certificate`

### Internal Office Notes
- `note_job`
- `note_todo`
- `note_internal_message`

## API Endpoints

### Upload Document
```
POST /api/jobs/upload-document
FormData:
  - file: File
  - job_id: string
  - doc_type: string (optional, defaults to "other" for AI categorization)
  - title: string (optional)
```

### Get Documents
```
GET /api/jobs/[jobId]/documents-vault
Query params:
  - folder: string (optional)
  - search: string (optional)
  - doc_type: string (optional)
```

### Search Documents
```
POST /api/jobs/[jobId]/documents/search
Body:
  - query: string
  - folder: string (optional)
  - docType: string (optional)
  - dateFrom: string (optional)
  - dateTo: string (optional)
  - uploadedBy: string (optional)
  - hasExtractedData: boolean (optional)
```

## Usage Examples

### Upload with Auto-Categorization
```typescript
const formData = new FormData();
formData.append("file", file);
formData.append("job_id", jobId);
formData.append("doc_type", "other"); // Let AI categorize

const res = await fetch("/api/jobs/upload-document", {
  method: "POST",
  body: formData,
});
```

### Check Pipeline Requirements
```typescript
import { getDocumentRequirementStatus } from "@/lib/services/pipelineDocumentRequirements";

const status = await getDocumentRequirementStatus(jobId);
if (!status.hasAllRequired) {
  console.log("Missing documents:", status.missing);
}
```

### Link Document to Insurance Flow
```typescript
import { linkDocumentToInsuranceFlow } from "@/lib/services/documentLinking";

await linkDocumentToInsuranceFlow(documentId, jobId, insuranceEventId);
```

## Integration Points

### Insurance Flow
- Insurance documents automatically link to Insurance Flow
- Extracted claim numbers match with insurance events
- ACV/RCV calculations update Insurance Score

### Payment Tracking
- Receipt/invoice documents automatically link to payments
- Extracted amounts match with payment records
- Payment status updates based on document presence

### Job Health Score
- Warranty documents trigger annual check-ins
- Document completeness affects job health

### Pipeline Automation
- Each stage has required documents
- System prompts roofer when documents are missing
- Prevents stage progression without required docs

## Benefits

1. **Zero Manual Organization**: AI handles categorization automatically
2. **Complete Audit Trail**: Every action is logged
3. **Search Everything**: Find documents instantly by any criteria
4. **Active Documents**: Documents link to and update other features
5. **Pipeline Integration**: Never forget required documentation
6. **Retention**: Roofers won't cancel if all their documents are in SmartSend

## Future Enhancements

- Email-to-vault auto-capture
- Supplier auto-upload integration
- Document version comparison
- Bulk operations (move, delete, tag)
- Document sharing with homeowners (Phase 2)
- Mobile app integration for crew uploads
- OCR for PDF text extraction
- Document templates






































