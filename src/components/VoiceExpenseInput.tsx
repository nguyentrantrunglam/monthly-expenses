"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Mic, MicOff, Loader2, Check, X, Type } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyInput, parseCurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { ParsedExpense } from "@/app/api/expenses/parse/route";

const CATEGORIES = [
  "Ăn uống",
  "Di chuyển",
  "Mua sắm",
  "Giải trí",
  "Sức khỏe",
  "Giáo dục",
  "Hóa đơn",
  "Khác",
];

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export interface VoiceExpensePanelProps {
  onConfirm: (expenses: ParsedExpense[]) => Promise<void>;
  /** Khi false: dừng thu âm và xóa trạng thái (đóng modal cha hoặc chuyển tab). */
  active?: boolean;
  /** Hiển thị tiêu đề mô tả (modal độc lập). Trong modal cha có tab thì đặt false. */
  showHeader?: boolean;
  /** Gọi sau khi lưu thành công hoặc khi cần đóng modal cha. */
  onClose: () => void;
  /** Theo dõi đang thu âm (để modal cha chặn đóng khi đang ghi). */
  onRecordingChange?: (recording: boolean) => void;
}

export function VoiceExpensePanel({
  onConfirm,
  active = true,
  showHeader = true,
  onClose,
  onRecordingChange,
}: VoiceExpensePanelProps) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [manualText, setManualText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ParsedExpense[] | null>(null);
  const [saving, setSaving] = useState(false);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(
    null,
  );

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!active) {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      setRecording(false);
      setTranscript("");
      setManualText("");
      setExpenses(null);
      setParseError(null);
      setParsing(false);
      setSaving(false);
    }
  }, [active]);

  const startRecording = useCallback(() => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition ||
        (
          window as unknown as {
            webkitSpeechRecognition?: new () => SpeechRecognition;
          }
        ).webkitSpeechRecognition);

    if (!SR) {
      setParseError(
        "Trình duyệt không hỗ trợ. Dùng Chrome/Edge hoặc nhập text bên dưới.",
      );
      return;
    }

    setParseError(null);
    setTranscript("");
    setExpenses(null);

    const recognition = new SR();
    recognition.lang = "vi-VN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && r[0]) final += r[0].transcript;
      }
      if (final) {
        setTranscript((prev) => (prev + final).trim());
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.log(e.error);

      if (e.error !== "aborted" && e.error !== "no-speech") {
        const messages: Record<string, string> = {
          network:
            "Thu âm cần kết nối tới Google (có thể bị chặn bởi VPN/firewall). Dùng nhập text bên dưới — luôn hoạt động.",
          "not-allowed":
            "Microphone bị chặn. Cho phép truy cập mic hoặc nhập text.",
          "service-not-allowed": "Dịch vụ không khả dụng. Nhập text bên dưới.",
          "language-not-supported": "Ngôn ngữ không hỗ trợ. Thử nhập text.",
        };
        setParseError(
          messages[e.error] ?? `Lỗi: ${e.error}. Nhập text bên dưới.`,
        );
      }
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition as {
        stop: () => void;
        abort: () => void;
      };
      setRecording(true);
    } catch {
      setParseError("Không thể bắt đầu thu âm. Nhập text bên dưới.");
    }
  }, []);

  const parseText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setParseError("Vui lòng nhập hoặc nói nội dung chi tiêu.");
      return;
    }

    setParsing(true);
    setParseError(null);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Chưa đăng nhập");
      const token = await user.getIdToken();

      const res = await fetch("/api/expenses/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi phân tích");

      if (!data.expenses?.length) {
        setParseError("Không tìm thấy khoản chi tiêu nào.");
        return;
      }

      setExpenses(data.expenses);
      setManualText("");
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Không thể phân tích.",
      );
    } finally {
      setParsing(false);
    }
  }, []);

  const stopRecordingAndParse = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setRecording(false);

    const text = transcript.trim();
    if (!text) {
      setParseError(
        "Không nghe thấy nội dung. Vui lòng thử lại hoặc nhập text bên dưới.",
      );
      return;
    }

    await parseText(text);
  }, [transcript, parseText]);

  const handleSave = async () => {
    if (!expenses?.length) return;
    setSaving(true);
    try {
      await onConfirm(expenses);
      setExpenses(null);
      setTranscript("");
      onClose();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setSaving(false);
    }
  };

  const updateExpense = (idx: number, patch: Partial<ParsedExpense>) => {
    if (!expenses) return;
    setExpenses((prev) =>
      prev!.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    );
  };

  const removeExpense = (idx: number) => {
    if (!expenses) return;
    setExpenses((prev) => prev!.filter((_, i) => i !== idx));
  };

  return (
    <>
      {showHeader ? (
        <DialogHeader>
          <DialogTitle>
            {recording
              ? "Đang thu âm..."
              : expenses
                ? "Xác nhận chi tiêu"
                : "Thu âm chi tiêu"}
          </DialogTitle>
          <DialogDescription>
            {expenses
              ? "Kiểm tra và chỉnh sửa các khoản chi tiêu trước khi lưu."
              : "Nói chi tiêu bằng tiếng Việt hoặc nhập text bên dưới."}
          </DialogDescription>
        </DialogHeader>
      ) : null}

      <div className="space-y-4 overflow-y-auto overflow-x-hidden min-h-0 flex-1 pr-1">
        {!expenses ? (
          <>
            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                variant={recording ? "destructive" : "default"}
                className="h-20 w-20 rounded-full"
                onClick={recording ? stopRecordingAndParse : startRecording}
                disabled={parsing}
              >
                {parsing ? (
                  <Loader2 className="h-10 w-10 animate-spin" />
                ) : recording ? (
                  <MicOff className="h-10 w-10" />
                ) : (
                  <Mic className="h-10 w-10" />
                )}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                {recording
                  ? "Đang nghe... Nhấn lại để dừng và phân tích"
                  : "Nhấn để bắt đầu nói chi tiêu"}
              </p>
              <p className="text-[11px] text-muted-foreground/80 text-center">
                Thu âm cần mạng ổn định. Nếu lỗi, nhập text bên dưới.
              </p>
            </div>

            {transcript && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Đã nghe:
                </p>
                <p className="text-sm">{transcript}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Type className="h-3 w-3" />
                Hoặc nhập text (luôn hoạt động)
              </p>
              <div className="flex gap-2 min-w-0">
                <Input
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="VD: hôm nay ăn phở 45 nghìn, đổ xăng 100 nghìn"
                  className="flex-1 min-w-0"
                  disabled={parsing}
                />
                <Button
                  size="sm"
                  onClick={() => void parseText(manualText || transcript)}
                  disabled={
                    parsing || (!manualText.trim() && !transcript.trim())
                  }
                >
                  {parsing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Phân tích"
                  )}
                </Button>
              </div>
            </div>

            {parseError && (
              <p className="text-sm text-destructive">{parseError}</p>
            )}
          </>
        ) : (
          <>
            <div className="max-h-[280px] overflow-y-auto overflow-x-hidden space-y-2 min-w-0">
              {expenses.map((e, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border p-2 min-w-0"
                >
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <input
                      value={e.title}
                      onChange={(ev) =>
                        updateExpense(i, { title: ev.target.value })
                      }
                      className="w-full text-sm font-medium bg-transparent border-none focus:outline-none min-w-0"
                    />
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      <CurrencyInput
                        value={e.amount || ""}
                        onChange={(val) =>
                          updateExpense(i, {
                            amount: parseCurrencyInput(val) || 0,
                          })
                        }
                        className="w-24 min-w-0 text-xs h-7 bg-muted rounded px-1.5 py-0.5"
                      />
                      <Select
                        value={e.category}
                        onValueChange={(val) =>
                          updateExpense(i, { category: val })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-7 min-w-0 text-xs w-fit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <DatePicker
                        value={e.date}
                        onChange={(val) =>
                          updateExpense(i, { date: val })
                        }
                        className="h-7 text-xs min-w-0"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeExpense(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 shrink-0 pt-1">
              <span className="text-sm text-muted-foreground">
                Tổng: {fmt(expenses.reduce((s, e) => s + e.amount, 0))} ₫
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpenses(null)}
                >
                  Sửa lại
                </Button>
                <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Lưu
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

interface VoiceExpenseInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (expenses: ParsedExpense[]) => Promise<void>;
  defaultDate: string;
  defaultSpendingType: "personal" | "shared_pool";
  trigger?: ReactNode;
}

export function VoiceExpenseInput({
  open,
  onOpenChange,
  onConfirm,
  defaultDate: _defaultDate,
  defaultSpendingType: _defaultSpendingType,
  trigger,
}: VoiceExpenseInputProps) {
  void _defaultDate;
  void _defaultSpendingType;
  const [recording, setRecording] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col min-w-0"
        onPointerDownOutside={(e) => {
          if (recording) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (recording) e.preventDefault();
        }}
      >
        <VoiceExpensePanel
          showHeader
          active={open}
          onConfirm={onConfirm}
          onClose={() => onOpenChange(false)}
          onRecordingChange={setRecording}
        />
      </DialogContent>
    </Dialog>
  );
}
