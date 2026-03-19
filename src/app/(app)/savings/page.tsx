"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput, parseCurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/components/ui/date-picker";
import { Trash2 } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

interface Deposit {
  month: string;
  amount: number;
  sessionId: string;
  note?: string;
  createdAt: { toDate?: () => Date } | string;
}

interface Withdrawal {
  amount: number;
  note?: string | null;
  createdAt: { toDate?: () => Date } | string;
}

interface GoldPurchase {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number; // chỉ
  pricePerUnit: number; // VND / chỉ
  totalCost: number; // VND
  note?: string;
}

interface GoldValuePoint {
  id: string;
  createdAt: string;
  totalValue: number;
  totalWeight: number;
  pricePerUnit: number;
}

export default function SavingsPage() {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [goldLoading, setGoldLoading] = useState(true);
  const [goldPurchases, setGoldPurchases] = useState<GoldPurchase[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  const [goldDate, setGoldDate] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  });
  const [goldWeight, setGoldWeight] = useState("");
  const [goldPricePerUnit, setGoldPricePerUnit] = useState("");
  const [goldNote, setGoldNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [activeTab, setActiveTab] = useState<"cash" | "gold">("cash");
  const [goldMarketPrice, setGoldMarketPrice] = useState("");
  const [goldHistory, setGoldHistory] = useState<GoldValuePoint[]>([]);
  const [extraAmount, setExtraAmount] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [extraDepositDate, setExtraDepositDate] = useState("");
  const [addingExtra, setAddingExtra] = useState(false);
  const [existingGoldWeight, setExistingGoldWeight] = useState("");
  const [addingExistingGold, setAddingExistingGold] = useState(false);
  const [updatingGoldPrice, setUpdatingGoldPrice] = useState(false);

  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "savingsFund", "main");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBalance(data.balance ?? 0);
        setDeposits(data.deposits ?? []);
        setWithdrawals(data.withdrawals ?? []);
      } else {
        setBalance(0);
        setDeposits([]);
        setWithdrawals([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId]);

  // Load last saved market gold price for this family
  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "goldSettings", "main");
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { lastPricePerUnit?: number | null };
      if (data.lastPricePerUnit && data.lastPricePerUnit > 0) {
        setGoldMarketPrice(String(data.lastPricePerUnit));
      }
    });
    return () => unsub();
  }, [user?.familyId]);

  // Load historical gold value snapshots
  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const col = collection(
      db,
      "families",
      user.familyId,
      "goldValueHistory",
    );
    const q = query(col, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: GoldValuePoint[] = [];
      snap.forEach((d) => {
        const data = d.data() as {
          createdAt?: { toDate?: () => Date } | string;
          totalValue?: number;
          totalWeight?: number;
          pricePerUnit?: number;
        };
        const raw = data.createdAt;
        const ts =
          typeof raw === "string"
            ? raw
            : raw?.toDate?.()?.toISOString() ?? "";
        list.push({
          id: d.id,
          createdAt: ts,
          totalValue: data.totalValue ?? 0,
          totalWeight: data.totalWeight ?? 0,
          pricePerUnit: data.pricePerUnit ?? 0,
        });
      });
      setGoldHistory(list);
    });
    return () => unsub();
  }, [user?.familyId]);

  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "goldSavings");
    const q = query(col, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: GoldPurchase[] = [];
      snap.forEach((d) => {
        const data = d.data() as {
          date?: string;
          weight?: number;
          pricePerUnit?: number;
          totalCost?: number;
          note?: string;
        };
        list.push({
          id: d.id,
          date: data.date ?? "",
          weight: data.weight ?? 0,
          pricePerUnit: data.pricePerUnit ?? 0,
          totalCost: data.totalCost ?? 0,
          note: data.note,
        });
      });
      setGoldPurchases(list);
      setGoldLoading(false);
    });
    return () => unsub();
  }, [user?.familyId]);

  const handleAddGoldPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.familyId) return;
    const weight = Number(goldWeight.replace(/\s/g, "").replace(",", ".")) || 0;
    const pricePerUnit = parseCurrencyInput(goldPricePerUnit) || 0;
    if (!goldDate || weight <= 0 || pricePerUnit <= 0) return;

    try {
      setSubmitting(true);
      const db = getFirestoreDb();
      const col = collection(db, "families", user.familyId, "goldSavings");
      const totalCost = Math.round(weight * pricePerUnit);
      await addDoc(col, {
        date: goldDate,
        weight,
        pricePerUnit,
        totalCost,
        note: goldNote.trim() || null,
        createdAt: serverTimestamp(),
      });
      setGoldWeight("");
      setGoldPricePerUnit("");
      setGoldNote("");
    } finally {
      setSubmitting(false);
    }
  };

  const saveGoldMarketPrice = async (value: string) => {
    if (!user?.familyId) return;
    setUpdatingGoldPrice(true);
    try {
      const numeric = parseCurrencyInput(value) || 0;
      const db = getFirestoreDb();
      const ref = doc(db, "families", user.familyId, "goldSettings", "main");
      await setDoc(
        ref,
        {
          lastPricePerUnit: numeric > 0 ? numeric : null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Also snapshot total portfolio value at this price
      if (numeric > 0 && goldPurchases.length > 0) {
        const totalWeight = goldPurchases.reduce(
          (s, g) => s + g.weight,
          0,
        );
        if (totalWeight > 0) {
          const totalValue = Math.round(totalWeight * numeric);
          const historyCol = collection(
            db,
            "families",
            user.familyId,
            "goldValueHistory",
          );
          await addDoc(historyCol, {
            createdAt: serverTimestamp(),
            totalValue,
            totalWeight,
            pricePerUnit: numeric,
          });
        }
      }
    } finally {
      setUpdatingGoldPrice(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.familyId) return;
    const amount = parseCurrencyInput(withdrawAmount) || 0;
    if (amount <= 0 || amount > balance) return;

    try {
      setWithdrawing(true);
      const db = getFirestoreDb();
      const ref = doc(db, "families", user.familyId, "savingsFund", "main");
      const nextWithdrawals: Withdrawal[] = [
        ...(withdrawals ?? []),
        {
          amount,
          note: withdrawNote.trim() || null,
          createdAt: new Date().toISOString(),
        },
      ];
      const nextBalance = Math.max(0, balance - amount);
      await updateDoc(ref, {
        withdrawals: nextWithdrawals,
        balance: nextBalance,
      } as unknown as Partial<{
        withdrawals: Withdrawal[];
        balance: number;
      }>);
      setWithdrawAmount("");
      setWithdrawNote("");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleExtraDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.familyId) return;
    const amount = parseCurrencyInput(extraAmount) || 0;
    if (amount <= 0) return;

    try {
      setAddingExtra(true);
      const db = getFirestoreDb();
      const ref = doc(db, "families", user.familyId, "savingsFund", "main");
      const dateStr = extraDepositDate || (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      const [y, m] = dateStr.split("-");
      const month = `${y}-${m}`;
      const now = new Date(dateStr + "T12:00:00");
      const newDeposit: Deposit = {
        month,
        amount,
        sessionId: "manual",
        note: extraNote.trim() || undefined,
        createdAt: now.toISOString(),
      };
      const nextDeposits = [...deposits, newDeposit];
      const depositsTotal = nextDeposits.reduce((s, d) => s + d.amount, 0);
      const withdrawalsTotal = withdrawals.reduce(
        (s, w) => s + (w.amount ?? 0),
        0,
      );
      const nextBalance = depositsTotal - withdrawalsTotal;

      await setDoc(
        ref,
        {
          deposits: nextDeposits,
          balance: nextBalance,
        },
        { merge: true },
      );

      setExtraAmount("");
      setExtraNote("");
      setExtraDepositDate("");
    } finally {
      setAddingExtra(false);
    }
  };

  const handleDeleteWithdrawal = async (index: number) => {
    if (!user?.familyId) return;
    if (!confirm("Xóa khoản chi này? Số dư sẽ được cộng lại.")) return;
    const nextWithdrawals = withdrawals.filter((_, i) => i !== index);
    const depositsTotal = deposits.reduce((s, d) => s + d.amount, 0);
    const withdrawalsTotal = nextWithdrawals.reduce(
      (s, w) => s + (w.amount ?? 0),
      0,
    );
    const nextBalance = depositsTotal - withdrawalsTotal;
    try {
      const db = getFirestoreDb();
      const ref = doc(db, "families", user.familyId, "savingsFund", "main");
      await updateDoc(ref, {
        withdrawals: nextWithdrawals,
        balance: nextBalance,
      } as unknown as Partial<{ withdrawals: Withdrawal[]; balance: number }>);
    } catch (err) {
      console.error(err);
      alert("Không xóa được khoản chi.");
    }
  };

  const handleDeleteDeposit = async (deposit: Deposit) => {
    if (!user?.familyId) return;
    if (!confirm("Xóa khoản nạp này?")) return;
    const nextDeposits = deposits.filter((d) => d !== deposit);
    const depositsTotal = nextDeposits.reduce((s, d) => s + d.amount, 0);
    const withdrawalsTotal = withdrawals.reduce(
      (s, w) => s + (w.amount ?? 0),
      0,
    );
    const nextBalance = depositsTotal - withdrawalsTotal;
    try {
      const db = getFirestoreDb();
      const ref = doc(db, "families", user.familyId, "savingsFund", "main");
      await setDoc(
        ref,
        { deposits: nextDeposits, balance: nextBalance },
        { merge: true },
      );
    } catch (err) {
      console.error(err);
      alert("Không xóa được khoản nạp.");
    }
  };

  const handleAddExistingGold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.familyId) return;
    const weight =
      Number(existingGoldWeight.replace(/\s/g, "").replace(",", ".")) || 0;
    const pricePerUnit = parseCurrencyInput(goldMarketPrice) || 0;
    if (weight <= 0 || pricePerUnit <= 0) return;

    try {
      setAddingExistingGold(true);
      const db = getFirestoreDb();
      const col = collection(db, "families", user.familyId, "goldSavings");
      const totalCost = Math.round(weight * pricePerUnit);
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      await addDoc(col, {
        date: `${y}-${m}-${d}`,
        weight,
        pricePerUnit,
        totalCost,
        note: "Ghi nhận số vàng đang nắm giữ",
        createdAt: serverTimestamp(),
      });
      setExistingGoldWeight("");
    } finally {
      setAddingExistingGold(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  if (!user?.familyId) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <span className="text-lg font-semibold text-muted-foreground/60">
            ₫
          </span>
        </div>
        <div>
          <p className="font-medium">Chưa có gia đình</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bạn cần tạo hoặc tham gia một gia đình trước khi sử dụng quỹ tiết kiệm.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Quỹ tiết kiệm
        </h1>
        <p className="text-sm text-muted-foreground">
          Tự động tích lũy từ phần còn lại sau phân chia ngân sách mỗi tháng.
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border bg-card p-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("cash")}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === "cash"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Tiền mặt / quỹ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("gold")}
          className={`ml-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === "gold"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Vàng
        </button>
      </div>

      {activeTab === "cash" && (
        <div className="space-y-4">
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Tổng tích lũy</p>
            <p className="text-3xl font-bold text-teal-600 mt-1">
              {fmt(balance)} đ
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Lịch sử nạp theo tháng</h2>
                <p className="text-[11px] text-muted-foreground">
                  Bao gồm cả các khoản nạp tự do ngoài session.
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" className="text-xs">
                    Nạp thêm vào quỹ
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Nạp thêm vào quỹ tiết kiệm</DialogTitle>
                    <DialogDescription className="text-xs">
                      Ghi nhận khoản tiền bất chợt bạn muốn chuyển trực tiếp vào
                      quỹ tiết kiệm, không phụ thuộc session.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleExtraDeposit} className="space-y-3 mt-2">
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Số tiền nạp thêm
                      </p>
                      <CurrencyInput
                        className="h-8 text-xs"
                        placeholder="Ví dụ: 10,000,000"
                        value={extraAmount}
                        onChange={setExtraAmount}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Ngày nạp (tùy chọn)
                      </p>
                      <div className="flex gap-2">
                        <DatePicker
                          value={extraDepositDate}
                          onChange={setExtraDepositDate}
                          placeholder="Mặc định: hôm nay"
                          className="h-8 text-xs flex-1"
                        />
                        {extraDepositDate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground shrink-0"
                            onClick={() => setExtraDepositDate("")}
                          >
                            Bỏ chọn
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Ghi chú (tùy chọn)
                      </p>
                      <Input
                        className="h-8 text-xs"
                        placeholder="Nguồn tiền, lý do..."
                        value={extraNote}
                        onChange={(e) => setExtraNote(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Số dư hiện tại: {fmt(balance)} đ</span>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={addingExtra}
                        className="text-xs"
                      >
                        {addingExtra ? "Đang lưu..." : "Nạp vào quỹ"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            {deposits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có khoản nạp nào. Khi owner phân chia ngân sách, phần còn
                lại sẽ tự động vào quỹ tiết kiệm hoặc bạn có thể nạp thêm thủ
                công.
              </p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto rounded-md border">
                <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted shadow-sm">
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs">Tháng</TableHead>
                    <TableHead className="text-xs">Khoản</TableHead>
                    <TableHead className="text-xs text-right">Số tiền</TableHead>
                    <TableHead className="text-xs w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const byMonth = deposits.reduce(
                      (acc, d) => {
                        if (!acc[d.month])
                          acc[d.month] = { session: [] as Deposit[], manual: [] as Deposit[] };
                        if (d.sessionId === "manual") acc[d.month].manual.push(d);
                        else acc[d.month].session.push(d);
                        return acc;
                      },
                      {} as Record<string, { session: Deposit[]; manual: Deposit[] }>
                    );
                    const monthTotalMap = new Map<string, number>();
                    for (const [m, g] of Object.entries(byMonth)) {
                      const total = [...g.session, ...g.manual].reduce((s, d) => s + d.amount, 0);
                      monthTotalMap.set(m, total);
                    }
                    const months = Object.keys(byMonth).sort((a, b) =>
                      b.localeCompare(a)
                    );
                    return months.flatMap((month) => {
                      const { session, manual } = byMonth[month];
                      const items = [
                        ...session.map((d) => ({ d, label: "Tiết kiệm" as const })),
                        ...manual.map((d) => ({ d, label: d.note || "Nạp tay" })),
                      ];
                      const rowCount = items.length;
                      if (rowCount === 0) return [];
                      const monthTotal = fmt(monthTotalMap.get(month) ?? 0);
                      const rows: React.ReactNode[] = [
                        ...items.map(({ d, label }, i) => (
                          <TableRow
                            key={`${month}-${i}`}
                            className={d.sessionId === "manual" ? "bg-muted/20" : ""}
                          >
                            {i === 0 ? (
                              <TableCell
                                className="text-xs font-medium align-top"
                                rowSpan={rowCount + 1}
                              >
                                Tháng {month}
                              </TableCell>
                            ) : null}
                            <TableCell className="text-xs pl-4">
                              {label}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-teal-600">
                              +{fmt(d.amount)} đ
                            </TableCell>
                            <TableCell className="w-12 p-1">
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDeleteDeposit(d)}
                                title="Xóa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        )),
                        <TableRow key={`${month}-total`} className="bg-teal-50 dark:bg-teal-950/50 border-t-2 border-teal-200 dark:border-teal-800">
                          <TableCell className="text-xs pl-4 font-semibold text-foreground">
                            Tổng cộng
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold text-teal-600 dark:text-teal-400">
                            +{monthTotal} đ
                          </TableCell>
                          <TableCell className="w-12 p-1" />
                        </TableRow>,
                      ];
                      return rows;
                    });
                  })()}
                </TableBody>
              </Table>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Chi từ quỹ tiết kiệm</h2>
                <p className="text-xs text-muted-foreground">
                  Dùng cho những khoản chi bất chợt hoặc khoản lớn trích từ quỹ
                  tiết kiệm.
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" className="text-xs">
                    Ghi nhận khoản chi
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Chi từ quỹ tiết kiệm</DialogTitle>
                    <DialogDescription className="text-xs">
                      Nhập số tiền và lý do chi để trừ vào quỹ tiết kiệm.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleWithdraw} className="space-y-3 mt-2">
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Số tiền muốn rút
                        </p>
                        <CurrencyInput
                          className="h-8 text-xs"
                          placeholder="Ví dụ: 5,000,000"
                          value={withdrawAmount}
                          onChange={setWithdrawAmount}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Ghi chú
                        </p>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Lý do chi, ai dùng..."
                          value={withdrawNote}
                          onChange={(e) => setWithdrawNote(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Số dư hiện tại: {fmt(balance)} đ</span>
                      <span>
                        Sau rút:{" "}
                        <span className="font-semibold text-foreground">
                          {fmt(
                            Math.max(
                              0,
                              balance - (parseCurrencyInput(withdrawAmount) || 0),
                            ),
                          )}{" "}
                          đ
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={withdrawing}
                        className="text-xs"
                      >
                        {withdrawing ? "Đang lưu..." : "Lưu khoản chi"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {withdrawals.length > 0 && (
              <div className="pt-2 border-t mt-2 max-h-[300px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted shadow-sm">
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs w-28">Ngày</TableHead>
                      <TableHead className="text-xs">Ghi chú</TableHead>
                      <TableHead className="text-xs text-right">Số tiền</TableHead>
                      <TableHead className="text-xs w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals
                      .slice()
                      .reverse()
                      .map((w, displayIdx) => {
                        const originalIdx = withdrawals.length - 1 - displayIdx;
                        const created =
                          typeof w.createdAt === "string"
                            ? w.createdAt
                            : w.createdAt?.toDate?.()?.toISOString() ?? "";
                        const dateLabel = created ? created.slice(0, 10) : "";
                        return (
                          <TableRow key={originalIdx}>
                            <TableCell className="text-xs tabular-nums">
                              {dateLabel}
                            </TableCell>
                            <TableCell className="text-xs">
                              {w.note || "Chi từ quỹ"}
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold text-red-500 tabular-nums">
                              -{fmt(w.amount)} đ
                            </TableCell>
                            <TableCell className="w-12 p-1">
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDeleteWithdrawal(originalIdx)}
                                title="Xóa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "gold" && (
        <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">Tiết kiệm vàng</h2>
              <p className="text-xs text-muted-foreground">
                Lưu lại lịch sử mua vàng để theo dõi giá vốn và khối lượng nắm giữ.
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="text-xs">
                  Thêm giao dịch vàng
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Thêm giao dịch vàng</DialogTitle>
                  <DialogDescription className="text-xs">
                    Nhập thông tin lần mua vàng để cập nhật lịch sử và giá vốn.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddGoldPurchase} className="space-y-3 mt-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Ngày mua
                    </p>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={goldDate}
                      onChange={(e) => setGoldDate(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Khối lượng (chỉ)
                      </p>
                      <Input
                        className="h-8 text-xs"
                        inputMode="decimal"
                        placeholder="Ví dụ: 2.5"
                        value={goldWeight}
                        onChange={(e) => setGoldWeight(e.target.value)}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Giá/chỉ (đ)
                      </p>
                      <CurrencyInput
                        className="h-8 text-xs"
                        placeholder="Ví dụ: 7,000,000"
                        value={goldPricePerUnit}
                        onChange={setGoldPricePerUnit}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Ghi chú (tùy chọn)
                    </p>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Loại vàng, cửa hàng..."
                      value={goldNote}
                      onChange={(e) => setGoldNote(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={submitting}
                      className="text-xs"
                    >
                      {submitting ? "Đang lưu..." : "Lưu giao dịch"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">Giá vàng & giá trị ước tính</h2>
              <p className="text-[11px] text-muted-foreground">
                Bạn có thể nhập thêm số vàng đang giữ; giá sẽ lấy theo giá hiện tại.
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="text-xs">
                  Ghi nhận vàng đang giữ
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Ghi nhận số vàng đang nắm giữ</DialogTitle>
                  <DialogDescription className="text-xs">
                    Dùng khi bạn đã có sẵn vàng trước khi bắt đầu theo dõi trên ứng dụng.
                    Giá mua sẽ lấy bằng giá vàng hiện tại.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={handleAddExistingGold}
                  className="space-y-3 mt-2"
                >
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Khối lượng vàng đang giữ (chỉ)
                    </p>
                    <Input
                      className="h-8 text-xs"
                      inputMode="decimal"
                      placeholder="Ví dụ: 5"
                      value={existingGoldWeight}
                      onChange={(e) => setExistingGoldWeight(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Giá vàng hiện tại (đ/chỉ)
                    </p>
                    <div className="flex gap-2">
                      <CurrencyInput
                        className="h-8 text-xs flex-1"
                        placeholder="Ví dụ: 7,500,000"
                        value={goldMarketPrice}
                        onChange={setGoldMarketPrice}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs shrink-0"
                        disabled={updatingGoldPrice}
                        onClick={() => saveGoldMarketPrice(goldMarketPrice)}
                      >
                        {updatingGoldPrice ? "Đang cập nhật..." : "Cập nhật"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={addingExistingGold}
                      className="text-xs"
                    >
                      {addingExistingGold ? "Đang lưu..." : "Lưu số vàng"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {goldPurchases.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có giao dịch vàng nào để tính toán.
            </p>
          ) : (
            (() => {
              const totalWeight = goldPurchases.reduce(
                (s, g) => s + g.weight,
                0,
              );
              const totalCost = goldPurchases.reduce(
                (s, g) => s + g.totalCost,
                0,
              );
              const avgPrice =
                totalWeight > 0 ? Math.round(totalCost / totalWeight) : 0;
              const market = parseCurrencyInput(goldMarketPrice) || 0;
              const estValue =
                totalWeight > 0 && market > 0
                  ? Math.round(totalWeight * market)
                  : 0;
              const diff = estValue - totalCost;

              const historyMax = goldHistory.reduce(
                (m, p) => Math.max(m, p.totalValue ?? 0),
                0,
              );

              return (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5 rounded border bg-muted/40 px-2 py-1.5">
                    <div className="flex justify-between gap-4">
                      <span className="text-[11px] text-muted-foreground">
                        Tổng khối lượng:{" "}
                        <span className="font-semibold text-foreground">
                          {totalWeight.toFixed(2)} chỉ
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Giá vốn TB:{" "}
                        <span className="font-semibold text-foreground">
                          {fmt(avgPrice)} đ/chỉ
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Giá vàng hiện tại (đ/chỉ)
                    </p>
                    <div className="flex gap-2">
                      <CurrencyInput
                        className="h-8 text-xs flex-1"
                        placeholder="Ví dụ: 7,500,000"
                        value={goldMarketPrice}
                        onChange={setGoldMarketPrice}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs shrink-0"
                        disabled={updatingGoldPrice}
                        onClick={() => saveGoldMarketPrice(goldMarketPrice)}
                      >
                        {updatingGoldPrice ? "Đang cập nhật..." : "Cập nhật"}
                      </Button>
                    </div>
                  </div>

                  {market > 0 && totalWeight > 0 && (
                    <div className="space-y-1 rounded border bg-muted/40 px-2 py-1.5">
                      <p className="text-[11px] text-muted-foreground">
                        Giá trị ước tính theo giá hiện tại:
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {fmt(estValue)} đ
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Lãi/lỗ tạm tính:{" "}
                        <span
                          className={`font-semibold ${
                            diff >= 0 ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {diff >= 0 ? "+" : ""}
                          {fmt(diff)} đ
                        </span>
                      </p>
                    </div>
                  )}

                  {goldHistory.length > 1 && historyMax > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Biến động tổng giá trị vàng
                      </p>
                      <div className="relative h-24 rounded border bg-muted/30 px-2 py-2">
                        <div className="flex items-end h-full gap-0.5">
                          {goldHistory.map((p, idx) => {
                            const h = Math.max(
                              4,
                              (p.totalValue / historyMax) * 70,
                            );
                            return (
                              <div
                                key={p.id || idx}
                                className="flex-1 bg-amber-400/70 dark:bg-amber-500/80 rounded-t"
                                style={{ height: `${h}%` }}
                                title={`${p.createdAt.slice(0, 10)}: ${fmt(
                                  p.totalValue,
                                )} đ`}
                              />
                            );
                          })}
                        </div>
                        <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
                          <span>
                            {goldHistory[0]?.createdAt
                              ? goldHistory[0].createdAt.slice(5, 10)
                              : ""}
                          </span>
                          <span>
                            {goldHistory[goldHistory.length - 1]?.createdAt
                              ? goldHistory[goldHistory.length - 1].createdAt.slice(
                                  5,
                                  10,
                                )
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-medium">Lịch sử mua vàng</h2>
          {goldLoading ? (
            <p className="text-xs text-muted-foreground">Đang tải...</p>
          ) : goldPurchases.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có giao dịch vàng nào.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto text-xs">
              {goldPurchases.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {g.date || "Không rõ ngày"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.weight.toFixed(2)} chỉ × {fmt(g.pricePerUnit)} đ/chỉ
                      {g.note ? ` • ${g.note}` : ""}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-amber-500 whitespace-nowrap">
                    {fmt(g.totalCost)} đ
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </div>
      )}
    </div>
  );
}
