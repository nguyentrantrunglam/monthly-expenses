"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";
import type { YoutubeSearchResultItem } from "@/lib/youtube";

export async function fetchYoutubeSearchResults(
  query: string,
): Promise<YoutubeSearchResultItem[]> {
  const auth = getFirebaseAuth();
  const u = auth.currentUser;
  if (!u) throw new Error("Chưa đăng nhập");
  const token = await u.getIdToken();
  const q = query.trim();
  const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await res.json()) as {
    error?: string;
    items?: YoutubeSearchResultItem[];
  };
  if (!res.ok) {
    throw new Error(j.error ?? "Không tìm được");
  }
  return j.items ?? [];
}
