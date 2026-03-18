"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { useFamily } from "@/hooks/useFamily";
import { useReconcile } from "@/hooks/useReconcile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput, parseCurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Wallet,
  TrendingDown,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

interface SessionSummary {
  id: string;
  month: string;
  status: string;
}

interface AllocationData {
  items: { type: string; userId: string | null; label: string; amount: number }[];
  savingsAmount: number;
}

export default function ReconcilePage() {
  const user = useAuthStore((s) => s.user);
  useFamily();
  const { records, loading: recLoading, addReconciliation } = useReconcile();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [allocation, setAllocation] = useState<AllocationData | null>(null);
  const [monthTransactions, setMonthTransactions] = useState<
    { amount: number; type: string; category: string; note: string; date: string }[]
  >([]);
  const [loadingData, setLoadingData] = useState(false);

  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load locked sessions
  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "sessions");
    const q = query(col, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: SessionSummary[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === "locked") {
          list.push({ id: d.id, month: data.month, status: data.status });
        }
      });
      setSessions(list);
      if (list.length > 0 && !selectedMonth) {
        setSelectedMonth(list[0].month);
        setSelectedSessionId(list[0].id);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.familyId]);

  // Load allocation + transactions for selected session
  useEffect(() => {
    if (!user?.familyId || !selectedSessionId) return;
    setLoadingData(true);
    const db = getFirestoreDb();

    const allocRef = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      selectedSessionId,
      "allocation",
      "main"
    );
    const unsub1 = onSnapshot(allocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAllocation({
          items: data.items ?? [],
          savingsAmount: data.savingsAmount ?? 0,
        });
      } else {
        setAllocation(null);
      }
    });

    const txCol = collection(db, "families", user.familyId, "transactions");
    const unsub2 = onSnapshot(query(txCol, orderBy("date", "desc")), (snap) => {
      const list: typeof monthTransactions = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.date?.startsWith(selectedMonth) && data.userId === user.uid) {
          list.push({
            amount: data.amount,
            type: data.type,
            category: data.category ?? "",
            note: data.note ?? "",
            date: data.date,
          });
        }
      });
      setMonthTransactions(list);
      setLoadingData(false);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user?.familyId, user?.uid, selectedSessionId, selectedMonth]);

  // My allocation for this month
  const myBudget = useMemo(() => {
    if (!allocation || !user) return 0;
    const personal = allocation.items.find(
      (i) => i.type === "personal" && i.userId === user.uid
    );
    return personal?.amount ?? 0;
  }, [allocation, user]);

  const sharedPool = useMemo(() => {
    if (!allocation) return 0;
    const shared = allocation.items.find((i) => i.type === "shared_pool");
    return shared?.amount ?? 0;
  }, [allocation]);

  // My spending this month
  const mySpending = useMemo(() => {
    return monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
  }, [monthTransactions]);

  const remaining = myBudget - mySpending;

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthTransactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const cat = t.category || "Khác";
        map[cat] = (map[cat] || 0) + t.amount;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthTransactions]);

  useMemo(() => {
    return records.filter((r) => {
      const ca = r.createdAt;
      const dateStr =
        typeof ca === "object" && ca && "toDate" in ca && typeof ca.toDate === "function"
          ? (ca.toDate() as Date).toISOString()
          : new Date(ca as string).toISOString();
      return dateStr.startsWith(selectedMonth);
    });
  }, [records, selectedMonth]);

  const handleSelectSession = (sid: string) => {
    const s = sessions.find((x) => x.id === sid);
    if (s) {
      setSelectedSessionId(s.id);
      setSelectedMonth(s.month);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = parseCurrencyInput(actual);
    if (Number.isNaN(parsed)) {
      setError("Số dư không hợp lệ.");
      return;
    }
    setSubmitting(true);
    try {
      await addReconciliation({
        actualBalance: parsed,
        calculatedBalance: remaining,
        note: `${selectedMonth} | ${note.trim()}`,
      });
      setActual("");
      setNote("");
    } catch (err) {
      console.error(err);
      setError("Không lưu được.");
    } finally {
      setSubmitting(false);
    }
  };

  function monthLabel(month: string) {
    const [y, m] = month.split("-");
    const months = [
      "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
      "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
      "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
    ];
    return `${months[Number(m) - 1]} / ${y}`;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Scale className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Đối chiếu chi tiêu
          </h1>
          <p className="text-xs text-muted-foreground">
            So sánh chi tiêu thực tế với ngân sách được chia mỗi tháng
          </p>
        </div>
      </div>

      {/* Month selector */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground">Chọn tháng:</Label>
          <Select value={selectedSessionId} onValueChange={handleSelectSession}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {monthLabel(s.month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {sessions.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Scale className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Chưa có session nào được chốt. Hãy hoàn thành session tháng trước.
          </p>
        </Card>
      )}

      {selectedSessionId && !loadingData && (
        <>
          {/* Budget overview */}
          {!allocation ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-amber-500" />
              Session này chưa được phân chia ngân sách. Owner cần vào session &gt; Phân chia ngân sách trước.
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Wallet className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[11px] text-muted-foreground">Ngân sách của bạn</span>
                  </div>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {fmt(myBudget)} đ
                  </p>
                </Card>

                <Card className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-[11px] text-muted-foreground">Đã chi tiêu</span>
                  </div>
                  <p className="text-lg font-bold text-red-500 tabular-nums">
                    {fmt(mySpending)} đ
                  </p>
                </Card>

                <Card className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Còn lại</span>
                  </div>
                  <p
                    className={`text-lg font-bold tabular-nums ${
                      remaining >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {fmt(remaining)} đ
                  </p>
                </Card>

                <Card className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Wallet className="h-3.5 w-3.5 text-teal-500" />
                    <span className="text-[11px] text-muted-foreground">Quỹ chung</span>
                  </div>
                  <p className="text-lg font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                    {fmt(sharedPool)} đ
                  </p>
                </Card>
              </div>

              {/* Progress bar */}
              <Card className="p-4">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-muted-foreground">
                    Tiến độ chi tiêu
                  </span>
                  <span className="font-medium">
                    {myBudget > 0
                      ? Math.round((mySpending / myBudget) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      myBudget > 0 && mySpending / myBudget > 0.9
                        ? "bg-red-500"
                        : myBudget > 0 && mySpending / myBudget > 0.7
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.min(100, myBudget > 0 ? (mySpending / myBudget) * 100 : 0)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>0 đ</span>
                  <span>{fmt(myBudget)} đ</span>
                </div>
              </Card>

              {/* Category breakdown */}
              {categoryBreakdown.length > 0 && (
                <Card className="p-4 space-y-3">
                  <h2 className="text-sm font-medium">Chi tiêu theo danh mục</h2>
                  <div className="space-y-2">
                    {categoryBreakdown.map(([cat, amount]) => {
                      const pct = myBudget > 0 ? (amount / myBudget) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span>{cat}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {fmt(amount)} đ ({Math.round(pct)}%)
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-red-400 dark:bg-red-500"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Reconcile form */}
              <Card className="p-4 space-y-3">
                <h2 className="text-sm font-medium">Đối chiếu số dư thực tế</h2>
                <p className="text-xs text-muted-foreground">
                  Nhập số tiền thực tế bạn đang có (tiền mặt + tài khoản) để so
                  sánh với số dư tính toán ({fmt(remaining)} đ).
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Số dư thực tế (VND)</Label>
                      <CurrencyInput
                        value={actual}
                        onChange={setActual}
                        placeholder="Số tiền thực tế đang có"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ghi chú</Label>
                      <Input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Tùy chọn"
                      />
                    </div>
                  </div>
                  {actual && (
                    <div
                      className={`rounded-lg p-3 text-center text-sm font-medium ${
                        parseCurrencyInput(actual) - remaining === 0
                          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {parseCurrencyInput(actual) - remaining === 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" /> Khớp hoàn toàn!
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" /> Chênh lệch:{" "}
                          {fmt(parseCurrencyInput(actual) - remaining)} đ
                        </span>
                      )}
                    </div>
                  )}
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={submitting}>
                      {submitting ? "Đang lưu..." : "Lưu đối chiếu"}
                    </Button>
                  </div>
                </form>
              </Card>

              {/* History */}
              <ReconcileHistory records={records} loading={recLoading} />
            </>
          )}
        </>
      )}

      {loadingData && (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Clock className="mr-2 h-4 w-4 animate-spin" /> Đang tải dữ liệu...
        </div>
      )}
    </div>
  );
}

