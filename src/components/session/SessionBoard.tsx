"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { DroppableColumn } from "./DroppableColumn";
import { ItemCard } from "./ItemCard";
import { Input } from "@/components/ui/input";
import { CurrencyInput, parseCurrencyInput } from "@/components/ui/currency-input";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type {
  MemberSessionItem,
  MemberItems,
  Session,
} from "@/hooks/useSession";

interface OtherMemberItem extends MemberSessionItem {
  memberName: string;
  memberUid: string;
}

interface Props {
  session: Session;
  initialItems: MemberSessionItem[];
  disabled: boolean;
  onItemsChange: (items: MemberSessionItem[]) => void;
  onSessionUpdate?: (patch: {
    incomeItems?: Session["incomeItems"];
    sharedExpenses?: Session["sharedExpenses"];
  }) => void;
  currentUserId: string;
  allMemberItems: Record<string, MemberItems>;
  memberNames: Record<string, string>;
  isOwner: boolean;
  /** ID khoản cố định (Firestore) — thẻ khớp ID này không được xóa khỏi kho cá nhân */
  fixedCatalogItemIds: ReadonlySet<string>;
}

type ColumnId = "personal" | "income" | "expense" | "trash";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function SessionBoard({
  session,
  initialItems,
  disabled,
  onItemsChange,
  onSessionUpdate,
  currentUserId,
  allMemberItems,
  memberNames,
  isOwner,
  fixedCatalogItemIds,
}: Props) {
  const [items, setItems] = useState<MemberSessionItem[]>(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (disabled) return;
      const { active, over } = event;
      if (!over) return;

      const idx = active.data.current?.index as number;
      const targetColumn = over.id as ColumnId;
      if (idx == null || !targetColumn) return;

      const item = items[idx];
      if (!item) return;

      // Kéo vào vùng xóa: không cho xóa thẻ bắt nguồn từ khoản cố định cá nhân
      if (targetColumn === "trash") {
        const fromFixed =
          item.fixedItemId != null &&
          fixedCatalogItemIds.has(item.fixedItemId);
        if (!fromFixed) {
          const next = items.filter((_, i) => i !== idx);
          setItems(next);
          onItemsChange(next);
        } else {
          toast.warning(
            "Không xóa được khoản từ khoản cố định. Tắt hoặc xóa trong Cài đặt → Khoản cố định.",
          );
        }
        return;
      }

      const isIncomeType =
        item.type === "income" ||
        item.fixedItemId === "__income__" ||
        item.fixedItemId.startsWith("__income");
      const isExpenseType =
        item.type === "expense" ||
        (!isIncomeType &&
          !item.fixedItemId.startsWith("_quick_") &&
          !item.fixedItemId.startsWith("__income"));

      if (isIncomeType && targetColumn === "expense") {
        toast.warning("Khoản thu nhập không thể kéo sang cột Chi cố định.");
        return;
      }
      if (isExpenseType && targetColumn === "income") {
        toast.warning("Khoản chi phí không thể kéo sang cột Thu nhập.");
        return;
      }

      const next = [...items];
      next[idx] = {
        ...next[idx],
        column: targetColumn,
        action: targetColumn === "personal" ? "skip" : "include",
      };
      setItems(next);
      onItemsChange(next);
    },
    [items, disabled, onItemsChange, fixedCatalogItemIds],
  );

  const handleAmountChange = useCallback(
    (index: number, amount: number) => {
      const next = [...items];
      next[index] = { ...next[index], amount };
      setItems(next);
      onItemsChange(next);
    },
    [items, onItemsChange],
  );

  // Collect other members' items that are in income/expense columns
  const otherItems = useMemo(() => {
    const result: OtherMemberItem[] = [];
    for (const [uid, mi] of Object.entries(allMemberItems)) {
      if (uid === currentUserId) continue;
      for (const item of mi.items) {
        if (item.column === "income" || item.column === "expense") {
          result.push({
            ...item,
            memberName: memberNames[uid] || uid.slice(0, 8),
            memberUid: uid,
          });
        }
      }
    }
    return result;
  }, [allMemberItems, currentUserId, memberNames]);

  const otherIncomeItems = otherItems.filter((i) => i.column === "income");
  const otherExpenseItems = otherItems.filter((i) => i.column === "expense");

  const personalItems = items.filter((i) => i.column === "personal");
  const myIncomeItems = items.filter((i) => i.column === "income");
  const myExpenseItems = items.filter((i) => i.column === "expense");

  // Quick-add form state
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addType, setAddType] = useState<"income" | "expense">("expense");

  const handleQuickAdd = () => {
    const parsed = parseCurrencyInput(addAmount) || 0;
    if (!addTitle.trim() || parsed <= 0) return;
    const newItem: MemberSessionItem = {
      fixedItemId: `_quick_${Date.now()}`,
      title: addTitle.trim(),
      amount: parsed,
      action: "skip",
      column: "personal",
      type: addType,
    };
    const next = [...items, newItem];
    setItems(next);
    onItemsChange(next);
    setAddTitle("");
    setAddAmount("");
    setShowAdd(false);
  };

  const handleDeletePersonalItem = useCallback(
    (index: number) => {
      const row = items[index];
      if (
        row?.fixedItemId != null &&
        fixedCatalogItemIds.has(row.fixedItemId)
      ) {
        toast.warning(
          "Không xóa được khoản từ khoản cố định. Tắt hoặc xóa trong Cài đặt → Khoản cố định.",
        );
        return;
      }
      const next = items.filter((_, i) => i !== index);
      setItems(next);
      onItemsChange(next);
    },
    [items, onItemsChange, fixedCatalogItemIds],
  );

  const closeAddForm = () => {
    setShowAdd(false);
    setAddTitle("");
    setAddAmount("");
  };

  const personalTotal = personalItems.reduce((s, i) => s + i.amount, 0);

  const incomeTotal =
    session.incomeItems.reduce((s, i) => s + i.amount, 0) +
    myIncomeItems.reduce((s, i) => s + i.amount, 0) +
    otherIncomeItems.reduce((s, i) => s + i.amount, 0);

  const expenseTotal =
    session.sharedExpenses.reduce((s, i) => s + i.amount, 0) +
    myExpenseItems.reduce((s, i) => s + i.amount, 0) +
    otherExpenseItems.reduce((s, i) => s + i.amount, 0);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {/* Cột 1: Kho cá nhân */}

        <DroppableColumn
          id="personal"
          title="Kho cá nhân"
          total={personalTotal}
          color="default"
        >
          {items.map(
            (item, idx) =>
              item.column === "personal" && (
                <ItemCard
                  key={idx}
                  item={item}
                  index={idx}
                  onAmountChange={handleAmountChange}
                  disabled={disabled}
                  onDelete={
                    item.fixedItemId == null ||
                    !fixedCatalogItemIds.has(item.fixedItemId)
                      ? handleDeletePersonalItem
                      : undefined
                  }
                />
              ),
          )}
          {personalItems.length === 0 && !showAdd && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Kéo thẻ vào đây để bỏ ra khỏi session
            </p>
          )}
          {!disabled && (
            <>
              {showAdd ? (
                <div className="rounded-md border border-dashed p-2 space-y-1.5">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                        addType === "income"
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      onClick={() => setAddType("income")}
                    >
                      Thu nhập
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                        addType === "expense"
                          ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      onClick={() => setAddType("expense")}
                    >
                      Chi phí
                    </button>
                  </div>
                  <Input
                    className="h-7 text-xs"
                    placeholder="Tên khoản"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
                  />
                  <CurrencyInput
                    className="h-7 text-xs"
                    placeholder="Số tiền"
                    value={addAmount}
                    onChange={setAddAmount}
                    onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      className="rounded px-2 py-0.5 text-[11px] bg-primary text-primary-foreground hover:opacity-90"
                      onClick={handleQuickAdd}
                    >
                      Thêm
                    </button>
                    <button
                      type="button"
                      className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                      onClick={closeAddForm}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="h-3 w-3" />
                  Thêm khoản
                </button>
              )}
            </>
          )}
        </DroppableColumn>

        {/* Cột 2: Quỹ chung */}
        <DroppableColumn
          id="income"
          title="Quỹ chung"
          total={incomeTotal}
          color="green"
        >
          {session.incomeItems.map((inc, i) => (
            <EditableSessionItem
              key={`session-inc-${i}`}
              label={inc.label}
              amount={inc.amount}
              color="green"
              canEdit={!disabled && isOwner && !!onSessionUpdate}
              onSave={(label, amount) => {
                const next = [...session.incomeItems];
                next[i] = { ...next[i], label, amount };
                onSessionUpdate?.({ incomeItems: next });
              }}
            />
          ))}
          {items.map(
            (item, idx) =>
              item.column === "income" && (
                <ItemCard
                  key={idx}
                  item={item}
                  index={idx}
                  disabled={disabled}
                />
              ),
          )}
          {otherIncomeItems.map((item, i) => (
            <div
              key={`other-inc-${i}`}
              className="rounded-md border border-dashed p-3 bg-green-50/50 dark:bg-green-950/50 text-sm"
            >
              <div className="flex justify-between items-center">
                <div>
                  <span>{item.title}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    ({item.memberName})
                  </span>
                </div>
                <span className="text-xs font-semibold text-green-600">
                  {fmt(item.amount)} đ
                </span>
              </div>
            </div>
          ))}
          {myIncomeItems.length === 0 &&
            otherIncomeItems.length === 0 &&
            session.incomeItems.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Kéo thẻ thu nhập vào đây
              </p>
            )}
        </DroppableColumn>

        {/* Cột 3: Chi cố định tháng này */}
        <DroppableColumn
          id="expense"
          title="Chi cố định tháng này"
          total={expenseTotal}
          color="red"
        >
          {session.sharedExpenses.map((exp, i) => (
            <EditableSessionItem
              key={`session-exp-${i}`}
              label={exp.title}
              amount={exp.amount}
              color="red"
              canEdit={!disabled && isOwner && !!onSessionUpdate}
              onSave={(title, amount) => {
                const next = [...session.sharedExpenses];
                next[i] = { ...next[i], title, amount };
                onSessionUpdate?.({ sharedExpenses: next });
              }}
            />
          ))}
          {items.map(
            (item, idx) =>
              item.column === "expense" && (
                <ItemCard
                  key={idx}
                  item={item}
                  index={idx}
                  disabled={disabled}
                />
              ),
          )}
          {otherExpenseItems.map((item, i) => (
            <div
              key={`other-exp-${i}`}
              className="rounded-md border border-dashed p-3 bg-red-50/50 dark:bg-red-950/50 text-sm"
            >
              <div className="flex justify-between items-center">
                <div>
                  <span>{item.title}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    ({item.memberName})
                  </span>
                </div>
                <span className="text-xs font-semibold text-red-500">
                  {fmt(item.amount)} đ
                </span>
              </div>
            </div>
          ))}
          {myExpenseItems.length === 0 &&
            otherExpenseItems.length === 0 &&
            session.sharedExpenses.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Kéo khoản chi cố định vào đây
              </p>
            )}
        </DroppableColumn>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-[11px] text-muted-foreground mb-0.5">
            Kho cá nhân
          </p>
          <p className="text-sm font-semibold text-muted-foreground">
            {fmt(personalTotal)} đ
          </p>
        </div>
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 p-3 text-center">
          <p className="text-[11px] text-green-600 mb-0.5">Tổng thu</p>
          <p className="text-sm font-semibold text-green-600">
            {fmt(incomeTotal)} đ
          </p>
        </div>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 p-3 text-center">
          <p className="text-[11px] text-red-500 mb-0.5">Tổng chi</p>
          <p className="text-sm font-semibold text-red-500">
            {fmt(expenseTotal)} đ
          </p>
        </div>
      </div>

      <div
        className={`rounded-lg border p-3 text-center ${
          incomeTotal - expenseTotal >= 0
            ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30"
            : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/30"
        }`}
      >
        <span className="text-xs text-muted-foreground">
          Còn lại sau chi cố định:{" "}
        </span>
        <span
          className={`text-base font-bold ${
            incomeTotal - expenseTotal >= 0
              ? "text-blue-600 dark:text-blue-400"
              : "text-orange-600 dark:text-orange-400"
          }`}
        >
          {fmt(incomeTotal - expenseTotal)} đ
        </span>
      </div>
    </DndContext>
  );
}

