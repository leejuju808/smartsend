import * as React from "react";
import { cn } from "./utils";

export interface LayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "dashboard" | "minimal";
}

export const Layout = React.forwardRef<HTMLDivElement, LayoutProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "min-h-screen bg-brand-black text-white",
      dashboard: "min-h-screen bg-surface text-white",
      minimal: "bg-transparent",
    };

    return (
      <div
        ref={ref}
        className={cn(variantStyles[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Layout.displayName = "Layout";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, maxWidth = "lg", children, ...props }, ref) => {
    const maxWidthStyles = {
      sm: "max-w-screen-sm",
      md: "max-w-screen-md",
      lg: "max-w-screen-lg",
      xl: "max-w-screen-xl",
      full: "max-w-full",
    };

    return (
      <div
        ref={ref}
        className={cn("mx-auto px-4 sm:px-6 lg:px-8", maxWidthStyles[maxWidth], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = "Container";









