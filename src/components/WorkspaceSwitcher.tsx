'use client';
import { useEffect, useState } from 'react';

export function WorkspaceSwitcher() {
  const [items, setItems] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/me/workspaces');
      const j = await r.json();
      setItems(j.items || []);
      setActive(j.active?.id || j.items?.[0]?.id || null);
    })();
  }, []);

  function go(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('ws', id);
    
    // Set cookie
    document.cookie = `ws=${id}; path=/; SameSite=Lax; ${window.location.protocol === 'https:' ? 'Secure;' : ''}`;
    
    window.location.href = url.toString();
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm text-gray-600">Workspace</span>
      <select
        className="rounded-xl border px-3 py-2"
        value={active ?? ''}
        onChange={(e) => go(e.target.value)}
      >
        {items.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </div>
  );
}
