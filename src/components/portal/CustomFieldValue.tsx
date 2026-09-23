"use client";

/**
 * CustomFieldValue — typed inline editor for an org custom field.
 * Types: TEXT (input), NUMBER (numeric input), DATE (popover calendar),
 * SELECT (dropdown), CHECKBOX (switch). Calls onChange(null) to clear.
 */

import { useState } from "react";
import { CalendarClock, Type } from "lucide-react";

import type { CustomFieldDTO } from "@/lib/portal-types";
import { formatDate } from "./RelativeTime";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function CustomFieldValue({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDTO;
  /** Current stored value (string) or null when unset. */
  value: string | null;
  /** Called with the next string value, or null to clear. */
  onChange: (value: string | null) => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="block truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {field.name}
      </label>

      {field.type === "TEXT" && (
        <Input
          className="h-8"
          aria-label={field.name}
          placeholder="Type…"
          defaultValue={value ?? ""}
          key={`cf-${field.id}-${value ?? ""}`}
          onBlur={(e) => onChange(e.target.value.trim() || null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}

      {field.type === "NUMBER" && (
        <Input
          type="number"
          className="h-8"
          aria-label={field.name}
          defaultValue={value ?? ""}
          key={`cf-${field.id}-${value ?? ""}`}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (!raw) return onChange(null);
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(String(n));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}

      {field.type === "DATE" && (
        <div className="flex items-center gap-1">
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("h-8 flex-1 justify-start font-normal", !value && "text-muted-foreground/80")}
                aria-label={field.name}
              >
                <CalendarClock className="size-3.5 text-muted-foreground/80" aria-hidden />
                {value ? formatDate(value) : "Set date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(d) => {
                  setDateOpen(false);
                  onChange(d ? d.toISOString() : null);
                }}
              />
            </PopoverContent>
          </Popover>
          {value && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Clear ${field.name}`}
              onClick={() => onChange(null)}
            >
              <Type className="size-3.5 rotate-45" aria-hidden />
            </Button>
          )}
        </div>
      )}

      {field.type === "SELECT" && (
        <Select
          value={value ?? "none"}
          onValueChange={(v) => onChange(v === "none" ? null : v)}
        >
          <SelectTrigger size="sm" className="w-full" aria-label={field.name}>
            <span className={cn(!value && "text-muted-foreground/80")}>{value ?? "None"}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground/80">None</span>
            </SelectItem>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === "CHECKBOX" && (
        <div className="flex h-8 items-center">
          <Switch
            checked={value === "true"}
            onCheckedChange={(v) => onChange(v ? "true" : "false")}
            aria-label={field.name}
          />
        </div>
      )}
    </div>
  );
}
