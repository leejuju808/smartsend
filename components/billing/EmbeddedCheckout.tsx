"use client";

import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutComponentProps } from "./EmbeddedCheckout.types";

// Note: This component requires @stripe/react-stripe-js to be installed
// Install it with: npm install @stripe/react-stripe-js
// For now, we'll use a dynamic import to handle the optional dependency
import dynamic from "next/dynamic";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// Dynamically import EmbeddedCheckout components
const EmbeddedCheckoutProvider = dynamic(
  async () => {
    try {
      const { EmbeddedCheckoutProvider: Provider } = await import("@stripe/react-stripe-js");
      return Provider;
    } catch (e) {
      // Return a placeholder component if package is not installed
      return ({ children }: any) => (
        <div className="p-4 text-yellow-600 border border-yellow-500 rounded">
          <p className="font-semibold mb-2">Embedded Checkout requires @stripe/react-stripe-js</p>
          <p className="text-sm">
            Please install it: <code className="bg-gray-100 px-1 rounded">npm install @stripe/react-stripe-js</code>
          </p>
        </div>
      );
    }
  },
  { ssr: false }
);

const EmbeddedCheckout = dynamic(
  async () => {
    try {
      const { EmbeddedCheckout: Checkout } = await import("@stripe/react-stripe-js");
      return Checkout;
    } catch (e) {
      return () => null;
    }
  },
  { ssr: false }
);

export function EmbeddedCheckoutComponent({ sessionClientSecret }: EmbeddedCheckoutComponentProps) {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="p-4 text-red-600">
        Stripe publishable key not configured. Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="p-4 text-red-600">
        Failed to load Stripe. Please check your NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </div>
    );
  }

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromise}
      options={{ clientSecret: sessionClientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}

