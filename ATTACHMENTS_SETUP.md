# Email Attachments Setup Guide

This guide walks you through the email attachments feature implementation for SmartSend AI.

## Overview

The attachments feature allows users to:
- Upload files (PDF, images, documents) to Supabase Storage
- Attach files to outbound emails via Gmail and Outlook
- Support inline images using Content-ID (CID)
- View and download previously sent attachments

## Database Setup

### 1. Run the Migration

The migration file `supabase/migrations/20251030_email_attachments.sql` creates:
- `email_attachments` table for metadata
- Storage bucket `email-attachments` (private)
- RLS policies for access control
- Indexes for efficient querying

Run the migration via Supabase CLI or dashboard:

```bash
supabase migration up
```

### 2. Create Storage Bucket

If the bucket creation fails in the migration, create it manually:

1. Go to Supabase Dashboard → Storage
2. Create a new bucket named `email-attachments`
3. Set it to **private** (not public)
4. Configure the allowed file types and 10 MB size limit

## API Endpoints

### Upload Attachment
```
POST /api/attachments/upload
Content-Type: multipart/form-data

Headers:
- x-user-id: User ID (TODO: Replace with actual auth)
- x-workspace-id: Workspace ID (TODO: Replace with actual auth)

Body:
- file: File to upload
- isInline: "true" or "false" (optional)
- contentId: Custom CID (optional, auto-generated for inline images)
```

Response:
```json
{
  "id": "uuid",
  "filename": "document.pdf",
  "contentId": "cid_123",
  "isInline": false
}
```

### Get Download URL
```
GET /api/attachments/:id/download

Returns signed URL valid for 1 hour
```

### Send Email with Attachments
```
POST /api/inbox/send

Body includes:
{
  ...existing fields,
  "attachmentIds": ["uuid1", "uuid2"]
}
```

## Supported File Types

- PDF: `application/pdf`
- Images: PNG, JPEG, GIF, WebP
- Documents: DOCX, XLSX
- Text: CSV, TXT

**File Size Limit:** 10 MB per file

## Implementation Details

### MIME Builder

The `buildMultipartAlternative` function in `src/lib/mime.ts` now supports:
- Regular attachments (multipart/mixed)
- Inline images with Content-ID
- Base64 encoding per RFC standards

### Gmail Sending

Attachments are embedded in the raw RFC822 message:
- Multipart/mixed for attachments
- Content-Disposition: attachment
- Content-ID for inline images

### Outlook Sending

Attachments are sent via Graph API:
- Uses `@microsoft.graph.fileAttachment` type
- Includes `contentBytes` (base64 encoded)
- Supports `contentId` and `isInline` properties

### Inline Images

To use inline images:

1. Upload file with `isInline=true`
2. Get the `contentId` from the response
3. Insert `<img src="cid:contentId" />` in your HTML
4. The email client will display the image inline

## UI Components

### RichComposer

The `RichComposer` component in `components/inbox/RichComposer.tsx` includes:
- File upload button with file picker
- Attachment preview list
- Remove attachment functionality
- Loading states for upload/send

## Security Considerations

### TODO Items

The following authentication needs to be implemented:

1. **Upload Route** (`src/app/api/attachments/upload/route.ts`):
   - Replace `x-user-id` header with session-based auth
   - Add workspace membership verification

2. **RichComposer** (`components/inbox/RichComposer.tsx`):
   - Pass actual workspace_id from context
   - Remove placeholder userId

3. **Storage Policies**:
   - Verify RLS policies are properly configured
   - Test signed URL generation

## Testing Checklist

- [ ] Upload one PDF and one PNG
- [ ] Send via Gmail → verify attachments appear
- [ ] Download attachments from sent email
- [ ] Test Outlook send with attachments
- [ ] Test inline images with CID
- [ ] Verify thread replies maintain attachments
- [ ] Test file size limit (10 MB)
- [ ] Verify attachment rows link to email_messages.id
- [ ] Test private bucket access (only signed URLs)
- [ ] Test RLS policies (users can only see their own attachments)

## Troubleshooting

### Storage Upload Fails
- Check bucket exists and is configured correctly
- Verify service role key has permissions
- Check file size doesn't exceed 10 MB limit

### Attachments Not Appearing
- Verify attachmentIds are passed to send API
- Check that files are downloaded from storage
- Verify MIME encoding is correct

### Outlook Attachments Issue
- Check that attachments array is properly formatted
- Verify contentBytes is valid base64
- Ensure @odata.type is included

## Future Enhancements

- [ ] Virus scanning on upload
- [ ] Drag-and-drop file upload
- [ ] Image preview in composer
- [ ] Attachment compression
- [ ] Cloud storage integration (S3, etc.)
- [ ] Attachment analytics (download tracking)


