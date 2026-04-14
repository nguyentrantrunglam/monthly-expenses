"use client";

import { useState } from "react";
import { useCommunityMusic } from "@/hooks/useCommunityMusic";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, SkipForward, ListMusic } from "lucide-react";
import { AddTrackDialog } from "@/components/family-music/AddTrackDialog";
import { FamilyMusicPlayer } from "@/components/family-music/FamilyMusicPlayer";
import { FamilyMusicPlaylist } from "@/components/family-music/FamilyMusicPlaylist";

export default function CommunityMusicPage() {
  const {
    state,
    loading,
    error,
    actionBusy,
    currentItem,
    addFromUrl,
    goNext,
    selectQueueItem,
    removeQueueItem,
    reorderQueue,
    publishPlaybackState,
  } = useCommunityMusic();
  const [localError, setLocalError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const handleNext = async () => {
    setLocalError(null);
    try {
      await goNext();
    } catch {
      setLocalError("Không chuyển được bài.");
    }
  };

  const handleSelectFromPlaylist = async (itemId: string) => {
    setLocalError(null);
    try {
      await selectQueueItem(itemId);
    } catch {
      setLocalError("Không chọn được bài.");
    }
  };

  const handleRemoveFromPlaylist = async (itemId: string) => {
    setLocalError(null);
    try {
      await removeQueueItem(itemId);
    } catch {
      setLocalError("Không xóa được bài.");
    }
  };

  const handleReorderPlaylist = async (fromIndex: number, toIndex: number) => {
    setLocalError(null);
    try {
      await reorderQueue(fromIndex, toIndex);
    } catch {
      setLocalError("Không sắp xếp lại được.");
    }
  };

  const queue = state?.queue ?? [];
  const currentId = currentItem?.id;
  const showPlayer = Boolean(currentItem?.videoId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nhạc cộng đồng
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Một phòng phát chung cho mọi người đang mở trang; thêm bài bằng + (link
          hoặc tìm YouTube), kéo thả, xóa, chuyển bài — khác phòng{" "}
          <span className="font-medium text-foreground">Nhạc gia đình</span>{" "}
          (chỉ thành viên cùng gia đình).
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {localError && (
        <p className="text-sm text-destructive" role="alert">
          {localError}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-6">
          <Card className="overflow-hidden p-0">
            {loading ? (
              <div className="flex aspect-video items-center justify-center bg-muted">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : showPlayer ? (
              <FamilyMusicPlayer
                videoId={currentItem!.videoId}
                isPlaying={state?.isPlaying ?? true}
                playbackPositionSec={state?.playbackPositionSec ?? 0}
                stateAtMillis={state?.stateAtMillis ?? null}
                onPlaybackChange={publishPlaybackState}
              />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted px-6 text-center">
                <ListMusic className="h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm font-medium text-muted-foreground">
                  Chưa có bài nào trong hàng chờ
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Nhấn + trên danh sách phát để thêm bài (link hoặc tìm kiếm).
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t p-4">
              <Button
                type="button"
                variant="secondary"
                disabled={loading || queue.length === 0 || actionBusy}
                onClick={() => void handleNext()}
                className="gap-2"
              >
                {actionBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SkipForward className="h-4 w-4" />
                )}
                Bài tiếp
              </Button>
              {currentItem && (
                <p className="min-w-0 flex-1 text-sm text-muted-foreground line-clamp-2">
                  <span className="font-medium text-foreground">
                    Đang phát:{" "}
                  </span>
                  {currentItem.title}
                </p>
              )}
            </div>
          </Card>
        </div>

        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[min(100%,17rem)] xl:w-[18rem]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Danh sách phát
            </h2>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs tabular-nums text-muted-foreground">
                {queue.length} bài
              </span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-8"
                disabled={actionBusy}
                aria-label="Thêm bài vào hàng chờ"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {queue.length === 0 ? (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Trống.</p>
            </Card>
          ) : (
            <FamilyMusicPlaylist
              queue={queue}
              currentId={currentId}
              actionBusy={actionBusy}
              onSelect={handleSelectFromPlaylist}
              onRemove={handleRemoveFromPlaylist}
              onReorder={handleReorderPlaylist}
            />
          )}
        </aside>
      </div>

      <AddTrackDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        actionBusy={actionBusy}
        onAdd={addFromUrl}
      />
    </div>
  );
}
