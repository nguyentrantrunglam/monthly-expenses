"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useSessions, type IncomeItem, type SharedExpense } from "@/hooks/useSession";
import { useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/ui/month-picker";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarRange,
  Plus,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  Trash2,
  X,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  const months = [
    "Tháng 1",
    "Tháng 2",
    "Tháng 3",
    "Tháng 4",
    "Tháng 5",
    "Tháng 6",
    "Tháng 7",
    "Tháng 8",
    "Tháng 9",
    "Tháng 10",
    "Tháng 11",
    "Tháng 12",
  ];
  return `${months[Number(m) - 1]} / ${y}`;
}

function sessionRangeLabel(month: string, cycleDay: number) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, cycleDay);
  const end = new Date(y, m, cycleDay - 1);
  if (cycleDay === 1) {
    // nếu bắt đầu từ ngày 1 thì kết thúc là ngày cuối tháng N
    end.setMonth(end.getMonth(), 0);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const startStr = `${pad(start.getDate())}/${pad(start.getMonth() + 1)}`;
  const endStr = `${pad(end.getDate())}/${pad(end.getMonth() + 1)}`;
  return `${startStr} – ${endStr}`;
}

export default function SessionListPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const { sessions, loading, createSession, deleteSession } = useSessions();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const isOwner =
    family && user
      ? family.members[user.uid]?.role === "owner" ||
        family.createdBy === user.uid
      : false;

  if (!user?.familyId || !family) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <CalendarRange className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-medium">Chưa có gia đình</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bạn cần tạo hoặc tham gia một gia đình trước khi sử dụng chức năng session tháng.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Session tháng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý thu chi theo từng tháng
          </p>
        </div>
        {isOwner && (
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Tạo mới
          </Button>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6">
          {family && user && (
            <CreateSessionForm
              familyMembers={Object.keys(family.members)}
              lastSession={sessions.length > 0 ? sessions[0] : null}
              onCreated={(id) => {
                setShowCreate(false);
                router.push(`/session/${id}`);
              }}
              onCancel={() => setShowCreate(false)}
              createSession={createSession}
              userId={user.uid}
            />
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <CalendarRange className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <div>
            <p className="font-medium">Chưa có session nào</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Owner hãy tạo session mới để bắt đầu quản lý thu chi.
            </p>
          </div>
        </Card>
      ) : (
        <SessionTable
          sessions={sessions}
          family={family}
          isOwner={isOwner}
          deleting={deleting}
          setDeleting={setDeleting}
          deleteSession={deleteSession}
          router={router}
        />
      )}
    </div>
  );
}

interface AllocItem {
  type: string;
  userId: string | null;
  label: string;
  amount: number;
}

const PAGE_SIZE = 10;

