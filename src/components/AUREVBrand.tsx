"use client";

import { Zap } from "lucide-react";
import Link from "next/link";

interface AUREVBrandProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  variant?: "default" | "monochrome";
}

/**
 * AUREV HQ Brand Component
 * Unified black & gold lightning theme across all dashboards
 */
export default function AUREVBrand({ 
  size = "md", 
  showTagline = false,
  variant = "default"
}: AUREVBrandProps) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl"
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  };

  const taglineClasses = size === "lg" ? "text-base" : size === "md" ? "text-sm" : "text-xs";

  return (
    <Link href="/aurev-hq/dashboard" className="flex items-center gap-2 group">
      <div className={`
        ${variant === "default" ? "text-yellow-500 group-hover:text-yellow-400" : "text-gray-400"}
        transition-colors
      `}>
        <Zap className={iconSizes[size]} />
      </div>
      <div className="flex flex-col">
        <span className={`
          font-bold tracking-tight
          ${sizeClasses[size]}
          ${variant === "default" 
            ? "bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent" 
            : "text-gray-800 dark:text-gray-100"
          }
        `}>
          AUREV HQ
        </span>
        {showTagline && (
          <span className={`
            ${taglineClasses}
            text-gray-500 dark:text-gray-400
          `}>
            Where Intelligent Automation Meets Execution
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * AUREV Logo Mark
 * Simple logo without text
 */
export function AUREVLogo({ size = "md", variant = "default" }: AUREVBrandProps) {
  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  };

  return (
    <Link href="/aurev-hq/dashboard" className="group">
      <Zap 
        className={`
          ${iconSizes[size]}
          ${variant === "default" 
            ? "text-yellow-500 group-hover:text-yellow-400" 
            : "text-gray-800 dark:text-gray-400"
          }
          transition-colors
        `} 
      />
    </Link>
  );
}

