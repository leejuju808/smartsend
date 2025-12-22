"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const COMMON_TZS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Boise",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
];

function validIana(tz: string) {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function TimeZoneSelect({
  value,
  onChange,
  placeholder = "Select timezone...",
}: {
  value?: string | null;
  onChange: (tz: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const display = value || "";
  const [inputValue, setInputValue] = React.useState(display);

  React.useEffect(() => {
    setInputValue(display);
  }, [display]);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-64 justify-between">
            {display || placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search timezone" />
            <CommandList>
              <CommandGroup heading="Common">
                {COMMON_TZS.map((tz) => (
                  <CommandItem
                    key={tz}
                    onSelect={() => {
                      setOpen(false);
                      setInputValue(tz);
                      onChange(tz);
                    }}
                  >
                    {tz}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        className="w-72"
        placeholder="Or type full IANA (e.g., Europe/Lisbon)"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={(e) => {
          const tz = e.target.value.trim();
          if (!tz) {
            setInputValue(display);
            return;
          }
          if (validIana(tz)) {
            setInputValue(tz);
            onChange(tz);
          } else {
            alert("Invalid timezone. Use a valid IANA ID like America/Los_Angeles.");
            setInputValue(display);
          }
        }}
      />
    </div>
  );
}

