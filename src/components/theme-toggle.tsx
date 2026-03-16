"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useThemeStore } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();

  const next = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <button
      type="button"
      onClick={next}
      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
      title={`Hiện tại: ${theme === "light" ? "Sáng" : theme === "dark" ? "Tối" : "Hệ thống"}`}
    >
      {theme === "light" && <Sun className="h-3.5 w-3.5" />}
      {theme === "dark" && <Moon className="h-3.5 w-3.5" />}
      {theme === "system" && <Monitor className="h-3.5 w-3.5" />}
      <span>
        {theme === "light" ? "Sáng" : theme === "dark" ? "Tối" : "Hệ thống"}
      </span>
    </button>
  );
}