function SessionTable({
  sessions,
  family,
  isOwner,
  deleting,
  setDeleting,
  deleteSession,
  router,
}: {
  sessions: import("@/hooks/useSession").Session[];
  family: ReturnType<typeof useFamily>["family"];
  isOwner: boolean;
  deleting: string | null;
  setDeleting: (id: string | null) => void;
  deleteSession: (id: string) => Promise<void>;
  router: ReturnType<typeof useRouter>;
}) {
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const sorted = sessions.slice().sort((a, b) => b.month.localeCompare(a.month));
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [allocations, setAllocations] = useState<
    Record<string, AllocItem[]>
  >({});

  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const unsubs: (() => void)[] = [];

    for (const s of sessions) {
      if (s.status !== "locked") continue;
      const allocRef = doc(
        db,
        "families",
        user.familyId,
        "sessions",
        s.id,
        "allocation",
        "main"
      );
      const u = onSnapshot(allocRef, (snap) => {
        if (snap.exists()) {
          setAllocations((prev) => ({
            ...prev,
            [s.id]: snap.data().items ?? [],
          }));
        }
      });
      unsubs.push(u);
    }

    return () => unsubs.forEach((u) => u());
  }, [user?.familyId, sessions]);

  const cycleDay = family?.cycleDay ?? 1;

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-xs">Tháng</TableHead>
            <TableHead className="text-xs">Trạng thái</TableHead>
            <TableHead className="text-xs">Xác nhận</TableHead>
            <TableHead className="text-xs text-right text-green-600">Thu nhập</TableHead>
            <TableHead className="text-xs text-right text-red-500">Chi phí</TableHead>
            <TableHead className="text-xs text-right">Còn lại</TableHead>
            <TableHead className="text-xs">Phân chia</TableHead>
            {isOwner && <TableHead className="w-16" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((s) => {
            const memberCount = Object.keys(s.memberStatus).length;
            const doneCount = Object.values(s.memberStatus).filter(
              (v) => v === "done"
            ).length;
            const allDone = doneCount === memberCount;
            const isLocked = s.status === "locked";
            const balance = s.remainingBudget;
            const rangeLabel = sessionRangeLabel(s.month, cycleDay);
            const alloc = allocations[s.id] ?? [];

            return (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => router.push(`/session/${s.id}`)}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{monthLabel(s.month)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {rangeLabel}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isLocked
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="h-3 w-3" />
                    ) : (
                      <Unlock className="h-3 w-3" />
                    )}
                    {isLocked ? "Đã chốt" : "Đang mở"}
                  </span>
                </TableCell>
                <TableCell>
                  {allDone ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {doneCount}/{memberCount}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {doneCount}/{memberCount}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium text-green-600 tabular-nums">
                  {fmt(s.totalIncome)} đ
                </TableCell>
                <TableCell className="text-right font-medium text-red-500 tabular-nums">
                  {fmt(s.totalExpense)} đ
                </TableCell>
                <TableCell
                  className={`text-right font-semibold tabular-nums ${
                    balance >= 0
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-orange-600 dark:text-orange-400"
                  }`}
                >
                  {fmt(balance)} đ
                </TableCell>
                <TableCell>
                  {alloc.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {alloc.map((ai, idx) => (
                        <span key={idx} className="text-[11px] text-muted-foreground whitespace-nowrap">
                          <span className="font-medium text-foreground">{ai.label}</span>
                          {": "}
                          <span className="tabular-nums">{fmt(ai.amount)} đ</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
                {isOwner && (
                  <TableCell className="text-right">
                    <button
                      type="button"
                      disabled={deleting === s.id}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-destructive dark:hover:bg-red-950 disabled:opacity-50"
                      title="Xóa session"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          !confirm(
                            `Xóa session ${monthLabel(s.month)}? Hành động này không thể hoàn tác.`
                          )
                        )
                          return;
                        setDeleting(s.id);
                        deleteSession(s.id)
                          .catch((err: unknown) =>
                            alert(err instanceof Error ? err.message : "Xóa thất bại")
                          )
                          .finally(() => setDeleting(null));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
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
                  className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  text="Sau"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-disabled={page >= pageCount}
                  className={page >= pageCount ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </Card>
  );
}

const DEFAULT_SHARED_EXPENSES: SharedExpense[] = [
  { title: "Tiền nhà", amount: 0 },
  { title: "Điện", amount: 0 },
  { title: "Nước", amount: 0 },
  { title: "Internet", amount: 0 },
];

function CreateSessionForm({
  familyMembers,
  lastSession,
  onCreated,
  onCancel,
  createSession,
  userId,
}: {
  familyMembers: string[];
  lastSession: import("@/hooks/useSession").Session | null;
  onCreated: (id: string) => void;
  onCancel: () => void;
  createSession: (input: {
    month: string;
    incomeItems: IncomeItem[];
    sharedExpenses: SharedExpense[];
    memberIds: string[];
  }) => Promise<string>;
  userId: string;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);

  const seedExpenses = (): SharedExpense[] => {
    if (lastSession && lastSession.sharedExpenses.length > 0) {
      return lastSession.sharedExpenses.map((e) => ({ title: e.title, amount: e.amount }));
    }
    return DEFAULT_SHARED_EXPENSES.map((e) => ({ ...e }));
  };

  const seedIncome = (): IncomeItem[] => {
    if (lastSession && lastSession.incomeItems.length > 0) {
      return lastSession.incomeItems.map((i) => ({
        label: i.label,
        amount: i.amount,
        userId: i.userId,
        contributorId: i.contributorId,
      }));
    }
    return [{ label: "", amount: 0, userId, contributorId: null }];
  };

  const [incomeRows, setIncomeRows] = useState<IncomeItem[]>(seedIncome);
  const [expenseRows, setExpenseRows] = useState<SharedExpense[]>(seedExpenses);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const incomeItems = incomeRows.filter(
        (r) => r.label.trim() && r.amount > 0
      );
      const sharedExpenses = expenseRows.filter(
        (r) => r.title.trim() && r.amount > 0
      );
      const id = await createSession({
        month,
        incomeItems,
        sharedExpenses,
        memberIds: familyMembers,
      });
      onCreated(id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không tạo được session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tạo session mới</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-6 mt-4">
        <div className="space-y-2">
          <Label>Tháng</Label>
          <MonthPicker value={month} onChange={setMonth} />
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-foreground">Thu nhập</Label>
            {lastSession && lastSession.incomeItems.length > 0 && (
              <span className="text-[11px] text-muted-foreground shrink-0">
                Lấy từ {monthLabel(lastSession.month)}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {incomeRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1 min-w-0"
                  placeholder="Tên khoản thu"
                  value={row.label}
                  onChange={(e) => {
                    const copy = [...incomeRows];
                    copy[i] = { ...copy[i], label: e.target.value };
                    setIncomeRows(copy);
                  }}
                />
                <CurrencyInput
                  className="w-28 shrink-0"
                  placeholder="Số tiền"
                  value={row.amount || ""}
                  onChange={() => {}}
                  onValueChange={(n) => {
                    const copy = [...incomeRows];
                    copy[i] = { ...copy[i], amount: n };
                    setIncomeRows(copy);
                  }}
                />
                {incomeRows.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setIncomeRows(incomeRows.filter((_, j) => j !== i))}
                    aria-label="Xóa khoản thu"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <div className="w-7 shrink-0" aria-hidden />
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-dashed border-muted-foreground/40 hover:border-muted-foreground/60 hover:bg-muted/50"
            onClick={() =>
              setIncomeRows([
                ...incomeRows,
                { label: "", amount: 0, userId, contributorId: null },
              ])
            }
          >
            + Thêm khoản thu
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-foreground">Chi cố định chung</Label>
            {lastSession && lastSession.sharedExpenses.length > 0 && (
              <span className="text-[11px] text-muted-foreground shrink-0">
                Lấy từ {monthLabel(lastSession.month)}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {expenseRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1 min-w-0"
                  placeholder="Tên khoản chi"
                  value={row.title}
                  onChange={(e) => {
                    const copy = [...expenseRows];
                    copy[i] = { ...copy[i], title: e.target.value };
                    setExpenseRows(copy);
                  }}
                />
                <CurrencyInput
                  className="w-28 shrink-0"
                  placeholder="Số tiền"
                  value={row.amount || ""}
                  onChange={() => {}}
                  onValueChange={(n) => {
                    const copy = [...expenseRows];
                    copy[i] = { ...copy[i], amount: n };
                    setExpenseRows(copy);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setExpenseRows(expenseRows.filter((_, j) => j !== i))}
                  aria-label="Xóa khoản chi"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-dashed border-muted-foreground/40 hover:border-muted-foreground/60 hover:bg-muted/50"
            onClick={() =>
              setExpenseRows([...expenseRows, { title: "", amount: 0 }])
            }
          >
            + Thêm khoản chi chung
          </Button>
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Đang tạo..." : "Tạo session"}
          </Button>
        </div>
      </form>
    </>
  );
}
