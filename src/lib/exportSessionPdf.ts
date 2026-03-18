import { jsPDF } from "jspdf";
import type { Session, MemberSessionItem } from "@/hooks/useSession";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

/** Chuyển tiếng Việt sang ASCII cho font Helvetica (không hỗ trợ Unicode) */
function toAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

interface ExportSessionPdfOptions {
  session: Session;
  boardItems: MemberSessionItem[];
  memberNames: Record<string, string>;
  allMemberItems: Record<string, { items?: MemberSessionItem[] }>;
  allocationItems?: { type: string; userId: string | null; label: string; amount: number }[];
  memberSpending?: Record<string, { personal: number; shared: number }>;
  totalSharedSpending?: number;
}

export function exportSessionPdf(options: ExportSessionPdfOptions): void {
  const {
    session,
    boardItems,
    memberNames,
    allMemberItems,
    allocationItems = [],
    memberSpending = {},
    totalSharedSpending = 0,
  } = options;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  let y = 20;
  const t = toAscii;

  const pageHeight = doc.internal.pageSize.getHeight();
  const addText = (text: string, fontSize = 10, x = margin) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(fontSize);
    doc.text(text, x, y);
    y += fontSize * 0.5;
  };

  const addSection = (title: string) => {
    y += 5;
    doc.setFontSize(12);
    addText(title, 12);
    doc.setFontSize(10);
    y += 3;
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  addText(`${t("Session tháng")} ${session.month}`, 16);
  doc.setFont("helvetica", "normal");
  addText(`${t("Trạng thái")}: ${session.status === "locked" ? t("Đã chốt") : t("Đang mở")}`, 10);
  y += 8;

  // Thu nhập
  addSection(t("Thu nhập (Quỹ chung)"));
  const incomeTotal = session.incomeItems.reduce((s, i) => s + i.amount, 0);
  for (const item of session.incomeItems) {
    const label = item.label ? t(item.label) : t("(Không tên)");
    addText(`  - ${label}: ${fmt(item.amount)} d`, 9);
  }
  addText(`${t("Tổng thu")}: ${fmt(incomeTotal)} d`, 9, margin + 5);
  y += 3;

  // Chi phí chung
  addSection(t("Chi phí cố định chung"));
  const expenseTotal = session.sharedExpenses.reduce((s, e) => s + e.amount, 0);
  for (const item of session.sharedExpenses) {
    const title = item.title ? t(item.title) : t("(Không tên)");
    addText(`  - ${title}: ${fmt(item.amount)} d`, 9);
  }
  addText(`${t("Tổng chi cố định")}: ${fmt(expenseTotal)} d`, 9, margin + 5);
  y += 3;

  // Tổng kết
  const remaining = incomeTotal - expenseTotal;
  addSection(t("Tổng kết"));
  addText(`${t("Tổng thu")}: ${fmt(incomeTotal)} d`, 10);
  addText(`${t("Tổng chi cố định")}: ${fmt(expenseTotal)} d`, 10);
  addText(`${t("Còn lại")}: ${fmt(remaining)} d`, 10);
  y += 8;

  // Chi tiêu cá nhân
  addSection(t("Chi tiêu cá nhân (thành viên)"));
  for (const [uid, mi] of Object.entries(allMemberItems)) {
    const name = memberNames[uid] ? t(memberNames[uid]) : uid.slice(0, 8);
    const items = (mi.items ?? []).filter(
      (i) => i.column === "personal" && i.action === "include"
    );
    if (items.length === 0) continue;
    addText(`${name}:`, 9);
    for (const item of items) {
      addText(`  - ${t(item.title)}: ${fmt(item.amount)} d`, 8, margin + 5);
    }
    y += 2;
  }

  addSection(t("Quỹ chung (từ chi tiêu cá nhân)"));
  for (const item of boardItems.filter((i) => i.column === "income" && i.action === "include")) {
    addText(`  - ${t(item.title)}: ${fmt(item.amount)} d`, 9);
  }

  addSection(t("Chi phí chung (từ chi tiêu cá nhân)"));
  for (const item of boardItems.filter((i) => i.column === "expense" && i.action === "include")) {
    addText(`  - ${t(item.title)}: ${fmt(item.amount)} d`, 9);
  }

  // Allocation (khi đã chốt)
  if (session.status === "locked" && allocationItems.length > 0) {
    y += 5;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    addSection(t("Phân chia ngân sách"));
    for (const ai of allocationItems) {
      const spent =
        ai.type === "personal" && ai.userId
          ? memberSpending[ai.userId]?.personal ?? 0
          : ai.type === "shared_pool"
            ? totalSharedSpending
            : 0;
      const remain = ai.amount - spent;
      const label = ai.type === "shared_pool" ? t(ai.label) : `${memberNames[ai.userId ?? ""] ? t(memberNames[ai.userId ?? ""]) : ""} - ${t(ai.label)}`;
      addText(`${label}:`, 9);
      addText(`  ${t("Được chia")}: ${fmt(ai.amount)} d | ${t("Đã chi")}: ${fmt(spent)} d | ${t("Còn lại")}: ${fmt(remain)} d`, 8, margin + 5);
    }
  }

  doc.save(`session-${session.month}.pdf`);
}
