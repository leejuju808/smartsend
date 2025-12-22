// components/campaign/CampaignSenderField.tsx
// Block 8170 — campaign sender selection field

"use client";

import * as React from "react";
import { OutboundEmailAccount } from "@/lib/smartsend/outbound-accounts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail } from "lucide-react";

type Props = {
  accounts: OutboundEmailAccount[];
  valueProvider: string | null;
  valueAccountId: string | null;
  onChange: (provider: string | null, accountId: string | null) => void;
};

export function CampaignSenderField({
  accounts,
  valueProvider,
  valueAccountId,
  onChange,
}: Props) {
  const hasAccounts = accounts.length > 0;

  function handleSelectChange(accountId: string) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      onChange(null, null);
      return;
    }
    onChange(account.provider, account.id);
  }

  const selectedAccount = accounts.find((a) => a.id === valueAccountId);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 opacity-70" />
          Sender
        </label>
        {selectedAccount ? (
          <Badge variant="outline" className="text-[10px] uppercase">
            {selectedAccount.provider}
          </Badge>
        ) : null}
      </div>

      {hasAccounts ? (
        <Select
          value={valueAccountId ?? ""}
          onValueChange={(val) => handleSelectChange(val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a sender account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">
                    {acc.display_name || acc.from_email}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {acc.from_email} • {acc.provider.toUpperCase()}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
          No senders connected yet. Go to Settings → Email Sending to add one.
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        This sender will be used for all emails in this campaign.
      </p>
    </div>
  );
}

































































