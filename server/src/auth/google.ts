import { Google, generateState, generateCodeVerifier } from "arctic";
import { env, GOOGLE_REDIRECT_URI } from "../env.js";

export const google = new Google(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
);

export { generateState, generateCodeVerifier };

export interface GoogleUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

/** Exchange the Google access token for the user's profile. */
export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo request failed: ${res.status}`);
  }
  return (await res.json()) as GoogleUser;
}
