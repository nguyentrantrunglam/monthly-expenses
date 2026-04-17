"use client";

import { useState, useCallback } from "react";
import { isFamilyOwner, useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import { useFamilyMusic } from "@/hooks/useFamilyMusic";
import { useMusicRoomPresence } from "@/hooks/useMusicRoomPresence";
import { useMusicRoomJoinSequence } from "@/hooks/useMusicRoomJoinSequence";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Music2, Plus, SkipForward, ListMusic } from "lucide-react";
import { AddTrackDialog } from "@/components/family-music/AddTrackDialog";
import { FamilyMusicPlayer } from "@/components/family-music/FamilyMusicPlayer";
import { FamilyMusicPlaylist } from "@/components/family-music/FamilyMusicPlaylist";

export default function FamilyMusicPage() {
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
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
  } = useFamilyMusic();
  const { peers, joinEvent } = useMusicRoomPresence({
    scope: "family",
    familyId: user?.familyId ?? null,
    enabled: Boolean(user?.familyId),
  });
  const queue = state?.queue ?? [];
  const showPlayer = Boolean(currentItem?.videoId);
  const { outputMuted, resyncTick } = useMusicRoomJoinSequence(
    joinEvent,
    showPlayer,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [boundaryTick, setBoundaryTick] = useState(0);
  const canManagePlayback = Boolean(user?.isAdmin || isFamilyOwner(user?.uid, family));

  const handleVideoEnded = useCallback(async () => {
    try {
      const ok = await goNext();
      if (ok) setBoundaryTick((t) => t + 1);
    } catch {
      /* ignore */
    }
  }, [goNext]);

  if (!user?.familyId || !family) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Music2 className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-medium">Chưa có gia đình</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo hoặc tham gia gia đình để nghe nhạc chung.
          </p>
        </div>
      </Card>
    );
  }

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

  const currentId = currentItem?.id;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nhạc gia đình
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Phát/tạm dừng đồng bộ realtime; thêm bài bằng + (link hoặc tìm trên
          YouTube), kéo thả để đổi thứ tự, xóa bằng thùng rác, chuyển bài như
          trước.
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
                activeQueueItemId={currentItem!.id}
                isPlaying={state?.isPlaying ?? false}
                playbackPositionSec={state?.playbackPositionSec ?? 0}
                stateAtMillis={state?.stateAtMillis ?? null}
                onPlaybackChange={publishPlaybackState}
                onVideoEnded={handleVideoEnded}
                outputMuted={outputMuted}
                resyncTick={resyncTick}
                boundaryTick={boundaryTick}
                canControlLive={canManagePlayback}
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
              {canManagePlayback ? (
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
              ) : null}
              {currentItem && (
                <p className="min-w-0 flex-1 text-sm text-muted-foreground line-clamp-2">
                  <span className="font-medium text-foreground">
                    Đang phát:{" "}
                  </span>
                  {currentItem.title}
                </p>
              )}
            </div>
            {showPlayer && (
              <div className="border-t px-4 py-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Đang nghe ({peers.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {peers.map((peer) => (
                    <span
                      key={peer.uid}
                      className="inline-flex items-center rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {peer.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <aside
          className="flex w-full min-h-0 shrink-0 flex-col overflow-hidden lg:sticky lg:top-6 lg:max-h-[calc(100svh-6rem)] lg:w-[min(100%,17rem)] xl:w-[18rem]"
          aria-label="Cột danh sách phát"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
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
          <div className="scrollbar-none min-h-0 max-h-[min(58vh,24rem)] flex-1 overflow-y-auto overscroll-y-contain lg:max-h-none">
            {queue.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Trống.</p>
              </Card>
            ) : (
              <FamilyMusicPlaylist
                queue={queue}
                currentId={currentId}
                actionBusy={actionBusy}
                canSelect={canManagePlayback}
                canManageQueue={canManagePlayback}
                onSelect={handleSelectFromPlaylist}
                onRemove={handleRemoveFromPlaylist}
                onReorder={handleReorderPlaylist}
              />
            )}
          </div>
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
