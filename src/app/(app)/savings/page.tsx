"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card } from "@/components/ui/card";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

interface Deposit {
  month: string;
  amount: number;
  sessionId: string;
  createdAt: { toDate?: () => Date } | string;
}

export default function SavingsPage() {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "savingsFund", "main");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBalance(data.balance ?? 0);
        setDeposits(data.deposits ?? []);
      } else {
        setBalance(0);
        setDeposits([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user?.familyId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Quỹ tiết kiệm
        </h1>
        <p className="text-sm text-muted-foreground">
          Tự động tích lũy từ phần còn lại sau phân chia ngân sách mỗi tháng.
        </p>
      </div>

      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Tổng tích lũy</p>
        <p className="text-3xl font-bold text-teal-600 mt-1">
          {fmt(balance)} đ
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium">Lịch sử nạp theo tháng</h2>
        {deposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có khoản nạp nào. Khi owner phân chia ngân sách, phần còn lại
            sẽ tự động vào quỹ tiết kiệm.
          </p>
        ) : (
          <div className="space-y-1">
            {deposits.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm border-b last:border-0 py-1"
              >
                <span>Tháng {d.month}</span>
                <span className="font-medium text-teal-600">
                  +{fmt(d.amount)} đ
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
