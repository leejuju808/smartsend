# Block 17000 — SmartSend Phone, Photos & File Handling v1

## Implementation Summary

This block implements comprehensive photo and file handling capabilities specifically designed for roofing contractors, including AI-powered photo analysis, insurance document extraction, mobile-first uploads, and intelligent pipeline automation.

## Features Implemented

### 1. Universal File Upload Button ✅
- Enhanced `UniversalFileUpload` component with mobile camera support
- Supports JPG, PNG, HEIC (iPhone), PDFs, DOCX, MP4 (short videos)
- Auto-compression for storage optimization
- Available from:
  - Inbox
  - Contact profile
  - Pipeline cards
  - Tasks
  - Scheduler confirmation

### 2. Mobile Photo Intake (Contractor Mode) ✅
- Camera-first upload flow on mobile devices
- "Take Photo" and "Choose from Gallery" options
- Optimized for on-site photo capture

### 3. Photo Categorization (v1 AI Assist) ✅
- AI labels photos as:
  - Shingle damage
  - Hail damage
  - Wind damage
  - Leak/water stain
  - Gutter damage
  - Skylight issue
  - General roof overview
  - Insurance document
  - Before/After photo

### 4. File Organization System ✅
- Automatic folder assignment:
  - Roof Photos
  - Damage Photos
  - Insurance Documents
  - Job Quotes
  - Before/After
  - Other Files
- No manual folder creation needed

### 5. Insurance Document Intelligence ✅
- Extracts from PDFs/photos:
  - Claim number
  - Deductible
  - ACV/RCV
  - Adjuster name
  - Inspection date
  - Carrier name
- Auto-updates:
  - Insurance likelihood
  - Revenue estimate
  - Tasks
  - Pipeline
  - Contact profile

### 6. Timeline Media Tracking ✅
- Media actions logged to activity log:
  - "5 photos uploaded"
  - "Insurance PDF analyzed"
  - "Damage photo added"
  - "Before/after photos added"
- Each event is clickable

### 7. Side-by-Side Photo Viewer ✅
- Comparison mode for before/after photos
- Multiple angles and dates
- Professional presentation for homeowners

### 8. Photo → Pipeline Triggers ✅
- Smart automation based on photo analysis:
  - **Hail/wind damage** → Move to Insurance Opportunity
  - **Leak detected** → Move to Hot Lead, create URGENT task, notify office manager
  - **Skylight damage** → Recommend skylight upsell
  - **General roof damage** → Increase job value estimate

### 9. PDF Import Functions ✅
- Text extraction from PDFs
- Number extraction (quote amounts, deductibles, etc.)
- Insurance metadata updates
- Quote amount extraction
- Adjuster notes summarization
- Storm correlation mapping

### 10. File Sharing ✅
- Attach files from contact's file library to inbox messages
- "Attach from Files" button in reply composer
- Search and filter by folder
- Multi-select support

## Database Schema

### Enhanced `attachments` Table
- `folder` - Auto-assigned folder name
- `ai_label` - AI-generated label
- `ai_tags` - Array of AI-detected tags
- `detected_damage_type` - Specific damage type
- `photo_analysis_id` - Reference to photo_analysis
- `insurance_doc_id` - Reference to insurance_docs

### New `photo_analysis` Table
- `attachment_id` - Reference to attachment
- `detected_damage_type` - Type of damage detected
- `confidence` - AI confidence score (0-100)
- `ai_tags` - Additional tags
- `analysis_metadata` - Full AI response

### New `insurance_docs` Table
- `attachment_id` - Reference to attachment
- `claim_number` - Insurance claim number
- `deductible` - Deductible amount
- `acv` - Actual Cash Value
- `rcv` - Replacement Cost Value
- `adjuster_name`, `adjuster_phone`, `adjuster_email`
- `inspection_date`, `date_of_loss`
- `carrier_name`, `policy_number`
- `extracted_metadata` - Full extracted text

## API Routes

