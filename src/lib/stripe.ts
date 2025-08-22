import Stripe from 'stripe'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'

// Server-side Stripe client
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  // Use a stable, supported API version
  apiVersion: '2024-06-20',
})

// Client-side Stripe loader (singleton)
let stripePromise: Promise<StripeJs | null> | undefined
export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string
    )
  }
  return stripePromise
}