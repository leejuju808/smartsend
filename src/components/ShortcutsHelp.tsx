'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/Button';

export default function ShortcutsHelp({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (v: boolean) => void;
}) {
  const shortcuts = [
    { keys: ['j', 'k'], description: 'Navigate threads (next/previous)' },
    { keys: ['r'], description: 'Mark as Replied' },
    { keys: ['e'], description: 'Archive' },
    { keys: ['⌘', 'Enter'], description: 'Send message (Mac)' },
    { keys: ['Ctrl', 'Enter'], description: 'Send message (Windows/Linux)' },
    { keys: ['⌘', '⇧', 'R'], description: 'Rewrite with AI (Mac)' },
    { keys: ['Ctrl', '⇧', 'R'], description: 'Rewrite with AI (Windows/Linux)' },
    { keys: ['?'], description: 'Open this shortcuts panel' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          {shortcuts.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-sm text-gray-300">{shortcut.description}</span>
              <div className="flex gap-1">
                {shortcut.keys.map((key, j) => (
                  <kbd
                    key={j}
                    className="px-2 py-1 text-xs font-semibold text-gray-200 bg-gray-800 border border-gray-700 rounded"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

