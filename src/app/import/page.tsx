'use client'

import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { getBrowserSupabase } from '@/utils/supabase/client'
import { toast } from 'sonner'
import Link from 'next/link'

type Row = { email?: string; name?: string; company?: string; [k:string]: any }

export default function ImportPage(){
  const supabase = getBrowserSupabase()
  const [projectId, setProjectId] = useState<string>('')
  const [importId, setImportId] = useState<string | null>(null)
  const [report, setReport] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  useEffect(()=>{
    async function loadProject() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle()
      
      if (data) {
        setProjectId(data.project_id)
      }
    }
    loadProject()
  }, [supabase])

  async function handleFile(e:any){
    const file = e.target.files?.[0]
    if (!file || !projectId) {
      if (!projectId) toast.error('Please wait for project to load')
      return
    }
    setBusy(true)
    try{
      const text = await file.text()
      const parsed = Papa.parse<Row>(text, { header:true, skipEmptyLines:true })
      if (parsed.errors?.length){
        console.error(parsed.errors[0])
        toast.error('CSV parse error')
        setBusy(false); return
      }
      const rows = parsed.data

      // 1) create import
      const { data: imp, error: impErr } = await supabase.from('imports').insert({
        project_id: projectId,
        filename: file.name
      }).select('id').single()
      if (impErr) throw impErr
      setImportId(imp.id)

      // 2) insert rows in batches
      const norm = rows.map((r, i)=>({
        import_id: imp.id,
        row_num: i+1,
        email: (r.email || r.Email || r['E-mail'] || '').trim(),
        name: (r.name || r.Name || '').trim(),
        company: (r.company || r.Company || '').trim(),
        raw: r
      }))

      const chunk = 500
      for (let i=0;i<norm.length;i+=chunk){
        const slice = norm.slice(i, i+chunk)
        const { error: rowErr } = await supabase.from('import_rows').insert(slice)
        if (rowErr) throw rowErr
      }

      // 3) process import server-side
      const { error: procErr } = await supabase.rpc('process_import', { p_import: imp.id })
      if (procErr) throw procErr

      // 4) load report
      await loadReport(imp.id)
      toast.success('Import complete')
    }catch(err:any){
      console.error(err)
      toast.error(err.message || 'Import failed')
    }finally{
      setBusy(false)
    }
  }

  async function loadReport(id:string){
    const { data } = await supabase
      .from('imports')
      .select('*')
      .eq('id', id).single()
    setReport(data)
  }

  if (!projectId) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-xl font-semibold">CSV Lead Import</h1>
        <div className="text-sm text-gray-600">Loading project...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">CSV Lead Import</h1>
        <Link href="/replies" className="text-xs border rounded px-2 py-1 hover:bg-gray-50">
          ← Back to Replies
        </Link>
      </div>

      <div className="border p-4 rounded-lg">
        <p className="text-sm text-gray-600 mb-2">Headers accepted: <code className="bg-gray-100 px-1 rounded">email</code>, <code className="bg-gray-100 px-1 rounded">name</code>, <code className="bg-gray-100 px-1 rounded">company</code></p>
        <input 
          type="file" 
          accept=".csv" 
          onChange={handleFile} 
          disabled={busy}
          className="block border rounded p-2 disabled:opacity-50 disabled:cursor-not-allowed" 
        />
        {busy && <p className="text-sm mt-2 text-gray-600">Processing…</p>}
      </div>

      {report && (
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Import Report</h2>
          <ul className="text-sm space-y-1">
            <li><b>File:</b> {report.filename}</li>
            <li><b>Status:</b> <span className={`font-medium ${report.status === 'done' ? 'text-green-600' : report.status === 'error' ? 'text-red-600' : 'text-gray-600'}`}>{report.status}</span></li>
            <li><b>Total rows:</b> {report.total_rows}</li>
            <li><b>Valid rows:</b> {report.valid_rows}</li>
            <li><b>Invalid rows:</b> {report.invalid_rows}</li>
            <li><b>De-duped (skipped):</b> {report.dedup_skipped}</li>
            <li><b>Inserted leads:</b> {report.inserted_leads}</li>
            <li><b>New threads:</b> {report.created_threads}</li>
          </ul>
          {report.status==='error' && (
            <p className="text-red-600 text-sm mt-2"><b>Error:</b> {report.error_text}</p>
          )}
        </div>
      )}
    </div>
  )
}
