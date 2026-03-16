"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const MONTHS = [
  "Th1", "Th2", "Th3", "Th4", "Th5", "Th6",
  "Th7", "Th8", "Th9", "Th10", "Th11", "Th12",
];

const MONTH_LABELS: Record<string, string> = {
  "01": "Tháng 1", "02": "Tháng 2", "03": "Tháng 3", "04": "Tháng 4",
  "05": "Tháng 5", "06": "Tháng 6", "07": "Tháng 7", "08": "Tháng 8",
  "09": "Tháng 9", "10": "Tháng 10", "11": "Tháng 11", "12": "Tháng 12",
};

interface MonthPickerProps {
  /** Format: "YYYY-MM" */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MonthPicker({
  value,
  onChange,
  placeholder = "Chọn tháng",
  className,
}: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);

  const now = new Date();
  const selectedYear = value ? Number(value.split("-")[0]) : now.getFullYear();
  const selectedMonth = value ? Number(value.split("-")[1]) : null;

  const [viewYear, setViewYear] = React.useState(selectedYear);

  React.useEffect(() => {
    if (open) {
      setViewYear(selectedYear);
    }
  }, [open, selectedYear]);

  const handleSelect = (monthIndex: number) => {
    const mm = String(monthIndex + 1).padStart(2, "0");
    onChange?.(`${viewYear}-${mm}`);
    setOpen(false);
  };

  const displayLabel = value
    ? `${MONTH_LABELS[value.split("-")[1]]} ${value.split("-")[0]}`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-8 w-full justify-start gap-2 px-2.5 text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {displayLabel ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y - 1)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{viewYear}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y + 1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((label, i) => {
            const isSelected =
              viewYear === selectedYear && i + 1 === selectedMonth;
            const isCurrent =
              viewYear === now.getFullYear() && i === now.getMonth();
            return (
              <Button
                key={i}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 text-xs font-medium",
                  isCurrent && !isSelected && "bg-muted text-foreground",
                )}
                onClick={() => handleSelect(i)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
