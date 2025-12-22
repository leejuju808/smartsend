# Block 25540 — SmartSend Roofing Warranty & Document Vault v1 Implementation

## ✅ Implementation Complete

This block implements a comprehensive warranty automation and document vault system that makes SmartSend the "brain + memory system" for roofing companies.

## 📦 What Was Built

### 1. Database Migration
**File:** `supabase/migrations/20250130000001_block25540_warranty_document_vault_v1.sql`

#### Enhanced Tables:
- **`warranty_packages`** - Enhanced with comprehensive warranty package fields:
  - Manufacturer warranty document reference
  - Workmanship warranty document reference
  - Material list document reference
  - Before/after photo arrays
  - Install date, crew info, ventilation/underlayment details
  - SmartSend Job ID for fast lookup
  - Homeowner portal link

#### New Tables:
- **`crew_documentation_requirements`** - Tracks required photos before job completion:
  - Required photo categories (underlayment, decking, flashing, vents, cleanup)
  - Status tracking for each category
  - Document IDs that satisfy requirements
  - Auto-calculated `all_requirements_met` flag

- **`insurance_file_folders`** - Organized folders for insurance documents:
  - Scope of loss
  - Adjuster notes
  - ACV payment
  - Depreciation payment
  - Supplements submitted/approved
  - Permits, contracts, communication log

- **`job_document_requirements`** - Tracks missing documents for owner dashboard:
  - Required photos
  - Insurance paperwork
  - Warranty info
  - Signed contract
  - Completion photos
  - Material invoice
  - Permit documents

- **`document_search_index`** - Enhanced search index:
  - Homeowner name, address, job number
  - Insurance carrier, claim number
  - Shingle color, crew name
  - Full-text search content

#### Functions Created:
1. **`generate_comprehensive_warranty_package(p_job_id)`**
   - Auto-generates warranty package when job is marked as paid
   - Includes manufacturer warranty, workmanship warranty, material list
   - Collects before/after photos
   - Creates/updates homeowner portal link
   - Adds timeline events

2. **`check_crew_documentation_requirements(p_job_id)`**
   - Checks if all required crew documentation is uploaded
   - Validates photo categories
   - Returns boolean indicating if job can be completed

3. **`sync_document_timeline()`**
   - Trigger function that adds timeline events when documents are uploaded
   - Updates document search index
   - Updates crew documentation status

4. **`update_document_search_index(p_document_id)`**
   - Updates search index when documents are added/updated
   - Extracts searchable content from documents and job data

5. **`update_crew_documentation_status(p_job_id, p_document_id, p_doc_type)`**
   - Updates crew documentation requirements when photos are uploaded
   - Automatically marks categories as complete

6. **`sync_job_document_requirements(p_job_id)`**
   - Syncs document requirements for owner dashboard
   - Checks all requirement types and updates status

#### Views Created:
- **`owner_document_dashboard`** - Shows missing documents across all jobs:
  - Job title, homeowner name, address
  - Missing requirement count
  - Array of missing requirement types
  - Last checked timestamp

### 2. API Routes

#### `/api/jobs/[jobId]/warranty-package`
- **GET**: Get warranty package for a job
  - Returns warranty package with all documents and photos
  - Includes signed URLs for secure access
  
- **POST**: Generate or regenerate warranty package
  - Calls comprehensive warranty generation function
  - Returns warranty ID and success status

#### `/api/jobs/[jobId]/crew-documentation`
- **GET**: Get crew documentation requirements status
  - Returns requirements record
  - Checks if all requirements are met
  
- **POST**: Update crew documentation requirements
  - Upserts requirements for a job
  - Allows customization of required photo categories

#### `/api/dashboard/document-requirements`
- **GET**: Owner document dashboard
  - Returns all jobs with missing documents
  - Summary statistics (total jobs with missing docs, total missing requirements)
  - Requirements grouped by type

#### `/api/jobs/documents/search`
- **GET**: Document search engine
  - Full-text search across all documents
  - Filter by homeowner name, address, job number
  - Filter by insurance carrier, claim number
  - Filter by shingle color, crew name
  - Filter by document type and category folder
  - Returns signed URLs for document access

### 3. Homeowner Portal Enhancements

#### Edge Function Updates
**File:** `supabase/functions/homeowner-portal-data/index.ts`

- Enhanced document loading:
  - Gets documents from `job_documents` table
  - Generates signed URLs for secure access
  - Includes document metadata and categories

- Warranty package loading:
  - Fetches comprehensive warranty package
  - Gets manufacturer/workmanship warranty documents
  - Gets material list
  - Collects before/after photos
  - Generates signed URLs for all documents

#### Frontend Components

**File:** `app/homeowner/[token]/components/WarrantyPackageSection.tsx`
- New component displaying warranty package:
  - Installation details (date, shingle brand/color)
  - Warranty documents with download buttons
  - Before/after photo galleries
  - Additional details (ventilation, underlayment)
  - Portal link for future access

**File:** `app/homeowner/[token]/page.tsx`
- Updated to include warranty package section
- Displays warranty package prominently above documents section

### 4. Integration Updates

**File:** `app/api/jobs/[jobId]/completion-engine/route.ts`
- Updated to call `generate_comprehensive_warranty_package` instead of basic function
- Triggers warranty generation when final invoice is marked as paid

## 🎯 Key Features

### 1. Warranty Automation (v1)
✅ Auto-generates warranty package when job is marked as paid
✅ Includes manufacturer warranty, workmanship warranty, material list
✅ Collects before/after photos automatically
✅ Creates homeowner portal link
✅ Adds timeline events

