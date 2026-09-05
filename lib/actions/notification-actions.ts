"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/security";
import { revalidatePath } from "next/cache";

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

  const skip = page && page > 1 ? (page - 1) * pageSize : 0;
  const take = page ? pageSize : undefined;

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

  revalidatePath("/notifications");
  return { success: true };
}

/**
 * تحديد جميع إشعارات المستخدم كمقروءة
 */
export async function markAllNotificationsAsRead() {
  const user = await requireUser();

  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/notifications");
  return { success: true };
}

/**
 * حذف جميع إشعارات المستخدم
 */
export async function clearAllNotifications() {
  const user = await requireUser();

  await prisma.notification.deleteMany({
    where: { userId: user.id },
  });

  revalidatePath("/notifications");
  return { success: true };
}
