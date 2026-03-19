import {
  addDoc,
  collection,
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";

export type NotificationType = "session" | "notes" | "calendar";

export interface NotificationPayload {
  type: NotificationType;
  createdBy: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(
  familyId: string,
  payload: NotificationPayload
) {
  const db = getFirestoreDb();
  const col = collection(db, "families", familyId, "notifications");
  await addDoc(col, {
    ...payload,
    readBy: [] as string[],
    createdAt: serverTimestamp(),
  });
}
