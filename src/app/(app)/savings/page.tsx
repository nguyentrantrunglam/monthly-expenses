"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
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
import { Pencil, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type GoldEntryType = "purchase" | "holding" | "sale";

const HOLDING_NOTE = "Ghi nhận số vàng đang nắm giữ";

function resolveGoldEntryType(data: {
  entryType?: string;
  note?: string | null;
}): GoldEntryType {
  if (data.entryType === "sale") return "sale";
  if (data.entryType === "holding") return "holding";
  if (data.entryType === "purchase") return "purchase";
  if (data.note === HOLDING_NOTE) return "holding";
  return "purchase";
}

interface GoldLedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number; // chỉ (luôn dương)
  pricePerUnit: number; // VND / chỉ — mua/có sẵn: giá ghi nhận; bán: giá bán
  totalCost: number; // VND — mua/có sẵn; bán thì 0
  totalProceeds?: number; // VND — chỉ khi bán
  note?: string;
  entryType: GoldEntryType;
}

function entryMoneyLabel(g: GoldLedgerEntry): number {
  if (g.entryType === "sale") {
    return g.totalProceeds ?? Math.round(g.weight * g.pricePerUnit);
  }
  return g.totalCost;
}

interface BtmhGoldChartRow {
  labelShort: string;
  labelFull: string;
  rate: number;
  sell: number;
}

interface BtmhGoldChartResponse {
  labels?: string[];
  data?: { rate?: string[]; sell?: string[] };
}

type GoldChartTimeType = "day" | "month";

function shortGoldChartLabel(raw: string): string {
  const d = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (d) return `${d[3]}/${d[2]}`;
  if (raw.length > 14) return raw.replace(/^\d{4}-/, "").slice(0, 11);
  return raw;
}

