import type { NextAuthConfig } from "next-auth";

// مسارات الدور الافتراضية — مُعرّفة بمفاتيح نصية فقط ( ללא imports من Prisma)
// لضمان التوافق مع Edge Runtime
const ROLE_DASHBOARD_PATHS: Record<string, string> = {
  ADMIN: "/admin",
  HEAD_OF_AFFAIRS: "/head-of-affairs",
  CERTIFICATE_SOURCE: "/certificate-source",
  TEST_SPECIALIST: "/test-specialist",
  EXAMINER: "/examiner",
  INSTITUTION: "/institution",
};

export const authConfig = {
  providers: [], // تُضاف من auth.ts (CredentialsProvider Server-side فقط)
  // يثق بأي Host (مطلوب في بيئة الإنتاج/خلف الوكيل — يمنع خطأ UntrustedHost)
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt" as const,
    // انتهاء الجلسة بعد 8 ساعات (OWASP Broken Authentication)
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth;
      const { nextUrl } = request;
      const path = nextUrl.pathname;

      const isPublic = path === "/login" || path.startsWith("/login");

      // غير مسجل الدخول ويسعى لصفحة محمية → وجّه للدخول
      if (!isLoggedIn) {
        if (!isPublic) {
          return Response.redirect(new URL("/login", nextUrl));
        }
        return true; // يسمح بالدخول لصفحة login
      }

      const role = auth.user?.role as string | undefined;
      const home = (role && ROLE_DASHBOARD_PATHS[role]) as string | undefined;

      // مسجل الدخول ويسعى لصفحة عامة → وجّهه لصفحته حسب دوره
      if (isPublic) {
        if (home) {
          return Response.redirect(new URL(home, nextUrl));
        }
        return true;
      }

      // الجذر (/) — لوحة التحكم العامة → وجّهه لصفحته حسب دوره
      if (path === "/") {
        if (home && home !== "/") {
          return Response.redirect(new URL(home, nextUrl));
        }
        return true;
      }

      // صفحات عامة لكل المستخدمين المسجلين
      if (path === "/audit-log" || path === "/notifications") {
        return true;
      }

      // مسار ليس ضمن منطقة دوره → وجّهه لصفحته
      if (!home) {
        return true;
      }
      if (path !== home && !path.startsWith(home + "/")) {
        return Response.redirect(new URL(home, nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;