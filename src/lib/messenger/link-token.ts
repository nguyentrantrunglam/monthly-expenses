import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

const COLLECTION = "messenger_links";

/**
 * Lấy quickAddToken đã liên kết với senderId (Facebook PSID).
 */
export async function getLinkedToken(senderId: string): Promise<string | null> {
  getFirebaseAdmin();
  const db = getFirestore();
  const doc = await db.collection(COLLECTION).doc(senderId).get();
  return (doc.data()?.quickAddToken as string) ?? null;
}

/**
 * Liên kết senderId với quickAddToken. Kiểm tra token tồn tại trong users trước khi lưu.
 */
export async function linkToken(
  senderId: string,
  quickAddToken: string
): Promise<{ success: boolean; error?: string }> {
  getFirebaseAdmin();
  const db = getFirestore();

  const usersSnap = await db
    .collection("users")
    .where("quickAddToken", "==", quickAddToken.trim())
    .limit(1)
    .get();

  if (usersSnap.empty) {
    return { success: false, error: "Token không hợp lệ. Tạo link mới tại Cài đặt > Hồ sơ." };
  }

  await db.collection(COLLECTION).doc(senderId).set({
    quickAddToken: quickAddToken.trim(),
    linkedAt: new Date(),
  });

  return { success: true };
}