function EditableSessionItem({
  label,
  amount,
  color,
  canEdit,
  onSave,
}: {
  label: string;
  amount: number;
  color: "green" | "red";
  canEdit: boolean;
  onSave: (label: string, amount: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const [editAmount, setEditAmount] = useState(String(amount));

  const bg =
    color === "green"
      ? "bg-green-50 dark:bg-green-950"
      : "bg-red-50 dark:bg-red-950";
  const textColor = color === "green" ? "text-green-600" : "text-red-500";

  const handleSave = () => {
    const parsed = parseCurrencyInput(editAmount) || 0;
    onSave(editLabel.trim() || label, parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`rounded-md border p-2.5 ${bg} text-sm space-y-1.5`}>
        <Input
          className="h-7 text-xs"
          value={editLabel}
          onChange={(e) => setEditLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
        />
        <CurrencyInput
          className="h-7 text-xs"
          value={editAmount}
          onChange={setEditAmount}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <div className="flex gap-1 justify-end">
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] bg-primary text-primary-foreground hover:opacity-90"
            onClick={handleSave}
          >
            Lưu
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            onClick={() => {
              setEditLabel(label);
              setEditAmount(String(amount));
              setEditing(false);
            }}
          >
            Hủy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border p-3 ${bg} text-sm ${canEdit ? "cursor-pointer hover:opacity-90" : "opacity-80"}`}
      onClick={() => canEdit && setEditing(true)}
    >
      <div className="flex justify-between">
        <span>{label}</span>
        <span className={`text-xs font-semibold ${textColor}`}>
          {fmt(amount)} đ
        </span>
      </div>
    </div>
  );
}
