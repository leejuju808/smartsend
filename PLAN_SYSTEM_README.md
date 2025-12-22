# Plan-Based Access Control System

This system provides client-side and server-side gating for premium features based on user subscription status.

## 🚀 Quick Start

### 1. Dependencies
The required packages are already installed:
- `@supabase/supabase-js` ✅
- `stripe` ✅

### 2. Components Created

#### Client-Side Plan Management (`src/lib/plan.tsx`)
- `usePlan()` hook - Get current user's plan and loading state
- `PlanGate` component - Gate UI components based on plan
- `UpsellCard` component - Default upgrade prompt

#### Server-Side Plan Verification (`src/lib/isPro.ts`)
- `isPro(user_id)` function - Check if user has Pro plan in APIs

#### Example Pages
- `/dashboard/account/plan` - Plan management page
- `/dashboard/premium-example` - Usage examples
- `/api/example-premium` - API gating example

## 📖 Usage Examples

### Client-Side Gating

#### Gate a Whole Page
```tsx
// app/dashboard/campaigns/new/page.tsx
"use client";
import { PlanGate } from "@/lib/plan";

export default function NewCampaignPage() {
  return (
    <PlanGate>
      {/* PRO-only UI below */}
      <div>
        <h2 className="text-xl font-semibold">New Campaign</h2>
        {/* form fields here */}
      </div>
    </PlanGate>
  );
}
```

#### Gate a Section Inside a Page
```tsx
import { PlanGate, UpsellCard } from "@/lib/plan";

function DashboardSection() {
  return (
    <PlanGate fallback={<UpsellCard />}>
      <div className="rounded-xl border p-4">Pro analytics go here.</div>
    </PlanGate>
  );
}
```

#### Custom Fallback
```tsx
<PlanGate fallback={
  <div className="bg-yellow-50 p-4 rounded">
    <h3>Custom Upgrade Message</h3>
    <p>This shows instead of the default UpsellCard.</p>
  </div>
}>
  <div>Premium content here</div>
</PlanGate>
```

#### Different Plan Requirements
```tsx
<PlanGate require="enterprise">
  <div>Enterprise-only features</div>
</PlanGate>
```

### Using the Plan Hook

```tsx
import { usePlan } from "@/lib/plan";

function MyComponent() {
  const { loading, plan, user } = usePlan();
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      <p>Current plan: {plan}</p>
      <p>User: {user?.email}</p>
    </div>
  );
}
```

### Server-Side API Gating

```tsx
// app/api/campaigns/create/route.ts
import { isPro } from "@/lib/isPro";

export async function POST(req: Request) {
  const { user_id, name } = await req.json();
  if (!user_id || !name) return new Response("bad request", { status: 400 });

  if (!(await isPro(user_id))) {
    return new Response("Pro plan required", { status: 402 });
  }

  // ...create the campaign...
  return Response.json({ ok: true, id: "new_campaign_id" });
}
```

## 🔧 Configuration

### Environment Variables
Ensure these are set in your `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_STRIPE_PRICE_ID=your_stripe_price_id
STRIPE_SECRET_KEY=your_stripe_secret
NEXT_PUBLIC_SITE_URL=your_site_url
```

### Database Schema
The system expects a `profiles` table with:
- `id` (UUID, primary key)
- `subscription_status` (text, e.g., "free", "pro")
- `stripe_customer_id` (text, optional)

## 🎯 Best Practices

### 1. Client vs Server Gating
- **Client-side**: Use `PlanGate` for UI components and user experience
- **Server-side**: Use `isPro()` for security and data access control

### 2. Fallback Content
- Always provide meaningful fallback content
- Use `UpsellCard` for consistent upgrade prompts
- Consider custom fallbacks for specific contexts

### 3. Loading States
- The `usePlan` hook provides loading state
- Show appropriate loading indicators while checking plan

### 4. Error Handling
- Handle API errors gracefully
- Provide clear upgrade paths when features are locked

## 🧪 Testing

### Test Different Plans
1. Create test users with different subscription statuses
2. Verify gating works correctly for each plan level
3. Test upgrade flows and billing integration

### Test Edge Cases
- Unauthenticated users
- Network errors during plan checks
- Invalid subscription statuses

## 🔄 Integration with Existing Code

### Existing Account Page
The system works alongside the existing account page at `/dashboard/account`. You can:
- Keep the existing server-side implementation
- Add client-side plan management features
- Integrate both approaches as needed

### Existing Billing System
The plan system integrates with your existing Stripe billing:
- Uses existing `/api/billing/checkout` endpoint
- Uses existing `/api/billing/portal` endpoint
- Maintains current billing flow

## 🚨 Security Notes

1. **Always verify on server-side**: Client-side gating is for UX only
2. **Use `isPro()` in APIs**: Never trust client-side plan status for sensitive operations
3. **Row Level Security**: Consider enabling RLS on the profiles table
4. **Rate limiting**: Implement rate limiting on plan-checking APIs

## 📚 Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Stripe Billing Portal](https://stripe.com/docs/billing/subscriptions/customer-portal)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

## 🤝 Support

For questions or issues with the plan system:
1. Check the example implementations
2. Review the Supabase and Stripe documentation
3. Test with different user scenarios
4. Verify environment variables are set correctly 