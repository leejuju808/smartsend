import * as React from "react";
import { cn } from "./utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: string;
  variant?: "default" | "gold" | "outline";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, label, children, variant = "default", ...props }, ref) => {
    const baseStyles = "inline-flex items-center px-2 py-1 text-xs font-semibold rounded-lg transition-colors";
    
    const variantStyles = {
      default: "bg-brand-gold/20 text-brand-gold border border-brand-gold/30",
      gold: "bg-brand-gold text-brand-black border border-brand-gold",
      outline: "bg-transparent text-brand-gold border border-brand-gold",
    };

    return (
      <span
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], className)}
        {...props}
      >
        {label || children}
      </span>
    );
  }
);

Badge.displayName = "Badge";









