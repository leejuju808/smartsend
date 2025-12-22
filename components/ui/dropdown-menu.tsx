"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DropdownMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLDivElement>;
};

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu() {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) {
    throw new Error("Dropdown menu components must be used within <DropdownMenu>");
  }
  return ctx;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!open) return;
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        contentRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keyup", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keyup", handleEscape);
    };
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef, contentRef }}>
      <div className="relative inline-flex">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

type DropdownMenuTriggerProps = {
  children: React.ReactNode;
  asChild?: boolean;
};

export function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  const { open, setOpen, triggerRef } = useDropdownMenu();

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    setOpen(!open);
  };

  const setRef = (node: HTMLElement | null) => {
    if (node) {
      triggerRef.current = node;
    }
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, {
      ref: (node: HTMLElement | null) => {
        setRef(node);
        const { ref } = children as React.ReactElement & { ref?: React.Ref<any> };
        if (typeof ref === "function") {
          ref(node);
        } else if (ref && typeof ref === "object") {
          (ref as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      },
      onClick: (event: React.MouseEvent) => {
        handleClick(event);
        if (children.props.onClick) {
          children.props.onClick(event);
        }
      },
      "aria-haspopup": "menu",
      "aria-expanded": open,
    });
  }

  return (
    <button
      ref={setRef}
      type="button"
      onClick={handleClick}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      {children}
    </button>
  );
}

type DropdownMenuContentProps = {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
};

export function DropdownMenuContent({ children, align = "start", className }: DropdownMenuContentProps) {
  const { open, contentRef } = useDropdownMenu();

  if (!open) return null;

  return (
    <div
      ref={contentRef}
      role="menu"
      className={cn(
        "absolute z-50 mt-2 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md focus:outline-none",
        align === "end" ? "right-0" : "left-0",
        className
      )}
    >
      {children}
    </div>
  );
}

type DropdownMenuItemProps = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
};

export function DropdownMenuItem({ children, onClick, className, disabled }: DropdownMenuItemProps) {
  const { setOpen } = useDropdownMenu();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        setOpen(false);
        onClick?.();
      }}
      className={cn(
        "flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/60"
          : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {children}
    </div>
  );
}

type DropdownMenuCheckboxItemProps = {
  children: React.ReactNode;
  checked?: boolean;
  disabled?: boolean;
};

export function DropdownMenuCheckboxItem({ children, checked, disabled }: DropdownMenuCheckboxItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
        disabled ? "cursor-not-allowed text-muted-foreground/60" : "text-muted-foreground"
      )}
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-disabled={disabled}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded border",
          checked ? "bg-primary text-primary-foreground" : "bg-background"
        )}
      >
        {checked ? "✓" : ""}
      </span>
      <span>{children}</span>
    </div>
  );
}


