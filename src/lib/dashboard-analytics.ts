import type { Session } from "@/hooks/useSession";
import type { Transaction } from "@/hooks/useTransactions";

/** Khoảng ngày của một session tháng theo cycleDay gia đình (YYYY-MM-DD). */
export function getSessionRangeFromMonth(
  sessionMonth: string,
  cycleDay: number,
): { startStr: string; endStr: string } | null {
  if (!sessionMonth || !/^\d{4}-\d{2}$/.test(sessionMonth)) return null;
  const [y, m] = sessionMonth.split("-").map(Number);
  const start = new Date(y, m - 1, cycleDay);
  const end = new Date(y, m, cycleDay - 1);
  if (cycleDay === 1) end.setMonth(end.getMonth(), 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return { startStr, endStr };
}

export function transactionInSessionRange(
  tx: { date: string },
  range: { startStr: string; endStr: string },
): boolean {
  const d = (tx.date ?? "").slice(0, 10);
  return d >= range.startStr && d <= range.endStr;
}

/** Năm dương lịch đầy đủ (YYYY-MM-DD). */
export function getCalendarYearRange(year: number): {
  startStr: string;
  endStr: string;
} {
  return { startStr: `${year}-01-01`, endStr: `${year}-12-31` };
}

/** Tổng hợp các session có `month` thuộc năm (YYYY-*). */
export function aggregateYearSessionTotals(
  sessions: Session[],
  year: number,
): {
  count: number;
  totalIncome: number;
  totalExpense: number;
  totalRemaining: number;
} {
  const prefix = `${year}-`;
  const inYear = sessions.filter((s) => s.month.startsWith(prefix));
  return {
    count: inYear.length,
    totalIncome: inYear.reduce((s, x) => s + x.totalIncome, 0),
    totalExpense: inYear.reduce((s, x) => s + x.totalExpense, 0),
    totalRemaining: inYear.reduce((s, x) => s + x.remainingBudget, 0),
  };
}

/** Điểm xu hướng: mỗi session trong năm dương lịch (theo trường `month`). */
export function buildYearSessionTrendPoints(
  sessions: Session[],
  year: number,
): {
  month: string;
  label: string;
  totalIncome: number;
  totalExpense: number;
  remainingBudget: number;
}[] {
  const prefix = `${year}-`;
  return sessions
    .filter((s) => s.month.startsWith(prefix))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => {
      const [Y, M] = s.month.split("-");
      return {
        month: s.month,
        label: `${M}/${Y}`,
        totalIncome: s.totalIncome,
        totalExpense: s.totalExpense,
        remainingBudget: s.remainingBudget,
      };
    });
}

/** Chi cá nhân / quỹ chung theo từng tháng dương lịch trong năm. */
export function buildStackedPersonalSharedCalendarMonths(
  transactions: Transaction[],
  year: number,
): { label: string; personal: number; shared: number }[] {
  const rows: { label: string; personal: number; shared: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const prefix = `${year}-${mm}`;
    let personal = 0;
    let shared = 0;
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (!(t.date ?? "").startsWith(prefix)) continue;
      if (t.spendingType === "shared_pool") shared += t.amount;
      else personal += t.amount;
    }
    rows.push({ label: `T${m}`, personal, shared });
  }
  return rows;
}

/** Chi cá nhân theo thành viên và theo tháng dương lịch (12 cột). */
export function buildMemberPersonalExpenseCalendarYear(
  transactions: Transaction[],
  year: number,
  members: Record<string, { name: string | null } | undefined>,
): Record<string, string | number>[] {
  const uids = Object.keys(members).sort();
  const rows: Record<string, string | number>[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const prefix = `${year}-${mm}`;
    const row: Record<string, string | number> = {
      label: `T${m}/${String(year).slice(2)}`,
    };
    const personalByUid: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (t.spendingType !== "personal") continue;
      if (!(t.date ?? "").startsWith(prefix)) continue;
      personalByUid[t.userId] = (personalByUid[t.userId] || 0) + t.amount;
    }
    uids.forEach((u) => {
      row[u] = personalByUid[u] ?? 0;
    });
    rows.push(row);
  }
  return rows;
}

export function aggregateExpenseByCategory(
  transactions: Transaction[],
  range: { startStr: string; endStr: string },
): { name: string; value: number }[] {
  const map: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (!transactionInSessionRange(t, range)) continue;
    const key = t.category?.trim() || "Không phân loại";
    map[key] = (map[key] || 0) + t.amount;
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function aggregatePersonalVsSharedExpenseInRange(
  transactions: Transaction[],
  range: { startStr: string; endStr: string },
): { personal: number; shared: number } {
  let personal = 0;
  let shared = 0;
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (!transactionInSessionRange(t, range)) continue;
    if (t.spendingType === "shared_pool") shared += t.amount;
    else personal += t.amount;
  }
  return { personal, shared };
}

