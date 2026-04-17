"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { fetchYoutubeSearchResults } from "@/lib/youtube-search-client";
import {
  canonicalYoutubeWatchUrl,
  type YoutubeSearchResultItem,
} from "@/lib/youtube";
import { Loader2, Search } from "lucide-react";

type Props = {
  actionBusy: boolean;
  onAdd: (watchUrl: string) => Promise<void>;
};

export function InlineTrackSearch({ actionBusy, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<YoutubeSearchResultItem[]>([]);
  const [resultsOpen, setResultsOpen] = useState(false);

  const runSearch = async () => {
    const q = query.trim();
    setError(null);
    if (q.length < 2) {
      setError("Nhập ít nhất 2 ký tự để tìm bài.");
      return;
    }
    setLoading(true);
    try {
      const items = await fetchYoutubeSearchResults(q);
      setResults(items);
      setResultsOpen(items.length > 0);
      if (items.length === 0) {
        setError("Không có kết quả phù hợp.");
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Không tìm được bài.");
    } finally {
      setLoading(false);
    }
  };

  const pickTrack = async (videoId: string) => {
    setError(null);
    try {
      await onAdd(canonicalYoutubeWatchUrl(videoId));
      setQuery("");
      setResults([]);
      setResultsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thêm được bài.");
    }
  };

  const busy = actionBusy || loading;

  return (
    <div className="space-y-3">
      <Popover
        open={resultsOpen}
        onOpenChange={(open) => {
          setResultsOpen(open);
          if (!open) setResults([]);
        }}
      >
        <PopoverAnchor asChild>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Input
                type="search"
                placeholder="Tìm bài hát, ca sĩ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
              onClick={() => void runSearch()}
              disabled={busy || query.trim().length < 2}
              className="gap-2 sm:w-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Tìm nhạc
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-[min(42rem,calc(100vw-2rem))] p-2">
          <ul className="grid gap-1.5">
            {results.slice(0, 6).map((item) => (
              <li key={item.videoId}>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void pickTrack(item.videoId)}
                  className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted"
                >
                  <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {item.channelTitle}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
