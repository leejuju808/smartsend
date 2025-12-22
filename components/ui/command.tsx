"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/Input";
import { cn } from "@/lib/utils";

const CommandContext = React.createContext<{
  value: string;
  setValue: (value: string) => void;
}>({
  value: "",
  setValue: () => {},
});

export function CommandDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  placeholder,
  value: controlledValue,
  onValueChange,
}: {
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const context = React.useContext(CommandContext);
  const value = controlledValue ?? context.value;
  const setValue = onValueChange ?? context.setValue;

  return (
    <div className="border-b px-3 py-2">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border-0 focus-visible:ring-0"
        autoFocus
      />
    </div>
  );
}

export function CommandList({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[400px] overflow-y-auto p-2">{children}</div>
  );
}

export function CommandEmpty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function CommandGroup({
  heading,
  children,
}: {
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      {heading && (
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {heading}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

export function CommandSeparator() {
  return <div className="h-px bg-border my-1" />;
}

export function CommandItem({
  children,
  onSelect,
  className,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className
      )}
      onClick={onSelect}
    >
      {children}
    </div>
  );
}

export function Command({
  children,
  value: controlledValue,
  onValueChange,
}: {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = React.useState("");
  const value = controlledValue ?? internalValue;
  const setValue = onValueChange ?? ((v: string) => setInternalValue(v));

  return (
    <CommandContext.Provider value={{ value, setValue }}>
      {children}
    </CommandContext.Provider>
  );
}

