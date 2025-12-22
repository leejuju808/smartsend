'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'

// Replace with your real auth hook/session
function useUser() {
  // TODO: wire to Supabase auth; must return user_id
  return { user_id: 'REPLACE_WITH_AUTH_USER_ID' }
}

type Row = {
  email?: string
  first_name?: string
  last_name?: string
  company?: string
  [key: string]: any
}

type ValidationMaps = {
  badFormat: Set<string>
  dupInFile: Set<string>
  existing: Set<string>
  suppressed: Set<string>
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ImportValidatePage() {
  const router = useRouter()
  const { user_id } = useUser()

  const [rows, setRows] = useState<Row[]>([])
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [suppressed, setSuppressed] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'ok' | 'issues'>('all')
  const [loadingCheck, setLoadingCheck] = useState(false)

  // Load preview from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('import_preview')
      if (!raw) {
        toast('No preview found. Please re-upload your CSV.')
        router.push('/import')
        return
      }
      const parsed = JSON.parse(raw)
      setRows(parsed)
    } catch {
      toast('Failed to read preview. Please re-upload CSV.')
      router.push('/import')
    }
  }, [router])

  // Compute file-level duplicates and bad formats
  const { dupInFile, badFormat } = useMemo(() => {
    const seen = new Set<string>()
    const dups = new Set<string>()
    const bad = new Set<string>()

    rows.forEach((r) => {
      const e = (r.email || '').trim().toLowerCase()
      if (!e || !emailRegex.test(e)) {
        if (e) bad.add(e)
        return
      }
      if (seen.has(e)) dups.add(e)
      seen.add(e)
    })
    return { dupInFile: dups, badFormat: bad }
  }, [rows])

  // Call API to check existing/suppressed
  useEffect(() => {
    const run = async () => {
      const emails = rows
        .map((r) => (r.email || '').trim().toLowerCase())
        .filter((e) => e && emailRegex.test(e))

      if (emails.length === 0 || !user_id) return

      setLoadingCheck(true)
      try {
        const res = await fetch('/api/import/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, emails }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data?.error || 'Validation failed')
        } else {
          setExisting(new Set((data.existing || []).map((e: string) => e.toLowerCase())))
          setSuppressed(new Set((data.suppressed || []).map((e: string) => e.toLowerCase())))
        }
      } catch (e) {
        console.error(e)
        toast.error('Network error during validation')
      } finally {
        setLoadingCheck(false)
      }
    }
    run()
  }, [rows, user_id])

  const maps: ValidationMaps = useMemo(
    () => ({ badFormat, dupInFile, existing, suppressed }),
    [badFormat, dupInFile, existing, suppressed]
  )

  const classify = (email: string | undefined) => {
    const e = (email || '').trim().toLowerCase()
    if (!e || !emailRegex.test(e)) return 'badFormat'
    if (maps.dupInFile.has(e)) return 'dupInFile'
    if (maps.suppressed.has(e)) return 'suppressed'
    if (maps.existing.has(e)) return 'existing'
    return 'ok'
  }

  const counts = useMemo(() => {
    const c = { ok: 0, badFormat: 0, dupInFile: 0, existing: 0, suppressed: 0 }
    rows.forEach((r) => {
      const status = classify(r.email)
      // @ts-ignore
      c[status] += 1
    })
    return c
  }, [rows, maps])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => (filter === 'ok' ? classify(r.email) === 'ok' : classify(r.email) !== 'ok'))
  }, [rows, filter])

  const proceedDisabled = counts.ok === 0 || loadingCheck

  const proceed = () => {
    // Keep only OK rows for ingestion in the next step
    const okRows = rows.filter((r) => classify(r.email) === 'ok')
    localStorage.setItem('import_ready', JSON.stringify(okRows))
    router.push('/import/ingest') // You will implement next step
  }

  const StatusBadge = ({ email }: { email?: string }) => {
    const s = classify(email)
    switch (s) {
      case 'ok':
        return <Badge variant="default">OK</Badge>
      case 'badFormat':
        return <Badge variant="destructive">Bad Email</Badge>
      case 'dupInFile':
        return <Badge variant="secondary">Duplicate in File</Badge>
      case 'existing':
        return <Badge variant="secondary">Already in Contacts</Badge>
      case 'suppressed':
        return <Badge variant="destructive">Suppressed</Badge>
      default:
        return <Badge>Unknown</Badge>
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>✅ Import Validation (Step 3)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">OK: {counts.ok}</Badge>
            <Badge variant="destructive">Bad Email: {counts.badFormat}</Badge>
            <Badge variant="secondary">Dup in File: {counts.dupInFile}</Badge>
            <Badge variant="secondary">Existing: {counts.existing}</Badge>
            <Badge variant="destructive">Suppressed: {counts.suppressed}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>All</Button>
            <Button variant={filter === 'ok' ? 'default' : 'outline'} onClick={() => setFilter('ok')}>Only OK</Button>
            <Button variant={filter === 'issues' ? 'default' : 'outline'} onClick={() => setFilter('issues')}>Only Issues</Button>
            <div className="ml-auto flex items-center gap-2">
              <Input placeholder="Search email/company..." onChange={(e) => {
                const q = e.target.value.toLowerCase()
                const raw = localStorage.getItem('import_preview')
                if (!raw) return
                const base = JSON.parse(raw) as Row[]
                if (!q) { setRows(base); return }
                setRows(
                  base.filter(r =>
                    (r.email || '').toLowerCase().includes(q) ||
                    (r.company || '').toLowerCase().includes(q)
                  )
                )
              }} />
              <Button variant="outline" onClick={() => router.push('/import')}>← Back</Button>
              <Button disabled={proceedDisabled} onClick={proceed}>
                {loadingCheck ? 'Checking...' : `Proceed (${counts.ok} ready) →`}
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">First</th>
                  <th className="text-left p-2">Last</th>
                  <th className="text-left p-2">Company</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2"><StatusBadge email={r.email} /></td>
                    <td className="p-2">{r.email || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">{r.first_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">{r.last_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">{r.company || <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: We only import rows marked <strong>OK</strong>. Duplicates, suppressed, and invalid emails are skipped to protect sender health and improve MB/100.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}