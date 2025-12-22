'use client'

import { useEffect, useState, useCallback } from 'react'
import { getBrowserSupabase } from '@/utils/supabase/client'

export default function TaskDrawer({ projectId, threadId }: { projectId: string, threadId: string }) {
  const supabase = getBrowserSupabase()
  const [tasks, setTasks] = useState<any[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .eq('thread_id', threadId)
      .order('created_at',{ascending:false})
    setTasks(data||[])
  }, [supabase, projectId, threadId])

  useEffect(() => {
    load()
    const ch = supabase.channel('tasks')
      .on('postgres_changes',{event:'*',schema:'public',table:'tasks'},()=>load())
      .subscribe()
    return ()=>supabase.removeChannel(ch)
  }, [load, supabase])

  async function toggle(id:string,status:string){
    const next = status==='open'?'done':'open'
    await supabase.from('tasks')
      .update({status:next,completed_at:next==='done'?new Date().toISOString():null})
      .eq('id',id)
    load()
  }

  if(tasks.length===0) return null

  return (
    <div className="border-t p-3 bg-gray-50">
      <div className="font-semibold mb-1 text-sm">Tasks</div>
      <ul className="space-y-1">
        {tasks.map(t=>(
          <li key={t.id} className="flex justify-between items-center text-sm">
            <span className={t.status==='done'?'line-through text-gray-400':''}>{t.title}</span>
            <button onClick={()=>toggle(t.id,t.status)}
              className="text-xs border rounded px-2 py-0.5">
              {t.status==='open'?'Mark Done':'Undo'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

