"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { useAuthStore } from "@/lib/stores/authStore";

export type FixedItemType = "fixed_recurring" | "variable_bill";
export type FixedItemCategory = "income" | "expense";

export interface FixedItem {
  id: string;
  title: string;
  amount: number;
  type: FixedItemType;
  /** Thu nhập / Chi phí */
  category: FixedItemCategory;
  /** Danh mục chi tiết, ví dụ: Tiền nhà, Ăn uống... */
  categoryName: string | null;
  dayOfMonth: number | null;
  tag: "personal" | "shared";
  isActive: boolean;
}

export interface FixedItemCategoryMeta {
  id: string;
  name: string;
}

export function useFixedItems() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<FixedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<FixedItemCategoryMeta[]>([]);

  useEffect(() => {
    if (!user?.familyId || !user.uid) {
      setItems([]);
      setCategories([]);
      return;
    }
    const db = getFirestoreDb();
    const col = collection(
      db,
      "families",
      user.familyId,
      "fixedItems"
    );
    const q = query(col, orderBy("createdAt", "desc"));
    setLoading(true);
    const catCol = collection(
      db,
      "families",
      user.familyId,
      "fixedItemCategories"
    );
    const catQuery = query(catCol, orderBy("createdAt", "asc"));

    const unsubItems = onSnapshot(
      q,
      (snap) => {
        const next: FixedItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data.userId !== user.uid) return; // chỉ lấy khoản cá nhân của mình
          next.push({
            id: docSnap.id,
            title: data.title,
            amount: data.amount,
            type: data.type,
            category: data.category ?? "expense",
            categoryName: data.categoryName ?? null,
            dayOfMonth: data.dayOfMonth ?? null,
            tag: data.tag ?? "personal",
            isActive: data.isActive ?? true,
          });
        });
        setItems(next);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setError("Không tải được danh sách khoản cố định.");
        setLoading(false);
      }
    );
    const unsubCats = onSnapshot(
      catQuery,
      (snap) => {
        const next: FixedItemCategoryMeta[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          next.push({
            id: d.id,
            name: data.name as string,
          });
        });
        setCategories(next);
      },
      (e) => {
        console.error(e);
      }
    );
    return () => {
      unsubItems();
      unsubCats();
    };
  }, [user?.familyId, user?.uid]);

  const addItem = async (input: {
    title: string;
    amount: number;
    type: FixedItemType;
    category: FixedItemCategory;
    categoryName: string | null;
    dayOfMonth: number | null;
  }) => {
    if (!user?.familyId || !user.uid) {
      throw new Error("Chưa có gia đình hoặc user.");
    }
    const db = getFirestoreDb();
    const col = collection(
      db,
      "families",
      user.familyId,
      "fixedItems"
    );
    await addDoc(col, {
      userId: user.uid,
      title: input.title,
      amount: input.amount,
      type: input.type,
      category: input.category,
      categoryName: input.categoryName,
      dayOfMonth: input.dayOfMonth,
      tag: "personal",
      isActive: true,
      createdAt: new Date(),
    });
  };

  const updateItem = async (id: string, patch: Partial<FixedItem>) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(
      db,
      "families",
      user.familyId,
      "fixedItems",
      id
    );
    const { id: _id, ...rest } = patch as any;
    await updateDoc(ref, rest);
  };

  const deleteItem = async (id: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(
      db,
      "families",
      user.familyId,
      "fixedItems",
      id
    );
    await deleteDoc(ref);
  };

  const addCategory = async (name: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const col = collection(
      db,
      "families",
      user.familyId,
      "fixedItemCategories"
    );
    await addDoc(col, {
      name: name.trim(),
      createdAt: new Date(),
    });
  };

  const updateCategory = async (id: string, name: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(
      db,
      "families",
      user.familyId,
      "fixedItemCategories",
      id
    );
    await updateDoc(ref, { name: name.trim() });
  };

  const deleteCategory = async (id: string) => {
    if (!user?.familyId) return;
    const db = getFirestoreDb();
    const ref = doc(
      db,
      "families",
      user.familyId,
      "fixedItemCategories",
      id
    );
    await deleteDoc(ref);
  };

  return {
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
  };
}

