import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { AuditAction } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";

// النطاقات المسموح قبولها في ترويسة Host أثناء الدخول
// (حماية إضافية من Host Header Injection — لا تغطيها الـ Middleware للـ /api)
function assertAllowedHostHeader() {
  const collected = new Set<string>();
  const na = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
  try {
    if (na) collected.add(new URL(na).host);
  } catch {
    /* تجاهل */
  }
  if (process.env.VERCEL_URL) collected.add(process.env.VERCEL_URL);
  if (process.env.VERCEL_DOMAIN) collected.add(process.env.VERCEL_DOMAIN);
  (process.env.ALLOWED_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean).forEach((h) => collected.add(h));

  // السماح دائمًا بالوصول المحلي (localhost / 127.0.0.1 / ::1)
  collected.add("localhost");
  collected.add("127.0.0.1");
  collected.add("::1");

  // لا يوجد نطاق معروف — نرفض الطلب (fail-closed)
  if (collected.size === 0) {
    throw new Error("خطأ في الإعداد: لا يوجد نطاق مصرح — NEXTAUTH_URL أو ALLOWED_HOSTS غير مضبوط");
  }

  const h = headers();
  const raw = h.get("x-forwarded-host") || h.get("host") || "";
  let host = raw;
  if (/:\d+$/.test(host)) host = host.slice(0, host.lastIndexOf(":"));
  if (host.startsWith("[")) host = host.slice(1);
  if (host.endsWith("]")) host = host.slice(0, -1);
  host = host.toLowerCase();
  if (!collected.has(host)) {
    throw new Error("Host غير مصرح");
  }
}

// مخطط التحقق من بيانات الدخول
const credentialsSchema = z.object({
  email: z
    .string()
    .email()
    .max(254, "البريد الإلكتروني طويل جداً"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        // التحقق من ترويسة Host (منع Host Header Injection)
        assertAllowedHostHeader();

        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // Rate limit: حد أقصى 10 محاولات لكل بريد إلكتروني خلال 15 دقيقة
        // (منع brute force مع تقليل فرصة استغلاله لتعطيل الحسابات DoS)
        await checkRateLimit(`login:${email}`, 10);

        // Rate limit على مستوى IP لمنع الهجوم الموزّع
        const forwarded = headers().get("x-forwarded-for");
        const ip = forwarded?.split(",")[0]?.trim() || "unknown";
        await checkRateLimit(`login-ip:${ip}`, 50);

        // إيجاد المستخدم بالبريد الإلكتروني
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            password: true,
            mustChangePassword: true,
          },
        });

        if (!user) {
          return null;
        }

        // حماية Brute Force: فحص عدد المحاولات الفاشلة خلال آخر 15 دقيقة
        const recentFails = await prisma.auditLog.count({
          where: {
            userId: user.id,
            action: AuditAction.LOGIN,
            details: { equals: { method: "credentials", success: false } },
            timestamp: { gte: new Date(Date.now() - 15 * 60 * 1000) },
          },
        });

        if (recentFails >= 5) {
          throw new Error(
            "تم تعطيل الحساب مؤقتاً بسبب كثرة المحاولات الفاشلة، حاول بعد 15 دقيقة"
          );
        }

        // التحقق من كلمة المرور المشفرة
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          // تسجيل محاولة الدخول الفاشلة في Audit Log (بتنسيق JSON منظم)
          try {
            await prisma.auditLog.create({
              data: {
                userId: user.id,
                action: AuditAction.LOGIN,
                details: {
                  method: "credentials",
                  success: false,
                },
              },
            });
          } catch {
            // لا يمنع التسجيل الفاشل الاستجابة
          }
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  events: {
    // تسجيل كل عملية دخول ناجحة في Audit Log (المراقبة والتسجيل)
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: AuditAction.LOGIN,
            details: { method: "credentials", success: true },
          },
        });
      } catch {
        // فشل التسجيل لا يمنع تسجيل الدخول نفسه
      }
    },
  },
});