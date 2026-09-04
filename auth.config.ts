import type { NextAuthConfig } from "next-auth";

// مسارات الدور الافتراضية — مُعرّفة بمفاتيح نصية فقط ( ללא imports من Prisma)
// لضمان التوافق مع Edge Runtime
const ROLE_DASHBOARD_PATHS: Record<string, string> = {
  ADMIN: "/dashboard/admin",
  HEAD_OF_AFFAIRS: "/dashboard/head-of-affairs",
  CERTIFICATE_SOURCE: "/dashboard/certificate-source",
  TEST_SPECIALIST: "/dashboard/test-specialist",
  EXAMINER: "/dashboard/examiner",
  INSTITUTION: "/dashboard/institution",
};

export const authConfig = {
  providers: [], // تُضاف من auth.ts (CredentialsProvider Server-side فقط)
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

      // مسجل الدخول ويسعى لصفحة عامة → وجّه لصفحته حسب دوره
      if (isPublic) {
        const role = auth.user?.role as string | undefined;
        const home = (role && ROLE_DASHBOARD_PATHS[role]) || "/dashboard";
        return Response.redirect(new URL(home, nextUrl));
      }

      // مسجل الدخول يزور /dashboard — وجّهه لصفحة دوره ما لم يكن هناك بالفعل
      const role = auth.user?.role as string | undefined;
      if (role && path.startsWith("/dashboard")) {
        const home = ROLE_DASHBOARD_PATHS[role] || "/dashboard";
        // /dashboard (الجذر) أو مسار مختلف عن دوره → وجّهه لصفحته
        if (path === "/dashboard" || !path.startsWith(home + "/") && path !== home) {
          return Response.redirect(new URL(home, nextUrl));
        }
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