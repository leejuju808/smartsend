"use client"
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

export default function WorkspaceSwitcher() {
  const supabase = createClientComponentClient()
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [active, setActive] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('workspace_members')
        .select('workspace_id, workspaces(*)')
        .eq('user_id', user.id)
      const list = (data || []).map((m: any) => (m as any).workspaces)
      setWorkspaces(list)
      setActive(list[0] || null)
      if (list[0]) localStorage.setItem('active_workspace', (list[0] as any).id)
    }
    load()
  }, [supabase])

  return (
    <div className="mb-4">
      <label className="block text-xs text-gray-500 mb-1">Workspace</label>
      <select
        className="w-full border rounded-lg p-2 text-sm"
        value={active?.id || ''}
        onChange={(e) => {
          const ws = workspaces.find((w) => (w as any).id === e.target.value)
          setActive(ws)
          if (ws) localStorage.setItem('active_workspace', (ws as any).id)
        }}
      >
        {workspaces.map((w: any) => (
          <option key={(w as any).id} value={(w as any).id}>
            {(w as any).name}
          </option>
        ))}
      </select>
    </div>
  )
}

