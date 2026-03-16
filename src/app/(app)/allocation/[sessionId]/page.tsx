"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAllocation, type AllocationItem } from "@/hooks/useAllocation";
import { useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, TrendingDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export default function AllocationPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const { allocation, remainingBudget, loading, saveAllocation } =
    useAllocation(sessionId);

  const [items, setItems] = useState<AllocationItem[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sessionMonth, setSessionMonth] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<
    { userId: string; amount: number; spendingType: string; date: string }[]
  >([]);

  useEffect(() => {
    if (!user?.familyId || !sessionId) return;
    const db = getFirestoreDb();
    const sessRef = doc(db, "families", user.familyId, "sessions", sessionId);
    const unsub = onSnapshot(sessRef, (snap) => {
      if (snap.exists()) setSessionMonth(snap.data().month ?? null);
    });
    return () => unsub();
  }, [user?.familyId, sessionId]);

  useEffect(() => {
    if (!user?.familyId || !sessionMonth) return;
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "transactions");
    const q = query(col, orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: typeof transactions = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({
          userId: data.userId,
          amount: data.amount ?? 0,
          spendingType: data.spendingType ?? "personal",
          date: data.date ?? "",
        });
      });
      setTransactions(list);
    });
    return () => unsub();
  }, [user?.familyId, sessionMonth]);

  const cycleDay = family?.cycleDay ?? 1;

  const sessionRange = useMemo(() => {
    if (!sessionMonth) return null;
    const [y, m] = sessionMonth.split("-").map(Number);
    const start = new Date(y, m - 1, cycleDay);
    const end = new Date(y, m, cycleDay - 1);
    if (cycleDay === 1) end.setMonth(end.getMonth(), 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    return { startStr, endStr };
  }, [sessionMonth, cycleDay]);

  const memberSpending = useMemo(() => {
    if (!sessionRange) return {};
    const map: Record<string, { personal: number; shared: number }> = {};
    for (const tx of transactions) {
      if (tx.date < sessionRange.startStr || tx.date > sessionRange.endStr) continue;
      if (!map[tx.userId]) map[tx.userId] = { personal: 0, shared: 0 };
      if (tx.spendingType === "shared_pool") {
        map[tx.userId].shared += tx.amount;
      } else {
        map[tx.userId].personal += tx.amount;
      }
    }
    return map;
  }, [transactions, sessionRange]);

  const totalSharedSpending = useMemo(() => {
    return Object.values(memberSpending).reduce((s, v) => s + v.shared, 0);
  }, [memberSpending]);

  // Seed from allocation or create fresh list
  useEffect(() => {
    if (loading || !family || !user) return;

    const memberIds = Object.keys(family.members);

    if (allocation && allocation.items.length > 0 && !seeded) {
      // Start from saved allocation, then merge any new members
      const saved = [...allocation.items];
      const existingUserIds = new Set(
        saved.filter((i) => i.type === "personal").map((i) => i.userId)
      );
      for (const uid of memberIds) {
        if (!existingUserIds.has(uid)) {
          const sharedIdx = saved.findIndex((i) => i.type === "shared_pool");
          saved.splice(sharedIdx >= 0 ? sharedIdx : saved.length, 0, {
            type: "personal",
            userId: uid,
            label: family.members[uid]?.name || "Thành viên",
            amount: 0,
          });
        }
      }
      setItems(saved);
      setSeeded(true);
      return;
    }

    if (!seeded) {
      const initial: AllocationItem[] = memberIds.map((uid) => ({
        type: "personal" as const,
        userId: uid,
        label: family.members[uid]?.name || "Thành viên",
        amount: 0,
      }));
      initial.push({
        type: "shared_pool",
        userId: null,
        label: "Quỹ sinh hoạt chung",
        amount: 0,
      });
      setItems(initial);
      setSeeded(true);
    }
  }, [allocation, loading, family, user, seeded]);

  // When family members change after initial seed, merge new members
  useEffect(() => {
    if (!seeded || !family || items.length === 0) return;

    const memberIds = Object.keys(family.members);
    const existingUserIds = new Set(
      items.filter((i) => i.type === "personal").map((i) => i.userId)
    );

    const newMembers = memberIds.filter((uid) => !existingUserIds.has(uid));
    if (newMembers.length === 0) return;

    const updated = [...items];
    const sharedIdx = updated.findIndex((i) => i.type === "shared_pool");
    for (const uid of newMembers) {
      updated.splice(sharedIdx >= 0 ? sharedIdx : updated.length, 0, {
        type: "personal",
        userId: uid,
        label: family.members[uid]?.name || "Thành viên",
        amount: 0,
      });
    }
    setItems(updated);
  }, [family, seeded]);

  const totalAllocated = items.reduce((s, i) => s + i.amount, 0);
  const savingsAmount = Math.max(0, remainingBudget - totalAllocated);
  const overBudget = totalAllocated > remainingBudget;

  const handleSlider = (index: number, value: number) => {
    const next = [...items];
    next[index] = { ...next[index], amount: value };
    setItems(next);
  };

  const handleSave = async () => {
    if (overBudget) return;
    setSaving(true);
    try {
      await saveAllocation(items);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Phân chia ngân sách
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ngân sách còn lại sau chi cố định:{" "}
          <span className="font-semibold text-foreground">
            {fmt(remainingBudget)} đ
          </span>
        </p>
      </div>

      <Card className="p-5 space-y-5">
        {items.map((item, idx) => {
          const pct =
            remainingBudget > 0
              ? Math.round((item.amount / remainingBudget) * 100)
              : 0;

          const spent =
            item.type === "personal" && item.userId
              ? memberSpending[item.userId]?.personal ?? 0
              : item.type === "shared_pool"
                ? totalSharedSpending
                : 0;
          const remain = item.amount - spent;
          const spentPct =
            item.amount > 0 ? Math.round((spent / item.amount) * 100) : 0;

          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground">
                  {fmt(item.amount)} đ ({pct}%)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={remainingBudget}
                step={100000}
                value={item.amount}
                onChange={(e) => handleSlider(idx, Number(e.target.value))}
                className="w-full accent-primary"
              />
              <Input
                type="number"
                className="h-7 text-xs"
                value={item.amount}
                onChange={(e) =>
                  handleSlider(idx, Number(e.target.value) || 0)
                }
              />

              {item.amount > 0 && sessionRange && (
                <div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <TrendingDown className="h-3 w-3" />
                      Đã chi
                    </span>
                    <span className="font-medium text-red-500 tabular-nums">
                      {fmt(spent)} đ
                      {spentPct > 0 && (
                        <span className="text-muted-foreground ml-1">
                          ({spentPct}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        spentPct > 90
                          ? "bg-red-500"
                          : spentPct > 70
                            ? "bg-amber-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, spentPct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Wallet className="h-3 w-3" />
                      Còn lại
                    </span>
                    <span
                      className={`font-medium tabular-nums ${
                        remain >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-orange-600 dark:text-orange-400"
                      }`}
                    >
                      {fmt(remain)} đ
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Đã phân chia:</span>
          <span className={overBudget ? "text-destructive font-medium" : ""}>
            {fmt(totalAllocated)} đ
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Tự động vào quỹ tiết kiệm:
          </span>
          <span className="font-semibold text-teal-600">
            {fmt(savingsAmount)} đ
          </span>
        </div>
        {overBudget && (
          <p className="text-xs text-destructive">
            Tổng phân chia vượt quá ngân sách còn lại!
          </p>
        )}
      </Card>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => router.back()}>
          Quay lại
        </Button>
        <Button onClick={handleSave} disabled={saving || overBudget}>
          {saving ? "Đang lưu..." : "Xác nhận phân chia"}
        </Button>
      </div>
    </div>
  );
}
