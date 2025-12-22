# SmartSend — Warmup UI + Deliverability Dashboard

This implementation provides two high-leverage surfaces that directly improve deliverability and visibility:

1. **Mailbox Warmup & Caps UI** — create/edit mailboxes, toggle warmup, set caps
2. **Deliverability Dashboard** — live usage by mailbox & domain, plus per-step engagement

## What's Implemented

### 0. SQL Migration
- **File**: `supabase/migrations/20250132_add_contacts_domain_for_engagement.sql`
- **Purpose**: Adds generated domain field to contacts for domain-level engagement tracking
- **Features**: 
  - Automatic domain extraction from email addresses
  - Trigger to update domain when email changes
  - Index for fast domain queries

### 1. API Endpoints

#### Mailbox Management
- **`/api/mailboxes/list`** - Returns today's usage + computed warmup cap per mailbox
- **`/api/mailboxes/upsert`** - Create or update a mailbox
- **`/api/mailboxes/delete`** - Delete a mailbox
- **`/api/mailboxes/warmup/start`** - Start mailbox warmup
- **`/api/mailboxes/warmup/stop`** - Stop mailbox warmup

#### Deliverability Metrics
- **`/api/metrics/deliverability/overview`** - Comprehensive deliverability overview
  - Mailbox usage (personal + workspace)
  - Top recipient domains (today + last 7 days)
  - Per-step engagement metrics
  - Campaign-specific filtering

#### Campaigns
- **`/api/campaigns/list`** - List campaigns for filtering deliverability data

### 2. UI Components

#### Mailbox Management Page
- **File**: `src/app/dashboard/settings/mailboxes/page.tsx`
- **Features**:
  - Create/edit mailboxes with full SMTP configuration
  - Set daily caps and warmup status
  - Visual usage indicators with color-coded progress bars
  - Real-time usage tracking (used today vs cap)
  - Toggle warmup on/off for each mailbox

#### Deliverability Dashboard
- **File**: `src/app/dashboard/deliverability/page.tsx`
- **Features**:
  - Summary cards: total mailboxes, sent today, opens, clicks
  - Mailbox usage breakdown (personal + workspace)
  - Top recipient domains ranking
  - Engagement metrics with campaign filtering
  - Real-time data refresh

### 3. Navigation
- Added "Mailboxes" link to dashboard sidebar under Settings
- Existing "Deliverability" link already present

## How It Works

### Mailbox Rotation & Throttling
The system leverages existing infrastructure:
- **Mailbox Rotation**: Automatically selects least-used mailbox under cap
- **Domain Throttling**: Enforces per-domain daily caps
- **Warmup Control**: Toggle mailboxes active/inactive for gradual scaling

### Engagement Tracking
- **Open Tracking**: Via tracking tokens and events
- **Click Tracking**: URL-based click tracking
- **Domain Analytics**: Aggregated by recipient domain for insights

### Data Flow
1. User creates/edits mailboxes with caps
2. System tracks daily usage per mailbox and domain
3. Sending engine rotates through available mailboxes
4. Engagement events are captured and aggregated
5. Dashboard displays real-time metrics and insights

## Usage

### Setting Up Mailboxes
1. Navigate to **Settings > Mailboxes**
2. Click "Add Mailbox"
3. Configure SMTP settings and daily cap
4. Toggle warmup on/off as needed

### Monitoring Deliverability
1. Navigate to **Deliverability** dashboard
2. View mailbox usage and domain performance
3. Filter by specific campaigns if needed
4. Monitor engagement rates and trends

### Best Practices
- Start with conservative daily caps (50-100 emails)
- Gradually increase caps as deliverability improves
- Monitor domain-specific performance
- Use warmup toggle to pause problematic mailboxes

## Technical Notes

### Database Tables Used
- `mailboxes` - Mailbox configuration and status
- `mailbox_daily_usage` - Daily sending counters
- `domain_daily_usage` - Per-domain daily limits
- `tracking_events` - Open/click tracking
- `contacts` - Recipient data with domain extraction

### Performance Considerations
- Indexed queries for fast mailbox selection
- Atomic increment functions for usage tracking
- Efficient domain aggregation queries
- Real-time dashboard updates

### Security
- User-level data isolation
- Workspace-level sharing where applicable
- Authentication required for all endpoints
- Input validation and sanitization

## Future Enhancements

- **Advanced Warmup**: Gradual cap increases over time
- **Domain Reputation**: Integration with external reputation services
- **Bounce Handling**: Automatic mailbox rotation on bounces
- **A/B Testing**: Test different sending patterns
- **Predictive Analytics**: ML-based cap optimization

## Dependencies

This implementation assumes you have the following packs installed:
- ✅ Mailbox Rotation + Throttling + Tracking
- ✅ Campaign management system
- ✅ User authentication and workspaces
- ✅ Basic email sending infrastructure

## Testing

To test the implementation:

1. **Run the migration**: Apply the SQL migration to your database
2. **Create test mailboxes**: Use the UI to add sample mailboxes
3. **Send test emails**: Trigger the sending system to populate metrics
4. **Verify tracking**: Check that opens/clicks are being recorded
5. **Monitor dashboard**: Ensure real-time updates are working

The system is designed to work with your existing infrastructure and provides immediate visibility into your email deliverability performance. 