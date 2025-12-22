"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SyncNowButton } from "@/components/settings/SyncNowButton";

type Conn = {
  id: string;
  provider: string;
  email_address: string | null;
  token_expires_at: string | null;
};

export default function EmailSettings() {
  const [connGmail, setConnGmail] = useState<Conn | null>(null);
  const [connOutlook, setConnOutlook] = useState<Conn | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [gmailRes, outlookRes] = await Promise.all([
        fetch("/api/settings/email/connection?provider=gmail"),
        fetch("/api/settings/email/connection?provider=outlook")
      ]);
      const gmailJson = await gmailRes.json();
      const outlookJson = await outlookRes.json();
      setConnGmail(gmailJson.conn ?? null);
      setConnOutlook(outlookJson.conn ?? null);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Email Accounts</h1>

      {/* Gmail card */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Gmail</div>
            <div className="text-sm opacity-70">
              {loading
                ? "Loading..."
                : connGmail
                ? `Connected: ${connGmail.email_address ?? "Unknown"}`
                : "Not connected"}
            </div>
          </div>
          {connGmail ? (
            <div className="flex items-center gap-2">
              <form action="/api/settings/email/disconnect" method="post">
                <input type="hidden" name="provider" value="gmail" />
                <button className="rounded-xl border px-3 py-1.5 text-sm">Disconnect</button>
              </form>
              <SyncNowButton accountId={connGmail.id} />
            </div>
          ) : (
            <a href="/api/oauth/gmail/start" className="rounded-xl border px-3 py-1.5 text-sm">
              Connect Gmail
            </a>
          )}
        </div>
        {connGmail && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Account routing:</span>
            <Link className="underline" href={`/settings/accounts/${connGmail.id}`}>
              Manage inbound rules
            </Link>
          </div>
        )}
        {connGmail && (
          <form className="flex items-center gap-2" action="/api/settings/email/test" method="post">
            <input type="hidden" name="provider" value="gmail" />
            <input
              name="to"
              placeholder="Send test to..."
              className="flex h-9 w-80 rounded-md border px-3 text-sm outline-none"
            />
            <button className="rounded-xl border px-3 py-1.5 text-sm">Send Test</button>
          </form>
        )}
      </div>

      {/* Outlook card */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Outlook / Microsoft 365</div>
            <div className="text-sm opacity-70">
              {loading
                ? "Loading..."
                : connOutlook
                ? `Connected: ${connOutlook.email_address ?? "Unknown"}`
                : "Not connected"}
            </div>
          </div>
          {connOutlook ? (
            <div className="flex items-center gap-2">
              <form action="/api/settings/email/disconnect" method="post">
                <input type="hidden" name="provider" value="outlook" />
                <button className="rounded-xl border px-3 py-1.5 text-sm">Disconnect</button>
              </form>
              <SyncNowButton accountId={connOutlook.id} />
            </div>
          ) : (
            <a href="/api/oauth/outlook/start" className="rounded-xl border px-3 py-1.5 text-sm">
              Connect Outlook
            </a>
          )}
        </div>
        {connOutlook && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Account routing:</span>
            <Link className="underline" href={`/settings/accounts/${connOutlook.id}`}>
              Manage inbound rules
            </Link>
          </div>
        )}
        {connOutlook && (
          <form className="flex items-center gap-2" action="/api/settings/email/test" method="post">
            <input type="hidden" name="provider" value="outlook" />
            <input
              name="to"
              placeholder="Send test to..."
              className="flex h-9 w-80 rounded-md border px-3 text-sm outline-none"
            />
            <button className="rounded-xl border px-3 py-1.5 text-sm">Send Test</button>
          </form>
        )}
      </div>
    </div>
  );
}
