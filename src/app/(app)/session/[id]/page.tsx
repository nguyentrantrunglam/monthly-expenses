"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useSessionDetail,
  type MemberSessionItem,
  type Session,
} from "@/hooks/useSession";
import { useFixedItems } from "@/hooks/useFixedItems";
import { useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import { SessionBoard } from "@/components/session/SessionBoard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { getFixedItemDisplayTitle } from "@/lib/utils";
import { exportSessionPdf } from "@/lib/exportSessionPdf";
import { Wallet, Scale, FileDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const {
    session,
    memberItems,
    allMemberItems,
    loading,
    saveMemberItems,
    confirmMemberItems,
  } = useSessionDetail(sessionId);
  const { items: fixedItems } = useFixedItems();

  const isOwner =
    family && user
      ? family.members[user.uid]?.role === "owner" ||
        family.createdBy === user.uid
      : false;

  const [allocationItems, setAllocationItems] = useState<
    { type: string; userId: string | null; label: string; amount: number }[]
  >([]);

  const [transactions, setTransactions] = useState<
    { userId: string; amount: number; spendingType: string; date: string }[]
  >([]);

  useEffect(() => {
    if (!user?.familyId || !sessionId) return;
    const db = getFirestoreDb();
    const allocRef = doc(
      db,
      "families",
      user.familyId,
      "sessions",
      sessionId,
      "allocation",
      "main"
    );
    const unsub = onSnapshot(allocRef, (snap) => {
      if (snap.exists()) {
        setAllocationItems(snap.data().items ?? []);
      }
    });
    return () => unsub();
  }, [user?.familyId, sessionId]);

  useEffect(() => {
    if (!user?.familyId || !session?.month) return;
    const db = getFirestoreDb();
    const col = collection(db, "families", user.familyId, "transactions");
    const q = query(col, orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: typeof transactions = [];
      snap.forEach((d) => {
        const data = d.data();
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
  }, [user?.familyId, session?.month]);

  const cycleDay = family?.cycleDay ?? 1;

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const sessionRange = useMemo(() => {
    if (!session?.month) return null;
    const [y, m] = session.month.split("-").map(Number);
    const start = new Date(y, m - 1, cycleDay);
    const end = new Date(y, m, cycleDay - 1);
    if (cycleDay === 1) end.setMonth(end.getMonth(), 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    return { startStr, endStr };
  }, [session?.month, cycleDay]);

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

  const [boardItems, setBoardItems] = useState<MemberSessionItem[]>([]);
  const localEditRef = useRef(false);

  // Sync boardItems from Firestore realtime, merging in any new fixedItems
  useEffect(() => {
    if (localEditRef.current) return;
    if (!session || !user) return;

    const savedItems = memberItems?.items ?? [];
    const existingIds = new Set(savedItems.map((i) => i.fixedItemId));

    const newFromFixed: MemberSessionItem[] = fixedItems
      .filter((fi) => fi.isActive && !existingIds.has(fi.id))
      .map((fi) => ({
        fixedItemId: fi.id,
        title: getFixedItemDisplayTitle(fi),
        amount: fi.amount,
        action: "skip" as const,
        column: "personal" as const,
        type: fi.category ?? ("expense" as "income" | "expense"),
        categoryName: fi.categoryName ?? null,
      }));

    const merged = [...savedItems, ...newFromFixed];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoardItems(merged);
  }, [session, user, memberItems, fixedItems]);

  // Reset localEditRef after a short delay to allow Firestore sync to land
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleItemsChange = useCallback(
    (items: MemberSessionItem[]) => {
      localEditRef.current = true;
      setBoardItems(items);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        saveMemberItems(items).then(() => {
          setTimeout(() => {
            localEditRef.current = false;
          }, 500);
        });
      }, 300);
    },
    [saveMemberItems]
  );

  const handleSessionUpdate = useCallback(
    async (patch: {
      incomeItems?: Session["incomeItems"];
      sharedExpenses?: Session["sharedExpenses"];
    }) => {
      if (!user?.familyId || !session) return;
      const db = getFirestoreDb();
      const ref = doc(db, "families", user.familyId, "sessions", sessionId);

      const nextIncome = patch.incomeItems ?? session.incomeItems;
      const nextExpense = patch.sharedExpenses ?? session.sharedExpenses;
      const totalIncome = nextIncome.reduce((s, i) => s + i.amount, 0);
      const totalExpense = nextExpense.reduce((s, i) => s + i.amount, 0);

      const updateData: Record<string, unknown> = { ...patch };
      if (patch.incomeItems) {
        updateData.totalIncome = totalIncome;
        updateData.remainingBudget = totalIncome - totalExpense;
      }
      if (patch.sharedExpenses) {
        updateData.totalExpense = totalExpense;
        updateData.remainingBudget = totalIncome - totalExpense;
      }

      await updateDoc(ref, updateData);
    },
    [user, session, sessionId]
  );

  const handleConfirm = async () => {
    if (
      !confirm(
        "Bạn có chắc muốn xác nhận? Sau khi xác nhận, bạn không thể chỉnh sửa cho đến khi owner mở lại session."
      )
    )
      return;
    localEditRef.current = false;
    await confirmMemberItems(boardItems);
  };

  const handleLock = async () => {
    if (!user?.familyId || !session) return;
    if (!confirm("Chốt session? Tất cả thành viên sẽ được đánh dấu là đã hoàn thành."))
      return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sessions", sessionId);
    const allDone: Record<string, "done"> = {};
    for (const uid of Object.keys(session.memberStatus)) {
      allDone[uid] = "done";
    }
    await updateDoc(ref, {
      status: "locked",
      lockedAt: serverTimestamp(),
      memberStatus: allDone,
    });
  };

  const handleUnlock = async () => {
    if (!user?.familyId || !session || !family) return;
    if (
      !confirm("Mở lại session? Tất cả thành viên sẽ phải xác nhận lại.")
    )
      return;
    const db = getFirestoreDb();
    const ref = doc(db, "families", user.familyId, "sessions", sessionId);
    const resetStatus: Record<string, "pending"> = {};
    for (const uid of Object.keys(family.members)) {
      resetStatus[uid] = "pending";
    }
    await updateDoc(ref, {
      status: "open",
      lockedAt: null,
      memberStatus: resetStatus,
    });
  };

  if (loading || !session) {
    return (
      <p className="text-sm text-muted-foreground">Đang tải session...</p>
    );
  }

  const myStatus = user ? session.memberStatus[user.uid] : "pending";
  const isLocked = session.status === "locked";
  const boardDisabled = isLocked || myStatus === "done";
  const memberNames = family
    ? Object.fromEntries(
        Object.entries(family.members).map(([uid, m]) => [
          uid,
          m.name || uid.slice(0, 8),
        ])
      )
    : {};

  // Calculate real totals from actual data (session-level + all member items)
  const sessionIncome = session.incomeItems.reduce((s, i) => s + i.amount, 0);
  const sessionExpense = session.sharedExpenses.reduce((s, i) => s + i.amount, 0);
  let memberIncomeTotal = 0;
  let memberExpenseTotal = 0;
  for (const mi of Object.values(allMemberItems)) {
    for (const item of mi.items ?? []) {
      if (item.column === "income") memberIncomeTotal += item.amount;
      else if (item.column === "expense") memberExpenseTotal += item.amount;
    }
  }
  const realTotalIncome = sessionIncome + memberIncomeTotal;
  const realTotalExpense = sessionExpense + memberExpenseTotal;
  const realRemaining = realTotalIncome - realTotalExpense;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Session tháng {session.month}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isLocked
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
              }`}
            >
              {isLocked ? "Đã chốt" : "Đang mở"}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                myStatus === "done"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {myStatus === "done" ? "Đã xác nhận" : "Chưa xác nhận"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              try {
                exportSessionPdf({
                  session,
                  boardItems,
                  memberNames,
                  allMemberItems,
                  allocationItems,
                  memberSpending,
                  totalSharedSpending,
                });
              } catch (err) {
                console.error(err);
                alert("Không xuất được PDF.");
              }
            }}
            className="gap-1.5"
          >
            <FileDown className="h-4 w-4" />
            Xuất PDF
          </Button>
          {!isLocked && myStatus !== "done" && (
            <Button onClick={handleConfirm} variant="outline">
              Xác nhận
            </Button>
          )}
          {isOwner && !isLocked && (
            <Button onClick={handleLock}>Chốt session</Button>
          )}
          {isOwner && isLocked && (
            <Button onClick={handleUnlock} variant="outline">
              Mở lại session
            </Button>
          )}
        </div>
      </div>

      {isOwner && (
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Tiến độ xác nhận</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(session.memberStatus).map(([uid, status]) => {
              const memberName =
                family?.members[uid]?.name || uid.slice(0, 8);
              const mi = allMemberItems[uid];
              const itemCount = mi?.items?.filter(
                (i) => i.action === "include"
              ).length;
              return (
                <span
                  key={uid}
                  className={`rounded px-2 py-0.5 text-xs ${
                    status === "done"
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                  }`}
                >
                  {memberName}: {status === "done" ? "Xong" : "Chờ"}
                  {itemCount != null && ` (${itemCount} khoản)`}
                </span>
              );
            })}
          </div>
        </Card>
      )}

      <SessionBoard
        session={session}
        initialItems={boardItems}
        disabled={boardDisabled}
        onItemsChange={handleItemsChange}
        onSessionUpdate={isOwner && !isLocked ? handleSessionUpdate : undefined}
        currentUserId={user?.uid ?? ""}
        allMemberItems={allMemberItems}
        memberNames={memberNames}
        isOwner={isOwner}
      />

      {isLocked && isOwner && (
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold">Tổng kết sau khi chốt</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Tổng thu</p>
              <p className="text-lg font-bold text-green-600 tabular-nums">
                {fmt(realTotalIncome)} đ
              </p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Tổng chi cố định</p>
              <p className="text-lg font-bold text-red-500 tabular-nums">
                {fmt(realTotalExpense)} đ
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Còn lại</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {fmt(realRemaining)} đ
              </p>
            </div>
          </div>
          <Button onClick={() => router.push(`/allocation/${sessionId}`)}>
            Phân chia ngân sách
          </Button>
        </Card>
      )}

      {isLocked && allocationItems.length > 0 && sessionRange && (
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold">
            Chi tiêu theo quỹ phân chia
          </h2>
          <div className="space-y-3">
            {allocationItems.map((ai, idx) => {
              const spent =
                ai.type === "personal" && ai.userId
                  ? memberSpending[ai.userId]?.personal ?? 0
                  : ai.type === "shared_pool"
                    ? totalSharedSpending
                    : 0;
              const remain = ai.amount - spent;
              const spentPct =
                ai.amount > 0 ? Math.round((spent / ai.amount) * 100) : 0;

              return (
                <div
                  key={idx}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {ai.type === "shared_pool" ? (
                        <Scale className="h-4 w-4 text-teal-500" />
                      ) : (
                        <Wallet className="h-4 w-4 text-blue-500" />
                      )}
                      <span className="text-sm font-medium">{ai.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Ngân sách: {fmt(ai.amount)} đ
                    </span>
                  </div>

                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        spentPct > 90
                          ? "bg-red-500"
                          : spentPct > 70
                            ? "bg-amber-500"
                            : ai.type === "shared_pool"
                              ? "bg-teal-500"
                              : "bg-blue-500"
                      }`}
                      style={{ width: `${Math.min(100, spentPct)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Được chia
                      </p>
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          ai.type === "shared_pool"
                            ? "text-teal-600 dark:text-teal-400"
                            : "text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {fmt(ai.amount)} đ
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Đã chi
                      </p>
                      <p className="text-sm font-semibold text-red-500 tabular-nums">
                        {fmt(spent)} đ
                        {spentPct > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-0.5">
                            ({spentPct}%)
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Còn lại
                      </p>
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          remain >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-orange-600 dark:text-orange-400"
                        }`}
                      >
                        {fmt(remain)} đ
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
