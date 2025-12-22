"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";
import ReplyComposer from "./ReplyComposer";
import TaskDrawer from "./TaskDrawer";
import EnrollInSequence from "./EnrollInSequence";
import ThreadProfilePicker from "./ThreadProfilePicker";

export default function ThreadView({ thread }: { thread: any }) {
  const supabase = getBrowserSupabase();
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    loadMessages();
  }, [thread]);

  async function loadMessages() {
    const { data } = await supabase.rpc("get_thread", { 
      p_project: thread.project_id,
      p_thread: thread.id 
    });
    setMessages(data || []);
  }

  async function unsuppressThread() {
    const { error } = await supabase
      .from('threads')
      .update({ suppressed: false, delivery_status: 'ok', bounce_reason: null })
      .eq('id', thread.id);
    
    if (error) {
      console.error('Failed to unsuppress thread:', error);
      return;
    }
    
    // Reload the thread data
    const { data } = await supabase
      .from('threads')
      .select('*')
      .eq('id', thread.id)
      .single();
    
    if (data) {
      Object.assign(thread, data);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex gap-2 items-center justify-between">
        <div className="flex gap-2">
          <EnrollInSequence projectId={thread.project_id} threadId={thread.id} />
          <ThreadProfilePicker projectId={thread.project_id} threadId={thread.id} />
          {thread.delivery_status === 'bounced' && (
            <button
              onClick={unsuppressThread}
              className="text-xs border rounded px-2 py-1 hover:bg-green-50 text-green-700"
            >
              Unsuppress
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`mb-3 ${m.direction === "in" ? "text-left" : "text-right"}`}>
            <div
              className={`inline-block px-3 py-2 rounded-2xl ${
                m.direction === "in" ? "bg-gray-200" : "bg-blue-500 text-white"
              }`}
            >
              {m.body}
            </div>
          </div>
        ))}
      </div>
      <TaskDrawer projectId={thread.project_id} threadId={thread.id}/>
      <ReplyComposer threadId={thread.id} projectId={thread.project_id} onSend={loadMessages} />
    </div>
  );
}
