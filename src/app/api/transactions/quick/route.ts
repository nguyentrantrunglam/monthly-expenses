import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

const CATEGORIES = [
  "Ăn uống",
  "Di chuyển",
  "Mua sắm",
  "Giải trí",
  "Sức khỏe",
  "Giáo dục",
  "Hóa đơn",
  "Khác",
];

/**
 * GET /api/transactions/quick
 *
 * Thêm chi tiêu nhanh bằng URL. Chỉ cần mở link trong trình duyệt.
 *
 * Query params:
 * - token (bắt buộc): Quick add token từ Cài đặt > Hồ sơ
 * - title: Tên chi tiêu
 * - amount: Số tiền (VND)
 * - category: Danh mục (mặc định: Khác)
 * - date: yyyy-MM-dd (mặc định: hôm nay)
 * - spendingType: personal | shared_pool (mặc định: personal)
 * - note: Ghi chú
 *
 * Ví dụ:
 * /api/transactions/quick?token=xxx&title=Ăn%20phở&amount=45000&category=Ăn%20uống
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "Thiếu token. Lấy token tại Cài đặt > Hồ sơ > Link thêm nhanh." },
        { status: 400 }
      );
    }

    getFirebaseAdmin();
    const db = getFirestore();
    const usersSnap = await db
      .collection("users")
      .where("quickAddToken", "==", token)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      return NextResponse.json(
        { error: "Token không hợp lệ hoặc đã hết hạn." },
        { status: 401 }
      );
    }

    const userDoc = usersSnap.docs[0];
    const uid = userDoc.id;
    const familyId = userDoc.data()?.familyId as string | undefined;

    if (!familyId) {
      return NextResponse.json(
        { error: "Bạn cần tham gia gia đình để thêm chi tiêu." },
        { status: 403 }
      );
    }

    const title = searchParams.get("title")?.trim() || "Chi tiêu";
    const amount = parseInt(searchParams.get("amount") ?? "0", 10);
    const category = validateCategory(searchParams.get("category"));
    const date = validateDate(searchParams.get("date"));
    const spendingType =
      searchParams.get("spendingType") === "shared_pool"
        ? "shared_pool"
        : "personal";
    const note = searchParams.get("note")?.trim() ?? "";

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Số tiền phải lớn hơn 0." },
        { status: 400 }
      );
    }

    const col = db
      .collection("families")
      .doc(familyId)
      .collection("transactions");

    const ref = await col.add({
      title,
      amount,
      category,
      date,
      spendingType,
      note,
      type: "expense",
      allocationUserId: spendingType === "personal" ? uid : null,
      userId: uid,
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      id: ref.id,
      message: `Đã thêm: ${title} - ${amount.toLocaleString("vi-VN")} đ`,
    });
  } catch (err) {
    console.error("[api/transactions/quick]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Không thể thêm chi tiêu" },
      { status: 500 }
    );
  }
}

function validateCategory(cat: string | null): string {
  const s = String(cat ?? "").trim();
  return CATEGORIES.includes(s) ? s : "Khác";
}

function validateDate(d: string | null): string {
  const s = String(d ?? "").trim();
  if (!s) return new Date().toISOString().slice(0, 10);
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return new Date().toISOString().slice(0, 10);
}