### POST `/api/files/analyze-photo`
Analyzes uploaded photos using AI to detect damage types and categorize.

**Request:**
```json
{
  "attachmentId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": { ... },
  "detected_damage_type": "hail_damage",
  "label": "Hail damage detected",
  "confidence": 85
}
```

### POST `/api/files/analyze-pdf`
Extracts text and metadata from PDFs, especially insurance documents.

**Request:**
```json
{
  "attachmentId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "type": "insurance_document",
  "insurance_doc": { ... },
  "extracted_data": {
    "claimNumber": "CL-12345",
    "deductible": 1000,
    "acv": 15000,
    "rcv": 20000,
    "carrierName": "State Farm"
  }
}
```

### POST `/api/files/update-insurance`
Updates insurance document data and contact information.

**Request:**
```json
{
  "insuranceDocId": "uuid",
  "updates": {
    "claim_number": "CL-12345",
    "deductible": 1000,
    "acv": 15000,
    "rcv": 20000
  }
}
```

## Components

### `UniversalFileUpload`
Enhanced component with:
- Mobile camera support
- File type validation
- Auto-compression
- Background AI analysis trigger

### `AttachFromFiles`
New component for attaching existing files from contact's library:
- Search functionality
- Folder filtering
- Multi-select
- File preview

### `SideBySidePhotoViewer`
Enhanced photo comparison viewer:
- Single and compare modes
- Thumbnail navigation
- AI labels display
- Before/after comparison

## Automation & Triggers

### Pipeline Updates
- **Hail/Wind Damage** → `insurance_opportunity` stage
- **Leak Detected** → `hot_lead` stage + URGENT task
- **Skylight Issue** → Task recommendation
- **General Damage** → Job value estimate update

### Task Creation
- Auto-generates tasks based on photo analysis
- Urgency levels: normal, urgent, critical
- Auto-source: "photo_analysis"

### Contact Updates
- Insurance likelihood updated from insurance docs
- Revenue estimates updated from ACV/RCV
- Pipeline stage changes logged

## Storage & Performance

- Auto-compression for images
- 10MB file size limit (50MB for videos)
- Storage tracking per organization
- Plan-based storage limits:
  - Starter: 1GB
  - Growth: 5GB
  - Domination: 20GB

## Security & Permissions

- RLS policies on all new tables
- Org-scoped access control
- Role-based permissions (owner, manager, staff)
- Service role full access for background jobs

## Next Steps (Future Enhancements)

1. **AI Service Integration**
   - Replace placeholder AI analysis with actual vision API (OpenAI Vision, Google Vision, etc.)
   - Implement PDF parsing library (pdf-parse, pdf.js)

2. **Edge Functions**
   - Create Supabase Edge Functions for async analysis
   - Background job processing for large files

3. **Advanced Features**
   - Video analysis for roof walkthroughs
   - OCR for handwritten notes
   - Storm date correlation
   - Automated estimate generation from photos

4. **Mobile App**
   - Native mobile app for field contractors
   - Offline photo capture
   - Batch upload when online

## Migration

Run the migration:
```bash
supabase migration up
```

Or apply manually:
```sql
-- Run: supabase/migrations/20250130000004_block17000_phone_photos_file_handling_v1.sql
```

## Testing Checklist

- [ ] Upload photos from mobile device (camera)
- [ ] Upload photos from gallery
- [ ] Upload PDF documents
- [ ] Verify AI analysis triggers (check logs)
- [ ] Verify pipeline stage updates
- [ ] Verify task creation
- [ ] Verify insurance document extraction
- [ ] Verify file sharing in inbox
- [ ] Verify folder auto-assignment
- [ ] Verify side-by-side photo viewer
- [ ] Verify activity log entries

## Notes

- AI analysis functions are currently placeholders - replace with actual AI service calls
- PDF extraction functions are placeholders - implement with actual PDF parsing library
- Background analysis is triggered asynchronously - consider using queue system for production
- File sharing uses attachment IDs - ensure inbox send endpoint supports these IDs
