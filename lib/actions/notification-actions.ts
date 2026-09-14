"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/security";
import { Role } from "@prisma/client";
import { pushUserNotificationRead } from "@/lib/realtime";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

export type PlatformAlert = {
  id: string;
  message: string;
  createdAt: Date;
};

/**
 * جلب أحدث تنبيه عام غير مقروء مرسَل من مالك النظام (SUPER_ADMIN)
 * يُعرض في شريط علوي داخل لوحة التحكم فقط.
 */
export async function getPlatformAlert(): Promise<PlatformAlert | null> {
  const user = await requireUser();

  const alert = await prisma.notification.findFirst({
    where: {
      userId: user.id,
      isRead: false,
      sender: { role: Role.SUPER_ADMIN },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, message: true, createdAt: true },
  });

  return alert;
}

/**
 * إغلاق تنبيه مالك النظام — يقبل إشعاراً من SUPER_ADMIN فقط
 */
export async function dismissPlatformAlert(notificationId: string) {
  const user = await requireUser();

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, sender: { select: { role: true } } },
  });

  if (!notification) {
    throw new Error("الإشعار غير موجود");
  }
  if (notification.userId !== user.id) {
    throw new Error("غير مصرح: هذا الإشعار ليس لك");
  }
  if (notification.sender?.role !== Role.SUPER_ADMIN) {
    throw new Error("غير مصرح: هذا الإشعار ليس تنبيهاً من مالك النظام");
  }

  await checkRateLimit(`notifications-dismiss:${user.id}`, 30);

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  await pushUserNotificationRead(user.id, { id: notificationId }).catch(() => {
    /* فشل القناة اللحظية لا يُسقط العملية */
  });

  revalidatePath("/notifications");
  return { success: true };
}

// ============================================================
// نظام الإشعارات (المادة 8 — عزل الصلاحيات)
// كل إجراء يتحقق من المستخدم الحالي ويعامل إشعاراته فقط
// ============================================================

/**
 * جلب إشعارات المستخدم الحالي (مرتبة من الأحدث) مع ترقيم الصفحات
 * إذا لم تُمرّر page تُرجع كل الإشعارات (بحد أقصى 100) للتوافق مع الشارات
 */
export async function getUserNotifications(page?: number, pageSize = 100) {
  const user = await requireUser();

  // التحقق من قيم ترقيم الصفحات (منع DoS عبر قيم ضخمة)
  if (page !== undefined) {
    const numericPage = Number(page);
    if (!Number.isInteger(numericPage) || numericPage < 1 || numericPage > 10000) {
      throw new Error("رقم الصفحة غير صالح");
    }
  }
  const numericPageSize = Number(pageSize);
  if (!Number.isInteger(numericPageSize) || numericPageSize < 1 || numericPageSize > 100) {
    throw new Error("حجم الصفحة غير صالح (الحد الأقصى 100)");
  }

  const skip = page && page > 1 ? (page - 1) * pageSize : 0;
  const take = page ? pageSize : 100;

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        message: true,
        type: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { userId: user.id } }),
  ]);

  return {
    notifications,
    total,
    page: page ?? 1,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * جلب عدد الإشعارات غير المقروءة للمستخدم الحالي
 */
export async function getUnreadCount(): Promise<number> {
  const user = await requireUser();

  return prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });
}

/**
 * تحديد إشعار واحد كمقروء
 * DB + بث لحظي (Pusher) → تُنقص الشارة فوراً في كل الألسنة.
 */
export async function markNotificationAsRead(notificationId: string) {
  const user = await requireUser();

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true },
  });

  if (!notification) {
    throw new Error("الإشعار غير موجود");
  }

  if (notification.userId !== user.id) {
    throw new Error("غير مصرح: هذا الإشعار ليس لك");
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  await pushUserNotificationRead(user.id, { id: notificationId }).catch(() => {
    /* فشل القناة اللحظية لا يُسقط العملية */
  });

  revalidatePath("/notifications");
  return { success: true };
}

/**
 * تحديد جميع إشعارات المستخدم كمقروءة
 * DB + بث لحظي (Pusher) → تُصفَّر الشارة فوراً.
 */
export async function markAllNotificationsAsRead() {
  const user = await requireUser();

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  if (result.count > 0) {
    await pushUserNotificationRead(user.id, { all: true, count: result.count }).catch(
      () => {
        /* فشل القناة اللحظية لا يُسقط العملية */
      }
    );
  }

  revalidatePath("/notifications");
  return { success: true };
}

/**
 * حذف جميع إشعارات المستخدم
 * DB + بث لحظي (Pusher) → تُصفَّر الشارة فوراً.
 */
export async function clearAllNotifications() {
  const user = await requireUser();

  // منع إساءة الاستخدام
  await checkRateLimit(`notifications-clear:${user.id}`, 10);

  const result = await prisma.notification.deleteMany({
    where: { userId: user.id },
  });

  if (result.count > 0) {
    await pushUserNotificationRead(user.id, { all: true, cleared: true, count: result.count }).catch(
      () => {
        /* فشل القناة اللحظية لا يُسقط العملية */
      }
    );
  }

  revalidatePath("/notifications");
  return { success: true };
}
