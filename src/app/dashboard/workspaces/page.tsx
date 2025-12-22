import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function WorkspacesPage() {
  const sb = createServerComponentClient({ cookies });
  const {
    data: { user }
  } = await sb.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: mships } = await sb
    .from('workspace_members')
    .select('workspace_id, role, workspaces!inner(id, name, created_at)')
    .eq('user_id', user?.id || '')
    .order('role', { ascending: false });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Workspaces</h1>
      
      <form action="/api/workspaces/create" method="post" className="flex gap-2">
        <input 
          name="name" 
          placeholder="New workspace name" 
          className="border rounded-xl p-2 flex-1" 
          required
        />
        <button className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">
          Create
        </button>
      </form>
      
      <div className="grid md:grid-cols-2 gap-4">
        {(mships || []).map((m: any) => (
          <a 
            key={m.workspace_id} 
            href={`/dashboard?ws=${m.workspaces.id}`} 
            className="border rounded-2xl p-4 block hover:border-blue-300 transition-colors"
          >
            <div className="font-semibold">{m.workspaces.name}</div>
            <div className="text-xs text-gray-600 mt-1">
              Role: <span className="capitalize">{m.role}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Created: {new Date(m.workspaces.created_at).toLocaleDateString()}
            </div>
          </a>
        ))}
      </div>
      
      {(!mships || mships.length === 0) && (
        <div className="text-center text-gray-500 py-8">
          No workspaces found. Create your first workspace above.
        </div>
      )}
    </div>
  );
} 