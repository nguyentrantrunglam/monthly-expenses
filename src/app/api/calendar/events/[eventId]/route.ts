import { NextRequest, NextResponse } from "next/server";
import { createCalendarClient } from "@/lib/google-calendar";
import {
  calendarRouteErrorResponse,
  createPersistTokensHandler,
} from "@/lib/calendar-route-helpers";
import {
  buildGoogleCalendarSchedule,
  toGoogleEventDateTime,
} from "@/lib/google-calendar-build-schedule";
import { verifyIdToken, getFirebaseAdmin } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

async function getFamilyCalendarTokens(familyId: string) {
  getFirebaseAdmin();
  const db = getFirestore();
  const snap = await db.collection("families").doc(familyId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const gc = data?.googleCalendar;
  if (!gc?.refreshToken) return null;
  return {
    access_token: gc.accessToken ?? null,
    refresh_token: gc.refreshToken,
    expiry_date: gc.expiryDate ?? null,
  };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;
    if (!eventId) {
      return NextResponse.json({ error: "Thiếu eventId" }, { status: 400 });
    }

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

    const decoded = await verifyIdToken(token);
    const uid = decoded.uid;
    getFirebaseAdmin();
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const familyId = userSnap.data()?.familyId as string | undefined;
    if (!familyId) {
      return NextResponse.json(
        { error: "Bạn cần tham gia gia đình" },
        { status: 403 }
      );
    }

    const tokens = await getFamilyCalendarTokens(familyId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Chưa kết nối Google Calendar" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { summary, description, start, end, location, colorId } = body;

    if (!summary || !start) {
      return NextResponse.json(
        { error: "Thiếu summary hoặc start" },
        { status: 400 }
      );
    }

    const sched = buildGoogleCalendarSchedule(start, end);
    const calendar = createCalendarClient(tokens, {
      onTokensRefreshed: createPersistTokensHandler(familyId),
    });

    const existing = await calendar.events.get({
      calendarId: "primary",
      eventId: decodeURIComponent(eventId),
    });
    if (!existing.data?.id) {
      return NextResponse.json(
        { error: "Không tìm thấy sự kiện" },
        { status: 404 }
      );
    }

    const startClean = toGoogleEventDateTime(sched.start);
    const endClean = toGoogleEventDateTime(sched.end);

    const base = { ...existing.data };
    delete base.htmlLink;
    delete base.created;
    delete base.updated;

    const res = await calendar.events.update({
      calendarId: "primary",
      eventId: decodeURIComponent(eventId),
      requestBody: {
        ...base,
        summary,
        start: startClean,
        end: endClean,
        description:
          description !== undefined && description !== null
            ? description
            : (base.description ?? ""),
        location:
          location !== undefined && location !== null && String(location).trim()
            ? String(location).trim()
            : base.location,
        colorId: colorId || base.colorId,
      },
      sendUpdates: "all",
    });

    return NextResponse.json(res.data);
  } catch (err) {
    return calendarRouteErrorResponse(err, {
      fallbackMessage: "Không thể cập nhật sự kiện",
      logLabel: "PATCH /api/calendar/events/[eventId]",
    });
  }
}
