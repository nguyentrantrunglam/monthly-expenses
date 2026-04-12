"use client";

import { useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getFixedItemDisplayTitle, parseCurrencyInput } from "@/lib/utils";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Plus } from "lucide-react";

function formatInstallmentEndDateVi(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const s = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

const DEFAULT_SOURCE_OPTIONS = [
  "SC",
  "HSBC",
  "Techcombank",
  "Vietcombank",
  "TPBank",
  "SPaylater",
];

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
  const [activeTab, setActiveTab] = useState<"all" | FixedItemCategory>("all");
  const [categoryName, setCategoryName] = useState<string>("");
  const [dayOfMonth, setDayOfMonth] = useState<string>("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentEndDate, setInstallmentEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormCategory, setAddFormCategory] = useState<FixedItemCategory>("expense");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState<FixedItemType>("fixed_recurring");
  const [editCategory, setEditCategory] =
    useState<FixedItemCategory>("expense");
  const [editCategoryName, setEditCategoryName] = useState<string>("");
  const [editDay, setEditDay] = useState("");
  const [editIsInstallment, setEditIsInstallment] = useState(false);
  const [editInstallmentEndDate, setEditInstallmentEndDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const categoryOptions = useMemo(() => {
    const custom = categories.map((c) => c.name);
    return [
      ...DEFAULT_SOURCE_OPTIONS,
      ...custom.filter((n) => !DEFAULT_SOURCE_OPTIONS.includes(n)),
    ];
  }, [categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const parsedAmount = parseCurrencyInput(amount);
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
        category: addFormCategory,
        categoryName: categoryName.trim() || null,
        dayOfMonth: parsedDay,
        isInstallment: addFormCategory === "expense" ? isInstallment : false,
        installmentEndDate:
          addFormCategory === "expense" &&
          isInstallment &&
          installmentEndDate.trim()
            ? installmentEndDate.trim()
            : null,
      });
      setTitle("");
      setAmount("");
      setCategoryName("");
      setDayOfMonth("");
      setIsInstallment(false);
      setInstallmentEndDate("");
      setShowAddModal(false);
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
    setEditIsInstallment(item.isInstallment ?? false);
    setEditInstallmentEndDate(item.installmentEndDate?.trim() ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const parsedAmount = parseCurrencyInput(editAmount);
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
        isInstallment: editCategory === "expense" ? editIsInstallment : false,
        installmentEndDate:
          editCategory === "expense" &&
          editIsInstallment &&
          editInstallmentEndDate.trim()
            ? editInstallmentEndDate.trim()
            : null,
      });
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-sm font-semibold">
            Danh sách khoản cố định của bạn
          </h2>
          <div className="flex items-center gap-2">
            <Dialog open={showAddModal} onOpenChange={(open) => {
              setShowAddModal(open);
              if (!open) setFormError(null);
              if (open) setAddFormCategory(activeTab === "all" ? "expense" : activeTab);
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Thêm khoản
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6">
                <DialogHeader>
                  <DialogTitle>Thêm khoản cố định mới</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div className="inline-flex rounded-lg border bg-muted/50 p-1 text-xs mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddFormCategory("income");
                        setIsInstallment(false);
                        setInstallmentEndDate("");
                      }}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                        addFormCategory === "income"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Thu nhập
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddFormCategory("expense")}
                      className={`ml-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                        addFormCategory === "expense"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Chi phí
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label>Tên khoản</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={addFormCategory === "income" ? "Ví dụ: Lương, Thu nhập phụ..." : "Ví dụ: Trả góp, Tiền nhà..."}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                    <Label>Số tiền (VND)</Label>
                    <CurrencyInput
                      value={amount}
                      onChange={setAmount}
                      placeholder="5,000,000"
                      required
                    />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nguồn tiền</Label>
                      <Select
                        value={categoryName || "__none__"}
                        onValueChange={(v) =>
                          setCategoryName(v === "__none__" ? "" : v)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Chọn nguồn tiền" />
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
                      <Label className="whitespace-nowrap">Ngày trong tháng (tùy chọn)</Label>
                      <Input
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(e.target.value)}
                        placeholder="1-31"
                        inputMode="numeric"
                      />
                    </div>
                    {addFormCategory === "expense" && (
                      <div className="space-y-1.5 flex items-center gap-3 sm:col-span-2">
                        <Label htmlFor="modal-is-installment" className="cursor-pointer">
                          Trả góp
                        </Label>
                        <Switch
                          id="modal-is-installment"
                          checked={isInstallment}
                          onCheckedChange={(v) => {
                            setIsInstallment(v);
                            if (!v) setInstallmentEndDate("");
                          }}
                          aria-label="Có phải khoản trả góp không"
                        />
                      </div>
                    )}
                    {addFormCategory === "expense" && isInstallment && (
                      <div className="sm:col-span-2 space-y-1.5">
                        <Label>Ngày kết thúc trả góp (tùy chọn)</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <DatePicker
                            value={installmentEndDate || undefined}
                            onChange={(v) => setInstallmentEndDate(v ?? "")}
                            placeholder="Chọn ngày trả hết"
                            className="min-w-[200px] max-w-xs flex-1"
                          />
                          {installmentEndDate ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="shrink-0"
                              onClick={() => setInstallmentEndDate("")}
                            >
                              Xóa ngày
                            </Button>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Từ tháng sau ngày này, khoản sẽ không còn tự thêm vào
                          session tháng mới (vẫn giữ trong phiên đã có sẵn).
                        </p>
                      </div>
                    )}
                  </div>
                  {formError && (
                    <p className="text-xs text-destructive">{formError}</p>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddModal(false)}
                    >
                      Hủy
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Đang lưu..." : "Lưu khoản cố định"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <div className="inline-flex rounded-lg border bg-muted/50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("income");
                setEditingId(null);
              }}
              className={`ml-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === "income"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Thu nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("expense");
                setEditingId(null);
              }}
              className={`ml-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === "expense"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Chi phí
            </button>
          </div>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : (activeTab === "all" ? items : items.filter((i) => i.category === activeTab)).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {activeTab === "all"
              ? "Chưa có khoản cố định nào."
              : activeTab === "income"
                ? "Chưa có khoản thu nhập cố định."
                : "Chưa có khoản chi phí cố định."}
          </p>
        ) : (
          <FixedItemsTable
            key={activeTab}
            items={activeTab === "all" ? items : items.filter((i) => i.category === activeTab)}
            showInstallmentColumn={activeTab === "expense" || activeTab === "all"}
            showCategoryColumn={activeTab === "all"}
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
            editIsInstallment={editIsInstallment}
            setEditIsInstallment={setEditIsInstallment}
            editInstallmentEndDate={editInstallmentEndDate}
            setEditInstallmentEndDate={setEditInstallmentEndDate}
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
        <h2 className="text-sm font-semibold">Nguồn tiền khoản cố định</h2>
        <p className="text-xs text-muted-foreground">
          {`Đã có sẵn: ${DEFAULT_SOURCE_OPTIONS.join(", ")}. Bạn có thể thêm nguồn tiền khác.`}
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
  editIsInstallment,
  setEditIsInstallment,
  editInstallmentEndDate,
  setEditInstallmentEndDate,
  editSaving,
  saveEdit,
  cancelEdit,
  startEdit,
  deleteItem,
  updateItem,
  categoryOptions,
  showInstallmentColumn = true,
  showCategoryColumn = false,
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
  editIsInstallment: boolean;
  setEditIsInstallment: (v: boolean) => void;
  editInstallmentEndDate: string;
  setEditInstallmentEndDate: (v: string) => void;
  editSaving: boolean;
  saveEdit: () => void;
  cancelEdit: () => void;
  startEdit: (item: FixedItem) => void;
  deleteItem: (id: string) => Promise<void>;
  updateItem: (id: string, data: Partial<FixedItem>) => Promise<void>;
  categoryOptions: string[];
  showInstallmentColumn?: boolean;
  showCategoryColumn?: boolean;
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
            <TableHead className="text-xs">Nguồn tiền</TableHead>
            {showCategoryColumn && (
              <TableHead className="text-xs">Thu / chi</TableHead>
            )}
            <TableHead className="text-xs">Loại</TableHead>
            <TableHead className="text-xs">Ngày</TableHead>
            {showInstallmentColumn && (
              <TableHead className="text-xs">Trả góp</TableHead>
            )}
            {showInstallmentColumn && (
              <TableHead className="text-xs whitespace-nowrap">
                Kết thúc TG
              </TableHead>
            )}
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
                  <CurrencyInput
                    className="h-7 text-xs w-28"
                    value={editAmount}
                    onChange={setEditAmount}
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
                {showCategoryColumn && (
                  <TableCell>
                    <Select
                      value={editCategory}
                      onValueChange={(v) => {
                        const c = v as FixedItemCategory;
                        setEditCategory(c);
                        if (c === "income") {
                          setEditIsInstallment(false);
                          setEditInstallmentEndDate("");
                        }
                      }}
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
                )}
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
                {showInstallmentColumn && (
                  <TableCell>
                    <Switch
                      checked={editIsInstallment}
                      onCheckedChange={(v) => {
                        setEditIsInstallment(v);
                        if (!v) setEditInstallmentEndDate("");
                      }}
                      size="sm"
                      aria-label="Trả góp"
                    />
                  </TableCell>
                )}
                {showInstallmentColumn && (
                  <TableCell>
                    <Input
                      type="date"
                      className="h-7 text-xs w-38"
                      value={editInstallmentEndDate}
                      onChange={(e) =>
                        setEditInstallmentEndDate(e.target.value)
                      }
                      disabled={
                        !editIsInstallment || editCategory === "income"
                      }
                    />
                  </TableCell>
                )}
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
                <TableCell>{getFixedItemDisplayTitle(item)}</TableCell>
                <TableCell>
                  {new Intl.NumberFormat("vi-VN").format(item.amount)} đ
                </TableCell>
                <TableCell>
                  {item.categoryName || (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                {showCategoryColumn && (
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
                )}
                <TableCell>
                  {item.type === "fixed_recurring"
                    ? "Lặp lại"
                    : "Hóa đơn biến đổi"}
                </TableCell>
                <TableCell>
                  {item.dayOfMonth ? `Ngày ${item.dayOfMonth}` : "-"}
                </TableCell>
                {showInstallmentColumn && (
                  <TableCell>
                    {item.isInstallment ? (
                      <span className="text-[10px] text-muted-foreground">Có</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">-</span>
                    )}
                  </TableCell>
                )}
                {showInstallmentColumn && (
                  <TableCell className="text-[11px] text-muted-foreground tabular-nums">
                    {item.isInstallment
                      ? formatInstallmentEndDateVi(item.installmentEndDate)
                      : "—"}
                  </TableCell>
                )}
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
  updateCategory: _updateCategory,
  deleteCategory,
}: CategoryManagerProps) {
  void _updateCategory;
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
          placeholder="Thêm nguồn tiền mới (vd: Lương, Tiền nhà)"
        />
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? "Đang lưu..." : "Thêm"}
        </Button>
      </form>

      {categories.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Chưa có nguồn tiền tùy chỉnh. Thêm nguồn tiền khác nếu cần.
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
                      `Xóa nguồn tiền \"${c.name}\"? Các khoản cố định đang dùng nguồn tiền này sẽ không bị xóa.`
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
