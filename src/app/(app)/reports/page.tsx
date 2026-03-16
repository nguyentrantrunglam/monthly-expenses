"use client";

import { useMemo, useState } from "react";
import { useTransactions, type Transaction } from "@/hooks/useTransactions";
import { useFamily } from "@/hooks/useFamily";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
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
} from "recharts";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export default function ReportsPage() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);
  const { family } = useFamily();
  const { transactions: allTx } = useTransactions();

  const monthTx = useMemo(
    () => allTx.filter((t) => t.date.startsWith(month)),
    [allTx, month]
  );

  const prevMonthDate = new Date(
    Number(month.split("-")[0]),
    Number(month.split("-")[1]) - 2,
    1
  );
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const prevTx = useMemo(
    () => allTx.filter((t) => t.date.startsWith(prevMonth)),
    [allTx, prevMonth]
  );

  const totalIncome = monthTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = monthTx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const prevIncome = prevTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevTx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthTx
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const memberBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthTx
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const name =
          family?.members[t.userId]?.name || t.userId.slice(0, 8);
        map[name] = (map[name] || 0) + t.amount;
      });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, family]);

  const comparisonData = [
    { name: "Thu nhập", current: totalIncome, previous: prevIncome },
    { name: "Chi tiêu", current: totalExpense, previous: prevExpense },
  ];

  const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? "+100%" : "0%";
    const p = Math.round(((curr - prev) / prev) * 100);
    return `${p > 0 ? "+" : ""}${p}%`;
  };

  const exportCSV = () => {
    const header = "Ngày,Loại,Danh mục,Số tiền,Nguồn,Ghi chú\n";
    const rows = monthTx
      .map(
        (t) =>
          `${t.date},${t.type === "income" ? "Thu" : "Chi"},${t.category},${t.amount},${t.spendingType === "shared_pool" ? "Chung" : "Cá nhân"},"${t.note}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bao-cao-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Báo cáo</h1>
          <p className="text-sm text-muted-foreground">
            Tổng kết thu chi theo tháng.
          </p>
        </div>
        <div className="flex gap-2">
          <MonthPicker
            className="w-44"
            value={month}
            onChange={setMonth}
          />
          <Button variant="outline" size="sm" onClick={exportCSV}>
            Xuất CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Tổng thu</p>
          <p className="text-xl font-bold text-green-600">
            {fmt(totalIncome)} đ
          </p>
          <p className="text-xs text-muted-foreground">
            vs tháng trước: {pctChange(totalIncome, prevIncome)}
          </p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Tổng chi</p>
          <p className="text-xl font-bold text-red-500">
            {fmt(totalExpense)} đ
          </p>
          <p className="text-xs text-muted-foreground">
            vs tháng trước: {pctChange(totalExpense, prevExpense)}
          </p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Số dư cuối kỳ</p>
          <p className="text-xl font-bold">
            {fmt(totalIncome - totalExpense)} đ
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-medium mb-3">
            Breakdown chi tiêu theo danh mục
          </h2>
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }: any) =>
                      `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {categoryBreakdown.map((_, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(Number(v)) + " đ"} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {categoryBreakdown.map((c, i) => (
                  <div
                    key={c.name}
                    className="flex justify-between text-xs"
                  >
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: COLORS[i % COLORS.length],
                        }}
                      />
                      {c.name}
                    </span>
                    <span>
                      {fmt(c.value)} đ (
                      {totalExpense > 0
                        ? Math.round((c.value / totalExpense) * 100)
                        : 0}
                      %)
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-medium mb-3">
            Chi tiêu theo thành viên
          </h2>
          {memberBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={memberBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmt(Number(v)) + " đ"} />
                  <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {memberBreakdown.map((m) => (
                  <div key={m.name} className="flex justify-between text-xs">
                    <span>{m.name}</span>
                    <span>{fmt(m.value)} đ</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium mb-3">
          So sánh tháng {month} vs tháng {prevMonth}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: any) => fmt(Number(v)) + " đ"} />
            <Legend />
            <Bar
              dataKey="current"
              name={`Tháng ${month}`}
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="previous"
              name={`Tháng ${prevMonth}`}
              fill="#94a3b8"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
