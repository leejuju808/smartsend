'use client'

import React, { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import Papa from 'papaparse'
import { leadSchema, type LeadInput } from '@/lib/leadSchema'
import { importLeadsAction } from '@/app/(dashboard)/leads/importActions'

type RawRow = Record<string, string | number | null | undefined>

const TARGET_FIELDS = ['email','first_name','last_name','company','phone'] as const
type TargetField = typeof TARGET_FIELDS[number]

const pretty = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

function guessMapping(headers: string[]) {
  const lower = headers.map(h => h.toLowerCase())
  const pick = (tests: (h:string)=>boolean) =>
    headers[lower.findIndex(tests)] ?? ''
  return {
    email:     pick(h => /(^|[^a-z])email(s)?([^a-z]|$)/.test(h)),
    first_name:pick(h => /(first(\s+)?name|fname|given)/.test(h)),
    last_name: pick(h => /(last(\s+)?name|lname|surname|family)/.test(h)),
    company:   pick(h => /(company|org(anization)?|business|employer)/.test(h)),
    phone:     pick(h => /(phone|mobile|cell|tel(ephone)?)/.test(h)),
  }
}

function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

export default function LeadImport({
  workspaceId,
  onComplete,
}: {
  workspaceId: string
  onComplete?: (summary: {attempted:number; inserted:number; skipped:number; errors:string[]}) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [filename, setFilename] = useState<string>('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawRow[]>([])
  const [mapping, setMapping] = useState<Record<TargetField, string>>({
    email:'', first_name:'', last_name:'', company:'', phone:''
  })
  const [overwrite, setOverwrite] = useState(false)
  const [status, setStatus] = useState<string>('')

  const onPickFile = useCallback(() => fileInputRef.current?.click(), [])

  const parseFile = useCallback((file: File) => {
    return new Promise<{headers: string[]; rows: RawRow[]}>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
        complete: (res: any) => {
          if (res.errors?.length) {
            reject(new Error(res.errors.map((e: any) => e.message).join('; ')))
            return
          }
          const data = res.data.filter(Boolean) as RawRow[]
          // Extract headers from the first row or use meta fields
          const hdrs = res.meta?.fields && res.meta.fields.length > 0 
            ? res.meta.fields
            : (data.length > 0 ? Object.keys(data[0]) : [])
          // Trim headers
          const trimmedHeaders = hdrs.map((h: string) => h.trim())
          resolve({ headers: trimmedHeaders, rows: data })
        },
        error: (err: any) => reject(err),
      })
    })
  }, [])

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files[0]) return
    const file = files[0]
    setFilename(file.name)
    setStatus('Parsing...')
    try {
      const { headers, rows } = await parseFile(file)
      setHeaders(headers)
      setRows(rows)
      const g = guessMapping(headers)
      setMapping({
        email: g.email,
        first_name: g.first_name,
        last_name: g.last_name,
        company: g.company,
        phone: g.phone,
      })
      setStatus(`Parsed ${rows.length} rows.`)
    } catch (e:any) {
      setStatus(`Parse error: ${e.message ?? String(e)}`)
    }
  }, [parseFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    onFiles(e.dataTransfer.files)
  }, [onFiles])

  const mappedPreview = useMemo(() => {
    // map first 10 rows into LeadInput with a batch duplicate check (by email)
    const seen = new Set<string>()
    const preview = rows.slice(0, 10).map((r) => {
      const emailRaw = (mapping.email ? (r[mapping.email] ?? '') : '') + ''
      const email = emailRaw.trim().toLowerCase()
      const li: LeadInput = {
        email,
        first_name: mapping.first_name ? (r[mapping.first_name] as string|undefined) : undefined,
        last_name:  mapping.last_name  ? (r[mapping.last_name]  as string|undefined) : undefined,
        company:    mapping.company    ? (r[mapping.company]    as string|undefined) : undefined,
        phone:      mapping.phone      ? (r[mapping.phone]      as string|undefined) : undefined,
        meta: {},
      }
      // collect unmapped columns to meta
      for (const h of headers) {
        if (!Object.values(mapping).includes(h)) {
          const v = r[h]
          if (v !== undefined && v !== null && `${v}`.trim() !== '') {
            li.meta![h] = v
          }
        }
      }
      // validation + batch duplicate flag
      const parsed = leadSchema.safeParse(li)
      const dup = email ? seen.has(email) : false
      if (email) seen.add(email)
      return { row: li, ok: parsed.success && !dup, err: parsed.success ? (dup ? 'Duplicate in batch' : '') : parsed.error.issues.map((i: any) => i.message).join(', ') }
    })
    return preview
  }, [rows, mapping, headers])

  const totalRows = rows.length
  const validCount = useMemo(() => mappedPreview.filter(x => x.ok).length, [mappedPreview])

  const onImport = useCallback(() => {
    if (!workspaceId) {
      setStatus('Missing workspaceId.')
      return
    }
    if (!mapping.email) {
      setStatus('Please map the Email column before importing.')
      return
    }
    setStatus('Validating & sending...')
    // Build full payload (not just preview)
    const payloadRows: LeadInput[] = rows.map((r) => {
      const email = ((mapping.email ? (r[mapping.email] ?? '') : '') + '').trim().toLowerCase()
      const li: LeadInput = {
        email,
        first_name: mapping.first_name ? (r[mapping.first_name] as string|undefined) : undefined,
        last_name:  mapping.last_name  ? (r[mapping.last_name]  as string|undefined) : undefined,
        company:    mapping.company    ? (r[mapping.company]    as string|undefined) : undefined,
        phone:      mapping.phone      ? (r[mapping.phone]      as string|undefined) : undefined,
        meta: {},
      }
      for (const h of headers) {
        if (!Object.values(mapping).includes(h)) {
          const v = r[h]
          if (v !== undefined && v !== null && `${v}`.trim() !== '') {
            li.meta![h] = v
          }
        }
      }
      return li
    })

    // Filter out obviously invalid emails before server call
    const cleaned = payloadRows.filter(r => leadSchema.safeParse(r).success)

    startTransition(async () => {
      try {
        const res = await importLeadsAction({
          workspace_id: workspaceId,
          rows: cleaned,
          overwrite,
        })
        setStatus(`Done. Inserted ${res.inserted}/${res.attempted} (skipped ${res.skipped}).`)
        onComplete?.(res)
      } catch (e:any) {
        setStatus(`Import failed: ${e.message ?? String(e)}`)
      }
    })
  }, [workspaceId, rows, mapping, headers, overwrite, onComplete])

  return (
    <div className="rounded-2xl border p-4 md:p-6">
      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e)=>e.preventDefault()}
        className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer hover:bg-neutral-50"
        onClick={onPickFile}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e)=>onFiles(e.target.files)}
        />
        <div className="text-center">
          <div className="text-lg font-semibold">Drag & drop your CSV here</div>
          <div className="text-sm text-neutral-500">or click to choose a file</div>
          {filename && <div className="mt-2 text-sm">Selected: <span className="font-medium">{filename}</span></div>}
        </div>
      </div>

      {/* Mapping */}
      {headers.length > 0 && (
        <div className="mt-6">
          <div className="font-semibold mb-2">Column Mapping</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TARGET_FIELDS.map((tf) => (
              <div key={tf} className="flex items-center gap-3">
                <label className="w-32 text-sm capitalize">{pretty(tf)}</label>
                  <select
                  className="flex-1 border rounded-md px-2 py-1"
                  value={mapping[tf]}
                  onChange={(e)=>setMapping(m=>({ ...m, [tf]: e.target.value }))}
                >
                  <option value="">— Not mapped —</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Preview (first 10)</div>
            <div className="text-sm text-neutral-600">
              Total rows: <span className="font-medium">{totalRows}</span> • Valid in preview: <span className="font-medium">{validCount}</span>
              </div>
              </div>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm border">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-2 py-1 border">Status</th>
                  <th className="px-2 py-1 border">Email</th>
                  <th className="px-2 py-1 border">First</th>
                  <th className="px-2 py-1 border">Last</th>
                  <th className="px-2 py-1 border">Company</th>
                  <th className="px-2 py-1 border">Phone</th>
                  </tr>
                </thead>
                <tbody>
                {mappedPreview.map((p, i) => (
                  <tr key={i} className={p.ok ? '' : 'bg-red-50'}>
                    <td className="px-2 py-1 border">{p.ok ? '✅ OK' : `⚠️ ${p.err}`}</td>
                    <td className="px-2 py-1 border">{p.row.email || ''}</td>
                    <td className="px-2 py-1 border">{p.row.first_name || ''}</td>
                    <td className="px-2 py-1 border">{p.row.last_name || ''}</td>
                    <td className="px-2 py-1 border">{p.row.company || ''}</td>
                    <td className="px-2 py-1 border">{p.row.phone || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          {/* Options */}
          <div className="mt-4 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
                checked={overwrite}
                onChange={(e)=>setOverwrite(e.target.checked)}
              />
              Overwrite duplicates (instead of skipping)
            </label>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center gap-3">
            <button
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60"
              disabled={isPending || rows.length === 0 || !mapping.email}
              onClick={onImport}
            >
              {isPending ? 'Importing…' : 'Import Leads'}
            </button>
            <button
              className="px-4 py-2 rounded-lg border"
              onClick={()=>{
                setFilename('')
                setHeaders([])
                setRows([])
                setMapping({ email:'', first_name:'', last_name:'', company:'', phone:'' })
                setStatus('')
              }}
            >
              Reset
            </button>
            <div className="text-sm text-neutral-600">{status}</div>
          </div>
        </div>
      )}
    </div>
  )
} 
