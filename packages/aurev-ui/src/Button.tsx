import * as React from "react";
import { cn } from "./utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand-gold focus:ring-offset-2 focus:ring-offset-surface disabled:pointer-events-none disabled:opacity-50";
    
    const variantStyles = {
      primary: "bg-brand-gold text-brand-black hover:bg-yellow-400 active:bg-yellow-500 shadow-soft",
      secondary: "bg-surface border border-gray-700 text-white hover:border-brand-gold hover:text-brand-gold",
      outline: "border-2 border-brand-gold text-brand-gold bg-transparent hover:bg-brand-gold hover:text-brand-black",
      ghost: "text-white hover:bg-gray-800 hover:text-brand-gold",
    };

    const sizeStyles = {
      sm: "h-9 px-3 text-sm",
      md: "h-10 px-4 py-2",
      lg: "h-12 px-8 text-lg",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

