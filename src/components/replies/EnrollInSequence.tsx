"use client";

import { getBrowserSupabase } from '@/utils/supabase/client';
import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toast/ToastProvider';

function EnrollInSequence({ projectId, threadId }: { projectId: string; threadId: string }) {
  const supabase = getBrowserSupabase();
  const [seqs, setSeqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { push } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('sequences')
        .select('id,name')
        .eq('project_id', projectId)
        .order('created_at');
      setSeqs(data || []);
      setLoading(false);
    })();
  }, [projectId, supabase]);

  async function enroll(id: string) {
    if (!id) return;
    const { error } = await supabase.rpc('enroll_in_sequence', {
      p_project: projectId,
      p_thread: threadId,
      p_sequence: id
    });
    if (error) {
      push({
        title: 'Error',
        description: 'Enroll failed: ' + error.message,
        type: 'error'
      });
    } else {
      push({
        title: 'Success',
        description: 'Enrolled! First step scheduled',
        type: 'success'
      });
    }
  }

  if (loading || !seqs.length) return null;

  return (
    <div className="p-2 border-b flex gap-2 items-center">
      <label className="text-xs text-gray-500">Sequence:</label>
      <select
        onChange={(e) => enroll(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
        defaultValue=""
      >
        <option value="">Enroll…</option>
        {seqs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default EnrollInSequence;
