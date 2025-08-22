# Pricing config

Monthly price (pick one, in priority):
- `STRIPE_PRICE_PRO_FOUNDERS` when `NEXT_PUBLIC_PRICE_VARIANT=founders`
- `STRIPE_PRICE_PRO_STANDARD` when `NEXT_PUBLIC_PRICE_VARIANT=standard`
- `NEXT_PUBLIC_STRIPE_PRICE_ID` (fallback)

Annual price (optional):
- `STRIPE_PRICE_PRO_ANNUAL_FOUNDERS` when `NEXT_PUBLIC_PRICE_VARIANT=founders`
- `STRIPE_PRICE_PRO_ANNUAL_STANDARD` when `NEXT_PUBLIC_PRICE_VARIANT=standard`
- `STRIPE_PRICE_PRO_ANNUAL` generic
- Falls back to monthly if none set

Default term: `NEXT_PUBLIC_PRICE_DEFAULT_TERM=monthly|annual`
