"use client";
import * as React from "react";

interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ children, open: controlledOpen, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  return (
    <div className="relative inline-block">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          if (child.type === PopoverTrigger) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onClick: () => setOpen(!open),
            });
          }
          if (child.type === PopoverContent && open) {
            return React.cloneElement(child as React.ReactElement<any>);
          }
        }
        return child;
      })}
    </div>
  );
}

export function PopoverTrigger({ asChild, children, ...props }: { asChild?: boolean; children: React.ReactNode; [key: string]: any }) {
  return <div {...props}>{children}</div>;
}

export function PopoverContent({ className = "", children, ...props }: { className?: string; children: React.ReactNode; [key: string]: any }) {
  return (
    <div
      className={`absolute z-50 mt-2 w-64 rounded-lg border bg-background p-4 shadow-lg ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

