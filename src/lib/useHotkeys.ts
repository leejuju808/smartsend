import { useEffect } from 'react';

export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (map[key]) {
        e.preventDefault();
        map[key](e);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [JSON.stringify(Object.keys(map))]);
}

