"use client";

import { useEffect, useMemo, useState } from "react";
import {
  usePersonalGoals,
  currentMonthKey,
  formatMonthLabelVi,
  monthKeyOptions,
  parseMonthKey,
  type PersonalGoalTask,
} from "@/hooks/usePersonalGoals";
import { GoalsMonthCalendar } from "@/components/personal-goals/GoalsMonthCalendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_GOAL_ACCENT,
  DEFAULT_GOAL_ICON_ID,
  GOAL_ACCENT_PRESETS,
  GOAL_ICON_OPTIONS,
  contrastingForegroundForBg,
  getGoalIconComponent,
} from "@/lib/personal-goal-task-styles";

function defaultDateInMonth(monthKey: string): string {
  const today = currentMonthKey();
  if (monthKey === today) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const { year, month } = parseMonthKey(monthKey);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function parseAmount(s: string): number {
  const t = s.trim().replace(",", ".");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function formatFullDateVi(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function TaskDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: PersonalGoalTask | null;
  onSave: (v: {
    title: string;
    targetAmount: number;
    unit: string;
    accentColor: string;
    iconId: string;
  }) => Promise<void>;
  title: string;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_GOAL_ACCENT);
  const [iconId, setIconId] = useState(DEFAULT_GOAL_ICON_ID);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.title);
      setTarget(String(initial.targetAmount));
      setUnit(initial.unit);
      setAccentColor(initial.accentColor);
      setIconId(initial.iconId);
    } else {
      setName("");
      setTarget("");
      setUnit("");
      setAccentColor(DEFAULT_GOAL_ACCENT);
      setIconId(DEFAULT_GOAL_ICON_ID);
    }
    setLocalErr(null);
  }, [open, initial]);

  const submit = async () => {
    setLocalErr(null);
    const t = name.trim();
    if (!t) {
      setLocalErr("Nhập tên công việc.");
      return;
    }
    const tgt = parseAmount(target);
    if (Number.isNaN(tgt)) {
      setLocalErr("Mục tiêu phải là số ≥ 0.");
      return;
    }
    const u = unit.trim();
    if (!u) {
      setLocalErr("Nhập đơn vị (vd. buổi, km).");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        title: t,
        targetAmount: tgt,
        unit: u,
        accentColor,
        iconId,
      });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      setLocalErr("Không lưu được. Thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Màu trên lịch & thẻ</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_ACCENT_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => setAccentColor(hex)}
                  className={`size-8 shrink-0 rounded-full border-2 border-transparent shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    accentColor === hex
                      ? "ring-2 ring-offset-2 ring-offset-background ring-foreground"
                      : ""
                  }`}
                  style={{ backgroundColor: hex }}
                  aria-label={`Chọn màu ${hex}`}
                  aria-pressed={accentColor === hex}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Biểu tượng</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_ICON_OPTIONS.map(({ id, label: iconLabel }) => {
                const Icon = getGoalIconComponent(id);
                const selected = iconId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setIconId(id)}
                    title={iconLabel}
                    aria-label={iconLabel}
                    aria-pressed={selected}
                    className={`flex size-10 items-center justify-center rounded-lg border transition-colors hover:bg-muted/80 ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pg-task-title">Tên công việc</Label>
            <Input
              id="pg-task-title"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Chạy bộ"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pg-task-target">Khối lượng mục tiêu (tháng)</Label>
            <Input
              id="pg-task-target"
              type="text"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="20"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pg-task-unit">Đơn vị</Label>
            <Input
              id="pg-task-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="buổi"
            />
          </div>
          {localErr && (
            <p className="text-sm text-destructive">{localErr}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LogDraft = { amount: string; note: string };

function DayLogModal({
  open,
  onOpenChange,
  dateYmd,
  tasks,
  logsForDate,
  onSaveAll,
  onDeleteWholeDay,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dateYmd: string;
  tasks: PersonalGoalTask[];
  logsForDate: { taskId: string; amount: number; note: string }[];
  onSaveAll: (
    entries: { taskId: string; amount: number; note: string }[]
  ) => Promise<void>;
  onDeleteWholeDay?: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, LogDraft>>({});
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, LogDraft> = {};
    for (const t of tasks) {
      const log = logsForDate.find((l) => l.taskId === t.id);
      next[t.id] = {
        amount:
          log && log.amount > 0 ? String(log.amount) : "",
        note: log?.note?.trim() ? log.note : "",
      };
    }
    setDrafts(next);
    setLocalErr(null);
  }, [open, tasks, logsForDate]);

  const setField = (taskId: string, patch: Partial<LogDraft>) => {
    setDrafts((d) => ({
      ...d,
      [taskId]: { ...d[taskId], ...patch },
    }));
  };

  const submit = async () => {
    setLocalErr(null);
    const entries: { taskId: string; amount: number; note: string }[] = [];
    for (const t of tasks) {
      const row = drafts[t.id] ?? { amount: "", note: "" };
      const amt = parseAmount(row.amount);
      if (Number.isNaN(amt)) {
        setLocalErr(`Số không hợp lệ: "${t.title}".`);
        return;
      }
      entries.push({
        taskId: t.id,
        amount: amt,
        note: row.note.trim(),
      });
    }
    setBusy(true);
    try {
      await onSaveAll(entries);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      setLocalErr("Không lưu được. Thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const hasStoredLogsForDay = logsForDate.some(
    (l) => l.amount > 0 || (l.note ?? "").trim().length > 0
  );

  const handleDeleteDay = async () => {
    if (!onDeleteWholeDay) return;
    if (
      !confirm(
        `Xóa toàn bộ nhật ký ngày ${formatFullDateVi(dateYmd)}?`
      )
    ) {
      return;
    }
    setBusy(true);
    setLocalErr(null);
    try {
      await onDeleteWholeDay();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      setLocalErr("Không xóa được. Thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col gap-0 p-0 sm:max-w-xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
          <DialogTitle>Ghi nhận trong ngày</DialogTitle>
          <p className="text-sm font-normal text-muted-foreground">
            {formatFullDateVi(dateYmd)} · Nhập số lượng và ghi chú cho từng công
            việc, rồi lưu một lần. Để trống cả hai sẽ xóa nhật ký của dòng đó.
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-4">
            {tasks.map((t) => {
              const d = drafts[t.id] ?? { amount: "", note: "" };
              const TaskIcon = getGoalIconComponent(t.iconId);
              const fg = contrastingForegroundForBg(t.accentColor);
              return (
                <div
                  key={t.id}
                  className="rounded-lg border border-border/80 bg-muted/15 p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: t.accentColor,
                        color: fg,
                      }}
                    >
                      <TaskIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        {t.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Đơn vị: {t.unit || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label className="text-[11px]">Số lượng</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={d.amount}
                        onChange={(e) =>
                          setField(t.id, { amount: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="grid gap-1 sm:col-span-2">
                      <Label className="text-[11px]">Ghi chú</Label>
                      <Textarea
                        className="min-h-[52px] resize-y text-sm"
                        value={d.note}
                        onChange={(e) =>
                          setField(t.id, { note: e.target.value })
                        }
                        placeholder="Tùy chọn"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {localErr && (
            <p className="mt-3 text-sm text-destructive">{localErr}</p>
          )}
        </div>
        <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {onDeleteWholeDay && hasStoredLogsForDay ? (
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => void handleDeleteDay()}
            >
              Xóa cả ngày
            </Button>
          ) : (
            <span className="hidden sm:block sm:flex-1" />
          )}
          <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu nhật ký"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PersonalGoalsPage() {
  const monthChoices = useMemo(() => monthKeyOptions(), []);
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const {
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
  } = usePersonalGoals(monthKey);

  const [selectedDate, setSelectedDate] = useState(() =>
    defaultDateInMonth(currentMonthKey())
  );

  useEffect(() => {
    setSelectedDate(defaultDateInMonth(monthKey));
  }, [monthKey]);

  const [dayLogModalOpen, setDayLogModalOpen] = useState(false);

  const taskById = useMemo(() => {
    const m: Record<string, PersonalGoalTask> = {};
    for (const t of tasks) m[t.id] = t;
    return m;
  }, [tasks]);

  const logsByDateForGrid = useMemo(() => {
    const map: Record<
      string,
      { id: string; label: string; styleKey: string; barBg?: string }[]
    > = {};
    for (const l of logs) {
      if (!l.date.startsWith(monthKey)) continue;
      const hasAmt = l.amount > 0;
      const note = (l.note ?? "").trim();
      if (!hasAmt && !note) continue;
      const t = taskById[l.taskId];
      const title = t?.title ?? "Đã xóa công việc";
      const unit = t?.unit ?? "";
      let label: string;
      if (hasAmt) {
        label = `${title}: ${l.amount.toLocaleString("vi-VN")}${unit ? ` ${unit}` : ""}`;
        if (note.length > 0) {
          const snip = note.slice(0, 22);
          label = `${label} · ${snip}${note.length > 22 ? "…" : ""}`;
        }
      } else {
        const snip = note.slice(0, 36);
        label = `${title}: ${snip}${note.length > 36 ? "…" : ""}`;
      }
      if (!map[l.date]) map[l.date] = [];
      map[l.date].push({
        id: `${l.date}-${l.taskId}`,
        label,
        styleKey: l.taskId,
        barBg: t?.accentColor,
      });
    }
    return map;
  }, [logs, monthKey, taskById]);

  const logsForSelectedDate = useMemo(
    () =>
      logs
        .filter((l) => l.date === selectedDate)
        .map((l) => ({
          taskId: l.taskId,
          amount: l.amount,
          note: l.note ?? "",
        })),
    [logs, selectedDate]
  );

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalGoalTask | null>(null);

  const openAddTask = () => {
    setEditingTask(null);
    setTaskDialogOpen(true);
  };

  const openEditTask = (t: PersonalGoalTask) => {
    setEditingTask(t);
    setTaskDialogOpen(true);
  };

  const handleSaveTaskForm = async (v: {
    title: string;
    targetAmount: number;
    unit: string;
    accentColor: string;
    iconId: string;
  }) => {
    if (editingTask) {
      await updateTask(editingTask.id, v);
    } else {
      await addTask(v);
    }
  };

  const handleDeleteTask = async (t: PersonalGoalTask) => {
    if (
      !confirm(
        `Xóa "${t.title}" và toàn bộ nhật ký của công việc này trong tháng?`
      )
    ) {
      return;
    }
    await deleteTask(t.id);
  };

  const saveDayLogsBatch = async (
    entries: { taskId: string; amount: number; note: string }[]
  ) => {
    await Promise.all(
      entries.map((e) =>
        saveLog({
          date: selectedDate,
          taskId: e.taskId,
          amount: e.amount,
          note: e.note,
        })
      )
    );
  };

  const deleteAllLogsForDate = async (dateYmd: string) => {
    const dayLogs = logs.filter((l) => l.date === dateYmd);
    await Promise.all(
      dayLogs.map((l) => deleteLog(dateYmd, l.taskId))
    );
  };

  const openDayLog = (ymd: string) => {
    setSelectedDate(ymd);
    setDayLogModalOpen(true);
  };

  const goCalendarToday = () => {
    const mk = currentMonthKey();
    setMonthKey(mk);
    setSelectedDate(defaultDateInMonth(mk));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Mục tiêu cá nhân
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đặt mục tiêu theo tháng dương lịch và ghi nhận tiến độ từng ngày.
            Không liên quan tới gia đình — chỉ bạn thấy dữ liệu này.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:w-56">
          <Label className="text-xs text-muted-foreground">Tháng</Label>
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthChoices.map((k) => (
                <SelectItem key={k} value={k}>
                  {formatMonthLabelVi(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            Công việc trong tháng
          </h2>
          <Button size="sm" onClick={openAddTask}>
            <Plus className="h-3.5 w-3.5" />
            Thêm công việc
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : tasks.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Chưa có công việc nào. Thêm ít nhất một mục để bắt đầu theo dõi.
          </Card>
        ) : (
          <div className="flex flex-row flex-wrap gap-3">
            {tasks.map((t) => {
              const done = totalsByTask[t.id] ?? 0;
              const target = t.targetAmount;
              const pct =
                target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
              const CardIcon = getGoalIconComponent(t.iconId);
              const cardFg = contrastingForegroundForBg(t.accentColor);
              return (
                <Card
                  key={t.id}
                  className="min-w-0 flex-[1_1_100%] p-4 sm:flex-[1_1_calc(50%-0.375rem)] lg:flex-[1_1_calc(33.333%-0.5rem)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start gap-2">
                        <div
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: t.accentColor,
                            color: cardFg,
                          }}
                        >
                          <CardIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium leading-tight">{t.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Mục tiêu: {target.toLocaleString("vi-VN")}{" "}
                            {t.unit || "đơn vị"}
                            {" · "}
                            Đã làm: {done.toLocaleString("vi-VN")}{" "}
                            {t.unit || ""}
                          </p>
                        </div>
                      </div>
                      {target > 0 && (
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.min(100, target > 0 ? (done / target) * 100 : 0)}%`,
                            }}
                          />
                        </div>
                      )}
                      {target > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {pct}% mục tiêu tháng
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1 sm:flex-col">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={() => openEditTask(t)}
                        aria-label="Sửa công việc"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => void handleDeleteTask(t)}
                        aria-label="Xóa công việc"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {tasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Lịch nhật ký
          </h2>
          <GoalsMonthCalendar
            monthKey={monthKey}
            onMonthKeyChange={setMonthKey}
            onToday={goCalendarToday}
            logsByDate={logsByDateForGrid}
            loading={loading}
            onOpenDay={openDayLog}
          />
        </section>
      )}

      <DayLogModal
        open={dayLogModalOpen}
        onOpenChange={setDayLogModalOpen}
        dateYmd={selectedDate}
        tasks={tasks}
        logsForDate={logsForSelectedDate}
        onSaveAll={saveDayLogsBatch}
        onDeleteWholeDay={() => deleteAllLogsForDate(selectedDate)}
      />

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        initial={editingTask}
        onSave={handleSaveTaskForm}
        title={editingTask ? "Sửa công việc" : "Thêm công việc"}
      />
    </div>
  );
}
