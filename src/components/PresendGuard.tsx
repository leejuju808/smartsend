"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Users, Shield, Mail, X } from "lucide-react";

interface PresendCheckResult {
  total_recipients: number;
  blocked_suppressed: number;
  blocked_invalid: number;
  final_sendable: number;
  blocked_contacts: Array<{
    id: string;
    email: string;
    reason: 'suppressed' | 'invalid_email';
    details: string;
  }>;
  has_blocked: boolean;
}

interface PresendGuardProps {
  campaignId: string;
  onSendEnabled: (enabled: boolean) => void;
}

export default function PresendGuard({ campaignId, onSendEnabled }: PresendGuardProps) {
  const [checkResult, setCheckResult] = useState<PresendCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFixList, setShowFixList] = useState(false);
  const [fixing, setFixing] = useState(false);

  const loadPresendCheck = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/campaigns/${campaignId}/presend-check`);
      if (!response.ok) throw new Error('Failed to load presend check');
      
      const result = await response.json();
      setCheckResult(result);
      onSendEnabled(!result.has_blocked);
    } catch (error) {
      console.error('Error loading presend check:', error);
      // On error, allow sending to not block legitimate sends
      onSendEnabled(true);
    } finally {
      setLoading(false);
    }
  };

  const handleFixList = async (excludeIds: string[]) => {
    try {
      setFixing(true);
      const response = await fetch(`/api/campaigns/${campaignId}/presend-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclude_contact_ids: excludeIds })
      });

      if (!response.ok) throw new Error('Failed to exclude contacts');
      
      // Reload the check to get updated counts
      await loadPresendCheck();
      setShowFixList(false);
    } catch (error) {
      console.error('Error fixing list:', error);
      alert('Failed to exclude contacts. Please try again.');
    } finally {
      setFixing(false);
    }
  };

  useEffect(() => {
    loadPresendCheck();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-600" />
          <span className="text-blue-800 font-medium">Checking recipient safety...</span>
        </div>
      </div>
    );
  }

  if (!checkResult) {
    return null;
  }

  // If no blocked contacts, show success message briefly
  if (!checkResult.has_blocked) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-md">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-green-600" />
          <span className="text-green-800 font-medium">
            ✓ All {checkResult.total_recipients} recipients are safe to send
          </span>
        </div>
      </div>
    );
  }

  // Show blocking alert with counts
  return (
    <>
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-red-800 mb-2">
              Sending Blocked - Suppressed/Invalid Recipients Detected
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div className="text-center">
                <div className="text-lg font-semibold text-red-700">{checkResult.total_recipients}</div>
                <div className="text-xs text-red-600">Total Recipients</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-red-700">{checkResult.blocked_suppressed}</div>
                <div className="text-xs text-red-600">Suppressed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-red-700">{checkResult.blocked_invalid}</div>
                <div className="text-xs text-red-600">Invalid Emails</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-700">{checkResult.final_sendable}</div>
                <div className="text-xs text-green-600">Sendable</div>
              </div>
            </div>

            <button
              onClick={() => setShowFixList(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              disabled={fixing}
            >
              {fixing ? 'Processing...' : 'Fix List'}
            </button>
          </div>
        </div>
      </div>

      {/* Fix List Drawer */}
      {showFixList && (
        <FixListDrawer
          blockedContacts={checkResult.blocked_contacts}
          onClose={() => setShowFixList(false)}
          onFix={handleFixList}
          fixing={fixing}
        />
      )}
    </>
  );
}

interface FixListDrawerProps {
  blockedContacts: PresendCheckResult['blocked_contacts'];
  onClose: () => void;
  onFix: (excludeIds: string[]) => void;
  fixing: boolean;
}

function FixListDrawer({ blockedContacts, onClose, onFix, fixing }: FixListDrawerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelectAll = () => {
    if (selectedIds.length === blockedContacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(blockedContacts.map(c => c.id));
    }
  };

  const handleSelectContact = (contactId: string) => {
    setSelectedIds(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleExclude = () => {
    if (selectedIds.length === 0) {
      alert('Please select contacts to exclude');
      return;
    }
    onFix(selectedIds);
  };

  const suppressedCount = blockedContacts.filter(c => c.reason === 'suppressed').length;
  const invalidCount = blockedContacts.filter(c => c.reason === 'invalid_email').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Fix Recipient List</h2>
            <p className="text-sm text-gray-600 mt-1">
              Exclude {blockedContacts.length} blocked contacts from this send
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md"
            disabled={fixing}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 border-b bg-gray-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">{suppressedCount} Suppressed</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium">{invalidCount} Invalid Emails</span>
            </div>
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-800"
              disabled={fixing}
            >
              {selectedIds.length === blockedContacts.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y">
            {blockedContacts.map((contact) => (
              <div key={contact.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(contact.id)}
                    onChange={() => handleSelectContact(contact.id)}
                    className="rounded border-gray-300"
                    disabled={fixing}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{contact.email}</div>
                    <div className="text-sm text-gray-600">{contact.details}</div>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    contact.reason === 'suppressed' 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {contact.reason === 'suppressed' ? 'Suppressed' : 'Invalid'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedIds.length} of {blockedContacts.length} contacts selected for exclusion
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={fixing}
            >
              Cancel
            </button>
            <button
              onClick={handleExclude}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              disabled={fixing || selectedIds.length === 0}
            >
              {fixing ? 'Excluding...' : `Exclude ${selectedIds.length} Contacts`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}