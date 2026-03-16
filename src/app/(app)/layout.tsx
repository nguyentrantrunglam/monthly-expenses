"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import { useThemeStore } from "@/hooks/useTheme";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  CalendarRange,
  Receipt,
  UserCog,
  Users,
  ListChecks,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronsUpDown,
} from "lucide-react";

interface NavGroup {
  title: string;
  items: { href: string; label: string; icon: ReactNode }[];
}

const navGroups: NavGroup[] = [
  {
    title: "Tổng quan",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Thu chi",
    items: [
      {
        href: "/session",
        label: "Session tháng",
        icon: <CalendarRange className="h-4 w-4" />,
      },
      {
        href: "/transactions",
        label: "Giao dịch",
        icon: <Receipt className="h-4 w-4" />,
      },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const { signOut } = await import("firebase/auth");
    await signOut(getFirebaseAuth());
    useAuthStore.setState({ user: null, loading: false });
    router.replace("/login");
  };

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const themeItems = [
    { value: "light" as const, label: "Sáng", icon: Sun },
    { value: "dark" as const, label: "Tối", icon: Moon },
    { value: "system" as const, label: "Hệ thống", icon: Monitor },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            F
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            Family Finance
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.title} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((link) => {
                  const active = pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {link.icon}
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User menu */}
        <div className="border-t p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar size="sm">
                  {user?.photoURL && <AvatarImage src={user.photoURL} />}
                  <AvatarFallback className="text-[10px] font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-medium leading-tight">
                    {user?.displayName || "Người dùng"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground leading-tight">
                    {user?.email}
                  </p>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">
                    {user?.displayName || "Người dùng"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
                  <UserCog className="h-4 w-4" />
                  Hồ sơ cá nhân
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/settings/family")}>
                  <Users className="h-4 w-4" />
                  Gia đình
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/settings/fixed-items")}>
                  <ListChecks className="h-4 w-4" />
                  Khoản cố định
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
              <DropdownMenuGroup>
                {themeItems.map((t) => (
                  <DropdownMenuItem key={t.value} onClick={() => setTheme(t.value)}>
                    <t.icon className="h-4 w-4" />
                    {t.label}
                    {theme === t.value && (
                      <span className="ml-auto text-xs text-primary">●</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
