"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";
import {
  DEFAULT_GOAL_ACCENT,
  sanitizeGoalAccent,
  sanitizeGoalIconId,
} from "@/lib/personal-goal-task-styles";

export interface PersonalGoalTask {
  id: string;
  title: string;
  targetAmount: number;
  unit: string;
  order: number;
  accentColor: string;
  iconId: string;
  createdAt: unknown;
}

export interface PersonalGoalLog {
  id: string;
  date: string;
  taskId: string;
  amount: number;
  note: string;
  updatedAt: unknown;
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

/** Tháng dương lịch ngay trước `monthKey` (YYYY-MM), hoặc null nếu key không hợp lệ. */
export function previousMonthKey(monthKey: string): string | null {
  const { year, month } = parseMonthKey(monthKey);
  if (!year || !month || month < 1 || month > 12) return null;
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabelVi(key: string): string {
  const { year, month } = parseMonthKey(key);
  if (!year || !month) return key;
  return `Tháng ${month}/${year}`;
}

export function daysInMonthKey(monthKey: string): number {
  const { year, month } = parseMonthKey(monthKey);
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function monthKeyOptions(
  pastMonths = 24,
  futureMonths = 3
): string[] {
  const d = new Date();
  const keys: string[] = [];
  for (let i = -pastMonths; i <= futureMonths; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
    keys.push(
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return keys.reverse();
}

function logDocId(date: string, taskId: string): string {
  return `${date}__${taskId}`;
}

/** Đánh dấu tháng đã qua bước “mặc định từ tháng trước” (kể cả khi không có gì để sao chép). */
const PERSONAL_GOALS_SEEDED_FIELD = "personalGoalsSeeded" as const;

/** Đọc/ghi mục tiêu theo UID. Admin dùng `subjectUid` để xem user khác (cần rule Firestore cho phép). */
export interface UsePersonalGoalsOptions {
  subjectUid?: string;
  readOnly?: boolean;
}

export function usePersonalGoals(
  monthKey: string,
  options?: UsePersonalGoalsOptions
) {
  const user = useAuthStore((s) => s.user);
  const readOnly = options?.readOnly ?? false;
  const override = options?.subjectUid?.trim();
  const [tasks, setTasks] = useState<PersonalGoalTask[]>([]);
  const [logs, setLogs] = useState<PersonalGoalLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = override || user?.uid || null;

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror useTransactions when scope missing
      setTasks([]);
      setLogs([]);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    const mk = monthKey;
    const tasksCol = collection(db, "users", uid, "personalGoalMonths", mk, "tasks");
    const logsCol = collection(db, "users", uid, "personalGoalMonths", mk, "logs");
    const tasksQ = query(tasksCol, orderBy("order", "asc"));
    setLoading(true);
    setError(null);

    const unsubTasks = onSnapshot(
      tasksQ,
      (snap) => {
        const list: PersonalGoalTask[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            title: data.title ?? "",
            targetAmount: typeof data.targetAmount === "number" ? data.targetAmount : 0,
            unit: data.unit ?? "",
            order: typeof data.order === "number" ? data.order : 0,
            accentColor: sanitizeGoalAccent(
              typeof data.accentColor === "string" ? data.accentColor : ""
            ),
            iconId: sanitizeGoalIconId(
              typeof data.iconId === "string" ? data.iconId : ""
            ),
            createdAt: data.createdAt,
          });
        });
        setTasks(list);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setError("Không tải được danh sách mục tiêu.");
        setLoading(false);
      }
    );

    const unsubLogs = onSnapshot(
      logsCol,
      (snap) => {
        const list: PersonalGoalLog[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            date: data.date ?? "",
            taskId: data.taskId ?? "",
            amount: typeof data.amount === "number" ? data.amount : 0,
            note: data.note ?? "",
            updatedAt: data.updatedAt,
          });
        });
        setLogs(list);
      },
      (e) => {
        console.error(e);
        setError("Không tải được nhật ký.");
      }
    );

    return () => {
      unsubTasks();
      unsubLogs();
    };
  }, [uid, monthKey]);

  /** Tháng chưa có mục tiêu: một lần duy nhất sao chép cấu hình từ tháng trước (không sao chép nhật ký). */
  useEffect(() => {
    if (readOnly || !uid || loading || tasks.length > 0) return;

    const db = getFirestoreDb();
    const mk = monthKey;
    const monthRef = doc(db, "users", uid, "personalGoalMonths", mk);
    const tasksCol = collection(db, "users", uid, "personalGoalMonths", mk, "tasks");

    let cancelled = false;

    const run = async () => {
      try {
        const monthSnap = await getDoc(monthRef);
        if (cancelled) return;
        if (
          monthSnap.exists() &&
          monthSnap.data()?.[PERSONAL_GOALS_SEEDED_FIELD] === true
        ) {
          return;
        }

        const prevKey = previousMonthKey(mk);
        if (!prevKey) {
          await setDoc(monthRef, { [PERSONAL_GOALS_SEEDED_FIELD]: true }, { merge: true });
          return;
        }

        const prevTasksCol = collection(
          db,
          "users",
          uid,
          "personalGoalMonths",
          prevKey,
          "tasks"
        );
        const prevQ = query(prevTasksCol, orderBy("order", "asc"));
        const prevSnap = await getDocs(prevQ);
        if (cancelled) return;

        type SeedRow = {
          title: string;
          targetAmount: number;
          unit: string;
          order: number;
          accentColor: string;
          iconId: string;
        };
        const fromPrev: SeedRow[] = [];
        prevSnap.forEach((d) => {
          const data = d.data();
          fromPrev.push({
            title: typeof data.title === "string" ? data.title : "",
            targetAmount: typeof data.targetAmount === "number" ? data.targetAmount : 0,
            unit: typeof data.unit === "string" ? data.unit : "",
            order: typeof data.order === "number" ? data.order : 0,
            accentColor: sanitizeGoalAccent(
              typeof data.accentColor === "string" ? data.accentColor : ""
            ),
            iconId: sanitizeGoalIconId(typeof data.iconId === "string" ? data.iconId : ""),
          });
        });

        await runTransaction(db, async (transaction) => {
          const m = await transaction.get(monthRef);
          if (m.exists() && m.data()?.[PERSONAL_GOALS_SEEDED_FIELD] === true) {
            return;
          }
          if (fromPrev.length === 0) {
            transaction.set(monthRef, { [PERSONAL_GOALS_SEEDED_FIELD]: true }, { merge: true });
            return;
          }
          for (const row of fromPrev) {
            const taskRef = doc(tasksCol);
            transaction.set(taskRef, {
              title: row.title,
              targetAmount: row.targetAmount,
              unit: row.unit,
              order: row.order,
              accentColor: row.accentColor,
              iconId: row.iconId,
              createdAt: serverTimestamp(),
            });
          }
          transaction.set(monthRef, { [PERSONAL_GOALS_SEEDED_FIELD]: true }, { merge: true });
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("Không khởi tạo mục tiêu từ tháng trước được.");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [uid, monthKey, readOnly, loading, tasks.length]);

  const totalsByTask = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of logs) {
      if (!l.taskId) continue;
      m[l.taskId] = (m[l.taskId] ?? 0) + l.amount;
    }
    return m;
  }, [logs]);

  const addTask = useCallback(
    async (input: {
      title: string;
      targetAmount: number;
      unit: string;
      accentColor: string;
      iconId: string;
    }) => {
      if (readOnly || !uid) return;
      const db = getFirestoreDb();
      const mk = monthKey;
      const tasksCol = collection(db, "users", uid, "personalGoalMonths", mk, "tasks");
      const maxOrder = tasks.reduce((a, t) => Math.max(a, t.order), -1);
      const accentColor = sanitizeGoalAccent(input.accentColor) || DEFAULT_GOAL_ACCENT;
      const iconId = sanitizeGoalIconId(input.iconId);
      await addDoc(tasksCol, {
        title: input.title.trim(),
        targetAmount: input.targetAmount,
        unit: input.unit.trim(),
        accentColor,
        iconId,
        order: maxOrder + 1,
        createdAt: serverTimestamp(),
      });
    },
    [readOnly, uid, monthKey, tasks]
  );

  const updateTask = useCallback(
    async (
      taskId: string,
      input: {
        title: string;
        targetAmount: number;
        unit: string;
        accentColor: string;
        iconId: string;
      }
    ) => {
      if (readOnly || !uid) return;
      const db = getFirestoreDb();
      const mk = monthKey;
      const ref = doc(db, "users", uid, "personalGoalMonths", mk, "tasks", taskId);
      const accentColor = sanitizeGoalAccent(input.accentColor) || DEFAULT_GOAL_ACCENT;
      const iconId = sanitizeGoalIconId(input.iconId);
      await updateDoc(ref, {
        title: input.title.trim(),
        targetAmount: input.targetAmount,
        unit: input.unit.trim(),
        accentColor,
        iconId,
      });
    },
    [readOnly, uid, monthKey]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (readOnly || !uid) return;
      const db = getFirestoreDb();
      const mk = monthKey;
      const logsCol = collection(db, "users", uid, "personalGoalMonths", mk, "logs");
      const qLogs = query(logsCol, where("taskId", "==", taskId));
      const snap = await getDocs(qLogs);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      const taskRef = doc(db, "users", uid, "personalGoalMonths", mk, "tasks", taskId);
      await deleteDoc(taskRef);
    },
    [readOnly, uid, monthKey]
  );

  const saveLog = useCallback(
    async (input: { date: string; taskId: string; amount: number; note: string }) => {
      if (readOnly || !uid) return;
      const amt = Math.max(0, input.amount);
      const note = input.note.trim();
      const db = getFirestoreDb();
      const mk = monthKey;
      const id = logDocId(input.date, input.taskId);
      const logRef = doc(db, "users", uid, "personalGoalMonths", mk, "logs", id);
      if (amt === 0 && !note) {
        await deleteDoc(logRef).catch(() => {});
        return;
      }
      await setDoc(
        logRef,
        {
          date: input.date,
          taskId: input.taskId,
          amount: amt,
          note,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [readOnly, uid, monthKey]
  );

  const deleteLog = useCallback(
    async (date: string, taskId: string) => {
      if (readOnly || !uid) return;
      const db = getFirestoreDb();
      const mk = monthKey;
      const id = logDocId(date, taskId);
      await deleteDoc(
        doc(db, "users", uid, "personalGoalMonths", mk, "logs", id)
      );
    },
    [readOnly, uid, monthKey]
  );

  return {
    tasks,
    logs,
    totalsByTask,
    loading,
    error,
    addTask,
    updateTask,
    deleteTask,
    saveLog,
    deleteLog,
  };
}