export default function SavingsPage() {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [goldLoading, setGoldLoading] = useState(true);
  const [goldLedger, setGoldLedger] = useState<GoldLedgerEntry[]>([]);
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
  const [firestoreGoldSpot, setFirestoreGoldSpot] = useState<number | null>(
    null,
  );
  const [goldChartSeries, setGoldChartSeries] = useState<BtmhGoldChartRow[]>(
    [],
  );
  const [btmhSpotRate, setBtmhSpotRate] = useState<number | null>(null);
  const [btmhSpotSell, setBtmhSpotSell] = useState<number | null>(null);
  const [goldChartLoading, setGoldChartLoading] = useState(false);
  const [goldChartError, setGoldChartError] = useState<string | null>(null);
  const [goldTimeType, setGoldTimeType] = useState<GoldChartTimeType>("day");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [extraDepositDate, setExtraDepositDate] = useState("");
  const [addingExtra, setAddingExtra] = useState(false);
  const [existingGoldWeight, setExistingGoldWeight] = useState("");
  const [addingExistingGold, setAddingExistingGold] = useState(false);

  const [saleDate, setSaleDate] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  });
  const [saleWeight, setSaleWeight] = useState("");
  const [salePricePerUnit, setSalePricePerUnit] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [saleSubmitting, setSaleSubmitting] = useState(false);

  const [editPurchaseOpen, setEditPurchaseOpen] = useState(false);
  const [editPurchase, setEditPurchase] = useState<GoldLedgerEntry | null>(null);
  const [editGoldDate, setEditGoldDate] = useState("");
  const [editGoldWeight, setEditGoldWeight] = useState("");
  const [editGoldPricePerUnit, setEditGoldPricePerUnit] = useState("");
  const [editGoldNote, setEditGoldNote] = useState("");
  const [purchaseSaving, setPurchaseSaving] = useState(false);

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

  // Giá đã lưu lần trước — chỉ dùng dự phòng khi API không tải được
  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "goldSettings", "main");
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setFirestoreGoldSpot(null);
        return;
      }
      const data = snap.data() as { lastPricePerUnit?: number | null };
      const p = data.lastPricePerUnit;
      setFirestoreGoldSpot(p && p > 0 ? p : null);
    });
    return () => unsub();
  }, [user?.familyId]);

  const loadBtmhChart = useCallback(async () => {
    if (!user?.familyId) return;
    setGoldChartLoading(true);
    setGoldChartError(null);
    try {
      const res = await fetch(
        `/api/gold/btmh-chart?gold_type=KGB&time_type=${goldTimeType}&init=false`,
      );
      const json = (await res.json()) as
        | BtmhGoldChartResponse
        | { error?: string };
      if (
        !res.ok ||
        !json ||
        typeof json !== "object" ||
        !("labels" in json) ||
        !Array.isArray((json as BtmhGoldChartResponse).labels)
      ) {
        throw new Error("bad_response");
      }
      const labels = (json as BtmhGoldChartResponse).labels ?? [];
      const rates = (json as BtmhGoldChartResponse).data?.rate ?? [];
      const sells = (json as BtmhGoldChartResponse).data?.sell ?? [];
      const n = Math.min(labels.length, rates.length, sells.length);
      const series: BtmhGoldChartRow[] = [];
      for (let i = 0; i < n; i++) {
        const rate = Math.round(Number(String(rates[i]).replace(/,/g, "")));
        const sell = Math.round(Number(String(sells[i]).replace(/,/g, "")));
        const raw = String(labels[i] ?? "");
        const labelShort = shortGoldChartLabel(raw);
        series.push({ labelShort, labelFull: raw, rate, sell });
      }
      setGoldChartSeries(series);
      if (n > 0) {
        const lastRate = Math.round(
          Number(String(rates[n - 1]).replace(/,/g, "")),
        );
        const lastSell = Math.round(
          Number(String(sells[n - 1]).replace(/,/g, "")),
        );
        setBtmhSpotRate(lastRate);
        setBtmhSpotSell(lastSell);
        if (user?.familyId) {
          const db = getFirestoreDb();
          void setDoc(
            doc(db, "families", user.familyId, "goldSettings", "main"),
            {
              lastPricePerUnit: lastRate,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ).catch(() => {});
        }
      } else {
        setBtmhSpotRate(null);
        setBtmhSpotSell(null);
      }
    } catch {
      setGoldChartError("Không tải được giá từ Bảo Tín Mạnh Hải.");
      setGoldChartSeries([]);
      setBtmhSpotRate(null);
      setBtmhSpotSell(null);
    } finally {
      setGoldChartLoading(false);
    }
  }, [user?.familyId, goldTimeType]);

  useEffect(() => {
    if (activeTab !== "gold" || !user?.familyId) return;
    void loadBtmhChart();
  }, [activeTab, user?.familyId, loadBtmhChart]);

  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "goldSavings");
    const q = query(col, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: GoldLedgerEntry[] = [];
      snap.forEach((d) => {
        const data = d.data() as {
          date?: string;
          weight?: number;
          pricePerUnit?: number;
          totalCost?: number;
          totalProceeds?: number;
          note?: string;
          entryType?: string;
        };
        list.push({
          id: d.id,
          date: data.date ?? "",
          weight: data.weight ?? 0,
          pricePerUnit: data.pricePerUnit ?? 0,
          totalCost: data.totalCost ?? 0,
          totalProceeds: data.totalProceeds,
          note: data.note,
          entryType: resolveGoldEntryType(data),
        });
      });
      setGoldLedger(list);
      setGoldLoading(false);
    });
    return () => unsub();
  }, [user?.familyId]);

  const effectiveSpotRate = btmhSpotRate ?? firestoreGoldSpot;

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
        entryType: "purchase",
        createdAt: serverTimestamp(),
      });
      setGoldWeight("");
      setGoldPricePerUnit("");
      setGoldNote("");
      void loadBtmhChart();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddGoldSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.familyId) return;
    const weight =
      Number(saleWeight.replace(/\s/g, "").replace(",", ".")) || 0;
    const pricePerUnit = parseCurrencyInput(salePricePerUnit) || 0;
    if (!saleDate || weight <= 0 || pricePerUnit <= 0) return;

    const purchaseRows = goldLedger.filter((g) => g.entryType === "purchase");
    const holdingRows = goldLedger.filter((g) => g.entryType === "holding");
    const saleRows = goldLedger.filter((g) => g.entryType === "sale");
    const wPur = purchaseRows.reduce((s, g) => s + g.weight, 0);
    const wHold = holdingRows.reduce((s, g) => s + g.weight, 0);
    const wSold = saleRows.reduce((s, g) => s + g.weight, 0);
    const netAvail = wPur + wHold - wSold;
    if (weight > netAvail + 1e-9) {
      alert(
        `Khối lượng bán vượt phần đang nắm giữ. Hiện còn tối đa ${netAvail.toFixed(2)} chỉ (đã trừ các lần bán trước).`,
      );
      return;
    }

    try {
      setSaleSubmitting(true);
      const db = getFirestoreDb();
      const col = collection(db, "families", user.familyId, "goldSavings");
      const totalProceeds = Math.round(weight * pricePerUnit);
      await addDoc(col, {
        date: saleDate,
        weight,
        pricePerUnit,
        totalCost: 0,
        totalProceeds,
        note: saleNote.trim() || null,
        entryType: "sale",
        createdAt: serverTimestamp(),
      });
      setSaleWeight("");
      setSalePricePerUnit("");
      setSaleNote("");
      void loadBtmhChart();
    } finally {
      setSaleSubmitting(false);
    }
  };

  const openEditPurchase = (g: GoldLedgerEntry) => {
    setEditPurchase(g);
    setEditGoldDate(g.date);
    setEditGoldWeight(String(g.weight));
    setEditGoldPricePerUnit(String(g.pricePerUnit));
    setEditGoldNote(g.note ?? "");
    setEditPurchaseOpen(true);
  };

  const handleUpdatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.familyId || !editPurchase) return;
    const weight =
      Number(editGoldWeight.replace(/\s/g, "").replace(",", ".")) || 0;
    const pricePerUnit = parseCurrencyInput(editGoldPricePerUnit) || 0;
    if (!editGoldDate || weight <= 0 || pricePerUnit <= 0) return;

    if (editPurchase.entryType === "sale") {
      const purchaseRows = goldLedger.filter((g) => g.entryType === "purchase");
      const holdingRows = goldLedger.filter((g) => g.entryType === "holding");
      const saleRows = goldLedger.filter(
        (g) => g.entryType === "sale" && g.id !== editPurchase.id,
      );
      const wPur = purchaseRows.reduce((s, g) => s + g.weight, 0);
      const wHold = holdingRows.reduce((s, g) => s + g.weight, 0);
      const wSold = saleRows.reduce((s, g) => s + g.weight, 0);
      const netAvail = wPur + wHold - wSold;
      if (weight > netAvail + 1e-9) {
        alert(
          `Sau khi sửa, chỉ bán không được vượt ${netAvail.toFixed(2)} chỉ đang nắm giữ.`,
        );
        return;
      }
    }

    setPurchaseSaving(true);
    try {
      const db = getFirestoreDb();
      if (editPurchase.entryType === "sale") {
        const totalProceeds = Math.round(weight * pricePerUnit);
        await updateDoc(
          doc(db, "families", user.familyId, "goldSavings", editPurchase.id),
          {
            date: editGoldDate,
            weight,
            pricePerUnit,
            totalCost: 0,
            totalProceeds,
            note: editGoldNote.trim() || null,
            entryType: "sale",
          },
        );
      } else {
        const totalCost = Math.round(weight * pricePerUnit);
        await updateDoc(
          doc(db, "families", user.familyId, "goldSavings", editPurchase.id),
          {
            date: editGoldDate,
            weight,
            pricePerUnit,
            totalCost,
            note: editGoldNote.trim() || null,
            entryType: editPurchase.entryType,
          },
        );
      }
      setEditPurchaseOpen(false);
      setEditPurchase(null);
    } finally {
      setPurchaseSaving(false);
    }
  };

  const handleDeletePurchase = async (g: GoldLedgerEntry) => {
    if (!user?.familyId) return;
    if (!confirm("Xóa giao dịch vàng này?")) return;
    try {
      const db = getFirestoreDb();
      await deleteDoc(
        doc(db, "families", user.familyId, "goldSavings", g.id),
      );
    } catch (err) {
      console.error(err);
      alert("Không xóa được giao dịch.");
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
    const pricePerUnit = effectiveSpotRate ?? 0;
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
        note: HOLDING_NOTE,
        entryType: "holding",
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
                Mua: giá vốn và lãi/lỗ trên phần còn nắm. Có sẵn: chỉ cộng chỉ và giá
                trị, không lãi/lỗ. Bán: trừ chỉ đang nắm, ghi tiền thu.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
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
                      Mỗi lần mua mới: nhập ngày, chỉ và giá/chỉ để theo dõi giá vốn
                      và lãi/lỗ.
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
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-xs">
                    Ghi nhận bán vàng
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Ghi nhận bán vàng</DialogTitle>
                    <DialogDescription className="text-xs">
                      Số chỉ bán không được vượt tổng đang nắm (mua + có sẵn − đã bán
                      trước). Nhập giá bán mỗi chỉ (tiệm thu).
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddGoldSale} className="space-y-3 mt-2">
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Ngày bán
                      </p>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={saleDate}
                        onChange={(e) => setSaleDate(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Khối lượng bán (chỉ)
                        </p>
                        <Input
                          className="h-8 text-xs"
                          inputMode="decimal"
                          placeholder="Ví dụ: 1"
                          value={saleWeight}
                          onChange={(e) => setSaleWeight(e.target.value)}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Giá bán/chỉ (đ)
                        </p>
                        <CurrencyInput
                          className="h-8 text-xs"
                          placeholder="Ví dụ: 7,200,000"
                          value={salePricePerUnit}
                          onChange={setSalePricePerUnit}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Ghi chú (tùy chọn)
                      </p>
                      <Input
                        className="h-8 text-xs"
                        placeholder="Cửa hàng, lý do..."
                        value={saleNote}
                        onChange={(e) => setSaleNote(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={saleSubmitting}
                        className="text-xs"
                      >
                        {saleSubmitting ? "Đang lưu..." : "Lưu giao dịch bán"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-medium">Giá vàng Bảo Tín Mạnh Hải</h2>
              <p className="text-[11px] text-muted-foreground">
                Nguồn: nhẫn tròn 99,99% (KGB),{" "}
                <a
                  href="https://baotinmanhhai.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 text-foreground/80 hover:text-foreground"
                >
                  baotinmanhhai.vn
                </a>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border bg-background p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setGoldTimeType("day")}
                  className={`rounded px-2 py-1 font-medium ${
                    goldTimeType === "day"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Theo ngày
                </button>
                <button
                  type="button"
                  onClick={() => setGoldTimeType("month")}
                  className={`rounded px-2 py-1 font-medium ${
                    goldTimeType === "month"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Theo tháng
                </button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={goldChartLoading}
                onClick={() => void loadBtmhChart()}
              >
                {goldChartLoading ? "Đang tải..." : "Làm mới"}
              </Button>
            </div>
          </div>

          {goldChartError && (
            <p className="text-xs text-destructive">{goldChartError}</p>
          )}
          {goldChartLoading && goldChartSeries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Đang tải biểu đồ...</p>
          ) : goldChartSeries.length > 0 ? (
            <div className="h-56 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={goldChartSeries}
                  margin={{
                    top: 4,
                    right: 8,
                    left: 0,
                    bottom: goldTimeType === "month" ? 20 : 4,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="labelShort"
                    tick={{ fontSize: 9 }}
                    interval={
                      goldTimeType === "month"
                        ? Math.max(0, Math.floor(goldChartSeries.length / 8))
                        : "preserveStartEnd"
                    }
                    angle={goldTimeType === "month" ? -35 : 0}
                    textAnchor={goldTimeType === "month" ? "end" : "middle"}
                    height={goldTimeType === "month" ? 52 : 30}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      v >= 1e6 ? `${Math.round(v / 1e6)}M` : String(v)
                    }
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 11 }}
                    formatter={(value, name) => {
                      const n = Number(value ?? 0);
                      const label =
                        name === "rate" || name === "Giá mua vào"
                          ? "Giá mua vào"
                          : "Giá bán ra";
                      return [`${fmt(n)} đ`, label];
                    }}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as BtmhGoldChartRow | undefined)
                        ?.labelFull ?? ""
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="Giá mua vào"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="sell"
                    name="Giá bán ra"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            !goldChartError && (
              <p className="text-xs text-muted-foreground">
                Không có điểm dữ liệu trên biểu đồ.
              </p>
            )
          )}

          {(btmhSpotRate != null || btmhSpotSell != null) && (
            <div className="flex flex-wrap gap-3 rounded border bg-muted/40 px-2 py-2 text-[11px]">
              <span>
                <span className="text-muted-foreground">Mua vào: </span>
                <span className="font-semibold tabular-nums">
                  {btmhSpotRate != null ? `${fmt(btmhSpotRate)} đ/chỉ` : "—"}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Bán ra: </span>
                <span className="font-semibold tabular-nums">
                  {btmhSpotSell != null ? `${fmt(btmhSpotSell)} đ/chỉ` : "—"}
                </span>
              </span>
              {!btmhSpotRate && firestoreGoldSpot ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Đang dùng giá đã lưu: {fmt(firestoreGoldSpot)} đ/chỉ (API lỗi)
                </span>
              ) : null}
            </div>
          )}
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">Giá trị danh mục</h2>
              <p className="text-[11px] text-muted-foreground">
                Chỉ còn nắm = mua + có sẵn − đã bán. Tổng giá trị = chỉ còn nắm × giá. Lãi/lỗ
                chỉ trên phần mua còn lại (coi các lần bán trừ vào chỉ mua trước).
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="text-xs">
                  Ghi nhận vàng có sẵn
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Ghi nhận vàng có sẵn</DialogTitle>
                  <DialogDescription className="text-xs">
                    Cho số vàng bạn đã nắm giữ trước khi theo dõi trên app. Dòng này
                    cộng vào tổng chỉ và giá trị ước tính cùng vàng đã mua, nhưng{" "}
                    <span className="font-medium text-foreground">không</span> tính
                    vào lãi/lỗ. Giá/chỉ tạm lấy theo bảng Bảo Tín Mạnh Hải (hoặc giá
                    đã lưu nếu API lỗi) chỉ để ước giá trị.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={handleAddExistingGold}
                  className="space-y-3 mt-2"
                >
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Khối lượng có sẵn (chỉ)
                    </p>
                    <Input
                      className="h-8 text-xs"
                      inputMode="decimal"
                      placeholder="Ví dụ: 5"
                      value={existingGoldWeight}
                      onChange={(e) => setExistingGoldWeight(e.target.value)}
                    />
                  </div>
                  <p className="rounded border bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                    Giá áp dụng:{" "}
                    <span className="font-semibold text-foreground">
                      {effectiveSpotRate
                        ? `${fmt(effectiveSpotRate)} đ/chỉ`
                        : "chưa có — bấm «Làm mới» biểu đồ giá phía trên"}
                    </span>
                  </p>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={addingExistingGold || !effectiveSpotRate}
                      className="text-xs"
                    >
                      {addingExistingGold ? "Đang lưu..." : "Lưu số vàng"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {goldLedger.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có giao dịch vàng nào để tính toán.
            </p>
          ) : (
            (() => {
              const purchaseRows = goldLedger.filter(
                (g) => g.entryType === "purchase",
              );
              const holdingRows = goldLedger.filter(
                (g) => g.entryType === "holding",
              );
              const saleRows = goldLedger.filter((g) => g.entryType === "sale");

              const weightPurchase = purchaseRows.reduce(
                (s, g) => s + g.weight,
                0,
              );
              const weightHolding = holdingRows.reduce(
                (s, g) => s + g.weight,
                0,
              );
              const weightSold = saleRows.reduce((s, g) => s + g.weight, 0);

              const totalCostPurchase = purchaseRows.reduce(
                (s, g) => s + g.totalCost,
                0,
              );
              const avgPricePurchase =
                weightPurchase > 0
                  ? Math.round(totalCostPurchase / weightPurchase)
                  : 0;

              const soldFromPurchase = Math.min(weightSold, weightPurchase);
              const remainingPurchaseWeight = Math.max(
                0,
                weightPurchase - soldFromPurchase,
              );
              const soldFromHolding = Math.max(0, weightSold - soldFromPurchase);
              const remainingHoldingWeight = Math.max(
                0,
                weightHolding - soldFromHolding,
              );
              const totalWeightNet =
                remainingPurchaseWeight + remainingHoldingWeight;

              const totalProceedsSales = saleRows.reduce(
                (s, g) =>
                  s +
                  (g.totalProceeds ?? Math.round(g.weight * g.pricePerUnit)),
                0,
              );

              const costRemainingPurchase =
                weightPurchase > 0
                  ? Math.round(
                      (totalCostPurchase * remainingPurchaseWeight) /
                        weightPurchase,
                    )
                  : 0;

              const spot = effectiveSpotRate ?? 0;
              const estValue =
                totalWeightNet > 0 && spot > 0
                  ? Math.round(totalWeightNet * spot)
                  : 0;
              const estValuePurchaseOnly =
                remainingPurchaseWeight > 0 && spot > 0
                  ? Math.round(remainingPurchaseWeight * spot)
                  : 0;
              const diffPnl = estValuePurchaseOnly - costRemainingPurchase;

              return (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5 rounded border bg-muted/40 px-2 py-1.5">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-[11px] text-muted-foreground">
                          Đang nắm:{" "}
                          <span className="font-semibold text-foreground">
                            {totalWeightNet.toFixed(2)} chỉ
                          </span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Giá vốn TB (đã mua):{" "}
                          <span className="font-semibold text-foreground">
                            {weightPurchase > 0
                              ? `${fmt(avgPricePurchase)} đ/chỉ`
                              : "—"}
                          </span>
                        </span>
                      </div>
                      {(weightPurchase > 0 ||
                        weightHolding > 0 ||
                        weightSold > 0) && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          {weightPurchase > 0 ? (
                            <>
                              <span className="font-medium text-foreground">
                                Đã mua: {weightPurchase.toFixed(2)} chỉ
                              </span>
                              {remainingPurchaseWeight < weightPurchase ? (
                                <>
                                  {" → còn "}
                                  <span className="font-medium text-foreground">
                                    {remainingPurchaseWeight.toFixed(2)} chỉ
                                  </span>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <span className="font-medium text-foreground">
                              Chưa có giao dịch mua
                            </span>
                          )}
                          {weightHolding > 0 ? (
                            <>
                              {" · "}
                              <span className="font-medium text-foreground">
                                Có sẵn: {weightHolding.toFixed(2)} chỉ
                              </span>
                              {remainingHoldingWeight < weightHolding ? (
                                <>
                                  {" → còn "}
                                  <span className="font-medium text-foreground">
                                    {remainingHoldingWeight.toFixed(2)} chỉ
                                  </span>
                                </>
                              ) : null}
                              {" — không lãi/lỗ"}
                            </>
                          ) : null}
                          {weightSold > 0 ? (
                            <>
                              {" · "}
                              <span className="font-medium text-foreground">
                                Đã bán: {weightSold.toFixed(2)} chỉ
                              </span>
                              {" · Thu: "}
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {fmt(totalProceedsSales)} đ
                              </span>
                            </>
                          ) : null}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 rounded border bg-muted/40 px-2 py-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Giá tham chiếu (mua vào, đ/chỉ)
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {spot > 0 ? `${fmt(spot)} đ/chỉ` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Lãi/lỗ tạm chỉ trên chỉ mua còn lại và phần giá vốn tương ứng (bán
                      được coi trừ vào chỉ mua trước).
                    </p>
                  </div>

                  {totalWeightNet > 0 && (
                    <div className="space-y-1 rounded border bg-muted/40 px-2 py-1.5">
                      <p className="text-[11px] text-muted-foreground">
                        Giá trị ước tính (chỉ đang nắm × giá mua vào):
                      </p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {spot > 0 ? `${fmt(estValue)} đ` : "—"}
                      </p>
                      {spot <= 0 && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          Chưa tải được giá tham chiếu. Bấm «Làm mới» ở biểu đồ Bảo Tín
                          Mạnh Hải phía trên (hoặc đợi vài giây).
                        </p>
                      )}
                      {remainingPurchaseWeight > 0 ? (
                        spot > 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            Lãi/lỗ tạm (phần mua còn nắm):{" "}
                            <span
                              className={`font-semibold ${
                                diffPnl >= 0 ? "text-green-600" : "text-red-500"
                              }`}
                            >
                              {diffPnl >= 0 ? "+" : ""}
                              {fmt(diffPnl)} đ
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {" "}
                              (giá vốn còn lại ~{fmt(costRemainingPurchase)} đ)
                            </span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Lãi/lỗ tạm:
                            </span>{" "}
                            cần giá mua vào — giá vốn còn lại ~{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {fmt(costRemainingPurchase)} đ
                            </span>
                            .
                          </p>
                        )
                      ) : weightPurchase > 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          Đã bán hết phần mua ghi nhận — không còn lãi/lỗ tạm trên giá
                          vốn mua (còn lại chỉ vàng có sẵn nếu có).
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Chưa có giao dịch mua — không có lãi/lỗ tạm trên giá vốn.
                        </p>
                      )}
                    </div>
                  )}

                  {totalWeightNet <= 0 && goldLedger.length > 0 && (
                    <p className="rounded border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                      Không còn chỉ đang nắm (đã bán hết hoặc chỉ có giao dịch bán).
                    </p>
                  )}
                </div>
              );
            })()
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-medium">Lịch sử vàng</h2>
          {goldLoading ? (
            <p className="text-xs text-muted-foreground">Đang tải...</p>
          ) : goldLedger.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có giao dịch vàng nào.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto text-xs">
              {goldLedger.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-2 border-b py-1.5 last:border-0"
                >
                  <div className="min-w-0 flex flex-col">
                    <span className="font-medium inline-flex items-center gap-1.5 flex-wrap">
                      {g.date || "Không rõ ngày"}
                      {g.entryType === "holding" ? (
                        <span className="rounded border border-dashed px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                          Có sẵn
                        </span>
                      ) : null}
                      {g.entryType === "sale" ? (
                        <span className="rounded border border-dashed px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                          Bán
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.entryType === "sale" ? (
                        <>
                          Bán {g.weight.toFixed(2)} chỉ × {fmt(g.pricePerUnit)}{" "}
                          đ/chỉ
                        </>
                      ) : (
                        <>
                          {g.weight.toFixed(2)} chỉ × {fmt(g.pricePerUnit)} đ/chỉ
                        </>
                      )}
                      {g.note && g.entryType === "purchase"
                        ? ` • ${g.note}`
                        : ""}
                      {g.note && g.entryType === "sale" ? ` • ${g.note}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
                        g.entryType === "sale"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-500"
                      }`}
                    >
                      {g.entryType === "sale" ? "+" : ""}
                      {fmt(entryMoneyLabel(g))} đ
                    </span>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Sửa"
                      onClick={() => openEditPurchase(g)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Xóa"
                      onClick={() => void handleDeletePurchase(g)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={editPurchaseOpen}
        onOpenChange={(o) => {
          setEditPurchaseOpen(o);
          if (!o) setEditPurchase(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editPurchase?.entryType === "sale"
                ? "Sửa giao dịch bán"
                : "Sửa giao dịch vàng"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editPurchase?.entryType === "sale"
                ? "Cập nhật ngày, chỉ bán và giá bán/chỉ."
                : "Cập nhật ngày, khối lượng và giá ghi nhận."}
              {editPurchase?.entryType === "holding"
                ? " Dòng «có sẵn» không đưa vào lãi/lỗ."
                : ""}
            </DialogDescription>
          </DialogHeader>
          {editPurchase && (
            <form onSubmit={handleUpdatePurchase} className="space-y-3 mt-2">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {editPurchase.entryType === "sale" ? "Ngày bán" : "Ngày"}
                </p>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={editGoldDate}
                  onChange={(e) => setEditGoldDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {editPurchase.entryType === "sale"
                      ? "Chỉ bán"
                      : "Khối lượng (chỉ)"}
                  </p>
                  <Input
                    className="h-8 text-xs"
                    inputMode="decimal"
                    value={editGoldWeight}
                    onChange={(e) => setEditGoldWeight(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {editPurchase.entryType === "sale"
                      ? "Giá bán/chỉ (đ)"
                      : "Giá/chỉ (đ)"}
                  </p>
                  <CurrencyInput
                    className="h-8 text-xs"
                    value={editGoldPricePerUnit}
                    onChange={setEditGoldPricePerUnit}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Ghi chú
                </p>
                <Input
                  className="h-8 text-xs"
                  value={editGoldNote}
                  onChange={(e) => setEditGoldNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={purchaseSaving}
                  className="text-xs"
                >
                  {purchaseSaving ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      </div>
      )}
    </div>
  );
}
