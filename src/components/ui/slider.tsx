"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  max?: number;
  min?: number;
  step?: number;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, defaultValue, onValueChange, max = 100, min = 0, step = 1, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState<number[]>(
      value || defaultValue || [min]
    );

    React.useEffect(() => {
      if (value !== undefined) {
        setInternalValue(value);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = [parseInt(e.target.value, 10)];
      setInternalValue(newValue);
      if (onValueChange) {
        onValueChange(newValue);
      }
    };

    const currentValue = value !== undefined ? value[0] : internalValue[0];
    const percentage = ((currentValue - min) / (max - min)) * 100;

    return (
      <div className={cn("relative flex w-full items-center", className)}>
        <input
          type="range"
          ref={ref}
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={handleChange}
          className={cn(
            "h-2 w-full cursor-pointer appearance-none rounded-lg bg-input",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
          )}
          {...props}
        />
        <div className="absolute -top-1 left-0 text-xs text-muted-foreground">
          {currentValue}
        </div>
      </div>
    );
  }
);

Slider.displayName = "Slider";

