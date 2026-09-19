import NextAuth, { type NextAuthRequest } from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";
import { authConfig } from "@/auth.config";

// Middleware يستخدم إعداد Auth الخاص بـ Edge فقط (auth.config.ts)
// — لا يدخل Prisma أو bcryptjs (المعرّفان في auth.ts) إلى حزمة الـ Middleware
const { auth: middlewareAuth } = NextAuth(authConfig);

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
  // السماح دائمًا بالوصول المحلي (localhost / 127.0.0.1 / ::1) — التجربة على Port 3000
  hosts.add("localhost");
  hosts.add("127.0.0.1");
  hosts.add("::1");
  return hosts;
}

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const nonce = crypto.randomUUID();

  // حماية من اختطاف النطاق: رفض الطلبات ذات Host غير مصرح
  // يقرأ x-forwarded-host أولاً (خلف Reverse Proxy) ثم host
  // تُنفَّذ قبل NextAuth حتى لا يُوجه المُهاجم التوجيهَ نحو مضيف غير مصرح
  const allowed = getAllowedHosts();
  if (allowed.size > 0) {
    let raw = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    let host = raw;
    if (/:\d+$/.test(host)) host = host.slice(0, host.lastIndexOf(":"));
    if (host.startsWith("[")) host = host.slice(1);
    if (host.endsWith("]")) host = host.slice(0, -1);
    host = host.toLowerCase();
    if (!allowed.has(host)) {
      return new NextResponse("المضيف غير مصرح للاتصال بالمنصة", { status: 403 });
    }
  }

  // تمرير nonce عبر request headers حتى يقرأه layout عبر headers().get("x-nonce")
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  // تشغيل NextAuth Middleware (Edge-safe config) بصيغة للغط: تمنح الـ augment
  // للطلب (req.auth) وتُكمل التوجيه/الحماية عبر authorized في auth.config
  const nextAuth = middlewareAuth((authReq: NextAuthRequest, _event: NextFetchEvent) => {
    void authReq;
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-nonce", nonce);
    return response;
  });

  const authResult = await nextAuth(req, event);

  // إن كان NextAuth قد أصدر استجابة (إعادة توجيه مثلاً)، نمررها ثم نضيف رؤوس الأمان
  let response: NextResponse;
  if (authResult instanceof Response) {
    response = new NextResponse(authResult.body, authResult);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
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