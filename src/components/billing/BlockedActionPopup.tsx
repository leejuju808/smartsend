'use client';

import { AlertCircle, X } from 'lucide-react';
import { UpgradeModal } from './UpgradeModal';
import { useState } from 'react';

interface BlockedActionPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  plan?: string;
  currentCount?: number;
  maxAllowed?: number | null;
  upgradeRequired?: boolean;
  orgId: string;
}

export function BlockedActionPopup({
  isOpen,
  onClose,
  title,
  message,
  plan,
  upgradeRequired = false,
  orgId,
}: BlockedActionPopupProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  if (!isOpen) return null;

  const handleUpgrade = () => {
    setShowUpgradeModal(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
          
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 mb-4">{message}</p>
                
                {plan && (
                  <div className="mb-4 p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">
                      Current Plan: <span className="font-semibold capitalize">{plan}</span>
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  {upgradeRequired && (
                    <button
                      onClick={handleUpgrade}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Upgrade Now
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={plan}
          orgId={orgId}
        />
      )}
    </>
  );
}




























































