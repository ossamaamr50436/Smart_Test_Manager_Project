import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { pushUserNotification } from "@/lib/realtime";

// ============================================================
// خدمة الإشعارات متعددة القنوات
//  في التطبيق (جدول Notification — القناة الأساسية دائماً)
//  دفع لحظي (Pusher private-user-{id}) — يُحدّث الشارة فوراً
//  بريد إلكتروني (عبر مزوّد HTTP قابل للضبط — يتطلب EMAIL_WEBHOOK_URL أو RESEND_API_KEY)
//  رسالة SMS (عبر مزوّد HTTP قابل للضبط — يتطلب SMS_WEBHOOK_URL)
//
// القاعدة: أي فشل في قناة خارجية لا يُسقط الإشعار الأساسي
// (Graceful Degradation) — الإشعار الداخلي يُسجَّل دائماً.
// ============================================================

export type NotificationPayload = {
  userId: string;
  message: string;
  type: NotificationType;
  examSessionId?: string;
};

/**
 * توزيع القنوات الخارجية فقط (دفع + بريد + SMS) — بلا إنشاء سجل داخلي.
 * يُستخدم بعد العمليات الذرية (prisma.$transaction) التي أنشأت سجلات
 * الإشعارات داخلها، لتجنب تكرار السجلات مع الحفاظ على تعدد القنوات.
 */
export async function dispatchNotificationChannels({
  userIds,
  message,
  type,
  examSessionId,
}: {
  userIds: string[];
  message: string;
  type: NotificationType;
  examSessionId?: string;
}) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  await Promise.allSettled(
    unique.map((userId) =>
      pushUserNotification(userId, { message, type, examSessionId })
    )
  );

  try {
    if (emailConfigured() || smsConfigured()) {
      const users = await prisma.user.findMany({
        where: { id: { in: unique } },
        select: { email: true, phone: true },
      });
      await Promise.allSettled(
        users.flatMap((u) => {
          const jobs: Promise<boolean>[] = [];
          if (u.email && emailConfigured()) {
            jobs.push(sendEmail(u.email, "إشعار جديد — منصة مدير الاختبارات", `<p dir="rtl">${message}</p>`));
          }
          if (u.phone && smsConfigured()) {
            jobs.push(sendSms(u.phone, message));
          }
          return jobs;
        })
      );
    }
  } catch {
    // لا نسقط العملية بسبب فشل قناة البريد/الرسائل
  }
}

/** هل البريد فعال من المتغيرات البيئية؟ */
function emailConfigured(): boolean {
  return Boolean(
    process.env.EMAIL_WEBHOOK_URL || process.env.RESEND_API_KEY
  );
}

/** هل SMS فعال من المتغيرات البيئية؟ */
function smsConfigured(): boolean {
  return Boolean(process.env.SMS_WEBHOOK_URL || process.env.TWILIO_WEBHOOK_URL);
}

/** إرسال بريد عبر مزوّد HTTP عام (Resend-compatible) بنمط fetch بلا اعتماديات */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const webhook = process.env.EMAIL_WEBHOOK_URL;
  const apiKey = process.env.RESEND_API_KEY;
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html }),
    });
    return res.ok;
  }
  if (apiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "notifications@smart-test.local",
        to: [to],
        subject,
        html,
      }),
    });
    return res.ok;
  }
  return false;
}

/** إرسال SMS عبر مزوّد HTTP عام بتنسيق Twilio-like */
async function sendSms(toPhone: string, text: string): Promise<boolean> {
  const url =
    process.env.SMS_WEBHOOK_URL ||
    process.env.TWILIO_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: toPhone, body: text, from: process.env.SMS_FROM }),
  });
  return res.ok;
}

/**
 * إرسال إشعار لقناة واحدة (تجمع كل القنوات).
 * السجل الداخلي إلزامي؛ القنوات الخارجية تُحاول وتُتجاهل عند فشلها.
 */
export async function notifyOne({ userId, message, type, examSessionId }: NotificationPayload) {
  const record = await prisma.notification.create({
    data: { userId, message, type, examSessionId },
    select: { id: true, userId: true },
  });

  // المزامنة الحية: يحدّث الشارة/القائمة لحظياً إن كان المستخدم متصلاً
  try {
    await pushUserNotification(record.userId, {
      id: record.id,
      message,
      type,
      examSessionId,
    });
  } catch {
    // تجاهل فشل القناة اللحظية
  }

  // البريد و SMS: قناة خارجية اختيارية
  try {
    if (emailConfigured() || smsConfigured()) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true, name: true },
      });
      if (user) {
        if (user.email && emailConfigured()) {
          await sendEmail(
            user.email,
            "إشعار جديد — منصة مدير الاختبارات",
            `<div dir="rtl"><h3>مرحباً ${user.name}</h3><p>${message}</p></div>`
          );
        }
        if (user.phone && smsConfigured()) {
          await sendSms(user.phone, message);
        }
      }
    }
  } catch {
    // لا نسقط الإشعار الأساسي بسبب فشل البريد/الرسائل
  }

  return record;
}

/**
 * إشعار جماعي لمجموعة مستخدمين (بنفس الرسالة).
 * يُستخدم في أحداث تشكيل اللجان والاعتماد الإداري.
 */
export async function notifyMany(
  userIds: string[],
  payload: Omit<NotificationPayload, "userId">
) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return { sent: 0 };

  const data = unique.map((userId) => ({
    userId,
    message: payload.message,
    type: payload.type,
    examSessionId: payload.examSessionId,
  }));

  const result = await prisma.notification.createMany({ data });

  // بث لحظي لكل مستخدم (فاشل لواحد لا يؤثر على البقية)
  await Promise.allSettled(
    unique.map((userId) =>
      pushUserNotification(userId, {
        message: payload.message,
        type: payload.type,
        examSessionId: payload.examSessionId,
      })
    )
  );

  // البريد الجمعي اختياري — يمرر بهدوء عند الفشل
  try {
    if (emailConfigured() || smsConfigured()) {
      const users = await prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, email: true, phone: true },
      });
      await Promise.allSettled(
        users.map((u) => {
          const jobs: Promise<boolean>[] = [];
          if (u.email && emailConfigured()) {
            jobs.push(sendEmail(u.email, "إشعار جديد — منصة مدير الاختبارات", `<p dir="rtl">${payload.message}</p>`));
          }
          if (u.phone && smsConfigured()) {
            jobs.push(sendSms(u.phone, payload.message));
          }
          return jobs;
        })
      );
    }
  } catch {
    // تجاهل
  }

  return { sent: result.count };
}