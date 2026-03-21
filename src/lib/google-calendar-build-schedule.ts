/** Chuẩn hóa start/end cho Google Calendar API (cùng logic tạo & sửa sự kiện). */
export function buildGoogleCalendarSchedule(
  start: string,
  end: string | undefined
): {
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
} {
  const hasTime = start.includes("T") || start.includes(" ");
  const startOut: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  } = {};
  const endOut: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  } = {};

  if (hasTime) {
    const startDate = new Date(start);
    const endDate = end
      ? new Date(end)
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    startOut.dateTime = startDate.toISOString();
    startOut.timeZone = "Asia/Ho_Chi_Minh";
    endOut.dateTime = endDate.toISOString();
    endOut.timeZone = "Asia/Ho_Chi_Minh";
  } else {
    const startYmd = start.slice(0, 10);
    const [sy, sm, sd] = startYmd.split("-").map(Number);
    const startLocal = new Date(sy, sm - 1, sd);
    startOut.date = startYmd;

    const pad = (n: number) => String(n).padStart(2, "0");
    const toYmd = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    let endExclusive: Date;
    if (end) {
      const endYmd = String(end).slice(0, 10);
      const [ey, em, ed] = endYmd.split("-").map(Number);
      const lastInclusive = new Date(ey, em - 1, ed);
      endExclusive = new Date(lastInclusive);
      endExclusive.setDate(endExclusive.getDate() + 1);
    } else {
      endExclusive = new Date(startLocal);
      endExclusive.setDate(endExclusive.getDate() + 1);
    }
    endOut.date = toYmd(endExclusive);
  }

  return { start: startOut, end: endOut };
}

/** Chỉ một trong hai: `date` (cả ngày) hoặc `dateTime` + `timeZone` — tránh patch merge lỗi. */
export function toGoogleEventDateTime(
  part: { dateTime?: string; date?: string; timeZone?: string }
): { date: string } | { dateTime: string; timeZone: string } {
  if (part.date) {
    return { date: part.date };
  }
  if (part.dateTime && part.timeZone) {
    return { dateTime: part.dateTime, timeZone: part.timeZone };
  }
  throw new Error("Thiếu date hoặc dateTime/timeZone cho sự kiện");
}
