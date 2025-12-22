"use client";
import * as React from "react";

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType | undefined>(undefined);

export function Dialog({ 
  open: controlledOpen, 
  onOpenChange, 
  children 
}: { 
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback((newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isControlled, onOpenChange]);

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {open && children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({ 
  asChild, 
  children 
}: { 
  asChild?: boolean; 
  children: React.ReactNode;
}) {
  const context = React.useContext(DialogContext);
  if (!context) {
    // Standalone trigger without Dialog wrapper
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <div onClick={() => setOpen(true)}>{children}</div>
        {open && <Dialog open={open} onOpenChange={setOpen}>{context?.children}</Dialog>}
      </>
    );
  }
  
  const handleClick = () => {
    context.setOpen(true);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { onClick: handleClick });
  }

  return <div onClick={handleClick}>{children}</div>;
}

export function DialogContent({ 
  className, 
  children 
}: { 
  className?: string; 
  children: React.ReactNode;
}) {
  const context = React.useContext(DialogContext);
  
  if (!context) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={() => context.setOpen(false)}
    >
      <div 
        className={"bg-background rounded-2xl shadow-xl w-full max-w-lg p-6 " + (className ?? "")}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold">{children}</h3>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
