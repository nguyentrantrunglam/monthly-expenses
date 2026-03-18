import { NextRequest, NextResponse } from "next/server";
import { getTokensFromCode } from "@/lib/google-calendar";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase/admin";

export async function GET(req: NextRequest) {
  try {
    getFirebaseAdmin();
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL(`/calendar?error=${encodeURIComponent(error)}`, req.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/calendar?error=missing_params", req.url)
      );
    }

    const tokens = await getTokensFromCode(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/calendar?error=no_refresh_token", req.url)
      );
    }

    const db = getFirestore();
    await db.collection("families").doc(state).set(
      {
        googleCalendar: {
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date ?? null,
          updatedAt: new Date(),
        },
      },
      { merge: true }
    );

    return NextResponse.redirect(new URL("/calendar?connected=1", req.url));
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(
      new URL("/calendar?error=callback_failed", req.url)
    );
  }
}