/** Các điểm cho biểu đồ xu hướng (đã sort theo tháng tăng dần, tối đa `maxPoints`). */
export function buildSessionTrendPoints(
  sessions: Session[],
  maxPoints = 6,
): {
  month: string;
  label: string;
  totalIncome: number;
  totalExpense: number;
  remainingBudget: number;
}[] {
  const sorted = [...sessions].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  const slice = sorted.slice(-maxPoints);
  return slice.map((s) => {
    const [Y, M] = s.month.split("-");
    return {
      month: s.month,
      label: `${M}/${Y}`,
      totalIncome: s.totalIncome,
      totalExpense: s.totalExpense,
      remainingBudget: s.remainingBudget,
    };
  });
}

export function buildStackedPersonalSharedSeries(
  sessions: Session[],
  transactions: Transaction[],
  cycleDay: number,
  maxPoints = 6,
): { label: string; personal: number; shared: number; month: string }[] {
  const sorted = [...sessions].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  const slice = sorted.slice(-maxPoints);
  return slice.map((s) => {
    const range = getSessionRangeFromMonth(s.month, cycleDay);
    const [Y, M] = s.month.split("-");
    if (!range) {
      return { label: `${M}/${Y}`, personal: 0, shared: 0, month: s.month };
    }
    const { personal, shared } = aggregatePersonalVsSharedExpenseInRange(
      transactions,
      range,
    );
    return { label: `${M}/${Y}`, personal, shared, month: s.month };
  });
}

function memberLabel(
  members: Record<string, { name: string | null } | undefined>,
  uid: string,
): string {
  const n = members[uid]?.name?.trim();
  return n || `Thành viên ${uid.slice(0, 6)}`;
}

/** Chi cá nhân (expense + personal) theo userId trong kỳ. */
export function aggregatePersonalExpenseByMember(
  transactions: Transaction[],
  range: { startStr: string; endStr: string },
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (!transactionInSessionRange(t, range)) continue;
    if (t.spendingType !== "personal") continue;
    map[t.userId] = (map[t.userId] || 0) + t.amount;
  }
  return map;
}

export function totalSharedExpenseInRange(
  transactions: Transaction[],
  range: { startStr: string; endStr: string },
): number {
  let s = 0;
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (!transactionInSessionRange(t, range)) continue;
    if (t.spendingType === "shared_pool") s += t.amount;
  }
  return s;
}

/** Cá nhân + phần quỹ chung chia đều (để so sánh giữa các thành viên). */
export function buildMemberStackedExpenseRows(
  transactions: Transaction[],
  range: { startStr: string; endStr: string } | null,
  members: Record<string, { name: string | null } | undefined>,
): { name: string; personal: number; sharedShare: number }[] {
  if (!range) return [];
  const uids = Object.keys(members);
  const n = Math.max(1, uids.length);
  const sharedTotal = totalSharedExpenseInRange(transactions, range);
  const perShare = sharedTotal / n;
  const personal = aggregatePersonalExpenseByMember(transactions, range);
  return uids
    .map((uid) => ({
      name: memberLabel(members, uid),
      personal: personal[uid] ?? 0,
      sharedShare: perShare,
    }))
    .sort(
      (a, b) =>
        b.personal + b.sharedShare - (a.personal + a.sharedShare),
    );
}

/** Thu và chi (chi = cá nhân + phần quỹ chung chia đều) theo người trong kỳ. */
export function buildMemberIncomeExpenseRows(
  transactions: Transaction[],
  range: { startStr: string; endStr: string } | null,
  members: Record<string, { name: string | null } | undefined>,
): { name: string; income: number; expense: number }[] {
  if (!range) return [];
  const uids = Object.keys(members);
  const n = Math.max(1, uids.length);
  const income: Record<string, number> = {};
  const expensePersonal: Record<string, number> = {};
  let sharedExp = 0;
  for (const t of transactions) {
    if (!transactionInSessionRange(t, range)) continue;
    if (t.type === "income") {
      income[t.userId] = (income[t.userId] || 0) + t.amount;
    } else if (t.type === "expense") {
      if (t.spendingType === "shared_pool") sharedExp += t.amount;
      else expensePersonal[t.userId] = (expensePersonal[t.userId] || 0) + t.amount;
    }
  }
  const share = sharedExp / n;
  return uids
    .map((uid) => ({
      name: memberLabel(members, uid),
      income: income[uid] ?? 0,
      expense: (expensePersonal[uid] ?? 0) + share,
    }))
    .sort((a, b) => b.expense - a.expense);
}

/**
 * Chuỗi thời gian: chi cá nhân theo từng uid (mỗi hàng có `label` + [uid]: số tiền).
 */
export function buildMemberPersonalExpenseTrend(
  sessions: Session[],
  transactions: Transaction[],
  cycleDay: number,
  members: Record<string, { name: string | null } | undefined>,
  maxPoints = 6,
): Record<string, string | number>[] {
  const uids = Object.keys(members).sort();
  const sorted = [...sessions]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-maxPoints);
  return sorted.map((sess) => {
    const range = getSessionRangeFromMonth(sess.month, cycleDay);
    const [Y, M] = sess.month.split("-");
    const row: Record<string, string | number> = { label: `${M}/${Y}` };
    if (!range) {
      uids.forEach((u) => {
        row[u] = 0;
      });
      return row;
    }
    const byUid = aggregatePersonalExpenseByMember(transactions, range);
    uids.forEach((u) => {
      row[u] = byUid[u] ?? 0;
    });
    return row;
  });
}
