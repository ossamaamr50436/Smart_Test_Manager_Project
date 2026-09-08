import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { buildCsp } from "@/lib/csp";

type AuthMiddlewareResult = {
  status: number;
  headers: Headers;
} | null;

// قائمة النطاقات المسموح قبولها في ترويسة Host
// (حماية من Host Header Injection / Password Reset Poisoning)
function getAllowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const na = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
  try {
    if (na) hosts.add(new URL(na).host);
  } catch {
    /* تجاهل عنوان غير صالح */
  }
  if (process.env.VERCEL_URL) hosts.add(process.env.VERCEL_URL);
  if (process.env.VERCEL_DOMAIN) hosts.add(process.env.VERCEL_DOMAIN);
  (process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .forEach((h) => hosts.add(h));
  return hosts;
}

export default async function middleware(req: NextRequest) {
  const nonce = crypto.randomUUID();

  // حماية من اختطاف النطاق: رفض الطلبات ذات Host غير مصرح
  // يقرأ x-forwarded-host أولاً (خلف Reverse Proxy) ثم host
  const allowed = getAllowedHosts();
  if (allowed.size > 0) {
    let raw = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    let host = raw;
    if (/:\d+$/.test(host)) host = host.slice(0, host.lastIndexOf(":"));
    if (host.startsWith("[")) host = host.slice(1);
    if (host.endsWith("]")) host = host.slice(0, -1);
    host = host.toLowerCase();
    if (!allowed.has(host)) {
      return new NextResponse("Forbidden: Host غير مصرح", { status: 403 });
    }
  }

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

  response.headers.set("x-nonce", nonce);

  // تطبيق CSP الصارمة (Nonce) في وضع الإنتاج فقط، لأن Next.js في وضع
  // التطوير (dev) يشغّل وحداته عبر eval() (Webpack/Hot Refresh) ويضيف
  // سكربت inline للسكربت عبر next-themes؛ إرسال هذه السياسة في dev يكسر
  // تشغيل التطبيق كلياً ولا يُفعَّل الزر. في الإنتاج تظل السياسة مشددة.
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Content-Security-Policy", buildCsp(nonce));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|css|js|woff|woff2|ttf|eot|pdf)).*)",
  ],
};