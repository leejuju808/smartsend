# Pre-Send Suppression Guard Implementation

## Overview

This implementation provides a comprehensive pre-send safety system that blocks suppressed/invalid recipients before campaign sending, with a visible alert system and "Fix List" functionality.

## Features Implemented

### ✅ Server API Route (`/api/campaigns/[id]/presend-check`)

**GET Endpoint**: Returns detailed suppression analysis
```typescript
{
  total: number;
  suppressed_global: number;
  suppressed_campaign: number;
  invalid: number;
  final_sendable: number;
  blocked: Array<{
    id: string;
    email: string;
    reason: 'suppressed_global' | 'suppressed_campaign' | 'invalid';
    details: string;
  }>;
}
```

**POST Endpoint**: Excludes blocked contacts and logs metrics
- Updates recipient status to 'cancelled' for excluded contacts
- Logs detailed metrics to `send_attempts` table
- Returns success confirmation with final sendable count

### ✅ UI Components

#### SuppressionGuardBanner Component
- **Location**: `src/components/SuppressionGuardBanner.tsx`
- **Features**:
  - Real-time suppression status display
  - Color-coded alerts (amber for issues, green for safe)
  - Detailed breakdown of blocked recipients
  - "Fix List" button with drawer interface
  - Auto-refresh after fixes

#### FixListDrawer Component (embedded)
- **Features**:
  - Grouped display by suppression type
  - Visual categorization with icons and colors
  - One-click exclusion of all blocked contacts
  - Confirmation dialog with final counts

### ✅ Enforcement Logic

#### Campaign Send Page Integration
- **Location**: `src/app/dashboard/campaigns/[id]/send/page.tsx`
- **Features**:
  - Pre-send safety check on page load
  - Disabled "Start" button when blocked recipients exist
  - Visual feedback (grayed out button, tooltip)
  - Auto-refresh after fixing issues

### ✅ Metrics Logging

#### Send Attempts Table
- **Location**: `supabase/migrations/20250127000000_create_send_attempts_table.sql`
- **Fields**:
  - `attempted`: Total recipients attempted
  - `blocked_suppressed`: Blocked due to suppression
  - `blocked_invalid`: Blocked due to invalid format
  - `final_sendable`: Final sendable count
  - `metadata`: Detailed breakdown and context

## Database Schema

### Enhanced Suppression System
- Uses existing `is_suppressed(workspace, email, campaign?)` function
- Supports both global and campaign-specific suppressions
- Validates email format with comprehensive regex

### Send Attempts Tracking
```sql
CREATE TABLE public.send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns_new(id),
  attempted int NOT NULL DEFAULT 0,
  blocked_suppressed int NOT NULL DEFAULT 0,
  blocked_invalid int NOT NULL DEFAULT 0,
  final_sendable int NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## User Experience Flow

### 1. Campaign Send Screen Load
1. User navigates to campaign send page
2. Suppression guard automatically checks all pending recipients
3. Banner displays status with detailed breakdown

### 2. Issues Found Scenario
1. Banner shows amber alert with issue counts
2. "Fix List" button becomes available
3. Start button is disabled with visual feedback
4. User clicks "Fix List" to open drawer

### 3. Fix List Process
1. Drawer shows grouped blocked recipients
2. Clear categorization by suppression type
3. User confirms exclusion of all blocked contacts
4. System updates recipient statuses and logs metrics
5. Banner updates to show "safe to send" status

### 4. Send Proceeds
1. Start button becomes enabled
2. User can proceed with sending to clean recipient list
3. All metrics are logged for analytics

## API Endpoints

### GET `/api/campaigns/[id]/presend-check`
- **Purpose**: Check recipient safety before sending
- **Returns**: Detailed suppression analysis
- **Usage**: Called on page load and after fixes

### POST `/api/campaigns/[id]/presend-check`
- **Purpose**: Exclude blocked contacts and log metrics
- **Body**: `{ exclude_contact_ids: string[] }`
- **Returns**: Success confirmation with final counts

## Testing

### Test Script
- **Location**: `scripts/test-presend-guard.ts`
- **Coverage**:
  - Campaign creation with mixed recipients
  - Suppression setup and validation
  - API endpoint testing
  - Metrics logging verification
  - Cleanup procedures

### Run Test
```bash
npm run test:presend-guard
# or
tsx scripts/test-presend-guard.ts
```

## Acceptance Criteria Verification

### ✅ With suppressed/invalid present, "Send" is blocked and shows counts
- Banner displays detailed counts for each issue type
- Start button is disabled until issues are resolved
- Clear visual feedback about what needs to be fixed

### ✅ "Fix list" excludes blocked; "Send" enables
- One-click exclusion of all problematic recipients
- Real-time status updates after fixing
- Send button becomes enabled only when safe

### ✅ DB shows metric row (send_attempts table)
- Comprehensive logging of all send attempts
- Detailed breakdown of suppression types
- Metadata includes user actions and timestamps

## File Structure

```
src/
├── app/
│   └── api/
│       └── campaigns/
│           └── [id]/
│               └── presend-check/
│                   └── route.ts              # Enhanced API endpoints
├── app/
│   └── dashboard/
│       └── campaigns/
│           └── [id]/
│               └── send/
│                   └── page.tsx              # Updated send page
├── components/
│   ├── SuppressionGuardBanner.tsx            # Main banner component
│   └── ui/
│       ├── Button.tsx                        # Enhanced button component
│       ├── Card.tsx                          # Card component
│       └── badge.tsx                         # Enhanced badge component
└── supabase/
    └── migrations/
        └── 20250127000000_create_send_attempts_table.sql
```

## Next Steps for Extension

### Role-Account Filter on Import
- Detect common role patterns (info@, admin@, sales@, etc.)
- Auto-suppress with reason='role_account'
- Settings toggle in /settings/safety

### Paywall Guardrails for Free Tier
- Gate "Auto-fix" and "1-click exclude" on Free tier
- Show upgrade modal for advanced features
- Seamless experience for paid tiers

## Dependencies

- Next.js 14 App Router ✅
- TypeScript ✅
- Tailwind CSS ✅
- shadcn/ui components ✅
- Existing `public.is_suppressed()` function ✅

## Performance Considerations

- Efficient batch processing of recipient checks
- Optimized database queries with proper indexing
- Real-time UI updates without full page reloads
- Minimal API calls through smart caching

## Security

- Row Level Security (RLS) enabled on all tables
- User authentication required for all endpoints
- Workspace isolation for multi-tenant safety
- Input validation and sanitization