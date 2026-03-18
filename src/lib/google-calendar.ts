import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state: string) {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function getTokensFromCode(code: string) {
  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export function createCalendarClient(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
}) {
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials(tokens);
  return google.calendar({ version: "v3", auth: oauth2 });
}
