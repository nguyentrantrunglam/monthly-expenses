"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchYoutubeSearchResults } from "@/lib/youtube-search-client";
import {
  canonicalYoutubeWatchUrl,
  type YoutubeSearchResultItem,
} from "@/lib/youtube";
import { cn } from "@/lib/utils";
import { Link2, Loader2, Search } from "lucide-react";

type AddMode = "url" | "search";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionBusy: boolean;
  onAdd: (watchUrl: string) => Promise<void>;
};

export function AddTrackDialog({
  open,
  onOpenChange,
  actionBusy,
  onAdd,
}: Props) {
  const [mode, setMode] = useState<AddMode>("url");
  const [url, setUrl] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<YoutubeSearchResultItem[]>(
    [],
  );

  useEffect(() => {
    if (open) {
      setAddError(null);
      setSearchError(null);
      setSearchResults([]);
      setSearchQuery("");
    }
  }, [open]);

  const submitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      await onAdd(trimmed);
      setUrl("");
      onOpenChange(false);
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Không thêm được bài.",
      );
    }
  };

  const runSearch = async () => {
    setSearchError(null);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchError("Nhập ít nhất 2 ký tự.");
      return;
    }
    setSearchLoading(true);
    try {
      const items = await fetchYoutubeSearchResults(q);
      setSearchResults(items);
      if (items.length === 0) {
        setSearchError("Không có kết quả.");
      }
    } catch (err) {
      setSearchResults([]);
      setSearchError(
        err instanceof Error ? err.message : "Không tìm được.",
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const pickResult = async (videoId: string) => {
    setAddError(null);
    try {
      await onAdd(canonicalYoutubeWatchUrl(videoId));
      setUrl("");
      setSearchQuery("");
      setSearchResults([]);
      onOpenChange(false);
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Không thêm được bài.",
      );
    }
  };

  const busy = actionBusy || searchLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="border-b p-4 pb-3">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle>Thêm bài vào hàng chờ</DialogTitle>
            <DialogDescription>
              Dán link hoặc tìm theo từ khóa trên YouTube (kết quả hiển thị
              trong cửa sổ này).
            </DialogDescription>
          </DialogHeader>
          <div
            className="mt-4 flex gap-1 rounded-lg bg-muted p-1"
            role="tablist"
            aria-label="Cách thêm bài"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "url"}
              disabled={busy}
              onClick={() => setMode("url")}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "url"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              Link
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "search"}
              disabled={busy}
              onClick={() => setMode("search")}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "search"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              Tìm kiếm
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === "url" ? (
            <form id="add-yt-track-url" onSubmit={submitUrl} className="grid gap-4">
              <div className="space-y-2">
                <label htmlFor="yt-url-modal" className="text-sm font-medium">
                  Link YouTube
                </label>
                <Input
                  id="yt-url-modal"
                  type="url"
                  inputMode="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={actionBusy}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              {addError && (
                <p className="text-sm text-destructive" role="alert">
                  {addError}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={actionBusy}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={actionBusy || !url.trim()}>
                  {actionBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Thêm vào hàng chờ"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-2">
                  <label
                    htmlFor="yt-search-q"
                    className="text-sm font-medium"
                  >
                    Từ khóa
                  </label>
                  <Input
                    id="yt-search-q"
                    type="search"
                    placeholder="Tên bài, ca sĩ…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void runSearch();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  className="shrink-0 sm:w-auto"
                  disabled={busy || searchQuery.trim().length < 2}
                  onClick={() => void runSearch()}
                >
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Tìm"
                  )}
                </Button>
              </div>
              {searchError && (
                <p className="text-sm text-destructive" role="alert">
                  {searchError}
                </p>
              )}
              {addError && (
                <p className="text-sm text-destructive" role="alert">
                  {addError}
                </p>
              )}
              {searchResults.length > 0 && (
                <ul className="flex max-h-[min(50vh,22rem)] flex-col gap-1.5 overflow-y-auto pr-0.5">
                  {searchResults.map((item) => (
                    <li key={item.videoId}>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void pickResult(item.videoId)}
                        className={cn(
                          "flex w-full gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          actionBusy && "pointer-events-none opacity-60",
                        )}
                      >
                        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="line-clamp-2 text-sm font-medium leading-snug">
                            {item.title}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {item.channelTitle}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searchResults.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Kết quả tìm kiếm do YouTube cung cấp.
                </p>
              )}
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={actionBusy}
                >
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
