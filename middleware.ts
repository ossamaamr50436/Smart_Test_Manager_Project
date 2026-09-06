import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { buildCsp } from "@/lib/csp";

type AuthMiddlewareResult = {
  status: number;
  headers: Headers;
} | null;

export default async function middleware(req: NextRequest) {
  const nonce = crypto.randomUUID();

  // تشغيل NextAuth Middleware
  const nextAuth = auth as unknown as (
    request: NextRequest
  ) => Promise<AuthMiddlewareResult | object>;
  const authResult = await nextAuth(req);

  let response: NextResponse;

  // إن كان NextAuth قد أصدر استجابة (إعادة توجيه مثلاً)، نمررها ثم نضيف رؤوس الأمان
  if (
    authResult &&
    typeof authResult === "object" &&
    "status" in authResult &&
    typeof (authResult as AuthMiddlewareResult)?.headers?.get === "function"
  ) {
    const headers = (authResult as AuthMiddlewareResult)!.headers;
    const location = headers.get("location");

    if (location) {
      response = NextResponse.redirect(location, (authResult as AuthMiddlewareResult)!.status);
      const setCookie = headers.get("set-cookie");
      if (setCookie) {
        response.headers.set("set-cookie", setCookie);
      }
    } else {
      response = NextResponse.next();
      headers.forEach((value, key) => {
        response.headers.set(key, value);
      });
    }
  } else {
    response = NextResponse.next();
  }

  const cspHeader = buildCsp(nonce);
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|css|js|woff|woff2|ttf|eot|pdf)).*)",
  ],
};