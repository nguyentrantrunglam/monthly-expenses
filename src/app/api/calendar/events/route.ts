import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { createCalendarClient } from "@/lib/google-calendar";
import { verifyIdToken, getFirebaseAdmin } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

/** Email mời: mọi thành viên trong gia đình (gồm người vừa tạo sự kiện trên app). */
async function getFamilyMemberAttendeeEmails(familyId: string): Promise<string[]> {
  const db = getFirestore();
  const fam = await db.collection("families").doc(familyId).get();
  if (!fam.exists) return [];
  const members = fam.data()?.members as Record<string, unknown> | undefined;
  if (!members) return [];

  const app = getFirebaseAdmin();
  const auth = admin.auth(app);

  const memberUids = Object.keys(members);
  const raw = await Promise.all(
    memberUids.map(async (memberUid) => {
      try {
        return (await auth.getUser(memberUid)).email ?? null;
      } catch {
        return null;
      }
    })
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const em of raw) {
    if (!em || !em.includes("@")) continue;
    const lower = em.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(em);
  }
  return out;
}

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
    const listParams = {
      timeMin: timeMin ?? undefined,
      timeMax: timeMax ?? undefined,
      maxResults,
      singleEvents: true,
      orderBy: "startTime" as const,
    };

    const VIETNAM_HOLIDAY_CALENDAR_IDS = [
      "vi.vietnamese#holiday@group.v.calendar.google.com",
      "en.vietnamese#holiday@group.v.calendar.google.com",
    ];

    const [primaryRes, ...holidayResults] = await Promise.all([
      calendar.events.list({ calendarId: "primary", ...listParams }),
      ...VIETNAM_HOLIDAY_CALENDAR_IDS.map((id) =>
        calendar.events
          .list({ calendarId: id, ...listParams })
          .catch(() => ({ data: { items: [] } }))
      ),
    ]);

    const holidayItems = (
      holidayResults.find((r) => (r.data.items ?? []).length > 0)?.data.items ?? []
    ).map((ev) => ({ ...ev, isHoliday: true }));

    const primaryItems = primaryRes.data.items ?? [];
    const items = [...primaryItems, ...holidayItems];

    return NextResponse.json({
      items,
      nextPageToken: primaryRes.data.nextPageToken,
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

    const attendeeEmails = await getFamilyMemberAttendeeEmails(familyId);

    const calendar = createCalendarClient(tokens);
    const event: {
      summary: string;
      description?: string;
      location?: string;
      colorId?: string;
      attendees?: { email: string }[];
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
    if (attendeeEmails.length > 0) {
      event.attendees = attendeeEmails.map((email) => ({ email }));
    }

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
      sendUpdates: attendeeEmails.length > 0 ? "all" : undefined,
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
