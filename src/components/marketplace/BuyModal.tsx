'use client';

import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { LockClosedIcon, CreditCardIcon } from '@heroicons/react/24/outline';

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: {
    slug: string;
    name: string;
    description?: string;
    price_cents: number;
  };
  userId: string;
}

export default function BuyModal({ isOpen, onClose, template, userId }: BuyModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/marketplace/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateSlug: template.slug,
          userId,
          successUrl: `${window.location.origin}/marketplace?status=success&template=${template.slug}`,
          cancelUrl: `${window.location.origin}/marketplace?status=cancel&template=${template.slug}`,
        }),
      });

      const data = await response.json();

      if (data.alreadyOwned) {
        setError('You already own this template!');
        setIsLoading(false);
        return;
      }

      if (data.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.checkoutUrl;
      } else {
        setError('Failed to create checkout session');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Purchase error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-gradient-to-r from-purple-600 to-blue-600 rounded-full mb-4">
                  <LockClosedIcon className="w-6 h-6 text-white" />
                </div>

                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 text-center mb-2"
                >
                  Unlock Premium Template
                </Dialog.Title>

                <div className="text-center mb-6">
                  <p className="text-sm text-gray-500">
                    Get instant access to <strong>{template.name}</strong>
                  </p>
                  {template.description && (
                    <p className="text-xs text-gray-400 mt-2">{template.description}</p>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Price:</span>
                    <span className="text-2xl font-bold text-gray-900">
                      {formatPrice(template.price_cents)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">One-time purchase</p>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                    onClick={onClose}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 border border-transparent rounded-md hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handlePurchase}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Processing...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <CreditCardIcon className="w-4 h-4 mr-2" />
                        Buy Now
                      </div>
                    )}
                  </button>
                </div>

                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-400">
                    Secure payment powered by Stripe
                  </p>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
} 