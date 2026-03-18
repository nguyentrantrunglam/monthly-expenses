import { NextRequest, NextResponse } from "next/server";
import { createCalendarClient } from "@/lib/google-calendar";
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

export async function GET(req: NextRequest) {
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

    const decoded = await verifyIdToken(token);
    const uid = decoded.uid;
    getFirebaseAdmin();
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const familyId = userSnap.data()?.familyId as string | undefined;
    if (!familyId) {
      return NextResponse.json(
        { error: "Bạn cần tham gia gia đình để xem lịch" },
        { status: 403 }
      );
    }

    const tokens = await getFamilyCalendarTokens(familyId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Chưa kết nối Google Calendar. Chủ gia đình cần kết nối trước." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const timeMin = searchParams.get("timeMin");
    const timeMax = searchParams.get("timeMax");
    const maxResults = parseInt(searchParams.get("maxResults") ?? "100", 10);

    const calendar = createCalendarClient(tokens);
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin ?? undefined,
      timeMax: timeMax ?? undefined,
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    return NextResponse.json({
      items: res.data.items ?? [],
      nextPageToken: res.data.nextPageToken,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Không thể tải sự kiện" },
      { status: 500 }
    );
  }
}

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

    const decoded = await verifyIdToken(token);
    const uid = decoded.uid;
    getFirebaseAdmin();
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const familyId = userSnap.data()?.familyId as string | undefined;
    if (!familyId) {
      return NextResponse.json(
        { error: "Bạn cần tham gia gia đình để thêm sự kiện" },
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

    const calendar = createCalendarClient(tokens);
    const event: {
      summary: string;
      description?: string;
      location?: string;
      colorId?: string;
      start: { dateTime?: string; date?: string; timeZone?: string };
      end: { dateTime?: string; date?: string; timeZone?: string };
    } = {
      summary,
      start: {},
      end: {},
    };
    if (description) event.description = description;
    if (location) event.location = location;
    if (colorId) event.colorId = colorId;

    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000);
    const hasTime = start.includes("T") || start.includes(" ");
    if (hasTime) {
      event.start.dateTime = startDate.toISOString();
      event.start.timeZone = "Asia/Ho_Chi_Minh";
      event.end.dateTime = endDate.toISOString();
      (event.end as { timeZone?: string }).timeZone = "Asia/Ho_Chi_Minh";
    } else {
      event.start.date = startDate.toISOString().slice(0, 10);
      event.end.date = endDate.toISOString().slice(0, 10);
    }

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    return NextResponse.json(res.data);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Không thể tạo sự kiện" },
      { status: 500 }
    );
  }
}
