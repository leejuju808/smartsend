"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface RadioGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface RadioGroupItemProps {
  value: string;
  id?: string;
  className?: string;
}

interface RadioGroupContextType {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextType>({});

export function RadioGroup({ value, onValueChange, children, className }: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div className={cn("space-y-2", className)}>{children}</div>
    </RadioGroupContext.Provider>
  );
}

export function RadioGroupItem({ value, id, className }: RadioGroupItemProps) {
  const { value: selectedValue, onValueChange } = React.useContext(RadioGroupContext);
  const inputId = id || `radio-${value}`;
  const isChecked = selectedValue === value;

  return (
    <div className="flex items-center gap-2">
      <input
        type="radio"
        id={inputId}
        value={value}
        checked={isChecked}
        onChange={() => onValueChange?.(value)}
        className={cn(
          "h-4 w-4 border border-input text-primary focus:ring-2 focus:ring-ring",
          className
        )}
      />
    </div>
  );
}

