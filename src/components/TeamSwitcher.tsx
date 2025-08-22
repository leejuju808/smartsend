"use client"
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase'

export default function TeamSwitcher() {
  const supabase = createClientComponentClient()
  const [teams, setTeams] = useState<any[]>([])
  const [active, setActive] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('team_members')
        .select('team_id, teams(*)')
        .eq('user_id', user.id)
      const list = (data || []).map((m: any) => (m as any).teams)
      setTeams(list)
      const saved = typeof window !== 'undefined' ? localStorage.getItem('active_team') : null
      const initial = list.find((t: any) => (t as any).id === saved) || list[0] || null
      setActive(initial)
      if (initial) localStorage.setItem('active_team', (initial as any).id)
    }
    load()
  }, [supabase])

  return (
    <div className="mb-4">
      <label className="block text-xs text-gray-500 mb-1">Context</label>
      <select
        className="w-full border rounded-lg p-2 text-sm"
        value={active?.id || ''}
        onChange={(e) => {
          const t = teams.find((w) => (w as any).id === e.target.value)
          setActive(t)
          if (t) localStorage.setItem('active_team', (t as any).id)
        }}
      >
        <option value="">Personal</option>
        {teams.map((w: any) => (
          <option key={(w as any).id} value={(w as any).id}>
            Team: {(w as any).name}
          </option>
        ))}
      </select>
    </div>
  )
}

