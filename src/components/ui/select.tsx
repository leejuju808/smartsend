"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectProps {
  onValueChange?: (value: string) => void
  defaultValue?: string
  value?: string
  children: React.ReactNode
}

interface SelectTriggerProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
}

interface SelectContentProps {
  children: React.ReactNode
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
}

interface SelectValueProps {
  placeholder?: string
}

const Select = ({ onValueChange, defaultValue, value, children }: SelectProps) => {
  const [selectedValue, setSelectedValue] = React.useState(value || defaultValue || "")
  
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value
    setSelectedValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <div className="relative">
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          if (child.type === SelectTrigger) {
            return React.cloneElement(child as React.ReactElement<SelectTriggerProps>, {
              value: selectedValue,
              onChange: handleChange,
            })
          }
        }
        return child
      })}
    </div>
  )
}

const SelectTrigger = React.forwardRef<HTMLSelectElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50 pointer-events-none" />
    </div>
  )
)
SelectTrigger.displayName = "SelectTrigger"

const SelectContent = ({ children }: SelectContentProps) => {
  return <>{children}</>
}

const SelectItem = ({ value, children }: SelectItemProps) => {
  return <option value={value}>{children}</option>
}

const SelectValue = ({ placeholder }: SelectValueProps) => {
  return <option value="" disabled>{placeholder}</option>
}

export {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
}