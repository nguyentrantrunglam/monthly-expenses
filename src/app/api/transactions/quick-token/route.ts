import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyIdToken, getFirebaseAdmin } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * POST /api/transactions/quick-token
 *
 * Tạo hoặc làm mới quick add token. Cần Bearer token Firebase ID.
 * Token được lưu trong users/{uid}.quickAddToken
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      return NextResponse.json(
        { error: "Thiếu token đăng nhập." },
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
        { error: "Bạn cần tham gia gia đình trước khi tạo link thêm nhanh." },
        { status: 403 }
      );
    }

    const quickAddToken = randomBytes(24).toString("base64url");
    await db.collection("users").doc(uid).set(
      { quickAddToken },
      { merge: true }
    );

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (req.headers.get("x-forwarded-proto") && req.headers.get("host")
        ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
        : `http://localhost:${process.env.PORT ?? 3000}`);

    const exampleUrl = new URL("/api/transactions/quick", baseUrl);
    exampleUrl.searchParams.set("token", quickAddToken);
    exampleUrl.searchParams.set("title", "Ăn phở");
    exampleUrl.searchParams.set("amount", "45000");
    exampleUrl.searchParams.set("category", "Ăn uống");

    return NextResponse.json({
      success: true,
      token: quickAddToken,
      exampleUrl: exampleUrl.toString(),
      message: "Đã tạo link thêm nhanh. Lưu link này để dùng.",
    });
  } catch (err) {
    console.error("[api/transactions/quick-token]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Không thể tạo token" },
      { status: 500 }
    );
  }
}
