import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyIdToken } from "@/lib/firebase/admin";

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

export interface ParsedExpense {
  title: string;
  amount: number;
  category: string;
  date: string;
}

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích chi tiêu tiếng Việt. Nhiệm vụ: chuyển đoạn văn mô tả chi tiêu thành JSON.

Quy tắc:
1. Mỗi khoản chi tiêu là một object với: title (string), amount (number VND), category (string), date (string yyyy-MM-dd)
2. category PHẢI là một trong: ${CATEGORIES.join(", ")}
3. Nếu user nói "hôm nay", "ngày nay" → dùng ngày hôm nay
4. Nếu không nói ngày → dùng ngày hôm nay
5. Số tiền: "45 nghìn" = 45000, "100k" = 100000, "1 triệu" = 1000000
6. Trả về MẠNG JSON thuần, không markdown, không \`\`\`json. Chỉ trả về mảng JSON.

Ví dụ input: "hôm nay ăn phở 45 nghìn, đổ xăng 100 nghìn, mua cà phê 35 nghìn"
Output: [{"title":"Ăn phở","amount":45000,"category":"Ăn uống","date":"2025-03-17"},{"title":"Đổ xăng","amount":100000,"category":"Di chuyển","date":"2025-03-17"},{"title":"Mua cà phê","amount":35000,"category":"Ăn uống","date":"2025-03-17"}]`;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      return NextResponse.json(
        { error: "Thiếu token đăng nhập" },
        { status: 401 }
      );
    }

    await verifyIdToken(token);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chưa cấu hình GEMINI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { text } = body;
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Thiếu text" },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `${SYSTEM_PROMPT}\n\nNgày hôm nay: ${today}\n\nInput: ${text}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelNames = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
    let rawText = "";
    let lastErr: unknown = null;

    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        });
        const result = await model.generateContent(prompt);
        rawText = result.response.text()?.trim() ?? "";
        if (rawText) break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!rawText && lastErr) throw lastErr;
    if (!rawText) {
      return NextResponse.json(
        { error: "Không nhận được phản hồi từ AI" },
        { status: 500 }
      );
    }

    let parsed: unknown;
    try {
      const cleaned = rawText.replace(/```json?\s*/g, "").replace(/```\s*$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI trả về định dạng không hợp lệ" },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Kết quả phải là mảng" },
        { status: 500 }
      );
    }

    const expenses: ParsedExpense[] = parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      )
      .map((item) => {
        const title = String(item.title ?? "").trim() || "Chi tiêu";
        const amount = Number(item.amount) || 0;
        const cat = String(item.category ?? "").trim();
        const category = CATEGORIES.includes(cat) ? cat : "Khác";
        const date = String(item.date ?? today).slice(0, 10);
        return { title, amount, category, date };
      })
      .filter((e) => e.amount > 0);

    return NextResponse.json({ expenses });
  } catch (err) {
    console.error("[expenses/parse]", err);
    const msg = err instanceof Error ? err.message : "Không thể phân tích chi tiêu";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
