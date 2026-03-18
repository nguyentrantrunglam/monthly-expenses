import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getFirebaseAdmin } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      return NextResponse.json(
        { error: "Thiếu token đăng nhập" },
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
        { connected: false, isOwner: false, familyId: null }
      );
    }

    const familySnap = await db.collection("families").doc(familyId).get();
    const family = familySnap.data();
    const isOwner = family?.createdBy === uid;
    const connected = !!(family?.googleCalendar?.refreshToken);

    return NextResponse.json({
      connected,
      isOwner,
      familyId,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Lỗi kiểm tra trạng thái" },
      { status: 500 }
    );
  }
}
