"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInDays, endOfDay, startOfDay } from "date-fns";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useTransactions, type Transaction } from "@/hooks/useTransactions";
import { useFamily, isFamilyOwner } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CurrencyInput, parseCurrencyInput } from "@/components/ui/currency-input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Receipt, Plus, Pencil, Trash2, X, Check, Wallet, Scale, Mic } from "lucide-react";
import { VoiceExpenseInput } from "@/components/VoiceExpenseInput";

const CATEGORIES = [
  "Ăn uống",
  "Di chuyển",
  "Mua sắm",
  "Giải trí",
  "Sức khỏe",
  "Giáo dục",
  "Hóa đơn",
  "Khác",
];

const INCOME_CATEGORIES = [
  "Lương & thu nhập",
  "Thưởng",
  "Bán hàng / dịch vụ",
  "Đầu tư / lãi",
  "Hoàn tiền",
  "Thu khác",
];

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export default function TransactionsPage() {
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const [filterCategory, setFilterCategory] = useState("");
  const [scopeView, setScopeView] = useState<
    "all" | "personal_mine" | "shared_pool"
  >("all");
  const { transactions, loading, addTransaction, updateTransaction, deleteTransaction } =
    useTransactions({
      category: filterCategory || undefined,
    });

  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [spendingType, setSpendingType] = useState<"personal" | "shared_pool">(
    "personal"
  );
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [addTxType, setAddTxType] = useState<"expense" | "income">("expense");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTxType, setEditTxType] = useState<"expense" | "income">("expense");
  const [editSaving, setEditSaving] = useState(false);

  const [voiceOpen, setVoiceOpen] = useState(false);

  // Budget tracking: load all locked sessions with allocations
  const [sessionBudgets, setSessionBudgets] = useState<
    Record<string, { month: string; sessionId: string; myBudget: number; sharedPool: number }>
  >({});
  const [sessions, setSessions] = useState<{ id: string; month: string }[]>([]);
  const [selectedSessionMonth, setSelectedSessionMonth] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!user?.familyId || !user?.uid) return;
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "sessions");
    const q = query(col, orderBy("createdAt", "desc"));
    const unsubs: (() => void)[] = [];
    const unsub = onSnapshot(q, (snap) => {
      // Clean up previous allocation listeners
      unsubs.forEach((u) => u());
      unsubs.length = 0;

      const nextSessions: { id: string; month: string }[] = [];
      snap.forEach((d) => {
        const data = d.data();
        nextSessions.push({ id: d.id, month: data.month });
        if (data.status === "locked") {
          const allocRef = doc(
            db,
            "families",
            user.familyId!,
            "sessions",
            d.id,
            "allocation",
            "main"
          );
          const u = onSnapshot(allocRef, (allocSnap) => {
            if (allocSnap.exists()) {
              const items = (allocSnap.data().items ?? []) as { type: string; userId?: string; amount?: number }[];
              const personal = items.find(
                (i) => i.type === "personal" && i.userId === user.uid
              );
              const shared = items.find(
                (i) => i.type === "shared_pool"
              );
              setSessionBudgets((prev) => ({
                ...prev,
                [data.month]: {
                  month: data.month,
                  sessionId: d.id,
                  myBudget: personal?.amount ?? 0,
                  sharedPool: shared?.amount ?? 0,
                },
              }));
            }
          });
          unsubs.push(u);
        }
      });
      setSessions(nextSessions);
    });
    return () => {
      unsub();
      unsubs.forEach((u) => u());
    };
  }, [user?.familyId, user?.uid]);

  // Session tháng N chi tiêu từ ngày cycleDay tháng N đến cycleDay-1 tháng N+1
  // Chọn session sẽ suy ra khoảng ngày start/end và month đang xem
  const cycleDay = family?.cycleDay ?? 1;

  function sessionRange(month: string) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, cycleDay);
    const end = new Date(y, m, cycleDay - 1);
    // nếu cycleDay = 1 thì end là ngày cuối tháng N
    if (cycleDay === 1) {
      end.setMonth(end.getMonth(), 0);
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const startStr = `${start.getFullYear()}-${pad(
      start.getMonth() + 1
    )}-${pad(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad(
      end.getMonth() + 1
    )}-${pad(end.getDate())}`;
    const spendingMonth = startStr.slice(0, 7);
    const budgetMonth = month;
    return { startStr, endStr, spendingMonth, budgetMonth };
  }

  const budgetFromSession = selectedSessionMonth ?? "";

  // Chọn session hiện tại làm mặc định (dựa trên ngày hôm nay)
  useEffect(() => {
    if (selectedSessionMonth || sessions.length === 0) return;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const current = sessions.find((s) => {
      const { startStr, endStr } = sessionRange(s.month);
      return todayStr >= startStr && todayStr <= endStr;
    });
    if (current) {
      setSelectedSessionMonth(current.month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, selectedSessionMonth, cycleDay]);

  const activeBudget = sessionBudgets[budgetFromSession] ?? null;
  const myBudget = activeBudget?.myBudget ?? null;
  const sharedPool = activeBudget?.sharedPool ?? null;

  const sessionRemainingDays = useMemo(() => {
    if (!budgetFromSession) return null;
    const { endStr } = sessionRange(budgetFromSession);
    const endDate = endOfDay(new Date(endStr + "T12:00:00"));
    const today = startOfDay(new Date());
    return Math.max(0, differenceInDays(endDate, today) + 1);
  }, [budgetFromSession, cycleDay]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = parseCurrencyInput(amount);
    if (!parsed || parsed <= 0) {
      setFormError("Số tiền không hợp lệ.");
      return;
    }
    if (!title.trim()) {
      setFormError("Vui lòng nhập tên giao dịch.");
      return;
    }
    setSubmitting(true);
    try {
      await addTransaction({
        title: title.trim(),
        amount: parsed,
        type: addTxType,
        category,
        spendingType,
        note: note.trim(),
        date,
      });
      setTitle("");
      setAmount("");
      setNote("");
      setShowAddModal(false);
      setAddTxType("expense");
    } catch (err) {
      console.error(err);
      setFormError("Không lưu được giao dịch.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmVoice = async (
    expenses: { title: string; amount: number; category: string; date: string }[]
  ) => {
    for (const e of expenses) {
      await addTransaction({
        title: e.title,
        amount: e.amount,
        type: "expense",
        category: e.category,
        spendingType,
        note: "",
        date: e.date,
      });
    }
  };

  const handleEditTxTypeChange = (t: "expense" | "income") => {
    setEditTxType(t);
    const list = INCOME_CATEGORIES;
    const expenseList = CATEGORIES;
    setEditCategory((cat) => {
      const allowed = t === "income" ? list : expenseList;
      return allowed.includes(cat) ? cat : allowed[0];
    });
  };

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditTitle(tx.title ?? "");
    setEditAmount(String(tx.amount));
    setEditCategory(tx.category);
    setEditNote(tx.note);
    setEditDate(tx.date || new Date().toISOString().slice(0, 10));
    setEditTxType(tx.type === "income" ? "income" : "expense");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const parsed = parseCurrencyInput(editAmount);
    if (!parsed || parsed <= 0) return;
    if (!editDate || !/^\d{4}-\d{2}-\d{2}$/.test(editDate)) return;
    setEditSaving(true);
    try {
      await updateTransaction(editingId, {
        title: editTitle.trim(),
        amount: parsed,
        type: editTxType,
        category: editCategory,
        note: editNote,
        date: editDate,
      });
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const sessionFilteredTx = useMemo(() => {
    if (!selectedSessionMonth) return transactions;
    const { startStr, endStr } = sessionRange(selectedSessionMonth);
    return transactions.filter(
      (t) => t.date >= startStr && t.date <= endStr
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, selectedSessionMonth, cycleDay]);

  const visibleTransactions = useMemo(() => {
    const uid = user?.uid;
    if (scopeView === "all" || !uid) return sessionFilteredTx;
    if (scopeView === "shared_pool") {
      return sessionFilteredTx.filter((t) => t.spendingType === "shared_pool");
    }
    return sessionFilteredTx.filter((t) => {
      if (t.spendingType !== "personal") return false;
      if (t.allocationUserId != null) return t.allocationUserId === uid;
      return t.userId === uid;
    });
  }, [sessionFilteredTx, scopeView, user?.uid]);

  const totalExpense = visibleTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const totalIncome = visibleTransactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);

  // Spending breakdown for the active session
  const personalSpending = useMemo(() => {
    if (!selectedSessionMonth) return 0;
    const { startStr, endStr } = sessionRange(selectedSessionMonth);
    return transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.date >= startStr &&
          t.date <= endStr &&
          t.spendingType === "personal"
      )
      .reduce((s, t) => s + t.amount, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, selectedSessionMonth, cycleDay]);

  const sharedSpending = useMemo(() => {
    if (!selectedSessionMonth) return 0;
    const { startStr, endStr } = sessionRange(selectedSessionMonth);
    return transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.date >= startStr &&
          t.date <= endStr &&
          t.spendingType === "shared_pool"
      )
      .reduce((s, t) => s + t.amount, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, selectedSessionMonth, cycleDay]);

  const personalRemaining =
    myBudget != null ? myBudget - personalSpending : null;
  const personalPct =
    myBudget && myBudget > 0
      ? Math.round((personalSpending / myBudget) * 100)
      : 0;
  const sharedRemaining =
    sharedPool != null ? sharedPool - sharedSpending : null;
  const sharedPct =
    sharedPool && sharedPool > 0
      ? Math.round((sharedSpending / sharedPool) * 100)
      : 0;

  const nameSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      if (t.title && t.title.trim()) {
        set.add(t.title.trim());
      }
    }
    return Array.from(set).slice(0, 8);
  }, [transactions]);

  if (!user?.familyId) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Receipt className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-medium">Chưa có gia đình</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bạn cần tạo hoặc tham gia một gia đình trước khi sử dụng chức năng giao dịch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Giao dịch</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ghi chép thu và chi hàng ngày
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VoiceExpenseInput
            open={voiceOpen}
            onOpenChange={setVoiceOpen}
            onConfirm={handleConfirmVoice}
            defaultDate={date}
            defaultSpendingType={spendingType}
            trigger={
              <Button size="sm" variant="outline" className="gap-1.5">
                <Mic className="h-4 w-4" /> Thu âm
              </Button>
            }
          />
          <Dialog open={showAddModal} onOpenChange={(open) => {
            setShowAddModal(open);
            if (!open) {
              setFormError(null);
              setAddTxType("expense");
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Thêm giao dịch
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>Thêm giao dịch</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label>Loại giao dịch</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      addTxType === "expense"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    onClick={() => {
                      setAddTxType("expense");
                      setCategory((c) =>
                        CATEGORIES.includes(c) ? c : CATEGORIES[0],
                      );
                    }}
                  >
                    Chi tiêu
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      addTxType === "income"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    onClick={() => {
                      setAddTxType("income");
                      setCategory((c) =>
                        INCOME_CATEGORIES.includes(c)
                          ? c
                          : INCOME_CATEGORIES[0],
                      );
                    }}
                  >
                    Thu nhập
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Tên giao dịch</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ví dụ: Ăn trưa, Mua sữa cho bé..."
                    required
                  />
                  {nameSuggestions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {nameSuggestions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                          onClick={() => setTitle(name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Số tiền (VND)</Label>
                  <CurrencyInput
                    value={amount}
                    onChange={setAmount}
                    placeholder="100,000"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Danh mục</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(addTxType === "income" ? INCOME_CATEGORIES : CATEGORIES).map(
                        (c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ngày</Label>
                  <DatePicker value={date} onChange={setDate} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>
                    {addTxType === "income"
                      ? "Thuộc về (quỹ nào)"
                      : "Nguồn chi"}
                  </Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        spendingType === "personal"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      onClick={() => setSpendingType("personal")}
                    >
                      Cá nhân
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        spendingType === "shared_pool"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      onClick={() => setSpendingType("shared_pool")}
                    >
                      Quỹ chung
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Ghi chú</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Tùy chọn"
                  />
                </div>
              </div>
              {formError && (
                <p className="text-xs text-destructive">{formError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                >
                  Hủy
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Đang lưu..." : "Lưu giao dịch"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Budget summary — only show when there's an allocation for the active month */}
      {activeBudget && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Personal budget */}
          {myBudget != null && myBudget > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-medium">Quỹ cá nhân</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  session {budgetFromSession}
                  {sessionRemainingDays != null && (
                    <> · Còn {sessionRemainingDays} ngày</>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-2.5">
                <div className="text-center">
                  <p className="text-[10px] text-blue-500 mb-0.5">Được chia</p>
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {fmt(myBudget)} đ
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-red-500 mb-0.5">Đã chi</p>
                  <p className="text-sm font-bold text-red-500 tabular-nums">
                    {fmt(personalSpending)} đ
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Còn lại</p>
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      personalRemaining != null && personalRemaining >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {fmt(personalRemaining ?? 0)} đ
                  </p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    personalPct > 90
                      ? "bg-red-500"
                      : personalPct > 70
                        ? "bg-amber-500"
                        : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(100, personalPct)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right mt-1">
                {personalPct}%
              </p>
            </Card>
          )}

          {/* Shared pool budget */}
          {sharedPool != null && sharedPool > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-teal-500" />
                  <span className="text-xs font-medium">Quỹ chung</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  session {budgetFromSession}
                  {sessionRemainingDays != null && (
                    <> · Còn {sessionRemainingDays} ngày</>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-2.5">
                <div className="text-center">
                  <p className="text-[10px] text-teal-500 mb-0.5">Được chia</p>
                  <p className="text-sm font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                    {fmt(sharedPool)} đ
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-red-500 mb-0.5">Đã chi</p>
                  <p className="text-sm font-bold text-red-500 tabular-nums">
                    {fmt(sharedSpending)} đ
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Còn lại</p>
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      sharedRemaining != null && sharedRemaining >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {fmt(sharedRemaining ?? 0)} đ
                  </p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    sharedPct > 90
                      ? "bg-red-500"
                      : sharedPct > 70
                        ? "bg-amber-500"
                        : "bg-teal-500"
                  }`}
                  style={{ width: `${Math.min(100, sharedPct)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right mt-1">
                {sharedPct}%
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Filters & summary */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedSessionMonth || "__all__"}
          onValueChange={(sessionMonth) => {
            if (sessionMonth === "__all__") {
              setSelectedSessionMonth(null);
              return;
            }
            setSelectedSessionMonth(sessionMonth);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Tất cả session" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tất cả session</SelectItem>
            {sessions.map((s) => {
              const { startStr, endStr } = sessionRange(s.month);
              const [year, month] = s.month.split("-");
              const monthNum = Number(month);
              const monthNames = [
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
              const monthLabel = monthNames[monthNum - 1] ?? s.month;
              const rangeLabel = `${startStr.slice(8, 10)}/${startStr.slice(
                5,
                7
              )} - ${endStr.slice(8, 10)}/${endStr.slice(5, 7)}`;
              const label = `Session ${monthLabel} ${year} (${rangeLabel})`;
              return (
                <SelectItem key={s.id} value={s.month}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select
          value={filterCategory || "__all__"}
          onValueChange={(v) => setFilterCategory(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tất cả danh mục</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5 shadow-sm"
          role="tablist"
          aria-label="Phạm vi quỹ"
        >
          {(
            [
              { key: "all" as const, label: "Tất cả" },
              { key: "personal_mine" as const, label: "Cá nhân" },
              { key: "shared_pool" as const, label: "Quỹ chung" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scopeView === key}
              title={
                key === "all"
                  ? "Mọi giao dịch trong session"
                  : key === "personal_mine"
                    ? "Chỉ khoản cá nhân của bạn"
                    : "Chỉ khoản quỹ chung"
              }
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                scopeView === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setScopeView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-right space-y-0.5">
          <div>
            Tổng thu:{" "}
            <span className="font-semibold text-green-600 dark:text-green-400">
              +{fmt(totalIncome)} đ
            </span>
          </div>
          <div>
            Tổng chi:{" "}
            <span className="font-semibold text-red-500">
              -{fmt(totalExpense)} đ
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Đang tải...
        </p>
      ) : sessionFilteredTx.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Receipt className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <div>
            <p className="font-medium">Chưa có giao dịch nào</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nhấn &quot;Thêm giao dịch&quot; để bắt đầu ghi chép.
            </p>
          </div>
        </Card>
      ) : visibleTransactions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Receipt className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <div>
            <p className="font-medium">Không có giao dịch phù hợp</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Đổi tab quỹ (Tất cả / Cá nhân / Quỹ chung) hoặc chọn session khác.
            </p>
          </div>
        </Card>
      ) : (
        <TransactionsTable
          transactions={visibleTransactions}
          totalExpense={totalExpense}
          totalIncome={totalIncome}
          user={user}
          family={family}
          editingId={editingId}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editAmount={editAmount}
          setEditAmount={setEditAmount}
          editCategory={editCategory}
          setEditCategory={setEditCategory}
          editNote={editNote}
          setEditNote={setEditNote}
          editDate={editDate}
          setEditDate={setEditDate}
          editTxType={editTxType}
          onEditTxTypeChange={handleEditTxTypeChange}
          editSaving={editSaving}
          saveEdit={saveEdit}
          setEditingId={setEditingId}
          startEdit={startEdit}
          deleteTransaction={deleteTransaction}
        />
      )}
    </div>
  );
}

const TX_PAGE_SIZE = 10;

function TransactionsTable({
  transactions,
  totalExpense,
  totalIncome,
  user,
  family,
  editingId,
  editTitle,
  setEditTitle,
  editAmount,
  setEditAmount,
  editCategory,
  setEditCategory,
  editNote,
  setEditNote,
  editDate,
  setEditDate,
  editTxType,
  onEditTxTypeChange,
  editSaving,
  saveEdit,
  setEditingId,
  startEdit,
  deleteTransaction,
}: {
  transactions: Transaction[];
  totalExpense: number;
  totalIncome: number;
  user: import("@/lib/stores/authStore").AuthUser | null;
  family: import("@/hooks/useFamily").Family | null;
  editingId: string | null;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editAmount: string;
  setEditAmount: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editNote: string;
  setEditNote: (v: string) => void;
  editDate: string;
  setEditDate: (v: string) => void;
  editTxType: "expense" | "income";
  onEditTxTypeChange: (t: "expense" | "income") => void;
  editSaving: boolean;
  saveEdit: () => void;
  setEditingId: (v: string | null) => void;
  startEdit: (tx: Transaction) => void;
  deleteTransaction: (id: string) => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(transactions.length / TX_PAGE_SIZE));
  const paged = transactions.slice(
    (page - 1) * TX_PAGE_SIZE,
    page * TX_PAGE_SIZE
  );

  return (
    <Card className="overflow-hidden">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-xs w-[7.5rem]">Ngày</TableHead>
            <TableHead className="text-xs w-24">Người chi</TableHead>
            <TableHead className="text-xs w-28">Danh mục</TableHead>
            <TableHead className="text-xs w-20">Nguồn</TableHead>
            <TableHead className="text-xs w-[180px]">Ghi chú</TableHead>
            <TableHead className="text-xs text-right w-28">Số tiền</TableHead>
            <TableHead className="text-xs text-right w-24">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((tx) =>
            editingId === tx.id ? (
              <TableRow key={tx.id} className="bg-muted/20">
                <TableCell className="p-1 align-middle">
                  <DatePicker
                    value={editDate}
                    onChange={setEditDate}
                    className="h-7 text-xs px-1.5"
                    placeholder="Ngày"
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {tx.userId === user?.uid
                    ? "Tôi"
                    : family?.members[tx.userId]?.name || tx.userId.slice(0, 6)}
                </TableCell>
                <TableCell className="align-top p-1">
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          editTxType === "expense"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                        onClick={() => onEditTxTypeChange("expense")}
                      >
                        Chi
                      </button>
                      <button
                        type="button"
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          editTxType === "income"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                        onClick={() => onEditTxTypeChange("income")}
                      >
                        Thu
                      </button>
                    </div>
                    <Select value={editCategory} onValueChange={setEditCategory}>
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(editTxType === "income"
                          ? INCOME_CATEGORIES
                          : CATEGORIES
                        ).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {tx.spendingType === "shared_pool" ? "Chung" : "Cá nhân"}
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden">
                  <div className="flex flex-col gap-1 min-w-0">
                    <Input
                      className="h-7 text-xs min-w-0 max-w-full"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Tên giao dịch"
                    />
                    <Input
                      className="h-7 text-xs min-w-0 max-w-full"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Ghi chú"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyInput
                    className={`h-7 w-full text-xs text-right tabular-nums ${
                      editTxType === "income"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500"
                    }`}
                    value={editAmount}
                    onChange={setEditAmount}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="rounded p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                      disabled={editSaving}
                      onClick={saveEdit}
                      title="Lưu"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      onClick={() => setEditingId(null)}
                      title="Hủy"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={tx.id}>
                <TableCell className="text-xs tabular-nums">{tx.date}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {tx.userId === user?.uid
                    ? "Tôi"
                    : family?.members[tx.userId]?.name || tx.userId.slice(0, 6)}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <span
                      className={`rounded px-1 py-0 text-[9px] font-semibold ${
                        tx.type === "income"
                          ? "bg-green-500/15 text-green-700 dark:text-green-400"
                          : "bg-red-500/15 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {tx.type === "income" ? "Thu" : "Chi"}
                    </span>
                    {tx.category}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`text-[10px] font-medium ${
                      tx.spendingType === "shared_pool"
                        ? "text-teal-600 dark:text-teal-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {tx.spendingType === "shared_pool" ? "Quỹ chung" : "Cá nhân"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground min-w-0 overflow-hidden">
                  <div className="flex flex-col gap-0.5 min-w-0 truncate">
                    <span className="font-medium truncate">
                      {tx.title || "(Không có tên)"}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {tx.note || "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className={`text-right font-medium tabular-nums ${
                    tx.type === "income"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-500"
                  }`}
                >
                  {tx.type === "income" ? "+" : "-"}
                  {fmt(tx.amount)} đ
                </TableCell>
                <TableCell className="text-right">
                  {tx.userId === user?.uid ||
                  (isFamilyOwner(user?.uid, family) &&
                    tx.spendingType === "shared_pool") ? (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        onClick={() => startEdit(tx)}
                        title="Sửa"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-destructive dark:hover:bg-red-950"
                        onClick={() => {
                          if (confirm("Xóa giao dịch này?")) {
                            deleteTransaction(tx.id);
                          }
                        }}
                        title="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            )
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
              Tổng thu (
              {transactions.filter((t) => t.type === "income").length} giao dịch)
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs text-green-600 dark:text-green-400">
              +{fmt(totalIncome)} đ
            </TableCell>
            <TableCell />
          </TableRow>
          <TableRow>
            <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
              Tổng chi (
              {transactions.filter((t) => t.type === "expense").length} giao dịch)
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs text-red-500">
              -{fmt(totalExpense)} đ
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
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
