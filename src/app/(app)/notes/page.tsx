"use client";

import { useState } from "react";
import { useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import { useSharedChecklist } from "@/hooks/useSharedChecklist";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StickyNote, Plus, Pencil, Trash2 } from "lucide-react";

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const months = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
  return `${day}/${months[m - 1]}/${y}`;
}

function isOverdue(dueDate: string) {
  return dueDate < new Date().toISOString().slice(0, 10);
}

export default function SharedNotesPage() {
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const { items, loading, addItem, toggleItem, updateItem, deleteItem } = useSharedChecklist();

  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user?.familyId || !family) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <StickyNote className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-medium">Chưa có gia đình</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bạn cần tạo hoặc tham gia gia đình để sử dụng ghi chú chung.
          </p>
        </div>
      </Card>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await addItem(newTitle.trim(), newDueDate || undefined);
      setNewTitle("");
      setNewDueDate("");
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item: { id: string; title: string; dueDate: string | null }) => {
    setEditId(item.id);
    setEditTitle(item.title);
    setEditDueDate(item.dueDate ?? "");
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await updateItem(editId, {
        title: editTitle.trim(),
        dueDate: editDueDate || null,
      });
      setEditId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const pending = items.filter((i) => !i.done);
  const completed = items.filter((i) => i.done);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ghi chú chung</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Checklist và ghi chú dùng chung cho cả gia đình
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Thêm mục
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Thêm mục mới</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Nội dung
                </label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Nhập nội dung..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Hạn chót (tùy chọn)
                </label>
                <div className="flex gap-2">
                  <DatePicker
                    value={newDueDate}
                    onChange={setNewDueDate}
                    placeholder="Chọn ngày"
                    className="flex-1"
                  />
                  {newDueDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewDueDate("")}
                    >
                      Bỏ chọn
                    </Button>
                  )}
                </div>
              </div>
              <Button type="submit" disabled={adding || !newTitle.trim()}>
                {adding ? "Đang thêm..." : "Thêm"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <StickyNote className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Chưa có ghi chú nào</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nhấn &quot;Thêm mục&quot; để tạo checklist chung cho gia đình
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <Card className="p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Cần làm ({pending.length})
              </p>
              <ul className="space-y-1">
                {pending.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-transparent hover:border-border/60 px-3 py-2 group"
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => toggleItem(item.id, true)}
                    />
                    {editId === item.id ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <DatePicker
                            value={editDueDate}
                            onChange={setEditDueDate}
                            placeholder="Hạn chót"
                            className="h-8 text-xs flex-1"
                          />
                          <Button size="sm" onClick={saveEdit} disabled={saving}>
                            Lưu
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditId(null)}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm">{item.title}</span>
                          {item.dueDate && (
                            <span
                              className={`ml-2 text-[11px] ${
                                isOverdue(item.dueDate)
                                  ? "text-red-500 font-medium"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {formatDate(item.dueDate)}
                              {isOverdue(item.dueDate) && " (quá hạn)"}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                            onClick={() => startEdit(item)}
                            title="Sửa"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              if (confirm("Xóa mục này?")) deleteItem(item.id);
                            }}
                            title="Xóa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {completed.length > 0 && (
            <Card className="p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Đã xong ({completed.length})
              </p>
              <ul className="space-y-1">
                {completed.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 group opacity-75 hover:opacity-100"
                  >
                    <Checkbox
                      checked
                      onCheckedChange={() => toggleItem(item.id, false)}
                    />
                    {editId === item.id ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <DatePicker
                            value={editDueDate}
                            onChange={setEditDueDate}
                            placeholder="Hạn chót"
                            className="h-8 text-xs flex-1"
                          />
                          <Button size="sm" onClick={saveEdit} disabled={saving}>
                            Lưu
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditId(null)}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm line-through text-muted-foreground">
                            {item.title}
                          </span>
                          {item.dueDate && (
                            <span className="ml-2 text-[11px] text-muted-foreground">
                              {formatDate(item.dueDate)}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                            onClick={() => startEdit(item)}
                            title="Sửa"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              if (confirm("Xóa mục này?")) deleteItem(item.id);
                            }}
                            title="Xóa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
