"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

interface SheetContentProps {
  className?: string;
  children: React.ReactNode;
  side?: "left" | "right" | "top" | "bottom";
}

interface SheetHeaderProps {
  children: React.ReactNode;
}

interface SheetTitleProps {
  children: React.ReactNode;
}

interface SheetDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

interface SheetFooterProps {
  children: React.ReactNode;
}

interface SheetTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export function Sheet({ open: controlledOpen, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };

  const contextValue = React.useMemo(() => ({ open, setOpen }), [open]);

  return (
    <SheetContext.Provider value={contextValue}>
      {children}
    </SheetContext.Provider>
  );
}

const SheetContext = React.createContext<{ open: boolean; setOpen: (value: boolean) => void } | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) throw new Error("Sheet components must be used within Sheet");
  return context;
}

export function SheetTrigger({ asChild, children }: SheetTriggerProps) {
  const { setOpen } = useSheetContext();
  
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: () => setOpen(true),
    } as any);
  }
  
  return (
    <button onClick={() => setOpen(true)} className="inline-flex items-center">
      {children}
    </button>
  );
}

export function SheetContent({ className, children, side = "right" }: SheetContentProps) {
  const { open, setOpen } = useSheetContext();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setOpen(false)}
      />
      <div
        className={cn(
          side === "right" && "fixed right-0 top-0 h-full w-full sm:max-w-2xl bg-background border-l shadow-lg z-50 overflow-y-auto",
          side === "left" && "fixed left-0 top-0 h-full w-full sm:max-w-2xl bg-background border-r shadow-lg z-50 overflow-y-auto",
          side === "top" && "fixed top-0 left-0 w-full max-h-[80vh] bg-background border-b shadow-lg z-50 overflow-y-auto",
          side === "bottom" && "fixed bottom-0 left-0 w-full max-h-[80vh] bg-background border-t shadow-lg z-50 overflow-y-auto",
          className
        )}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </>
  );
}

export function SheetHeader({ children }: SheetHeaderProps) {
  return <div className="px-6 pt-6 pb-4">{children}</div>;
}

export function SheetTitle({ children }: SheetTitleProps) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}

export function SheetDescription({ children, className }: SheetDescriptionProps) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function SheetFooter({ children }: SheetFooterProps) {
  return <div className="px-6 py-4 border-t">{children}</div>;
}

