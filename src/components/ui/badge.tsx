import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success";
}

export function Badge({ children, variant = "default", className = "", ...props }: BadgeProps) {
  const baseClasses = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  
  const variants = {
    default: "border-transparent bg-green-600 text-white hover:bg-green-600/80",
    secondary: "border-transparent bg-muted text-foreground hover:bg-muted/80",
    destructive: "border-transparent bg-red-600 text-white hover:bg-red-600/80",
    outline: "border-yellow-500 text-yellow-700 hover:bg-yellow-50",
    success: "border-transparent bg-emerald-500 text-white hover:bg-emerald-500/80",
  };

  return (
    <span className={`${baseClasses} ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}