"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface CurrencyInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string | number;
  onChange: (value: string) => void;
  onValueChange?: (numericValue: number) => void;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, onValueChange, className, ...props }, ref) => {
    const displayValue =
      value === "" || value === 0 || value === undefined || value === null
        ? ""
        : formatCurrencyInput(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const digits = raw.replace(/\D/g, "");
      const formatted = digits === "" ? "" : formatCurrencyInput(digits);
      onChange(formatted);
      onValueChange?.(parseCurrencyInput(formatted));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        className={cn(className)}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput, formatCurrencyInput, parseCurrencyInput };
