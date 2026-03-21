import type { LucideIcon } from "lucide-react";
import {
  Target,
  BookOpen,
  Dumbbell,
  Bike,
  Heart,
  Briefcase,
  Coffee,
  Music,
  Code,
  Home,
  Moon,
  Trophy,
  PenLine,
  GraduationCap,
} from "lucide-react";

/** Màu preset (trùng palette thanh Lịch gia đình). */
export const GOAL_ACCENT_PRESETS = [
  "#5c6bc0",
  "#43a047",
  "#7b1fa2",
  "#e57373",
  "#ffb74d",
  "#ff7043",
  "#29b6f6",
  "#78909c",
  "#3f51b5",
  "#66bb6a",
  "#ef5350",
] as const;

export const DEFAULT_GOAL_ACCENT = GOAL_ACCENT_PRESETS[0]!;
export const DEFAULT_GOAL_ICON_ID = "target";

export const GOAL_ICON_MAP: Record<string, LucideIcon> = {
  target: Target,
  book: BookOpen,
  dumbbell: Dumbbell,
  bike: Bike,
  heart: Heart,
  briefcase: Briefcase,
  coffee: Coffee,
  music: Music,
  code: Code,
  home: Home,
  moon: Moon,
  trophy: Trophy,
  pen: PenLine,
  study: GraduationCap,
};

export const GOAL_ICON_OPTIONS: { id: string; label: string }[] = [
  { id: "target", label: "Mục tiêu" },
  { id: "book", label: "Sách" },
  { id: "dumbbell", label: "Tập luyện" },
  { id: "bike", label: "Xe đạp" },
  { id: "heart", label: "Sức khỏe" },
  { id: "briefcase", label: "Công việc" },
  { id: "coffee", label: "Thư giãn" },
  { id: "music", label: "Âm nhạc" },
  { id: "code", label: "Code" },
  { id: "home", label: "Nhà" },
  { id: "moon", label: "Ngủ / đêm" },
  { id: "trophy", label: "Thành tích" },
  { id: "pen", label: "Viết" },
  { id: "study", label: "Học tập" },
];

export function getGoalIconComponent(id: string): LucideIcon {
  return GOAL_ICON_MAP[id] ?? GOAL_ICON_MAP[DEFAULT_GOAL_ICON_ID]!;
}

export function isAllowedGoalAccent(hex: string): boolean {
  return (GOAL_ACCENT_PRESETS as readonly string[]).includes(hex);
}

export function sanitizeGoalAccent(hex: string): string {
  return isAllowedGoalAccent(hex) ? hex : DEFAULT_GOAL_ACCENT;
}

export function sanitizeGoalIconId(id: string): string {
  return id in GOAL_ICON_MAP ? id : DEFAULT_GOAL_ICON_ID;
}

/** Chữ sáng / tối trên nền hex. */
export function contrastingForegroundForBg(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return "#ffffff";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#ffffff";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 156 ? "#1a1a1a" : "#ffffff";
}
