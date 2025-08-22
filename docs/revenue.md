# Revenue Dashboard

**Route:** `/dashboard/admin/revenue` (email must be in `ADMIN_EMAILS`).

Shows 14-day gross revenue and succeeded charges, sourced directly from Stripe charges.

If the chart is empty but you’ve processed payments in this window, verify:
- `STRIPE_SECRET_KEY` is set in your environment
- Charges are `paid` and `status='succeeded'` (test vs live)
- Your time window (14d) includes the payments you expect

