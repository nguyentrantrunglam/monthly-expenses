import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import type { RefreshedCalendarCredentials } from "@/lib/google-calendar";

function getUnknownErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("code" in err)) return undefined;
  const c = (err as { code: unknown }).code;
  return typeof c === "string" ? c : undefined;
}

function getGoogleApiHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const status = (err as { response?: { status?: unknown } }).response?.status;
  return typeof status === "number" ? status : undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Phản hồi API cho lỗi Firebase Auth / Google Calendar / cấu hình. */
export function calendarRouteErrorResponse(
  err: unknown,
  opts?: { fallbackMessage?: string; logLabel?: string },
): NextResponse {
  const fallbackMessage = opts?.fallbackMessage ?? "Không thể tải sự kiện";
  const logLabel = opts?.logLabel ?? "calendar API";
  const authCode = getUnknownErrorCode(err);
  if (
    authCode === "auth/id-token-expired" ||
    authCode === "auth/argument-error" ||
    authCode === "auth/id-token-revoked"
  ) {
    return NextResponse.json(
      {
        error: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.",
        code: authCode,
      },
      { status: 401 },
    );
  }

  const googleStatus = getGoogleApiHttpStatus(err);
  if (googleStatus === 401 || googleStatus === 403) {
    return NextResponse.json(
      {
        error:
          "Google Calendar từ chối truy cập. Chủ gia đình cần kết nối lại Google Calendar.",
        code: "GOOGLE_CALENDAR_AUTH",
      },
      { status: 401 },
    );
  }

  const msg = errorMessage(err);
  if (/invalid_grant|Invalid Credentials|invalid_token/i.test(msg)) {
    return NextResponse.json(
      {
        error:
          "Phiên Google Calendar hết hạn hoặc đã bị thu hồi. Vui lòng kết nối lại trong trang Lịch.",
        code: "GOOGLE_OAUTH_INVALID",
      },
      { status: 401 },
    );
  }

  if (/Missing Google OAuth|Missing Firebase Admin/i.test(msg)) {
    return NextResponse.json(
      {
        error: "Cấu hình máy chủ thiếu biến môi trường.",
        code: "SERVER_CONFIG",
      },
      { status: 500 },
    );
  }

  console.error(logLabel, err);
  return NextResponse.json(
    {
      error: fallbackMessage,
      ...(process.env.NODE_ENV === "development" ? { details: msg } : {}),
    },
    { status: 500 },
  );
}

export async function persistRefreshedCalendarTokens(
  familyId: string,
  t: RefreshedCalendarCredentials,
) {
  const db = getFirestore();
  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (t.access_token != null && t.access_token !== "") {
    patch.accessToken = t.access_token;
  }
  if (t.expiry_date != null) patch.expiryDate = t.expiry_date;
  if (t.refresh_token != null && t.refresh_token !== "") {
    patch.refreshToken = t.refresh_token;
  }
  await db.collection("families").doc(familyId).set(
    { googleCalendar: patch },
    { merge: true },
  );
}

export function createPersistTokensHandler(familyId: string) {
  return async (t: RefreshedCalendarCredentials) => {
    try {
      await persistRefreshedCalendarTokens(familyId, t);
    } catch (e) {
      console.error("persistRefreshedCalendarTokens", e);
    }
  };
}
