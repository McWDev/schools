import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no cookie means certainly signed out, so skip rendering and redirect.
// A cookie that exists is NOT trusted here — every page, action, and route validates the session
// against the database on the server.
const SESSION_COOKIES = ["__Host-session", "session"];

export function proxy(request: NextRequest): NextResponse {
  const hasCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
