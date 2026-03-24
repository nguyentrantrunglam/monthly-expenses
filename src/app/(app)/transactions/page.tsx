"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Receipt,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Wallet,
  Scale,
  Mic,
  Loader2,
} from "lucide-react";
import { VoiceExpensePanel } from "@/components/VoiceExpenseInput";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

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

/** Tiêu đề giao dịch cho phần lệch không nhớ rõ khi đối soát số dư. */
const RECON_UNKNOWN_EXPENSE_TITLE = "Chi không nhớ rõ (đối soát)";
const RECON_TRANSACTION_NOTE = "Đối soát số dư ví";

/** Một dòng chi bù trong đối soát — cùng trường với form thêm giao dịch. */
interface ReconLine {
  id: string;
  title: string;
  amount: string;
  category: string;
  type: "expense" | "income";
  spendingType: "personal" | "shared_pool";
  date: string;
  note: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function createdAtToDate(createdAt: unknown): Date | null {
  if (createdAt == null) return null;
  let d: Date | null = null;
  if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    typeof (createdAt as { toDate?: () => Date }).toDate === "function"
  ) {
    d = (createdAt as { toDate: () => Date }).toDate();
  } else if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    typeof (createdAt as { toMillis?: () => number }).toMillis === "function"
  ) {
    d = new Date((createdAt as { toMillis: () => number }).toMillis());
  } else if (createdAt instanceof Date) {
    d = createdAt;
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function formatEntryDate(createdAt: unknown): string {
  const d = createdAtToDate(createdAt);
  if (!d) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

function formatEntryTime(createdAt: unknown): string {
  const d = createdAtToDate(createdAt);
  if (!d) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

/** Hover: ngày/giờ nhập (createdAt). Không có dữ liệu → chỉ hiển thị children. */
function TransactionEntryTooltip({
  createdAt,
  children,
}: {
  createdAt: unknown;
  children: React.ReactElement<{ className?: string }>;
}) {
  if (!createdAtToDate(createdAt)) {
    return children;
  }
  const trigger = React.cloneElement(children, {
    className: cn(
      children.props.className,
      "cursor-help border-b border-dotted border-muted-foreground/45 rounded-sm"
    ),
  });
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="top" align="start" className="text-left">
        <div className="space-y-1 leading-snug">
          <p>
            <span className="text-muted-foreground">Ngày nhập:</span>{" "}
            <span className="font-medium tabular-nums">
              {formatEntryDate(createdAt)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Giờ nhập:</span>{" "}
            <span className="font-medium tabular-nums">
              {formatEntryTime(createdAt)}
            </span>
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function TransactionsPage() {
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const [filterCategory, setFilterCategory] = useState("");
  const [scopeView, setScopeView] = useState<
    "all" | "personal_mine" | "shared_pool"
  >("personal_mine");
  const { transactions, loading, addTransaction, updateTransaction, deleteTransaction } =
    useTransactions({
      category: filterCategory || undefined,
    });

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalTab, setEntryModalTab] = useState<"manual" | "voice">(
    "manual",
  );
  const [voiceRecording, setVoiceRecording] = useState(false);
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

  const [reconOpen, setReconOpen] = useState(false);
  const [reconActualInput, setReconActualInput] = useState("");
  const [reconLines, setReconLines] = useState<ReconLine[]>([]);
  const [reconSubmitting, setReconSubmitting] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionRange phụ thuộc cycleDay
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
      setEntryModalOpen(false);
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

  const personalIncomeSession = useMemo(() => {
    if (!selectedSessionMonth) return 0;
    const { startStr, endStr } = sessionRange(selectedSessionMonth);
    return transactions
      .filter(
        (t) =>
          t.type === "income" &&
          t.date >= startStr &&
          t.date <= endStr &&
          t.spendingType === "personal"
      )
      .reduce((s, t) => s + t.amount, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, selectedSessionMonth, cycleDay]);

  const sharedIncomeSession = useMemo(() => {
    if (!selectedSessionMonth) return 0;
    const { startStr, endStr } = sessionRange(selectedSessionMonth);
    return transactions
      .filter(
        (t) =>
          t.type === "income" &&
          t.date >= startStr &&
          t.date <= endStr &&
          t.spendingType === "shared_pool"
      )
      .reduce((s, t) => s + t.amount, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, selectedSessionMonth, cycleDay]);

  const personalBudgetTotal =
    myBudget != null ? myBudget + personalIncomeSession : null;
  const personalRemaining =
    personalBudgetTotal != null
      ? personalBudgetTotal - personalSpending
      : null;
  const sharedBudgetTotal =
    sharedPool != null ? sharedPool + sharedIncomeSession : null;
  const sharedRemaining =
    sharedBudgetTotal != null ? sharedBudgetTotal - sharedSpending : null;

  /**
   * Số tiền còn lại theo app (thẻ ngân sách) — so với số dư thực tế khi đối soát.
   * Chỉ có khi session đã khóa có phân bổ; tab Tất cả không dùng một số duy nhất.
   */
  const reconCalculatedRemaining =
    scopeView === "shared_pool"
      ? sharedRemaining
      : scopeView === "personal_mine"
        ? personalRemaining
        : null;

  const reconActualNum = useMemo(() => {
    const t = reconActualInput.trim();
    if (!t) return null;
    const v = parseCurrencyInput(reconActualInput);
    if (Number.isNaN(v)) return null;
    return v;
  }, [reconActualInput]);

  /** Chênh lệch cần bù (thiếu tiền mặt so với số còn lại theo app). */
  const reconShortfall =
    reconActualNum != null && reconCalculatedRemaining != null
      ? Math.max(0, reconCalculatedRemaining - reconActualNum)
      : null;

  /** Chỉ cộng các khoản chi — dùng để khớp phần lệch so với ví. */
  const reconRememberedSum = useMemo(() => {
    let s = 0;
    for (const line of reconLines) {
      if (line.type !== "expense") continue;
      const a = parseCurrencyInput(line.amount);
      if (a != null && !Number.isNaN(a) && a > 0) s += a;
    }
    return s;
  }, [reconLines]);

  const reconRemainder =
    reconShortfall != null
      ? Math.max(0, reconShortfall - reconRememberedSum)
      : null;

  const reconSumExceedsShortfall =
    reconShortfall != null && reconRememberedSum > reconShortfall + 0.5;

  const reconSpendingType: "personal" | "shared_pool" =
    scopeView === "shared_pool" ? "shared_pool" : "personal";

  const addReconLine = () => {
    const today = new Date().toISOString().slice(0, 10);
    setReconLines((prev) => [
      ...prev,
      {
        id: nanoid(8),
        title: "",
        amount: "",
        category: CATEGORIES[0],
        type: "expense",
        spendingType: reconSpendingType,
        date: today,
        note: "",
      },
    ]);
  };

  const removeReconLine = (id: string) => {
    setReconLines((prev) => prev.filter((r) => r.id !== id));
  };

  const setReconLineTxType = (id: string, type: "expense" | "income") => {
    setReconLines((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const category =
          type === "income"
            ? INCOME_CATEGORIES.includes(r.category)
              ? r.category
              : INCOME_CATEGORIES[0]
            : CATEGORIES.includes(r.category)
              ? r.category
              : CATEGORIES[0];
        return { ...r, type, category };
      }),
    );
  };

  const submitReconciliation = async () => {
    setReconError(null);
    if (reconCalculatedRemaining == null) {
      setReconError(
        "Chưa có số còn lại để so — cần chọn session đã khóa có phân bổ và tab Cá nhân hoặc Quỹ chung."
      );
      return;
    }
    if (reconActualNum == null) {
      setReconError("Nhập số dư thực tế hiện tại.");
      return;
    }
    if (reconShortfall == null || reconShortfall <= 0) {
      setReconError(
        "Không có khoản thiếu cần bù — thực tế không thấp hơn số còn lại theo app."
      );
      return;
    }
    if (reconSumExceedsShortfall) {
      setReconError(
        "Tổng các khoản nhớ được lớn hơn phần lệch. Hãy chỉnh lại số tiền."
      );
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const linesToPost: {
      title: string;
      amount: number;
      category: string;
      type: "expense" | "income";
      spendingType: "personal" | "shared_pool";
      date: string;
      note: string;
    }[] = [];
    for (const line of reconLines) {
      const amt = parseCurrencyInput(line.amount);
      if (amt == null || Number.isNaN(amt) || amt <= 0) continue;
      const title = line.title.trim();
      if (!title) {
        setReconError(
          "Nhập tên giao dịch cho mỗi dòng đã điền số tiền.",
        );
        return;
      }
      const dateStr = (line.date ?? "").trim().slice(0, 10) || today;
      linesToPost.push({
        title,
        amount: amt,
        category:
          line.category ||
          (line.type === "income" ? INCOME_CATEGORIES[0] : "Khác"),
        type: line.type,
        spendingType: line.spendingType,
        date: dateStr,
        note: line.note.trim(),
      });
    }
    if (reconRemainder != null && reconRemainder > 0) {
      linesToPost.push({
        title: RECON_UNKNOWN_EXPENSE_TITLE,
        amount: reconRemainder,
        category: "Khác",
        type: "expense",
        spendingType: reconSpendingType,
        date: today,
        note: RECON_TRANSACTION_NOTE,
      });
    }
    if (linesToPost.length === 0) {
      setReconError("Không có khoản nào để ghi — thêm dòng hoặc kiểm tra lệch.");
      return;
    }
    setReconSubmitting(true);
    try {
      for (const row of linesToPost) {
        await addTransaction({
          title: row.title,
          amount: row.amount,
          type: row.type,
          category: row.category,
          spendingType: row.spendingType,
          note: row.note,
          date: row.date,
        });
      }
      setReconOpen(false);
      setReconActualInput("");
      setReconLines([]);
    } catch (e) {
      console.error(e);
      setReconError("Không lưu được giao dịch. Thử lại sau.");
    } finally {
      setReconSubmitting(false);
    }
  };

  const personalPct =
    personalBudgetTotal != null && personalBudgetTotal > 0
      ? Math.round((personalSpending / personalBudgetTotal) * 100)
      : 0;
  const sharedPct =
    sharedBudgetTotal != null && sharedBudgetTotal > 0
      ? Math.round((sharedSpending / sharedBudgetTotal) * 100)
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEntryModalTab("manual");
              setEntryModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Thêm giao dịch
          </Button>
          <Dialog
            open={entryModalOpen}
            onOpenChange={(open) => {
              setEntryModalOpen(open);
              if (!open) {
                setFormError(null);
                setAddTxType("expense");
              }
            }}
          >
            <DialogContent
              className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-6 min-h-0"
              onPointerDownOutside={(e) => {
                if (entryModalTab === "voice" && voiceRecording) {
                  e.preventDefault();
                }
              }}
              onEscapeKeyDown={(e) => {
                if (entryModalTab === "voice" && voiceRecording) {
                  e.preventDefault();
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>Thêm giao dịch</DialogTitle>
              </DialogHeader>
              <div
                className="mt-4 inline-flex w-full max-w-md shrink-0 rounded-lg border bg-muted/40 p-0.5"
                role="tablist"
                aria-label="Cách nhập giao dịch"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={entryModalTab === "manual"}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    entryModalTab === "manual"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setEntryModalTab("manual")}
                >
                  Nhập tay
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={entryModalTab === "voice"}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    entryModalTab === "voice"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setEntryModalTab("voice")}
                >
                  <Mic className="h-3.5 w-3.5" />
                  Thu âm
                </button>
              </div>
              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                {entryModalTab === "manual" ? (
            <form
              onSubmit={handleAdd}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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
              </div>
              <div className="mt-3 flex shrink-0 justify-end gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEntryModalOpen(false)}
                >
                  Hủy
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Đang lưu..." : "Lưu giao dịch"}
                </Button>
              </div>
            </form>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <VoiceExpensePanel
                      showHeader={false}
                      active={entryModalOpen && entryModalTab === "voice"}
                      onConfirm={handleConfirmVoice}
                      onClose={() => setEntryModalOpen(false)}
                      onRecordingChange={setVoiceRecording}
                    />
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={reconOpen}
            onOpenChange={(open) => {
              setReconOpen(open);
              if (open) {
                setReconError(null);
                setReconActualInput("");
                setReconLines([]);
              }
            }}
          >
            <DialogContent className="flex max-h-[min(90dvh,720px)] min-h-0 flex-col gap-0 overflow-hidden p-6 sm:max-w-lg">
              <DialogHeader className="shrink-0 pr-6">
                <DialogTitle>Đối soát số dư ví</DialogTitle>
                <DialogDescription>
                  Nhập <strong>số dư thực tế</strong> trong ví và so với{" "}
                  <strong>số còn lại đã tính</strong> trên thẻ ngân sách (cùng
                  session và tab Cá nhân / Quỹ chung). Nếu thiếu tiền so với số
                  đó, bạn có thể ghi bù các khoản chi nhớ được; phần còn lại lưu
                  là chi không nhớ rõ.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-1">
              <div className="space-y-4">
                {reconCalculatedRemaining == null ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                    Chưa có số còn lại để so: cần{" "}
                    <strong>chọn session đã khóa có phân bổ ngân sách</strong> và
                    tab <strong>Cá nhân</strong> hoặc <strong>Quỹ chung</strong>{" "}
                    (không dùng tab Tất cả).
                  </p>
                ) : null}
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">
                      Số còn lại theo app (đã tính):
                    </span>{" "}
                    <span className="font-semibold tabular-nums">
                      {reconCalculatedRemaining != null
                        ? `${fmt(reconCalculatedRemaining)} đ`
                        : "—"}
                    </span>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recon-actual">
                    Số dư thực tế hiện tại (đồng)
                  </Label>
                  <CurrencyInput
                    id="recon-actual"
                    value={reconActualInput}
                    onChange={setReconActualInput}
                    placeholder="Đếm tiền trong ví"
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm space-y-1">
                  {reconCalculatedRemaining != null && reconActualNum != null ? (
                    <>
                      <p>
                        <span className="text-muted-foreground">
                          Chênh lệch cần bù (thiếu so với app):
                        </span>{" "}
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            (reconShortfall ?? 0) > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {fmt(reconShortfall ?? 0)} đ
                        </span>
                      </p>
                      {reconShortfall === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Không thiếu so với số còn lại theo app — không cần form
                          bù chi.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {reconCalculatedRemaining == null
                        ? "Chọn đủ điều kiện phía trên để so sánh."
                        : "Nhập số dư thực tế để xem chênh lệch."}
                    </p>
                  )}
                </div>
                {reconCalculatedRemaining != null &&
                reconActualNum != null &&
                reconActualNum > reconCalculatedRemaining ? (
                  <p className="text-sm text-muted-foreground">
                    Số dư thực tế cao hơn số còn lại theo app — không cần ghi chi
                    bù từ đối soát này.
                  </p>
                ) : null}
                {reconShortfall != null && reconShortfall > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                      Mỗi dòng điền như thêm giao dịch (loại, quỹ, ngày, ghi chú…).
                      Tổng các khoản <strong>chi</strong> nhớ được không vượt quá
                      phần lệch; khoản <strong>thu</strong> vẫn được ghi nhưng
                      không tính vào tổng bù lệch.
                    </p>
                    <div>
                      <p className="text-sm font-medium">
                        Chi bù — các khoản bạn nhớ
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Phần chênh lệch chưa gán sẽ ghi tự động là &quot;
                        {RECON_UNKNOWN_EXPENSE_TITLE}&quot;.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {reconLines.map((line) => (
                        <div
                          key={line.id}
                          className="relative rounded-lg border bg-muted/20 p-3 sm:p-4"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1 h-8 w-8 shrink-0 text-muted-foreground"
                            onClick={() => removeReconLine(line.id)}
                            aria-label="Xóa dòng"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <div className="grid gap-3 pr-8 sm:grid-cols-2">
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px]">Loại giao dịch</Label>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                    line.type === "expense"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                                  }`}
                                  onClick={() =>
                                    setReconLineTxType(line.id, "expense")
                                  }
                                >
                                  Chi tiêu
                                </button>
                                <button
                                  type="button"
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                    line.type === "income"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                                  }`}
                                  onClick={() =>
                                    setReconLineTxType(line.id, "income")
                                  }
                                >
                                  Thu nhập
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px]">
                                {line.type === "income"
                                  ? "Thuộc về (quỹ nào)"
                                  : "Nguồn chi"}
                              </Label>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                    line.spendingType === "personal"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                                  }`}
                                  onClick={() =>
                                    setReconLines((prev) =>
                                      prev.map((r) =>
                                        r.id === line.id
                                          ? { ...r, spendingType: "personal" }
                                          : r
                                      )
                                    )
                                  }
                                >
                                  Cá nhân
                                </button>
                                <button
                                  type="button"
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                    line.spendingType === "shared_pool"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                                  }`}
                                  onClick={() =>
                                    setReconLines((prev) =>
                                      prev.map((r) =>
                                        r.id === line.id
                                          ? {
                                              ...r,
                                              spendingType: "shared_pool",
                                            }
                                          : r
                                      )
                                    )
                                  }
                                >
                                  Quỹ chung
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px]">Tên giao dịch</Label>
                              <Input
                                value={line.title}
                                onChange={(e) =>
                                  setReconLines((prev) =>
                                    prev.map((r) =>
                                      r.id === line.id
                                        ? { ...r, title: e.target.value }
                                        : r
                                    )
                                  )
                                }
                                placeholder="Ví dụ: Cà phê, xăng…"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px]">Số tiền (VND)</Label>
                              <CurrencyInput
                                value={line.amount}
                                onChange={(v) =>
                                  setReconLines((prev) =>
                                    prev.map((r) =>
                                      r.id === line.id
                                        ? { ...r, amount: v }
                                        : r
                                    )
                                  )
                                }
                                placeholder="100,000"
                                className="font-mono text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px]">Danh mục</Label>
                              <Select
                                value={line.category}
                                onValueChange={(v) =>
                                  setReconLines((prev) =>
                                    prev.map((r) =>
                                      r.id === line.id
                                        ? { ...r, category: v }
                                        : r
                                    )
                                  )
                                }
                              >
                                <SelectTrigger className="h-9 w-full text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(line.type === "income"
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
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px]">Ngày</Label>
                              <DatePicker
                                value={line.date}
                                onChange={(v) =>
                                  setReconLines((prev) =>
                                    prev.map((r) =>
                                      r.id === line.id ? { ...r, date: v } : r
                                    )
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label className="text-[11px]">Ghi chú</Label>
                              <Input
                                value={line.note}
                                onChange={(e) =>
                                  setReconLines((prev) =>
                                    prev.map((r) =>
                                      r.id === line.id
                                        ? { ...r, note: e.target.value }
                                        : r
                                    )
                                  )
                                }
                                placeholder="Tùy chọn"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={addReconLine}
                      >
                        <Plus className="h-4 w-4" />
                        Thêm khoản bù
                      </Button>
                    </div>
                    {reconRemainder != null && reconShortfall > 0 ? (
                      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">
                          Phần còn lại (tự động):
                        </span>{" "}
                        <span className="font-medium tabular-nums">
                          {fmt(reconRemainder)} đ
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {RECON_UNKNOWN_EXPENSE_TITLE}
                        </span>
                      </div>
                    ) : null}
                    {reconSumExceedsShortfall ? (
                      <p className="text-sm text-destructive">
                        Tổng các khoản nhớ được vượt quá phần lệch — giảm số tiền
                        hoặc xóa bớt dòng.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {reconError ? (
                  <p className="text-sm text-destructive">{reconError}</p>
                ) : null}
              </div>
              </div>
              <div className="mt-3 flex shrink-0 justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReconOpen(false)}
                >
                  Đóng
                </Button>
                <Button
                  type="button"
                  disabled={
                    reconSubmitting ||
                    reconCalculatedRemaining == null ||
                    reconShortfall == null ||
                    reconShortfall <= 0 ||
                    reconSumExceedsShortfall ||
                    reconActualNum == null
                  }
                  onClick={() => void submitReconciliation()}
                >
                  {reconSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Ghi các khoản bù
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setReconOpen(true)}
          >
            <Scale className="h-4 w-4" />
            Đối soát số dư
          </Button>
        </div>
      </div>

      {/* Budget summary — only show when there's an allocation for the active month */}
      {activeBudget && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Personal budget */}
          {myBudget != null &&
            (myBudget > 0 || personalIncomeSession > 0) && (
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
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-3 sm:gap-3">
                <div className="min-w-0 space-y-3 text-center sm:text-left">
                  <div>
                    <p className="text-[10px] text-blue-500 mb-0.5">Được chia</p>
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums whitespace-nowrap">
                      {fmt(myBudget)} đ
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 hidden sm:block">
                      trong session
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-green-600 dark:text-green-500 mb-0.5">
                      Thu nhập
                    </p>
                    <p className="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums whitespace-nowrap">
                      +{fmt(personalIncomeSession)} đ
                    </p>
                  </div>
                </div>
                <div className="min-w-0 text-center">
                  <p className="text-[10px] text-red-500 mb-0.5">Đã chi</p>
                  <p className="text-sm font-semibold text-red-500 tabular-nums whitespace-nowrap">
                    {fmt(personalSpending)} đ
                  </p>
                </div>
                <div className="min-w-0 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Còn lại</p>
                  <p
                    className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                      personalRemaining != null && personalRemaining >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {fmt(personalRemaining ?? 0)} đ
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60">
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
                <p className="text-[10px] text-muted-foreground text-right mt-1 tabular-nums">
                  {personalPct}% đã chi (trên được chia + thu)
                </p>
              </div>
            </Card>
          )}

          {/* Shared pool budget */}
          {sharedPool != null &&
            (sharedPool > 0 || sharedIncomeSession > 0) && (
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
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-3 sm:gap-3">
                <div className="min-w-0 space-y-3 text-center sm:text-left">
                  <div>
                    <p className="text-[10px] text-teal-600 dark:text-teal-500 mb-0.5">
                      Được chia
                    </p>
                    <p className="text-sm font-semibold text-teal-600 dark:text-teal-400 tabular-nums whitespace-nowrap">
                      {fmt(sharedPool)} đ
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 hidden sm:block">
                      trong session
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-green-600 dark:text-green-500 mb-0.5">
                      Thu nhập
                    </p>
                    <p className="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums whitespace-nowrap">
                      +{fmt(sharedIncomeSession)} đ
                    </p>
                  </div>
                </div>
                <div className="min-w-0 text-center">
                  <p className="text-[10px] text-red-500 mb-0.5">Đã chi</p>
                  <p className="text-sm font-semibold text-red-500 tabular-nums whitespace-nowrap">
                    {fmt(sharedSpending)} đ
                  </p>
                </div>
                <div className="min-w-0 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Còn lại</p>
                  <p
                    className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                      sharedRemaining != null && sharedRemaining >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {fmt(sharedRemaining ?? 0)} đ
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60">
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
                <p className="text-[10px] text-muted-foreground text-right mt-1 tabular-nums">
                  {sharedPct}% đã chi (trên được chia + thu)
                </p>
              </div>
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
          key={`tx-${selectedSessionMonth ?? "all"}-${scopeView}-${filterCategory || "allcat"}`}
          transactions={visibleTransactions}
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

/** Số dòng hiển thị ban đầu; cuộn xuống sẽ tải thêm từng đợt. */
const TX_INITIAL_VISIBLE = 10;
const TX_LOAD_MORE = 10;
const TX_LOAD_MORE_DELAY_MS = 280;

function TransactionsTable({
  transactions,
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
  const [visibleCount, setVisibleCount] = useState(TX_INITIAL_VISIBLE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreInFlightRef = useRef(false);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shown = useMemo(
    () => transactions.slice(0, visibleCount),
    [transactions, visibleCount]
  );
  const hasMore = visibleCount < transactions.length;

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || loadMoreInFlightRef.current) return;
        loadMoreInFlightRef.current = true;
        setLoadingMore(true);
        if (loadMoreTimeoutRef.current) clearTimeout(loadMoreTimeoutRef.current);
        loadMoreTimeoutRef.current = setTimeout(() => {
          loadMoreTimeoutRef.current = null;
          setVisibleCount((c) =>
            Math.min(c + TX_LOAD_MORE, transactions.length)
          );
          loadMoreInFlightRef.current = false;
          setLoadingMore(false);
        }, TX_LOAD_MORE_DELAY_MS);
      },
      { root: null, rootMargin: "240px", threshold: 0 }
    );
    obs.observe(node);
    return () => {
      obs.disconnect();
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
        loadMoreTimeoutRef.current = null;
      }
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
    };
  }, [hasMore, transactions.length, visibleCount]);

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="overflow-hidden">
        <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-xs w-22 min-w-22">Ngày</TableHead>
            <TableHead className="text-xs w-24">Người chi</TableHead>
            <TableHead className="text-xs w-28">Danh mục</TableHead>
            <TableHead className="text-xs w-20">Nguồn</TableHead>
            <TableHead className="text-xs w-[180px]">Ghi chú</TableHead>
            <TableHead className="text-xs text-right w-28">Số tiền</TableHead>
            <TableHead className="text-xs text-right w-24">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((tx) =>
            editingId === tx.id ? (
              <TableRow key={tx.id} className="bg-muted/20">
                <TableCell className="p-1 align-top">
                  <TransactionEntryTooltip createdAt={tx.createdAt}>
                    <div className="flex w-full min-w-0 flex-col gap-0.5">
                      <DatePicker
                        value={editDate}
                        onChange={setEditDate}
                        className="h-7 text-xs px-1.5"
                        placeholder="Ngày"
                      />
                    </div>
                  </TransactionEntryTooltip>
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
                <TableCell className="text-xs tabular-nums align-top">
                  <TransactionEntryTooltip createdAt={tx.createdAt}>
                    <span className="inline-block text-xs tabular-nums leading-tight">
                      {tx.date}
                    </span>
                  </TransactionEntryTooltip>
                </TableCell>
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
          {hasMore ? (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={7} className="h-px p-0">
                <div
                  ref={loadMoreSentinelRef}
                  className="flex min-h-10 items-center justify-center gap-2 py-2"
                  aria-busy={loadingMore}
                  aria-label={
                    loadingMore ? "Đang tải thêm giao dịch" : "Tải thêm khi cuộn tới"
                  }
                >
                  {loadingMore ? (
                    <>
                      <Loader2
                        className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                        aria-hidden
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Đang tải thêm…
                      </span>
                    </>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {transactions.length > 0 ? (
        <div className="border-t px-4 py-2 text-center text-[11px] text-muted-foreground">
          Đang hiển thị {shown.length}/{transactions.length} giao dịch
          {loadingMore
            ? " · đang tải thêm…"
            : hasMore
              ? " · cuộn xuống để tải thêm"
              : ""}
        </div>
      ) : null}
      </Card>
    </TooltipProvider>
  );
}
