"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const combinedRef = React.useCallback((node: HTMLInputElement | null) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
      internalRef.current = node;
    }, [ref]);

    React.useEffect(() => {
      if (internalRef.current) {
        internalRef.current.indeterminate = checked === "indeterminate";
      }
    }, [checked]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onCheckedChange) {
        onCheckedChange(e.target.checked);
      }
      if (props.onChange) {
        props.onChange(e);
      }
    };

    return (
      <input
        type="checkbox"
        ref={combinedRef}
        className={cn(
          "h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary",
          className
        )}
        checked={checked === "indeterminate" ? false : checked}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

Checkbox.displayName = "Checkbox";
