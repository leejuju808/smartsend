"use client"

import * as React from "react"
import { Badge } from "@/components/ui/Badge"

type ProviderAccount = {
  id: string
  email: string
  provider: "gmail" | "outlook"
  status: "active" | "revoked" | "error"
  display_name: string | null
  created_at: string
  updated_at: string
  token_expires_at: string | null
  token_scope: string | null
  token_type: string | null
}

type SendIdentity = {
  id: string
  email: string
  provider: "gmail" | "outlook" | "smtp"
  is_active: boolean
  provider_account_id: string | null
  daily_limit: number | null
  warmup_enabled: boolean | null
  warmup_stage: number | null
}

type AccountsResponse = {
  accounts: ProviderAccount[]
  identities: SendIdentity[]
  error?: string
}

export default function EmailAccountsList() {
  const [accounts, setAccounts] = React.useState<ProviderAccount[]>([])
  const [identities, setIdentities] = React.useState<SendIdentity[]>([])
  const [loading, setLoading] = React.useState(true)
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busyAccount, setBusyAccount] = React.useState<string | null>(null)
  const [busyIdentity, setBusyIdentity] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/settings/email-accounts.json", { cache: "no-store" })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as AccountsResponse
        throw new Error(body.error ?? `Failed to load accounts (${res.status})`)
      }
      const data = (await res.json()) as AccountsResponse
      setAccounts(data.accounts ?? [])
      setIdentities(data.identities ?? [])
    } catch (err: any) {
      setError(err?.message ?? "Failed to load accounts")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const formatProvider = (provider: string) => {
    switch (provider) {
      case "gmail":
        return "Gmail"
      case "outlook":
        return "Outlook"
      default:
        return provider.toUpperCase()
    }
  }

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return "—"
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (Number.isNaN(diff)) return "—"
    if (diff <= 0) return "Expired"
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `in ${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `in ${hours}h`
    const days = Math.floor(hours / 24)
    return `in ${days}d`
  }

  const handleDisconnect = async (accountId: string) => {
    setBusyAccount(accountId)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/provider-accounts/${accountId}/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to disconnect account")
      }
      setMessage("Disconnected account")
      await load()
    } catch (err: any) {
      setError(err?.message ?? "Failed to disconnect account")
    } finally {
      setBusyAccount(null)
    }
  }

  const handleBind = async (identityId: string, providerAccountId: string | null) => {
    setBusyIdentity(identityId)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/send-identities/${identityId}/provider`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_account_id: providerAccountId }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to update identity")
      }
      setMessage("Updated identity")
      await load()
    } catch (err: any) {
      setError(err?.message ?? "Failed to update identity")
    } finally {
      setBusyIdentity(null)
    }
  }

  return (
    <div className="space-y-6">
      {message && <div className="text-sm text-green-400">{message}</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Connected Accounts
          </h3>
          {!loading && accounts.length > 0 && (
            <span className="text-xs text-neutral-500">
              Tokens refresh automatically when under 10 minutes
            </span>
          )}
        </header>

        {loading ? (
          <div className="text-neutral-400 text-sm">Loading accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-400">
            No provider accounts connected yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-100">{account.email}</div>
                    <div className="text-xs text-neutral-500">{formatProvider(account.provider)}</div>
                  </div>
                  <StatusBadge status={account.status} />
                </div>
                <div className="text-xs text-neutral-500">
                  Token expires {formatExpiry(account.token_expires_at)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:border-neutral-500"
                    onClick={() => {
                      const path =
                        account.provider === "gmail"
                          ? "/api/oauth/gmail/start"
                          : "/api/oauth/outlook/start"
                      window.location.href = path
                    }}
                    disabled={busyAccount === account.id}
                  >
                    Reconnect
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:border-red-400 disabled:opacity-50"
                    onClick={() => handleDisconnect(account.id)}
                    disabled={busyAccount === account.id}
                  >
                    {busyAccount === account.id ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Send Identities
        </h3>
        {loading ? (
          <div className="text-neutral-400 text-sm">Loading identities…</div>
        ) : identities.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-400">
            No send identities configured yet.
          </div>
        ) : (
          <div className="space-y-2">
            {identities.map((identity) => {
              const options = accounts.filter((a) => a.provider === identity.provider)
              const currentAccount = accounts.find((a) => a.id === identity.provider_account_id)
              return (
                <div
                  key={identity.id}
                  className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-neutral-100">{identity.email}</div>
                    <div className="text-xs text-neutral-500">
                      {formatProvider(identity.provider)} • Daily limit {identity.daily_limit ?? "—"} •
                      Warmup {identity.warmup_enabled ? `Stage ${identity.warmup_stage ?? 1}` : "Off"}
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
                    <label className="text-xs text-neutral-500 md:text-right">
                      Provider account
                    </label>
                    <select
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                      value={identity.provider_account_id ?? ""}
                      onChange={(event) => {
                        const value = event.target.value
                        handleBind(identity.id, value.length ? value : null)
                      }}
                      disabled={busyIdentity === identity.id}
                    >
                      <option value="">Unassigned</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.email} ({formatExpiry(option.token_expires_at)})
                        </option>
                      ))}
                    </select>
                    {currentAccount && (
                      <StatusBadge status={currentAccount.status} compact />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ status, compact }: { status: ProviderAccount["status"]; compact?: boolean }) {
  const label = status === "active" ? "Active" : status === "revoked" ? "Revoked" : "Error"
  const className =
    status === "active"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : status === "revoked"
      ? "bg-neutral-800 text-neutral-300 border-neutral-700"
      : "bg-red-500/20 text-red-300 border-red-500/40"
  return (
    <Badge className={`${className} border ${compact ? "px-2 py-0.5 text-xs" : ""}`}>
      {label}
    </Badge>
  )
}