const REC_PAGE_SIZE = 10;

function ReconcileHistory({
  records,
  loading,
}: {
  records: import("@/hooks/useReconcile").Reconciliation[];
  loading: boolean;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(records.length / REC_PAGE_SIZE));
  const paged = records.slice(
    (page - 1) * REC_PAGE_SIZE,
    page * REC_PAGE_SIZE
  );

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Lịch sử đối chiếu</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 animate-spin" /> Đang tải...
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có lịch sử đối chiếu.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Ngày</TableHead>
                <TableHead className="text-xs text-right">Thực tế</TableHead>
                <TableHead className="text-xs text-right">Tính toán</TableHead>
                <TableHead className="text-xs text-right">Chênh lệch</TableHead>
                <TableHead className="text-xs">Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">
                    {typeof r.createdAt === "object" && r.createdAt && "toDate" in r.createdAt && typeof r.createdAt.toDate === "function"
                      ? (r.createdAt.toDate() as Date).toLocaleDateString("vi-VN")
                      : new Date(r.createdAt as string).toLocaleDateString("vi-VN")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(r.actualBalance)} đ
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(r.calculatedBalance)} đ
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      r.difference === 0 ? "text-green-600" : "text-amber-600"
                    }`}
                  >
                    {r.difference === 0
                      ? "Khớp"
                      : `${r.difference > 0 ? "+" : ""}${fmt(r.difference)} đ`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.note || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Trang {page}/{pageCount}
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      text="Trước"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-disabled={page <= 1}
                      className={
                        page <= 1
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      text="Sau"
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      aria-disabled={page >= pageCount}
                      className={
                        page >= pageCount
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
