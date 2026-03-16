"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import { useFamily } from "@/hooks/useFamily";
import { Card } from "@/components/ui/card";
import {
  CalendarRange,
  Receipt,
  Users,
  ListChecks,
  ArrowRight,
} from "lucide-react";

const quickLinks = [
  {
    href: "/session",
    label: "Session tháng",
    desc: "Quản lý thu chi theo phiên",
    icon: CalendarRange,
    color: "text-blue-600 bg-blue-100 dark:bg-blue-900/50 dark:text-blue-400",
  },
  {
    href: "/transactions",
    label: "Giao dịch",
    desc: "Ghi chép chi tiêu hàng ngày",
    icon: Receipt,
    color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-400",
  },
  {
    href: "/settings/family",
    label: "Gia đình",
    desc: "Quản lý thành viên & mời",
    icon: Users,
    color: "text-violet-600 bg-violet-100 dark:bg-violet-900/50 dark:text-violet-400",
  },
  {
    href: "/settings/fixed-items",
    label: "Khoản cố định",
    desc: "Thiết lập thu chi cố định",
    icon: ListChecks,
    color: "text-amber-600 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400",
  },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();

  const greeting = user?.displayName
    ? `Xin chào, ${user.displayName}`
    : "Xin chào";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {family
            ? `Gia đình: ${family.name} · ${Object.keys(family.members).length} thành viên`
            : "Hãy tạo hoặc tham gia một gia đình để bắt đầu."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="group flex flex-row items-center gap-4 overflow-hidden rounded-xl p-5 text-sm transition-colors hover:bg-muted/5">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${link.color}`}>
                <link.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold">{link.label}</p>
                <p className="text-xs text-muted-foreground">{link.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
