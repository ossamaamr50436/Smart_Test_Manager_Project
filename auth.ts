import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { AuditAction } from "@prisma/client";

// مخطط التحقق من بيانات الدخول
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // إيجاد المستخدم بالبريد الإلكتروني
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            password: true,
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