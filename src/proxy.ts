import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: is there a session cookie at all? Real session and role
// checks happen in the data access layer (src/lib/dal.ts) on every page and route.

/** Pages anyone can open. */
const PUBLIC_PAGES = ["/login", "/offline", "/unsubscribe", "/styleguide"];

function isPublic(pathname: string): boolean {
  // API routes answer for themselves with JSON 401/403 instead of redirects.
  if (pathname.startsWith("/api/")) return true;
  return PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname) || getSessionCookie(request)) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip Next internals and static metadata files (icons, manifest, robots). Phones
  // fetch the install icons signed out, so /icons/* must never redirect to /login.
  matcher: [
    "/((?!_next/static|_next/image|icon|icons/|apple-icon|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|serwist).*)",
  ],
};
