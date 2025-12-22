# Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1 Implementation

## ✅ Implementation Complete

This block brings official documents into SmartSend's ecosystem with full e-signature capabilities.

## 📦 What Was Built

### Database (1 file)
- ✅ `supabase/migrations/20250130000002_block22830_document_delivery_esign_v1.sql`
  - Created `job_signable_documents` table
  - Created storage buckets: `documents-original` and `documents-signed`
  - Added RLS policies
  - Created trigger function for auto-updating job status on document signing
  - Created function to update `updated_at` timestamp

### Edge Functions (2 files)
- ✅ `supabase/functions/documents-send/index.ts`
  - Inserts document record
  - Creates timeline event
  - Generates signing URL
- ✅ `supabase/functions/documents-sign/index.ts`
  - Handles signature capture (text or drawn)
  - Generates signed PDF using pdf-lib
  - Updates document status
  - Creates timeline event

### Frontend Pages (1 file)
- ✅ `app/homeowner/[token]/documents/[documentId]/page.tsx`
  - PDF preview
  - Type signature input
  - Draw signature canvas
  - Signature submission
  - Mobile-first design

### API Routes (3 files)
- ✅ `app/api/homeowner/documents/[documentId]/route.ts`
  - Token-based document access for homeowners
- ✅ `app/api/jobs/[jobId]/documents/route.ts`
  - List signable documents for a job
- ✅ `app/api/jobs/documents/upload/route.ts`
  - Upload PDF and create signable document record

### Office UI Components (1 file)
- ✅ `app/(dashboard)/jobs/[jobId]/components/SignableDocumentsTab.tsx`
  - Upload signable documents
  - View document status (sent/viewed/signed)
  - Filter by status
  - Download signed copies
  - Resend documents

## 🎯 Features

### Document Types Supported
- Estimate
- Contract
- Change Order
- Invoice
- Warranty
- Other

### Document Statuses
- **Sent** - Document sent to homeowner
- **Viewed** - Homeowner has viewed the document
- **Signed** - Document has been signed
- **Void** - Document has been voided

### Signature Methods
1. **Type Signature** - Text-based signature
2. **Draw Signature** - Canvas-based signature drawing

### Auto-Updates
When documents are signed:
- **Estimate signed** → Job status → "Scheduled"
- **Contract signed** → Job status → "Scheduled"
- **Change order signed** → Timeline event created
- **Invoice signed** → Timeline event created

## 📋 Database Schema

### `job_signable_documents` Table
```sql
- id (uuid)
- workspace_id (uuid)
- job_id (uuid)
- document_type (text): estimate, contract, change_order, invoice, warranty, other
- version (int)
- storage_path (text) - Original PDF path
- signed_storage_path (text) - Signed PDF path
- status (text): sent, viewed, signed, void
- signer_name (text)
- signer_email (text)
- signer_ip (text)
- signed_at (timestamptz)
- created_at (timestamptz)
- updated_at (timestamptz)
```

### Storage Buckets
- `documents-original/` - Original PDFs
- `documents-signed/` - Signed PDFs

Structure: `{workspace_id}/{job_id}/{doc_id}.pdf`

## 🔄 Workflow

1. **Upload Document**
   - Contractor uploads PDF via office UI
   - Document stored in `documents-original` bucket
   - Record created in `job_signable_documents` table

2. **Send to Homeowner**
   - Document sent via edge function
   - Homeowner receives link: `/homeowner/{token}/documents/{documentId}`
   - Status set to "sent"

3. **Homeowner Views**
   - Homeowner opens link
   - PDF preview shown
   - Status can be updated to "viewed" (optional)

4. **Homeowner Signs**
   - Homeowner enters name/email
   - Chooses signature method (type or draw)
   - Submits signature
   - Edge function generates signed PDF
   - Signed PDF stored in `documents-signed` bucket
   - Status updated to "signed"
   - Job status auto-updated (if applicable)

5. **Contractor Views**
   - See all documents in "E-Sign Documents" tab
   - Filter by status (all/unsigned/signed)
   - Download signed copies
   - Resend if needed

## 🚀 Deployment Steps

1. **Run Migration**
   ```sql
   -- Execute in Supabase SQL Editor
   supabase/migrations/20250130000002_block22830_document_delivery_esign_v1.sql
   ```

2. **Deploy Edge Functions**
   ```bash
   supabase functions deploy documents-send
   supabase functions deploy documents-sign
   ```

3. **Set Environment Variables**
   - Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in edge function environment

4. **Verify Storage Buckets**
   - Check that `documents-original` and `documents-signed` buckets exist
   - Verify RLS policies are active

## 📝 API Endpoints

### Edge Functions
- `POST /functions/v1/documents-send`
  - Body: `{ workspace_id, job_id, document_type, storage_path, signer_name, signer_email }`
  
- `POST /functions/v1/documents-sign`
  - Body: `{ document_id, signature_text, signature_image, signer_name, signer_ip }`

### Next.js API Routes
- `GET /api/homeowner/documents/[documentId]?token={token}`
- `GET /api/jobs/[jobId]/documents`
- `POST /api/jobs/documents/upload`

## 🎨 UI Components

### Homeowner Portal
- Clean, mobile-first design
- PDF preview with iframe
- Signature input (type or draw)
- Success/error states

### Office UI
- Upload form with document type selector
- Document list with status badges
- Filter buttons (all/unsigned/signed)
- Action buttons (view, download, resend)

## 🔐 Security

- Token-based access for homeowners (no authentication required)
- RLS policies on database tables
- Storage bucket policies restrict access by workspace
- Service role used for edge functions (bypasses RLS)

## 📊 Status Tracking

Documents track:
- When sent
- When viewed (optional)
- When signed
- Who signed (name, email, IP)
- When signed (timestamp)

## 🔗 Integration Points

- **Job Timeline** - Events added when documents sent/signed
- **Job Status** - Auto-updated when estimate/contract signed
- **Homeowner Portal** - Documents accessible via token

## 🎯 Next Steps (Future Enhancements)

- Add email notifications when documents are signed
- Add document versioning UI
- Add bulk document operations
- Add document templates
- Add signature fields positioning
- Add multiple signers support
- Add document expiration dates
- Add reminder emails for unsigned documents

## ✅ Testing Checklist

- [ ] Upload PDF document
- [ ] Send document to homeowner
- [ ] Homeowner views document
- [ ] Homeowner signs with typed signature
- [ ] Homeowner signs with drawn signature
- [ ] Download signed PDF
- [ ] Job status updates when estimate signed
- [ ] Job status updates when contract signed
- [ ] Filter documents by status
- [ ] Resend document
- [ ] View document in homeowner portal

## 📚 Related Blocks

- Block 22790 — Homeowner Portal v1 (portal infrastructure)
- Block 22310 — Job Documents Hub v1 (general document storage)







































