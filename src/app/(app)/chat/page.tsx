"use client";

import * as React from "react";
import { useFamily } from "@/hooks/useFamily";
import { useAuthStore } from "@/lib/stores/authStore";
import {
  useFamilyChat,
  FAMILY_CHAT_MAX_FILE_BYTES,
  type FamilyChatMessage,
} from "@/hooks/useFamilyChat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessagesSquare,
  Send,
  Smile,
  Image as ImageIcon,
  Camera,
  Paperclip,
  X,
  Loader2,
  Trash2,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EMOJI_PRESETS = [
  "😀",
  "😂",
  "🥰",
  "😍",
  "😮",
  "😢",
  "😡",
  "👍",
  "👎",
  "🙏",
  "👏",
  "🔥",
  "✨",
  "❤️",
  "💰",
  "🎉",
  "☕",
  "🍚",
  "🏠",
  "🚗",
  "✅",
  "❌",
  "⭐",
  "📝",
];

/** Cùng người gửi và cách tin trước không quá 5 phút → cùng cụm. */
const CHAT_CLUSTER_GAP_MS = 5 * 60 * 1000;

function createdAtToMs(createdAt: unknown): number | null {
  if (createdAt == null) return null;
  if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    typeof (createdAt as { toDate?: () => Date }).toDate === "function"
  ) {
    const ms = (createdAt as { toDate: () => Date }).toDate().getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (createdAt instanceof Date) {
    const ms = createdAt.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function formatChatTime(createdAt: unknown): string {
  if (createdAt == null) return "";
  let d: Date | null = null;
  if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    typeof (createdAt as { toDate?: () => Date }).toDate === "function"
  ) {
    d = (createdAt as { toDate: () => Date }).toDate();
  } else if (createdAt instanceof Date) {
    d = createdAt;
  }
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

function chatBubbleRadiusClass(
  firstInCluster: boolean,
  lastInCluster: boolean
): string {
  if (firstInCluster && lastInCluster) return "rounded-2xl";
  if (firstInCluster) return "rounded-2xl rounded-b-lg";
  if (lastInCluster) return "rounded-2xl rounded-t-lg";
  return "rounded-lg";
}

/** Nội dung bên trong bong bóng (ảnh / file / chữ). */
function ChatBubbleBody({
  m,
  mine,
}: {
  m: FamilyChatMessage;
  mine: boolean;
}) {
  const fileShell = mine
    ? "border-primary-foreground/30 bg-primary-foreground/10"
    : "border-border bg-background";
  return (
    <>
      {m.attachment?.kind === "image" ? (
        <a
          href={m.attachment.url}
          target="_blank"
          rel="noreferrer"
          className="mb-2 block overflow-hidden rounded-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.attachment.url}
            alt=""
            className="max-h-56 w-full max-w-full object-cover"
          />
        </a>
      ) : null}
      {m.attachment?.kind === "file" ? (
        <a
          href={m.attachment.url}
          target="_blank"
          rel="noreferrer"
          download={m.attachment.name}
          className={cn(
            "mb-2 flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-medium transition-opacity hover:opacity-90",
            fileShell
          )}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{m.attachment.name}</span>
        </a>
      ) : null}
      {m.text ? (
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
      ) : null}
    </>
  );
}

async function acquireCameraStream(): Promise<MediaStream> {
  const c = navigator.mediaDevices;
  if (!c?.getUserMedia) {
    throw new Error("no getUserMedia");
  }
  try {
    return await c.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    return c.getUserMedia({ video: true, audio: false });
  }
}

function memberInitials(name: string | null | undefined, uid: string) {
  if (name?.trim()) {
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return uid.slice(0, 2).toUpperCase();
}

export default function FamilyChatPage() {
  const user = useAuthStore((s) => s.user);
  const { family } = useFamily();
  const {
    messages,
    loading,
    sending,
    sendMessage,
    deleteMessage,
    loadOlder,
    loadingOlder,
    hasMoreOlder,
  } = useFamilyChat();

  const [text, setText] = React.useState("");
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraStatus, setCameraStatus] = React.useState<
    "idle" | "loading" | "ready" | "unsupported"
  >("idle");
  const [capturingPhoto, setCapturingPhoto] = React.useState(false);
  const [cameraPhase, setCameraPhase] = React.useState<"live" | "review">(
    "live"
  );
  const [cameraReviewFile, setCameraReviewFile] = React.useState<File | null>(
    null
  );
  const [cameraPreviewUrl, setCameraPreviewUrl] = React.useState<string | null>(
    null
  );
  const [cameraSessionId, setCameraSessionId] = React.useState(0);

  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  const preserveScrollHeightRef = React.useRef(0);
  const lastMessageIdRef = React.useRef<string | null>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!cameraOpen || cameraPhase === "review") return;
    let stream: MediaStream | null = null;
    let videoEl: HTMLVideoElement | null = null;
    let cancelled = false;
    setCameraStatus("loading");
    acquireCameraStream()
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const el = cameraVideoRef.current;
        if (!el) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        videoEl = el;
        el.srcObject = s;
        try {
          await el.play();
        } catch {
          /* một số trình duyệt vẫn hiển thị được khung hình */
        }
        if (!cancelled) setCameraStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setCameraStatus("unsupported");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [cameraOpen, cameraPhase, cameraSessionId]);

  React.useEffect(() => {
    if (!cameraReviewFile) {
      setCameraPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(cameraReviewFile);
    setCameraPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cameraReviewFile]);

  const stopLiveCameraTracks = React.useCallback(() => {
    const v = cameraVideoRef.current;
    const src = v?.srcObject;
    if (src && typeof (src as MediaStream).getTracks === "function") {
      (src as MediaStream).getTracks().forEach((t) => t.stop());
    }
    if (v) v.srcObject = null;
  }, []);

  const openNativeCameraPicker = React.useCallback(() => {
    setCameraOpen(false);
    setCameraStatus("idle");
    setCameraPhase("live");
    setCameraReviewFile(null);
    requestAnimationFrame(() => cameraInputRef.current?.click());
  }, []);

  const takePhotoFromStream = React.useCallback(() => {
    const v = cameraVideoRef.current;
    if (!v || v.videoWidth < 2 || v.videoHeight < 2) return;
    setCapturingPhoto(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCapturingPhoto(false);
        return;
      }
      ctx.drawImage(v, 0, 0);
      canvas.toBlob(
        (blob) => {
          setCapturingPhoto(false);
          if (!blob) return;
          if (blob.size > FAMILY_CHAT_MAX_FILE_BYTES) {
            setError(
              `Ảnh quá lớn (tối đa ${Math.round(FAMILY_CHAT_MAX_FILE_BYTES / (1024 * 1024))} MB)`
            );
            setCameraOpen(false);
            setCameraStatus("idle");
            setCameraPhase("live");
            setCameraReviewFile(null);
            return;
          }
          const file = new File([blob], `chup-anh-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          setError(null);
          stopLiveCameraTracks();
          setCameraReviewFile(file);
          setCameraPhase("review");
          setCameraStatus("ready");
        },
        "image/jpeg",
        0.88
      );
    } catch {
      setCapturingPhoto(false);
    }
  }, [stopLiveCameraTracks]);

  const confirmCameraReview = React.useCallback(() => {
    if (cameraReviewFile) {
      setPendingFile(cameraReviewFile);
      setError(null);
    }
    setCameraReviewFile(null);
    setCameraPhase("live");
    setCameraOpen(false);
    setCameraStatus("idle");
  }, [cameraReviewFile]);

  const retakeCameraPhoto = React.useCallback(() => {
    setCameraReviewFile(null);
    setCameraPhase("live");
    setCameraStatus("loading");
    setCameraSessionId((n) => n + 1);
  }, []);

  const discardCameraReview = React.useCallback(() => {
    setCameraReviewFile(null);
    setCameraPhase("live");
    setCameraOpen(false);
    setCameraStatus("idle");
  }, []);

  React.useEffect(() => {
    if (!pendingFile || !pendingFile.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const handleLoadOlder = React.useCallback(() => {
    const el = scrollAreaRef.current;
    if (el) preserveScrollHeightRef.current = el.scrollHeight;
    void loadOlder();
  }, [loadOlder]);

  React.useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const preserved = preserveScrollHeightRef.current;
    if (preserved > 0) {
      const delta = el.scrollHeight - preserved;
      el.scrollTop += delta;
      preserveScrollHeightRef.current = 0;
      return;
    }
    if (messages.length === 0) {
      lastMessageIdRef.current = null;
      return;
    }
    const lastId = messages[messages.length - 1]!.id;
    const prevLast = lastMessageIdRef.current;
    lastMessageIdRef.current = lastId;
    if (prevLast === null) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (lastId !== prevLast) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const clearPendingFile = () => setPendingFile(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > FAMILY_CHAT_MAX_FILE_BYTES) {
      setError(`Tệp quá lớn (tối đa ${Math.round(FAMILY_CHAT_MAX_FILE_BYTES / (1024 * 1024))} MB)`);
      return;
    }
    setError(null);
    setPendingFile(f);
  };

  const handleSend = async () => {
    const t = text.trim();
    if (!t && !pendingFile) return;
    setError(null);
    try {
      await sendMessage({ text, file: pendingFile });
      setText("");
      setPendingFile(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Không gửi được tin nhắn");
    }
  };

  const appendEmoji = (e: string) => {
    setText((prev) => prev + e);
    setEmojiOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) void handleSend();
    }
  };

  const handleDelete = async (m: FamilyChatMessage) => {
    if (!window.confirm("Xóa tin nhắn này?")) return;
    try {
      await deleteMessage(m);
    } catch (err) {
      console.error(err);
      setError("Không xóa được tin nhắn");
    }
  };

  if (!user?.familyId || !family) {
    return (
      <Card className="flex min-h-[min(320px,50dvh)] flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <MessagesSquare className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-medium">Chưa có gia đình</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo hoặc tham gia gia đình để trò chuyện cùng mọi người.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Chat gia đình</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhắn chữ, emoji, ảnh, chụp ảnh gửi ngay hoặc đính kèm tệp — mọi thành
          viên đều xem được.
        </p>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
        <div className="shrink-0 border-b px-4 py-3">
          <p className="text-sm font-medium">{family.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {Object.keys(family.members).length} thành viên
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={scrollAreaRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4"
          >
            {loading ? (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" aria-label="Đang tải" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.
              </p>
            ) : (
              <>
                {hasMoreOlder ? (
                  <div className="mb-3 flex justify-center border-b border-border/50 pb-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                      disabled={loadingOlder}
                      onClick={() => void handleLoadOlder()}
                    >
                      {loadingOlder ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : null}
                      {loadingOlder
                        ? "Đang tải…"
                        : "Tải tin nhắn cũ hơn"}
                    </Button>
                  </div>
                ) : null}
                {messages.map((m, i) => {
                const mine = m.userId === user.uid;
                const mem = family.members[m.userId];
                const avatarUrl = mem?.avatar ?? null;
                const displayName =
                  mem?.name?.trim() || m.authorName || "Thành viên";
                const prev = i > 0 ? messages[i - 1] : null;
                const next = i < messages.length - 1 ? messages[i + 1] : null;
                const t = createdAtToMs(m.createdAt);
                const prevT = prev ? createdAtToMs(prev.createdAt) : null;
                const nextT = next ? createdAtToMs(next.createdAt) : null;
                const groupWithPrev =
                  !!prev &&
                  prev.userId === m.userId &&
                  t != null &&
                  prevT != null &&
                  t >= prevT &&
                  t - prevT <= CHAT_CLUSTER_GAP_MS;
                const groupWithNext =
                  !!next &&
                  next.userId === m.userId &&
                  t != null &&
                  nextT != null &&
                  nextT >= t &&
                  nextT - t <= CHAT_CLUSTER_GAP_MS;
                const firstInCluster = !groupWithPrev;
                const lastInCluster = !groupWithNext;
                const radius = chatBubbleRadiusClass(firstInCluster, lastInCluster);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex gap-2",
                      mine ? "flex-row-reverse" : "flex-row",
                      firstInCluster ? "mt-3" : "mt-0.5",
                      i === 0 && "mt-0"
                    )}
                  >
                    {groupWithPrev ? (
                      <div
                        className="w-10 shrink-0 md:w-12"
                        aria-hidden
                      />
                    ) : (
                      <Avatar className="mt-0.5 size-10 shrink-0 md:size-12">
                        {avatarUrl ? (
                          <AvatarImage src={avatarUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="text-xs font-semibold md:text-sm">
                          {memberInitials(mem?.name ?? m.authorName, m.userId)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        "flex max-w-[min(100%,420px)] flex-col gap-1",
                        mine ? "items-end" : "items-start"
                      )}
                    >
                      {firstInCluster ? (
                        <div className="flex items-baseline gap-2 px-0.5">
                          <span className="text-[11px] font-medium text-foreground">
                            {mine ? "Bạn" : displayName}
                          </span>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {formatChatTime(m.createdAt)}
                          </span>
                        </div>
                      ) : null}
                      {mine ? (
                        <div className="flex flex-row-reverse items-start gap-0.5">
                          <div
                            className={cn(
                              "relative max-w-full px-3 py-2 text-sm shadow-sm",
                              "bg-primary text-primary-foreground",
                              radius
                            )}
                          >
                            <ChatBubbleBody m={m} mine />
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Tùy chọn tin nhắn"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={4}>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => void handleDelete(m)}
                              >
                                <Trash2 />
                                Xóa tin nhắn
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "relative px-3 py-2 text-sm shadow-sm",
                            "bg-muted text-foreground",
                            radius
                          )}
                        >
                          <ChatBubbleBody m={m} mine={false} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </>
            )}
          </div>

          {error ? (
            <p className="shrink-0 border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-center text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {pendingFile ? (
            <div className="shrink-0 border-t bg-muted/30 px-3 py-2">
              <div className="flex items-start gap-2 rounded-lg border bg-card p-2">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {pendingFile.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {(pendingFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={clearPendingFile}
                  aria-label="Bỏ tệp"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}

          <div className="shrink-0 border-t bg-card p-3">
            <div className="flex flex-wrap items-center gap-0.5 border-b border-transparent pb-2">
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Chèn emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px]" align="start">
                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                    Emoji
                  </p>
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_PRESETS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-muted"
                        onClick={() => appendEmoji(em)}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Chọn ảnh"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Chụp ảnh"
                onClick={() => {
                  setCameraPhase("live");
                  setCameraReviewFile(null);
                  setCameraStatus("loading");
                  setCameraSessionId((n) => n + 1);
                  setCameraOpen(true);
                }}
              >
                <Camera className="h-4 w-4" />
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Đính kèm tệp"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2 pt-1">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Nhập tin nhắn… (Enter gửi, Shift+Enter xuống dòng)"
                className="min-h-[44px] max-h-32 flex-1 resize-y text-sm"
                disabled={sending}
                rows={2}
              />
              <Button
                type="button"
                size="icon"
                className="h-11 w-11 shrink-0 self-end"
                disabled={
                  sending || (!text.trim() && !pendingFile)
                }
                onClick={() => void handleSend()}
                aria-label="Gửi"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCameraStatus("idle");
            setCameraPhase("live");
            setCameraReviewFile(null);
            stopLiveCameraTracks();
          }
          setCameraOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {cameraPhase === "review" && cameraPreviewUrl ? (
            <>
              <DialogHeader>
                <DialogTitle>Xem lại ảnh</DialogTitle>
                <DialogDescription>
                  Đính kèm ảnh này vào tin nhắn, chụp lại hoặc bỏ qua.
                </DialogDescription>
              </DialogHeader>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cameraPreviewUrl}
                alt="Ảnh vừa chụp"
                className="max-h-[min(55vh,420px)] w-full rounded-lg bg-black object-contain"
              />
              <div className="flex flex-col gap-2 pt-1">
                <Button type="button" onClick={confirmCameraReview}>
                  Dùng ảnh này
                </Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-stretch">
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:flex-1"
                    onClick={discardCameraReview}
                  >
                    Không dùng
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:flex-1"
                    onClick={retakeCameraPhoto}
                  >
                    Chụp lại
                  </Button>
                </div>
              </div>
            </>
          ) : cameraStatus === "unsupported" ? (
            <>
              <DialogHeader>
                <DialogTitle>Chụp ảnh</DialogTitle>
              </DialogHeader>
              <DialogDescription>
                Không mở được camera trong trình duyệt (thiết bị, quyền hoặc
                trình duyệt không hỗ trợ). Bạn vẫn có thể dùng camera gốc của
                máy hoặc điện thoại.
              </DialogDescription>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCameraOpen(false)}
                >
                  Đóng
                </Button>
                <Button type="button" onClick={openNativeCameraPicker}>
                  Mở camera hệ thống
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Chụp ảnh</DialogTitle>
              </DialogHeader>
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video
                  ref={cameraVideoRef}
                  className="max-h-[min(55vh,420px)] w-full object-contain"
                  playsInline
                  muted
                  autoPlay
                />
                {cameraStatus === "loading" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/90">
                    <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCameraOpen(false)}
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  disabled={
                    cameraStatus !== "ready" || capturingPhoto
                  }
                  onClick={takePhotoFromStream}
                >
                  {capturingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Chụp
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
