import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";
import { verifyIdToken, getFirebaseAdmin } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const familyId = body?.familyId as string | undefined;
    if (!familyId) {
      return NextResponse.json(
        { error: "Thiếu familyId" },
        { status: 400 }
      );
    }

    getFirebaseAdmin();
    const db = getFirestore();
    const familyRef = db.collection("families").doc(familyId);
    const familySnap = await familyRef.get();
    if (!familySnap.exists) {
      return NextResponse.json({ error: "Không tìm thấy gia đình" }, { status: 404 });
    }
    const family = familySnap.data();
    if (family?.createdBy !== uid) {
      return NextResponse.json(
        { error: "Chỉ chủ gia đình mới có thể kết nối Google Calendar" },
        { status: 403 }
      );
    }

    const url = getAuthUrl(familyId);
    return NextResponse.json({ url });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Lỗi khi tạo URL kết nối" },
      { status: 500 }
    );
  }
}
