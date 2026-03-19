import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getFirebaseAdmin } from "@/lib/firebase/admin";
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
 * POST /api/transactions
 *
 * Lưu chi tiêu (expense). Cần Bearer token Firebase ID.
 *
 * Payload (single):
 * {
 *   "title": "Ăn phở",
 *   "amount": 45000,
 *   "category": "Ăn uống",
 *   "date": "2026-03-19",
 *   "spendingType": "personal",
 *   "note": ""
 * }
 *
 * Payload (batch):
 * {
 *   "transactions": [
 *     { "title": "...", "amount": 45000, "category": "...", "date": "..." },
 *     ...
 *   ],
 *   "spendingType": "personal",
 *   "note": ""
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      return NextResponse.json(
        { error: "Thiếu token đăng nhập. Gửi Authorization: Bearer <firebase_id_token>" },
        { status: 401 }
      );
    }

    const decoded = await verifyIdToken(token);
    const uid = decoded.uid;

    getFirebaseAdmin();
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const familyId = userSnap.data()?.familyId as string | undefined;

    if (!familyId) {
      return NextResponse.json(
        { error: "Bạn cần tham gia gia đình để thêm chi tiêu" },
        { status: 403 }
      );
    }

    const body = await req.json();

    let items: Array<{
      title: string;
      amount: number;
      category: string;
      date: string;
      spendingType: "personal" | "shared_pool";
      note: string;
    }> = [];

    if (Array.isArray(body.transactions)) {
      const defaultSpendingType =
        body.spendingType === "shared_pool" ? "shared_pool" : "personal";
      const defaultNote = String(body.note ?? "").trim();
      for (const t of body.transactions) {
        items.push({
          title: String(t.title ?? "").trim() || "Chi tiêu",
          amount: Number(t.amount) || 0,
          category: validateCategory(t.category),
          date: validateDate(t.date),
          spendingType: defaultSpendingType,
          note: defaultNote,
        });
      }
    } else {
      items.push({
        title: String(body.title ?? "").trim() || "Chi tiêu",
        amount: Number(body.amount) || 0,
        category: validateCategory(body.category),
        date: validateDate(body.date),
        spendingType:
          body.spendingType === "shared_pool" ? "shared_pool" : "personal",
        note: String(body.note ?? "").trim(),
      });
    }

    const valid = items.filter((i) => i.amount > 0);
    if (valid.length === 0) {
      return NextResponse.json(
        { error: "Không có khoản chi tiêu hợp lệ (amount > 0)" },
        { status: 400 }
      );
    }

    const col = db.collection("families").doc(familyId).collection("transactions");
    const created: { id: string }[] = [];

    for (const item of valid) {
      const ref = await col.add({
        ...item,
        type: "expense",
        allocationUserId: item.spendingType === "personal" ? uid : null,
        userId: uid,
        createdAt: new Date(),
      });
      created.push({ id: ref.id });
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      ids: created.map((c) => c.id),
    });
  } catch (err) {
    console.error("[api/transactions]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Không thể lưu chi tiêu" },
      { status: 500 }
    );
  }
}

function validateCategory(cat: unknown): string {
  const s = String(cat ?? "").trim();
  return CATEGORIES.includes(s) ? s : "Khác";
}

function validateDate(d: unknown): string {
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
