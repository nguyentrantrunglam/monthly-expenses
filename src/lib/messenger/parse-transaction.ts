import { GoogleGenerativeAI } from "@google/generative-ai";

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

export interface ParsedTransaction {
  title?: string;
  amount?: number;
  category?: string;
  date?: string;
  error?: string;
}

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích chi tiêu tiếng Việt. Nhiệm vụ: chuyển tin nhắn mô tả chi tiêu thành JSON.

Quy tắc:
1. Trả về CHỈ một object JSON, không markdown, không \`\`\`json, không giải thích.
2. Format: { "title": "string", "amount": number, "category": "string", "date": "string yyyy-MM-dd" }
3. category PHẢI là một trong: ${CATEGORIES.join(", ")}
4. Nếu user nói "hôm nay", "ngày nay" → dùng ngày hôm nay
5. Nếu không nói ngày → dùng ngày hôm nay
6. Số tiền VND: "45k" = 45000, "45 nghìn" = 45000, "1.5tr" = 1500000, "1 triệu" = 1000000
7. Nếu thiếu thông tin quan trọng (amount hoặc title không suy ra được) → trả: { "error": "mô tả thiếu gì" }
8. Ví dụ thiếu: "mua đồ" (không có số tiền), "hello" (không phải chi tiêu)`;

/**
 * Gọi Gemini API để parse tin nhắn thành structured data.
 */
export async function parseTransaction(
  message: string,
  apiKey: string
): Promise<ParsedTransaction> {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `${SYSTEM_PROMPT}\n\nNgày hôm nay: ${today}\n\nTin nhắn: ${message}`;

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
          maxOutputTokens: 256,
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
    return { error: "Không nhận được phản hồi từ AI" };
  }

  try {
    const cleaned = rawText.replace(/```json?\s*/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned) as ParsedTransaction;

    if (parsed.error) return parsed;

    const category = parsed.category && CATEGORIES.includes(parsed.category)
      ? parsed.category
      : "Khác";

    return {
      title: parsed.title?.trim() || "Chi tiêu",
      amount: typeof parsed.amount === "number" ? parsed.amount : 0,
      category,
      date: parsed.date?.slice(0, 10) || today,
    };
  } catch {
    return { error: "Không thể phân tích tin nhắn. Thử: [tên] [số tiền] [danh mục]" };
  }
}
