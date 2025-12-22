# Pre-send Suppression Guard Implementation

## Overview

The Pre-send Suppression Guard is a blocking feature that prevents campaign sends when suppressed or invalid email recipients are detected. It provides a visible alert with counts and requires user action to exclude blocked contacts before allowing the send to proceed.

## Features Implemented

### ✅ Server Helper (`/api/campaigns/[id]/presend-check`)
- **GET**: Lists suppressed/invalid recipients for a campaign
- **POST**: Excludes selected contacts from the send
- Uses existing `is_suppressed(workspace_id, email, campaign_id)` function
- Validates email format using regex
- Logs metrics to `send_attempts` table

### ✅ UI Components
- **PresendGuard Component**: Main guard component with banner and drawer
- **FixListDrawer**: Modal for reviewing and excluding blocked contacts
- **Send Button Integration**: Disabled state when blocked contacts detected

### ✅ Enforcement Logic
- Blocks send button when suppressed/invalid recipients exist
- Requires user to click "Fix List" and exclude contacts
- Updates recipient status to "cancelled" for excluded contacts
- Re-enables send button after exclusion

### ✅ Metrics Logging
- **send_attempts table**: Tracks each send attempt with counts
- Fields: `attempted`, `blocked_suppressed`, `blocked_invalid`, `final_sendable`
- Includes metadata with excluded contact IDs

## Database Schema

### New Table: `send_attempts`
```sql
CREATE TABLE public.send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns_new(id) ON DELETE CASCADE,
  attempted int NOT NULL DEFAULT 0,        -- Total recipients attempted
  blocked_suppressed int NOT NULL DEFAULT 0, -- Blocked due to suppression
  blocked_invalid int NOT NULL DEFAULT 0,    -- Blocked due to invalid email format
  final_sendable int NOT NULL DEFAULT 0,     -- Final count of sendable recipients
  metadata jsonb DEFAULT '{}'::jsonb,        -- Additional context
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### RLS Policies
- Users can only access send attempts for their own campaigns
- Proper workspace isolation maintained

## API Endpoints

### GET `/api/campaigns/[id]/presend-check`
Returns suppression check results for a campaign.

**Response:**
```json
{
  "total_recipients": 100,
  "blocked_suppressed": 5,
  "blocked_invalid": 2,
  "final_sendable": 93,
  "blocked_contacts": [
    {
      "id": "uuid",
      "email": "suppressed@example.com",
      "reason": "suppressed",
      "details": "Email is in suppression list"
    }
  ],
  "has_blocked": true
}
```

### POST `/api/campaigns/[id]/presend-check`
Excludes selected contacts from the send.

**Request:**
```json
{
  "exclude_contact_ids": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "success": true,
  "excluded_count": 2
}
```

## UI Flow

1. **Load Send Page**: PresendGuard component loads and checks recipients
2. **Show Results**: 
   - ✅ **All Safe**: Green banner showing all recipients are safe
   - ❌ **Blocked**: Red banner with counts and "Fix List" button
3. **Fix List**: Click opens drawer with blocked contacts
4. **Exclude Contacts**: Select and exclude suppressed/invalid contacts
5. **Send Enabled**: Button becomes enabled after exclusion

## Integration Points

### Campaign Send Flow
- **File**: `src/app/dashboard/campaigns-new/[id]/send/page.tsx`
- **Integration**: PresendGuard component added before send controls
- **Send Button**: Disabled when blocked contacts detected

### Suppression Checking
- **File**: `src/app/api/campaigns/[id]/send-chunk/route.ts`
- **Enhancement**: Added `is_suppressed` RPC call before `sendMailSafe`
- **Compatibility**: Maintains existing suppression logic

## Testing

### Manual Testing Checklist
1. **Create test campaign** with ~20 contacts
2. **Insert suppressed emails** into `suppressions` table
3. **Add invalid emails** (malformed addresses)
4. **Navigate to send page** → Should show blocking alert
5. **Click "Fix List"** → Should open drawer with blocked contacts
6. **Select and exclude** blocked contacts
7. **Verify send button** becomes enabled
8. **Start send** → Should not include blocked contacts
9. **Check metrics** in `send_attempts` table

### Test Script
Run `scripts/test-presend-guard.ts` for automated testing:
```bash
tsx scripts/test-presend-guard.ts
```

## Database Queries for Verification

### Check No Suppressed Emails in Final Send
```sql
SELECT cr.email, cr.status 
FROM campaign_recipients_new cr 
WHERE cr.campaign_id = 'your-campaign-id' 
AND cr.status = 'sent';
```

### Verify Send Attempts Logged
```sql
SELECT * FROM send_attempts 
WHERE campaign_id = 'your-campaign-id' 
ORDER BY created_at DESC 
LIMIT 5;
```

### Check Suppression Coverage
```sql
SELECT 
  COUNT(*) as total_recipients,
  COUNT(CASE WHEN cr.status = 'suppressed' THEN 1 END) as suppressed_count,
  COUNT(CASE WHEN cr.status = 'sent' THEN 1 END) as sent_count
FROM campaign_recipients_new cr 
WHERE cr.campaign_id = 'your-campaign-id';
```

## File Structure

```
src/
├── app/api/campaigns/[id]/
│   ├── presend-check/route.ts          # Main API endpoint
│   └── send-chunk/route.ts             # Enhanced with suppression check
├── components/
│   └── PresendGuard.tsx                # UI component
├── app/dashboard/campaigns-new/[id]/send/
│   └── page.tsx                        # Updated send page
└── supabase/migrations/
    └── 20250127000000_create_send_attempts_table.sql

scripts/
└── test-presend-guard.ts               # Test script
```

## Acceptance Criteria Met

- ✅ **Blocking Alert**: Shows when suppressed/invalid recipients detected
- ✅ **Fix List CTA**: Opens drawer to review and exclude contacts
- ✅ **Send Enforcement**: Cannot start send until blocked contacts excluded
- ✅ **Metrics Logging**: Records send attempt data for analytics
- ✅ **UI Integration**: Seamlessly integrated into existing send flow
- ✅ **Database Safety**: Uses existing suppression system and RLS policies

## Next Steps

After this implementation lands, create follow-up tickets for:

1. **Role Account Filter**: Auto-detect role accounts (info@, admin@, etc.) on import
2. **Analytics Polish**: Add trendline charts for sender health metrics
3. **Bulk Suppression**: Add bulk suppression management UI
4. **Advanced Filtering**: Domain-based suppression rules

## Run/Verify Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run migration (if not auto-applied)
# Apply the send_attempts table migration

# Test the feature
# 1. Go to /dashboard/campaigns-new
# 2. Create a campaign with test recipients
# 3. Add some emails to suppressions table
# 4. Navigate to send page
# 5. Verify blocking behavior and fix list functionality
```

The implementation is complete and ready for testing! 🚀