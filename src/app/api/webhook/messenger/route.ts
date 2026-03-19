import { NextRequest, NextResponse } from "next/server";
import { verifyMessengerSignature } from "@/lib/messenger/verify-signature";
import { sendMessengerMessage } from "@/lib/messenger/send-message";
import { parseTransaction } from "@/lib/messenger/parse-transaction";
import { getLinkedToken, linkToken } from "@/lib/messenger/link-token";

const HELP_TEXT = `Gửi tin nhắn mô tả chi tiêu để lưu nhanh.

Ví dụ:
• Ăn phở 45k Ăn uống
• Hôm nay đổ xăng hết 120 nghìn
• Mua cà phê 35k

Danh mục: Ăn uống, Di chuyển, Mua sắm, Giải trí, Sức khỏe, Giáo dục, Hóa đơn, Khác`;

const LINK_INSTRUCTIONS = `Bạn chưa liên kết tài khoản. Gửi: kết nối [token]

Lấy token: Cài đặt > Hồ sơ > Link thêm nhanh > Tạo link > copy phần token trong URL.`;

/**
 * GET — Facebook verify webhook (1 lần duy nhất khi setup)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.FB_VERIFY_TOKEN;
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST — Nhận message events từ Facebook
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = process.env.FB_APP_SECRET ?? "";

  if (!verifyMessengerSignature(rawBody, signature, appSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: {
    object?: string;
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string };
        message?: { text?: string };
      }>;
    }>;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (body.object !== "page") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!pageToken || !anthropicKey) {
    console.error("[webhook/messenger] Thiếu env: FB_PAGE_ACCESS_TOKEN hoặc ANTHROPIC_API_KEY");
    return new NextResponse("OK", { status: 200 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT ?? 3000}`);

  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const text = event.message?.text?.trim();

      if (!senderId || !text) continue;

      (async () => {
        try {
          const linkMatch = text.match(/^(?:link|kết\s+nối)\s+(.+)$/i);
          if (linkMatch) {
            const tokenToLink = linkMatch[1].trim();
            const result = await linkToken(senderId, tokenToLink);
            await sendMessengerMessage(
              senderId,
              result.success ? "Đã liên kết tài khoản. Bạn có thể gửi chi tiêu ngay." : result.error ?? "Liên kết thất bại.",
              pageToken
            );
            return;
          }

          const quickToken = await getLinkedToken(senderId);
          if (!quickToken) {
            await sendMessengerMessage(senderId, LINK_INSTRUCTIONS, pageToken);
            return;
          }

          const parsed = await parseTransaction(text, anthropicKey);

          if (parsed.error) {
            await sendMessengerMessage(
              senderId,
              `${parsed.error}\n\n${HELP_TEXT}`,
              pageToken
            );
            return;
          }

          if (!parsed.amount || parsed.amount <= 0) {
            await sendMessengerMessage(
              senderId,
              `Số tiền không hợp lệ. ${HELP_TEXT}`,
              pageToken
            );
            return;
          }

          const params = new URLSearchParams({
            token: quickToken,
            title: parsed.title ?? "Chi tiêu",
            amount: String(parsed.amount),
            category: parsed.category ?? "Khác",
            date: parsed.date ?? new Date().toISOString().slice(0, 10),
          });

          const quickRes = await fetch(`${baseUrl}/api/transactions/quick?${params}`);
          const data = (await quickRes.json()) as { success?: boolean; message?: string; error?: string };

          if (quickRes.ok && data.success) {
            await sendMessengerMessage(senderId, data.message ?? "Đã lưu chi tiêu.", pageToken);
          } else {
            await sendMessengerMessage(
              senderId,
              data.error ?? "Không thể lưu chi tiêu. Kiểm tra token tại Cài đặt > Hồ sơ.",
              pageToken
            );
          }
        } catch (err) {
          console.error("[webhook/messenger]", err);
          await sendMessengerMessage(
            senderId,
            "Có lỗi xảy ra. Vui lòng thử lại sau.",
            pageToken
          );
        }
      })();
    }
  }

  return new NextResponse("OK", { status: 200 });
}
