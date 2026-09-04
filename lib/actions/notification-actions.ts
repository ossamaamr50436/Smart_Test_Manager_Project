"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/security";
import { revalidatePath } from "next/cache";

// ============================================================
// نظام الإشعارات (المادة 8 — عزل الصلاحيات)
// كل إجراء يتحقق من المستخدم الحالي ويعامل إشعاراته فقط
// ============================================================

/**
 * جلب جميع إشعارات المستخدم الحالي (مرتبة من الأحدث)
 */
export async function getUserNotifications() {
  const user = await requireUser();

  return prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      message: true,
      type: true,
      isRead: true,
      createdAt: true,
    },
  });
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
