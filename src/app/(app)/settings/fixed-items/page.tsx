"use client";

import { useState } from "react";
import {
  useFixedItems,
  type FixedItemType,
  type FixedItemCategory,
  type FixedItem,
  type FixedItemCategoryMeta,
} from "@/hooks/useFixedItems";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export default function FixedItemsSettingsPage() {
  const {
    items,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useFixedItems();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<FixedItemType>("fixed_recurring");
  const [category, setCategory] = useState<FixedItemCategory>("expense");
  const [categoryName, setCategoryName] = useState<string>("");
  const [dayOfMonth, setDayOfMonth] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState<FixedItemType>("fixed_recurring");
  const [editCategory, setEditCategory] =
    useState<FixedItemCategory>("expense");
  const [editCategoryName, setEditCategoryName] = useState<string>("");
  const [editDay, setEditDay] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const categoryOptions = categories.map((c) => c.name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const parsedAmount = Number(amount.replace(/\s/g, ""));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError("Số tiền không hợp lệ.");
      setSubmitting(false);
      return;
    }
    const parsedDay =
      dayOfMonth.trim() === "" ? null : Number.parseInt(dayOfMonth, 10);
    try {
      await addItem({
        title: title.trim(),
        amount: parsedAmount,
        type,
        category,
        categoryName: categoryName.trim() || null,
        dayOfMonth: parsedDay,
      });
      setTitle("");
      setAmount("");
      setCategoryName("");
      setDayOfMonth("");
    } catch (err) {
      console.error(err);
      setFormError("Không lưu được khoản cố định. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item: FixedItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditAmount(String(item.amount));
    setEditType(item.type);
    setEditCategory(item.category);
    setEditCategoryName(item.categoryName ?? "");
    setEditDay(item.dayOfMonth ? String(item.dayOfMonth) : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const parsedAmount = Number(editAmount.replace(/\s/g, ""));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) return;
    const parsedDay =
      editDay.trim() === "" ? null : Number.parseInt(editDay, 10);
    setEditSaving(true);
    try {
      await updateItem(editingId, {
        title: editTitle.trim(),
        amount: parsedAmount,
        type: editType,
        category: editCategory,
        categoryName: editCategoryName.trim() || null,
        dayOfMonth: parsedDay,
      } as any);
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Khoản cố định cá nhân
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Thiết lập các khoản thu/chi cố định hàng tháng. Các khoản này sẽ
          xuất hiện trong phiên session tháng.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold">Thêm khoản cố định mới</h2>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Tên khoản</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Trả góp, Lương..."
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Số tiền (VND)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5000000"
              inputMode="numeric"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Danh mục</Label>
            <Select
              value={categoryName || "__none__"}
              onValueChange={(v) =>
                setCategoryName(v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn danh mục" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Không chọn</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phân loại</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FixedItemCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Chi phí</SelectItem>
                <SelectItem value="income">Thu nhập</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Loại</Label>
            <Select value={type} onValueChange={(v) => setType(v as FixedItemType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_recurring">Lặp lại hàng tháng</SelectItem>
                <SelectItem value="variable_bill">Hóa đơn biến đổi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ngày trong tháng (tùy chọn)</Label>
            <Input
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              placeholder="1-31"
              inputMode="numeric"
            />
          </div>
          {formError && (
            <p className="md:col-span-5 text-xs text-destructive">
              {formError}
            </p>
          )}
          <div className="md:col-span-5 flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Đang lưu..." : "Lưu khoản cố định"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold">
          Danh sách khoản cố định của bạn
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Bạn chưa có khoản cố định nào.
          </p>
        ) : (
          <FixedItemsTable
            items={items}
            editingId={editingId}
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            editAmount={editAmount}
            setEditAmount={setEditAmount}
            editCategoryName={editCategoryName}
            setEditCategoryName={setEditCategoryName}
            editCategory={editCategory}
            setEditCategory={setEditCategory}
            editType={editType}
            setEditType={setEditType}
            editDay={editDay}
            setEditDay={setEditDay}
            editSaving={editSaving}
            saveEdit={saveEdit}
            cancelEdit={cancelEdit}
            startEdit={startEdit}
            deleteItem={deleteItem}
            updateItem={updateItem}
            categoryOptions={categoryOptions}
          />
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold">Danh mục khoản cố định</h2>
        <p className="text-xs text-muted-foreground">
          Dùng để gán nhanh cho các khoản cố định (ví dụ: Tiền nhà, Ăn uống...).
        </p>
        <CategoryManager
          categories={categories}
          addCategory={addCategory}
          updateCategory={updateCategory}
          deleteCategory={deleteCategory}
        />
      </Card>
    </div>
  );
}

const FIXED_PAGE_SIZE = 10;

function FixedItemsTable({
  items,
  editingId,
  editTitle,
  setEditTitle,
  editAmount,
  setEditAmount,
  editCategoryName,
  setEditCategoryName,
  editCategory,
  setEditCategory,
  editType,
  setEditType,
  editDay,
  setEditDay,
  editSaving,
  saveEdit,
  cancelEdit,
  startEdit,
  deleteItem,
  updateItem,
  categoryOptions,
}: {
  items: FixedItem[];
  editingId: string | null;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editAmount: string;
  setEditAmount: (v: string) => void;
  editCategoryName: string;
  setEditCategoryName: (v: string) => void;
  editCategory: FixedItemCategory;
  setEditCategory: (v: FixedItemCategory) => void;
  editType: FixedItemType;
  setEditType: (v: FixedItemType) => void;
  editDay: string;
  setEditDay: (v: string) => void;
  editSaving: boolean;
  saveEdit: () => void;
  cancelEdit: () => void;
  startEdit: (item: FixedItem) => void;
  deleteItem: (id: string) => Promise<void>;
  updateItem: (id: string, data: any) => Promise<void>;
  categoryOptions: string[];
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / FIXED_PAGE_SIZE));
  const paged = items.slice(
    (page - 1) * FIXED_PAGE_SIZE,
    page * FIXED_PAGE_SIZE
  );

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Tên</TableHead>
            <TableHead className="text-xs">Số tiền</TableHead>
            <TableHead className="text-xs">Danh mục</TableHead>
            <TableHead className="text-xs">Thu / chi</TableHead>
            <TableHead className="text-xs">Loại</TableHead>
            <TableHead className="text-xs">Ngày</TableHead>
            <TableHead className="text-xs">Trạng thái</TableHead>
            <TableHead className="text-xs text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((item) =>
            editingId === item.id ? (
              <TableRow key={item.id}>
                <TableCell>
                  <Input
                    className="h-7 text-xs"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-7 text-xs w-28"
                    inputMode="numeric"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={editCategoryName || "__none__"}
                    onValueChange={(v) =>
                      setEditCategoryName(v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger size="sm">
                      <SelectValue placeholder="Chọn" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Không chọn</SelectItem>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={editCategory}
                    onValueChange={(v) =>
                      setEditCategory(v as FixedItemCategory)
                    }
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Chi phí</SelectItem>
                      <SelectItem value="income">Thu nhập</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={editType}
                    onValueChange={(v) => setEditType(v as FixedItemType)}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_recurring">Lặp lại</SelectItem>
                      <SelectItem value="variable_bill">Biến đổi</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-7 text-xs w-16"
                    inputMode="numeric"
                    placeholder="1-31"
                    value={editDay}
                    onChange={(e) => setEditDay(e.target.value)}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.isActive ? "Đang dùng" : "Tạm tắt"}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    disabled={editSaving}
                    onClick={saveEdit}
                  >
                    {editSaving ? "Lưu..." : "Lưu"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={cancelEdit}
                  >
                    Hủy
                  </button>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={item.id}>
                <TableCell>{item.title}</TableCell>
                <TableCell>
                  {new Intl.NumberFormat("vi-VN").format(item.amount)} đ
                </TableCell>
                <TableCell>
                  {item.categoryName || (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      item.category === "income"
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    }`}
                  >
                    {item.category === "income" ? "Thu nhập" : "Chi phí"}
                  </span>
                </TableCell>
                <TableCell>
                  {item.type === "fixed_recurring"
                    ? "Lặp lại"
                    : "Hóa đơn biến đổi"}
                </TableCell>
                <TableCell>
                  {item.dayOfMonth ? `Ngày ${item.dayOfMonth}` : "-"}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() =>
                      updateItem(item.id, { isActive: !item.isActive })
                    }
                  >
                    {item.isActive ? "Đang dùng" : "Tạm tắt"}
                  </button>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => startEdit(item)}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="text-xs text-destructive underline"
                    onClick={() => {
                      if (
                        confirm(
                          "Bạn có chắc muốn xóa khoản cố định này? Thay đổi chỉ áp dụng cho session tương lai."
                        )
                      ) {
                        deleteItem(item.id);
                      }
                    }}
                  >
                    Xóa
                  </button>
                </TableCell>
              </TableRow>
            )
          )}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Trang {page}/{pageCount}
          </p>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Trước"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page <= 1}
                  className={
                    page <= 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  text="Sau"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-disabled={page >= pageCount}
                  className={
                    page >= pageCount
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

type CategoryManagerProps = {
  categories: FixedItemCategoryMeta[];
  addCategory: (name: string) => Promise<void>;
  updateCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
};

function CategoryManager({
  categories,
  addCategory,
  updateCategory,
  deleteCategory,
}: CategoryManagerProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addCategory(name);
      setName("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Thêm danh mục mới (vd: Tiền nhà)"
        />
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? "Đang lưu..." : "Thêm"}
        </Button>
      </form>

      {categories.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Chưa có danh mục nào. Hãy thêm ít nhất 1 danh mục để dùng cho khoản
          cố định.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              <span>{c.name}</span>
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      `Xóa danh mục \"${c.name}\"? Các khoản cố định đang dùng danh mục này sẽ không bị xóa.`
                    )
                  ) {
                    deleteCategory(c.id);
                  }
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
