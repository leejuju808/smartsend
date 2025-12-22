# Block 23760 — SmartSend Roofing Agency Partner Program v1

## Implementation Summary

Complete agency partner program system enabling roofing marketing agencies to resell SmartSend to their roofing clients with recurring commission structure.

## ✅ Completed Components

### 1. Database Schema (`supabase/migrations/20250130000001_block23760_agency_partner_program_v1.sql`)

#### Core Tables:
- **`partners`** - Agency partner records with tier, commission rate, and Stripe Connect account
- **`partner_referrals`** - Tracks which accounts were referred by which partner
- **`partner_commissions`** - Monthly commission calculations per partner per referral
- **`partner_payouts`** - Monthly payout batches to partners via Stripe Connect

#### Key Features:
- **Auto-tier upgrades**: Partners automatically upgrade to Elite (11 accounts) and Premier (50 accounts)
- **Commission rates**: 20% (Partner), 30% (Elite), 40% (Premier)
- **Referral tracking**: Unique referral codes per partner
- **Stripe Connect integration**: For automated payouts

#### Views:
- **`partner_dashboard_summary`** - Partner dashboard with account counts, commissions, payouts
- **`partner_referral_performance`** - Performance metrics per referral

#### Functions:
- `generate_partner_referral_code()` - Generates unique referral codes
- `update_partner_account_count()` - Auto-updates tier based on account count
- `calculate_partner_commission()` - Calculates monthly commission for a referral
- `process_monthly_partner_commissions()` - Processes commissions for all partners

### 2. API Endpoints

#### `/api/partners/register` (POST)
- Agency partner registration
- Creates partner record and Stripe Connect account
- Returns onboarding link

#### `/api/partners/dashboard` (GET)
- Partner dashboard data
- Returns summary, referrals, commissions, payouts, performance metrics

#### `/api/partners/referral` (GET/POST)
- **GET**: Validate referral code
- **POST**: Create referral when user signs up with partner code

#### `/api/partners/payouts/process` (POST)
- Process monthly payouts for all partners
- Creates Stripe transfers via Stripe Connect
- Updates commission and payout status

#### `/api/partners/connect/onboarding` (GET/POST)
- **GET**: Get Stripe Connect onboarding link
- **POST**: Handle Stripe Connect account updates

#### `/api/cron/partner-commissions` (GET)
- Monthly cron job for processing commissions and payouts

### 3. Stripe Webhook Integration

Updated `src/app/api/stripe/webhook/route.ts` to:
- Track partner referrals when subscriptions are created/updated
- Activate referrals when subscriptions become active
- Cancel referrals when subscriptions are canceled
- Store `partner_id` and `partner_referral_code` in subscriptions table

### 4. Partner Tier System

**Tier 1 — Partner (0–10 accounts)**
- 20% recurring commission
- Access to partner dashboard
- Access to SmartSend roofing templates

**Tier 2 — Elite Partner (11–50 accounts)**
- 30% recurring commission
- Priority support
- Co-branded SmartSend assets
- Agency-branded onboarding videos

**Tier 3 — Premier Partner (50+ accounts)**
- 40% recurring commission
- Dedicated account rep
- Exclusive features early
- Custom white-label domain option
- Monthly co-marketing events

## How It Works

### 1. Partner Registration
1. Agency signs up via `/api/partners/register`
2. System creates partner record with unique referral code
3. Stripe Connect account created for payouts
4. Partner completes Stripe Connect onboarding

### 2. Referral Flow
1. Roofer signs up with partner referral code (e.g., `?ref=AGENCY-ABC123`)
2. System creates `partner_referral` record with status `pending`
3. When subscription becomes active, referral status changes to `active`
4. Partner account count increments automatically
5. Tier upgrades happen automatically at 11 and 50 accounts

### 3. Commission Calculation
1. Monthly cron job (`/api/cron/partner-commissions`) runs
2. For each active referral, commission is calculated:
   - Subscription amount × Commission rate
   - Default: $199/month × commission rate
3. Commission records created in `partner_commissions` table

### 4. Payout Processing
1. Payout processor groups commissions by partner
2. Creates Stripe transfer to partner's Stripe Connect account
3. Updates commission and payout status to `paid`
4. Partner receives funds in their Stripe account

## Database Schema Details

### Partners Table
```sql
- id (UUID)
- agency_name (TEXT)
- contact_name, contact_email, contact_phone
- user_id (links to auth.users)
- tier (partner/elite/premier)
- commission_rate (20/30/40%)
- number_of_accounts (auto-calculated)
- referred_accounts (UUID array)
- stripe_connect_account_id
- referral_code (unique)
- white_label_domain (Premier only)
- status (pending/active/suspended/inactive)
```

### Partner Referrals Table
```sql
- id (UUID)
- partner_id (FK to partners)
- referred_user_id (FK to auth.users)
- subscription_id (FK to subscriptions)
- referral_code
- status (pending/active/canceled/expired)
- activated_at, canceled_at
```

### Partner Commissions Table
```sql
- id (UUID)
- partner_id (FK to partners)
- referral_id (FK to partner_referrals)
- subscription_amount_cents
- commission_rate
- commission_amount_cents
- period_year, period_month
- status (pending/accrued/paid/canceled)
- payout_id (FK to partner_payouts)
```

## Usage Examples

### Register a Partner
```typescript
POST /api/partners/register
{
  "agencyName": "Roofing Marketing Pro",
  "contactName": "John Doe",
  "contactEmail": "john@roofingmarketingpro.com",
  "contactPhone": "+1234567890"
}
```

### Get Partner Dashboard
```typescript
GET /api/partners/dashboard
// Returns: partner info, summary, referrals, commissions, payouts
```

### Create Referral (User Signup)
```typescript
POST /api/partners/referral
{
  "referralCode": "AGENCY-ABC123",
  "referralSource": "link"
}
```

### Process Monthly Payouts (Admin/Cron)
```typescript
POST /api/partners/payouts/process
{
  "periodYear": 2025,
  "periodMonth": 1,
  "dryRun": false
}
```

## Commission Math Examples

**Example 1: Partner with 20 accounts**
- 20 roofers × $199/month = $3,980/month
- Partner earns 30% (Elite tier) = $1,194/month recurring

**Example 2: Partner with 50 accounts**
- 50 roofers × $199/month = $9,950/month
- Partner earns 40% (Premier tier) = $3,980/month recurring

## Next Steps

1. **Partner Onboarding Materials**: Create PDF toolkit, demo deck, onboarding scripts
2. **Partner Dashboard UI**: Build frontend dashboard for partners
3. **Referral Link Generator**: Create partner-specific signup pages
4. **Monthly Success Reviews**: Automated emails to partners with performance metrics
5. **White-label Features**: Implement custom domain and branding for Premier partners

## Environment Variables

Required environment variables:
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `NEXT_PUBLIC_APP_URL` - App URL for onboarding links
- `CRON_SECRET` - Secret for cron job authentication (optional)

## Testing

1. **Register a partner**: Call `/api/partners/register`
2. **Create referral**: Sign up user with partner referral code
3. **Activate subscription**: Subscription becomes active → referral activates
4. **Process commissions**: Run `/api/cron/partner-commissions` or `/api/partners/payouts/process`
5. **Verify payout**: Check Stripe Connect account for transfer

## Notes

- Commission calculation uses default $199/month subscription amount
- In production, subscription amount should be retrieved from Stripe subscription
- Stripe Connect accounts must be activated before payouts can be processed
- Partner tier upgrades happen automatically via database triggers
- Referrals are tracked at the user level, not workspace level






































