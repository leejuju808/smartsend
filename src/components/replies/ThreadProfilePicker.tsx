"use client";

import { useEffect, useState } from 'react'
import { getBrowserSupabase } from "@/utils/supabase/client"

function ThreadProfilePicker({ projectId, threadId }: { projectId: string; threadId: string }) {
  const sb = getBrowserSupabase()
  const [list, setList] = useState<any[]>([])
  const [selected, setSelected] = useState<string>('')

  useEffect(()=>{ 
    (async()=>{
      const { data } = await sb.from('sending_profiles').select('id,name').eq('project_id', projectId).eq('is_active', true)
      setList(data||[])
    })() 
  },[projectId, sb])

  // Load current selection
  useEffect(() => {
    (async() => {
      const { data: thread } = await sb.from('threads').select('sending_profile_id').eq('id', threadId).single()
      if (thread?.sending_profile_id) {
        setSelected(thread.sending_profile_id)
      }
    })()
  }, [threadId, sb])

  async function setProfile(id:string){
    setSelected(id)
    await sb.from('threads').update({ sending_profile_id: id || null }).eq('id', threadId)
  }

  if (list.length === 0) return null

  return (
    <select className="border rounded px-2 py-1 text-xs" value={selected} onChange={e=>setProfile(e.target.value)}>
      <option value="">Default profile</option>
      {list.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

export default ThreadProfilePicker

