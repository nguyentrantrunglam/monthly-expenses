"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import { useFamily } from "@/hooks/useFamily";
import { useSessions } from "@/hooks/useSession";
import { useTransactions } from "@/hooks/useTransactions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Receipt,
  Users,
  TrendingUp,
  Wallet,
  PiggyBank,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Line,
  Area,
  ComposedChart,
  LineChart,
} from "recharts";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import {
  aggregateExpenseByCategory,
  aggregateYearSessionTotals,
  buildMemberIncomeExpenseRows,
  buildMemberPersonalExpenseCalendarYear,
  buildMemberPersonalExpenseTrend,
  buildMemberStackedExpenseRows,
  buildSessionTrendPoints,
  buildStackedPersonalSharedCalendarMonths,
  buildStackedPersonalSharedSeries,
  buildYearSessionTrendPoints,
  getCalendarYearRange,
  getSessionRangeFromMonth,
  transactionInSessionRange,
} from "@/lib/dashboard-analytics";
import type { AllocationItem } from "@/hooks/useAllocation";

const PIE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function memberLineHue(i: number, n: number): string {
  const hue = Math.round((i * 360) / Math.max(1, n));
  return `hsl(${hue} 62% 48%)`;
}

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; dataKey?: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      {label != null && (
        <p className="font-medium text-popover-foreground mb-1">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground tabular-nums">
          <span style={{ color: p.color }}>{p.name ?? p.dataKey}: </span>
          {fmt(p.value ?? 0)} đ
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const { sessions, loading: sessionsLoading } = useSessions();
  const { transactions, loading: txLoading } = useTransactions({
    allMembers: true,
  });

  const cycleDay = family?.cycleDay ?? 1;

  type DashboardViewMode = "session" | "year";
  const [viewMode, setViewMode] = useState<DashboardViewMode>("session");

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const s of sessions) {
      const y = Number(s.month.slice(0, 4));
      if (!Number.isNaN(y)) years.add(y);
    }
    for (const t of transactions) {
      const y = Number((t.date ?? "").slice(0, 4));
      if (!Number.isNaN(y)) years.add(y);
    }
    const arr = Array.from(years).sort((a, b) => b - a);
    if (arr.length === 0) arr.push(new Date().getFullYear());
    return arr;
  }, [sessions, transactions]);

  const [yearOverride, setYearOverride] = useState<number | null>(null);
  const defaultYear = yearOptions[0] ?? new Date().getFullYear();
  const activeYear = yearOverride ?? defaultYear;

  const yearTotals = useMemo(
    () => aggregateYearSessionTotals(sessions, activeYear),
    [sessions, activeYear],
  );

  const sessionsSortedDesc = useMemo(
    () => [...sessions].sort((a, b) => b.month.localeCompare(a.month)),
    [sessions],
  );

  const latestSession =
    sessionsSortedDesc.length > 0 ? sessionsSortedDesc[0] : null;

  const [focusMonthOverride, setFocusMonthOverride] = useState<string | null>(
    null,
  );
  const activeMonth =
    focusMonthOverride ?? latestSession?.month ?? null;

  const focusSession = useMemo(() => {
    if (!sessions.length) return null;
    if (activeMonth) {
      const found = sessions.find((s) => s.month === activeMonth);
      if (found) return found;
    }
    return latestSession;
  }, [sessions, activeMonth, latestSession]);

  const focusRange = useMemo(() => {
    if (viewMode === "year") {
      return getCalendarYearRange(activeYear);
    }
    if (!focusSession) return null;
    return getSessionRangeFromMonth(focusSession.month, cycleDay);
  }, [viewMode, activeYear, focusSession, cycleDay]);

  const latestSessionInYear = useMemo(() => {
    const prefix = `${activeYear}-`;
    const list = sessions
      .filter((s) => s.month.startsWith(prefix))
      .sort((a, b) => b.month.localeCompare(a.month));
    return list[0] ?? null;
  }, [sessions, activeYear]);

  const categoryData = useMemo(() => {
    if (!focusRange) return [];
    return aggregateExpenseByCategory(transactions, focusRange);
  }, [transactions, focusRange]);

  const trendPoints = useMemo(() => {
    if (viewMode === "year") {
      return buildYearSessionTrendPoints(sessions, activeYear);
    }
    return buildSessionTrendPoints(sessions, 6);
  }, [viewMode, sessions, activeYear]);

  const stackedPersonalShared = useMemo(() => {
    if (viewMode === "year") {
      return buildStackedPersonalSharedCalendarMonths(transactions, activeYear);
    }
    return buildStackedPersonalSharedSeries(
      sessions,
      transactions,
      cycleDay,
      6,
    );
  }, [viewMode, transactions, activeYear, sessions, cycleDay]);

  const memberUids = useMemo(
    () => Object.keys(family?.members ?? {}).sort(),
    [family?.members],
  );

  const memberStackedRows = useMemo(
    () =>
      buildMemberStackedExpenseRows(
        transactions,
        focusRange,
        family?.members ?? {},
      ),
    [transactions, focusRange, family?.members],
  );

  const memberIncomeExpense = useMemo(
    () =>
      buildMemberIncomeExpenseRows(
        transactions,
        focusRange,
        family?.members ?? {},
      ),
    [transactions, focusRange, family?.members],
  );

  const memberTrendRows = useMemo(() => {
    if (viewMode === "year") {
      return buildMemberPersonalExpenseCalendarYear(
        transactions,
        activeYear,
        family?.members ?? {},
      );
    }
    return buildMemberPersonalExpenseTrend(
      sessions,
      transactions,
      cycleDay,
      family?.members ?? {},
      6,
    );
  }, [
    viewMode,
    transactions,
    activeYear,
    family?.members,
    sessions,
    cycleDay,
  ]);

  const [allocationState, setAllocationState] = useState<{
    sessionId: string;
    items: AllocationItem[];
  } | null>(null);

  useEffect(() => {
    if (
      viewMode !== "session" ||
      !user?.familyId ||
      !focusSession?.id ||
      focusSession.status !== "locked"
    ) {
      return;
    }
    const sid = focusSession.id;
    const db = getFirestoreDb();
    const ref = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sid,
      "allocation",
      "main",
    );
    const unsub = onSnapshot(ref, (snap) => {
      setAllocationState({
        sessionId: sid,
        items: snap.exists()
          ? ((snap.data().items ?? []) as AllocationItem[])
          : [],
      });
    });
    return () => unsub();
  }, [viewMode, user?.familyId, focusSession?.id, focusSession?.status]);

  const allocationItems = useMemo(() => {
    if (
      focusSession?.status !== "locked" ||
      allocationState?.sessionId !== focusSession?.id
    ) {
      return [];
    }
    return allocationState.items;
  }, [focusSession?.status, focusSession?.id, allocationState]);

  const budgetVsSpent = useMemo(() => {
    if (
      viewMode !== "session" ||
      !focusRange ||
      !user?.uid ||
      focusSession?.status !== "locked" ||
      allocationItems.length === 0
    ) {
      return null;
    }
    const personalAlloc =
      allocationItems.find(
        (i) => i.type === "personal" && i.userId === user.uid,
      )?.amount ?? 0;
    const sharedAlloc =
      allocationItems.find((i) => i.type === "shared_pool")?.amount ?? 0;

    let personalSpent = 0;
    let sharedSpent = 0;
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (!transactionInSessionRange(t, focusRange)) continue;
      if (t.spendingType === "shared_pool") sharedSpent += t.amount;
      else if (t.userId === user.uid) personalSpent += t.amount;
    }

    return [
      {
        name: "Cá nhân (bạn)",
        allocated: personalAlloc,
        spent: personalSpent,
      },
      {
        name: "Quỹ chung",
        allocated: sharedAlloc,
        spent: sharedSpent,
      },
    ];
  }, [
    viewMode,
    focusRange,
    user,
    focusSession?.status,
    allocationItems,
    transactions,
  ]);

  const showDashboardCharts =
    !!family &&
    !!focusRange &&
    (viewMode === "year" || (sessions.length > 0 && !!focusSession));

  const showMemberTrendChart =
    memberUids.length > 0 &&
    (viewMode === "year" || memberTrendRows.length > 1);

  const greeting = user?.displayName
    ? `Xin chào, ${user.displayName}`
    : "Xin chào";

  const loading = sessionsLoading || txLoading;

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

      {family ? (
        <>
          <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Tổng quan
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {viewMode === "session"
                      ? `Kỳ session và giao dịch trong chu kỳ gia đình (ngày ${cycleDay}/tháng).`
                      : `Năm dương lịch ${activeYear}: giao dịch từ 01/01–31/12; KPI session là tổng các kỳ có tháng ${activeYear}-*.`}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <div className="inline-flex rounded-lg border bg-muted/50 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode("session")}
                      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                        viewMode === "session"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Theo kỳ session
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("year")}
                      className={`ml-0.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                        viewMode === "year"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Theo năm
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {viewMode === "session" ? (
                      focusSession ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            Tháng session:
                          </span>
                          <Select
                            value={focusSession.month}
                            onValueChange={(v) => setFocusMonthOverride(v)}
                          >
                            <SelectTrigger className="w-[200px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {sessionsSortedDesc.map((s) => (
                                <SelectItem key={s.id} value={s.month}>
                                  {s.month}
                                  {s.status === "locked" ? " · Đã chốt" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            asChild
                          >
                            <Link href={`/session/${focusSession.id}`}>
                              Mở session
                            </Link>
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Chưa có session — chuyển sang &quot;Theo năm&quot;
                          hoặc tạo session.
                        </span>
                      )
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">
                          Năm:
                        </span>
                        <Select
                          value={String(activeYear)}
                          onValueChange={(v) => setYearOverride(Number(v))}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {yearOptions.map((y) => (
                              <SelectItem key={y} value={String(y)}>
                                {y}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {latestSessionInYear ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            asChild
                          >
                            <Link
                              href={`/session/${latestSessionInYear.id}`}
                            >
                              Session gần nhất trong năm
                            </Link>
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {showDashboardCharts && (
                <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-4 border-green-200/60 dark:border-green-900/50">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-medium">Tổng thu</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {fmt(
                      viewMode === "year"
                        ? yearTotals.totalIncome
                        : (focusSession?.totalIncome ?? 0),
                    )}{" "}
                    đ
                  </p>
                  {viewMode === "year" && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Σ từ {yearTotals.count} kỳ session trong năm
                    </p>
                  )}
                </Card>
                <Card className="p-4 border-red-200/60 dark:border-red-900/50">
                  <div className="flex items-center gap-2 text-red-500 mb-1">
                    <Receipt className="h-4 w-4" />
                    <span className="text-xs font-medium">Tổng chi cố định</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {fmt(
                      viewMode === "year"
                        ? yearTotals.totalExpense
                        : (focusSession?.totalExpense ?? 0),
                    )}{" "}
                    đ
                  </p>
                </Card>
                <Card className="p-4 border-blue-200/60 dark:border-blue-900/50">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                    <Wallet className="h-4 w-4" />
                    <span className="text-xs font-medium">
                      Còn lại sau chi cố định
                    </span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {fmt(
                      viewMode === "year"
                        ? yearTotals.totalRemaining
                        : (focusSession?.remainingBudget ?? 0),
                    )}{" "}
                    đ
                  </p>
                  {viewMode === "year" && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Tổng phần còn lại theo từng kỳ (không dồn tích có thể chi)
                    </p>
                  )}
                </Card>
              </div>

              {trendPoints.length > 1 && (
                <Card className="p-4">
                  <p className="text-sm font-medium mb-1">
                    {viewMode === "year"
                      ? `Xu hướng theo từng kỳ session trong ${activeYear}`
                      : "Xu hướng ngân sách (tối đa 6 kỳ gần nhất)"}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Thu, chi cố định và phần còn lại theo dữ liệu session đã lưu.
                  </p>
                  <div className="h-64 w-full min-h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trendPoints}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-muted"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            v >= 1e6 ? `${Math.round(v / 1e6)}tr` : fmt(v)
                          }
                          className="text-muted-foreground"
                          width={48}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area
                          type="monotone"
                          dataKey="remainingBudget"
                          fill="hsl(217 91% 60%)"
                          fillOpacity={0.12}
                          stroke="hsl(217 91% 50%)"
                          name="Còn lại"
                        />
                        <Line
                          type="monotone"
                          dataKey="totalIncome"
                          stroke="hsl(142 71% 45%)"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Tổng thu"
                        />
                        <Line
                          type="monotone"
                          dataKey="totalExpense"
                          stroke="hsl(0 84% 60%)"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Chi cố định"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {memberUids.length > 0 && (
                <Card className="p-4 border-muted">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Theo từng thành viên</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Dựa trên giao dịch toàn gia đình
                    {viewMode === "year"
                      ? ` (năm ${activeYear}, theo ngày giao dịch)`
                      : " trong kỳ đang chọn"}
                    . Phần quỹ chung được chia đều để so sánh tương đối.
                  </p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium mb-2">
                        Chi: cá nhân + phần quỹ chung (chia đều)
                      </p>
                      <div className="h-64 w-full min-h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={memberStackedRows}
                            layout="vertical"
                            margin={{ left: 8, right: 8 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              className="stroke-muted"
                            />
                            <XAxis
                              type="number"
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v) =>
                                v >= 1e6
                                  ? `${Math.round(v / 1e6)}tr`
                                  : fmt(v)
                              }
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={96}
                              tick={{ fontSize: 10 }}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend
                              wrapperStyle={{ fontSize: 11 }}
                              formatter={(v) =>
                                v === "personal"
                                  ? "Chi cá nhân"
                                  : "Quỹ chung (chia đều)"
                              }
                            />
                            <Bar
                              dataKey="personal"
                              stackId="m"
                              fill="hsl(217 91% 55%)"
                              name="personal"
                              radius={[0, 0, 0, 0]}
                            />
                            <Bar
                              dataKey="sharedShare"
                              stackId="m"
                              fill="hsl(262 83% 58%)"
                              name="sharedShare"
                              radius={[0, 4, 4, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-2">
                        Thu vs chi (chi gồm cá nhân + phần quỹ chung chia đều)
                      </p>
                      <div className="h-64 w-full min-h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={memberIncomeExpense}
                            margin={{ left: 4, right: 8 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              className="stroke-muted"
                            />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 10 }}
                              interval={0}
                              angle={-12}
                              textAnchor="end"
                              height={52}
                            />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v) =>
                                v >= 1e6
                                  ? `${Math.round(v / 1e6)}tr`
                                  : fmt(v)
                              }
                              width={44}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend
                              wrapperStyle={{ fontSize: 11 }}
                              formatter={(v) =>
                                v === "income" ? "Thu" : "Chi"
                              }
                            />
                            <Bar
                              dataKey="income"
                              fill="hsl(142 71% 42%)"
                              name="income"
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="expense"
                              fill="hsl(0 72% 52%)"
                              name="expense"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {showMemberTrendChart && (
                    <div className="mt-4">
                      <p className="text-xs font-medium mb-2">
                        {viewMode === "year"
                          ? `Chi cá nhân theo tháng dương lịch (${activeYear})`
                          : "Xu hướng chi cá nhân các kỳ gần nhất"}
                      </p>
                      <div className="h-64 w-full min-h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={memberTrendRows}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              className="stroke-muted"
                            />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v) =>
                                v >= 1e6
                                  ? `${Math.round(v / 1e6)}tr`
                                  : fmt(v)
                              }
                              width={44}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {memberUids.map((uid, i) => (
                              <Line
                                key={uid}
                                type="monotone"
                                dataKey={uid}
                                stroke={memberLineHue(i, memberUids.length)}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                name={
                                  family?.members[uid]?.name?.trim() ||
                                  uid.slice(0, 6)
                                }
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <p className="text-sm font-medium mb-1">
                    Chi tiêu theo danh mục
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {viewMode === "year"
                      ? `Tất cả giao dịch chi trong năm ${activeYear} (toàn gia đình).`
                      : "Tất cả giao dịch chi trong kỳ (toàn gia đình)."}
                  </p>
                  {categoryData.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">
                      {viewMode === "year"
                        ? `Chưa có khoản chi nào trong năm ${activeYear}.`
                        : "Chưa có khoản chi nào trong kỳ này."}
                    </p>
                  ) : (
                    <div className="h-72 w-full min-h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="48%"
                            innerRadius={56}
                            outerRadius={88}
                            paddingAngle={2}
                          >
                            {categoryData.map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                          <Legend
                            wrapperStyle={{ fontSize: 11 }}
                            layout="horizontal"
                            verticalAlign="bottom"
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card className="p-4">
                  <p className="text-sm font-medium mb-1">
                    Chi cá nhân vs quỹ chung (tổng gia đình)
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {viewMode === "year"
                      ? "Theo tháng dương lịch trong năm (giao dịch chi)."
                      : "Xếp chồng theo kỳ (giao dịch chi)."}
                  </p>
                  <div className="h-72 w-full min-h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stackedPersonalShared}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-muted"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            v >= 1e6 ? `${Math.round(v / 1e6)}tr` : fmt(v)
                          }
                          width={44}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: 12 }}
                          formatter={(v) =>
                            v === "personal" ? "Cá nhân" : "Quỹ chung"
                          }
                        />
                        <Bar
                          dataKey="personal"
                          stackId="a"
                          fill="hsl(217 91% 60%)"
                          name="personal"
                        />
                        <Bar
                          dataKey="shared"
                          stackId="a"
                          fill="hsl(262 83% 58%)"
                          name="shared"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {budgetVsSpent && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <PiggyBank className="h-4 w-4 text-teal-600" />
                    <p className="text-sm font-medium">
                      Phân chia vs đã chi (session đã chốt)
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    So sánh ngân sách đã xác nhận với tổng giao dịch chi trong
                    kỳ.
                  </p>
                  <div className="h-56 w-full min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={budgetVsSpent}
                        layout="vertical"
                        margin={{ left: 16, right: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-muted"
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            v >= 1e6 ? `${Math.round(v / 1e6)}tr` : fmt(v)
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: 12 }}
                          formatter={(v) =>
                            v === "allocated" ? "Đã phân chia" : "Đã chi"
                          }
                        />
                        <Bar
                          dataKey="allocated"
                          fill="hsl(142 71% 45%)"
                          name="allocated"
                          radius={[0, 4, 4, 0]}
                        />
                        <Bar
                          dataKey="spent"
                          fill="hsl(25 95% 53%)"
                          name="spent"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
                </>
              )}
            </div>

          {family &&
            sessions.length === 0 &&
            viewMode === "session" &&
            !loading && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Chưa có session tháng nào. Tạo session trong mục{" "}
              <Link
                href="/session"
                className="font-medium text-primary underline"
              >
                Session tháng
              </Link>{" "}
              để xem biểu đồ theo kỳ, hoặc chuyển sang &quot;Theo năm&quot; để
              xem giao dịch theo lịch.
            </Card>
          )}
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/settings/family">
            <Card className="group flex flex-row items-center gap-4 overflow-hidden rounded-xl p-5 text-sm transition-colors hover:bg-muted/5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold">Tạo gia đình mới</p>
                <p className="text-xs text-muted-foreground">
                  Tạo một gia đình để bắt đầu quản lý thu chi chung.
                </p>
              </div>
            </Card>
          </Link>

          <Card className="flex flex-row items-center gap-4 overflow-hidden rounded-xl p-5 text-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold">Tham gia gia đình có sẵn</p>
              <p className="text-xs text-muted-foreground">
                Nếu người khác mời bạn, hãy dùng link mời để tham gia gia đình
                của họ.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
