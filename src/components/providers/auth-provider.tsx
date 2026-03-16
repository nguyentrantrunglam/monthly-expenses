"use client";

import { type ReactNode } from "react";
import { useAuthListener } from "@/hooks/useAuthListener";
import { useThemeEffect } from "@/hooks/useTheme";

export function AuthProvider({ children }: { children: ReactNode }) {
  useAuthListener();
  useThemeEffect();
  return <>{children}</>;
}

