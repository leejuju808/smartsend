"use client";

import { useState, useEffect } from "react";
import { ConnectGmail } from "./ConnectGmail";

interface SendingAccount {
  id: string;
  provider: string;
  email_address: string;
  rate_limit_per_minute: number;
  daily_cap: number;
  created_at: string;
}

export function SendingAccounts() {
  const [accounts, setAccounts] = useState<SendingAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/sending-accounts/list");
      const data = await response.json();
      
      if (response.ok) {
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error("Error loading sending accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Gmail Sending Accounts</h3>
          <p className="text-sm text-gray-600">Connect Gmail accounts to send emails via OAuth</p>
        </div>
        <ConnectGmail />
      </div>

      {accounts.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-gray-500">
          <p className="mb-4">No sending accounts connected yet</p>
          <ConnectGmail />
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {accounts.map((account) => (
            <div key={account.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{account.email_address}</div>
                <div className="text-sm text-gray-600">
                  {account.rate_limit_per_minute} emails/min • {account.daily_cap} emails/day
                </div>
              </div>
              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                {account.provider}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
