import dynamic from "next/dynamic"
import EmailConnectCard from "../(settings)/EmailConnectCard"
import { fetchMailAccounts } from "@/lib/server/mail-accounts"

const EmailAccountsList = dynamic(() => import("./EmailAccountsList"), { ssr: false })

function formatProvider(provider: string) {
  return provider === "gmail" ? "Gmail" : provider === "outlook" ? "Outlook" : provider
}

export default async function SettingsPage() {
  const accounts = await fetchMailAccounts()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Email Accounts</h2>
        {accounts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {accounts.map((account) => (
              <span
                key={account.id}
                className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-200"
              >
                Connected: {account.email} ({formatProvider(account.provider)})
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No mailboxes connected yet.</p>
        )}
        <EmailConnectCard />
        <EmailAccountsList />
      </section>
    </div>
  )
}