### 2. Homeowner Document Portal
✅ Secure portal link with all documents
✅ Warranty package prominently displayed
✅ All job documents organized by category
✅ Downloadable warranty documents
✅ Photo galleries (before/after)
✅ Installation details and specifications

### 3. Crew Documentation Requirements
✅ Blocks job completion until required photos uploaded
✅ Tracks: underlayment, decking, flashing, vents, cleanup photos
✅ Auto-updates when photos are uploaded
✅ Validates photo categories

### 4. Insurance File Management
✅ Organized folders for insurance documents
✅ Tracks: scope of loss, adjuster notes, ACV/depreciation payments
✅ Supplements tracking (submitted/approved)
✅ Permits, contracts, communication log

### 5. Owner Document Dashboard
✅ Shows all jobs with missing documents
✅ Summary statistics
✅ Requirements grouped by type
✅ Quick identification of compliance issues

### 6. Document Search Engine
✅ Full-text search across all documents
✅ Filter by homeowner, address, job number
✅ Filter by insurance carrier, claim number
✅ Filter by shingle color, crew name
✅ Filter by document type and category
✅ Returns signed URLs for secure access

### 7. Document Timeline Sync
✅ Every file upload adds to job timeline
✅ Document type determines event message
✅ Links documents to timeline events
✅ Complete audit trail

### 8. Forever File Vault
✅ All documents stored permanently
✅ Homeowners rely on SmartSend for warranty needs
✅ Retention-boosting feature
✅ Documents accessible via portal link forever

## 🔄 How It Works

### Warranty Package Generation Flow:
1. Job is marked as paid (final invoice paid)
2. `generate_comprehensive_warranty_package` is called
3. Function collects:
   - Manufacturer warranty document
   - Workmanship warranty document
   - Material list document
   - Before photos
   - After photos
   - Job details (install date, crew, shingle info)
4. Creates/updates homeowner portal
5. Generates SmartSend Job ID
6. Creates warranty package record
7. Adds timeline event
8. Updates completion tracking

### Crew Documentation Flow:
1. Job is created → `crew_documentation_requirements` record created
2. Crew uploads photos → `sync_document_timeline` trigger fires
3. Trigger calls `update_crew_documentation_status`
4. Status updated based on photo category
5. Before job completion → `check_crew_documentation_requirements` validates
6. If requirements not met → job completion blocked

### Document Search Flow:
1. Document uploaded → `sync_document_timeline` trigger fires
2. Trigger calls `update_document_search_index`
3. Search index updated with:
   - Document content
   - Job details (homeowner, address, etc.)
   - Insurance info
   - Shingle/crew info
4. Search API queries index with filters
5. Returns matching documents with signed URLs

## 📊 Database Schema

### Key Relationships:
- `warranty_packages` → `job_documents` (manufacturer_warranty, workmanship_warranty, material_list)
- `warranty_packages` → `homeowner_portals` (via homeowner_portal_link)
- `crew_documentation_requirements` → `roofing_jobs`
- `insurance_file_folders` → `roofing_jobs`
- `job_document_requirements` → `roofing_jobs`
- `document_search_index` → `job_documents` → `roofing_jobs`

## 🚀 Usage Examples

### Generate Warranty Package:
```typescript
POST /api/jobs/{jobId}/warranty-package
```

### Check Crew Documentation:
```typescript
GET /api/jobs/{jobId}/crew-documentation
```

### Owner Dashboard:
```typescript
GET /api/dashboard/document-requirements?workspace_id={workspaceId}
```

### Search Documents:
```typescript
GET /api/jobs/documents/search?workspace_id={workspaceId}&q=roof&homeowner_name=Smith
```

## 🎉 Benefits

### For Roofers:
- ✅ Zero manual warranty work
- ✅ Zero missing warranties
- ✅ Zero homeowner confusion
- ✅ Perfect compliance and operational discipline
- ✅ Protection against lawsuits and disputes
- ✅ Faster supplements and warranty claims
- ✅ Professional homeowner experience
- ✅ Fewer callbacks and more 5-star reviews

### For Homeowners:
- ✅ Single link to access all documents
- ✅ Warranty package always available
- ✅ Before/after photos included
- ✅ Installation details documented
- ✅ Forever file vault

### For SmartSend:
- ✅ Massive retention feature (Forever File Vault)
- ✅ Makes SmartSend irreplaceable
- ✅ "Brain + memory system" positioning
- ✅ Locks in customers for years

## 📝 Next Steps

1. **Warranty PDF Generation**: Create PDF generator for warranty packages
2. **Email Delivery**: Auto-email warranty package to homeowner
3. **Photo Validation**: AI-powered photo quality validation
4. **Document Templates**: Warranty template customization per workspace
5. **Advanced Search**: Add more search filters and sorting options
6. **Document Analytics**: Track document views and downloads
7. **Mobile App**: Mobile-friendly document upload and viewing

## 🔒 Security

- All document access uses signed URLs (1-hour expiry)
- Row-level security (RLS) on all tables
- Workspace-based access control
- Homeowner portal uses secure tokens
- Documents stored in private storage bucket

## 📚 Related Blocks

- Block 22310: Job Documents Hub v1
- Block 22360: Warranty & Service Tracking v1
- Block 24660: Document Vault v1
- Block 25180: Job Completion Engine v1
- Block 22790: Homeowner Portal v1

---

**Implementation Date:** January 30, 2025
**Status:** ✅ Complete
**Version:** v1




































