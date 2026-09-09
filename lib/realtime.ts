import Pusher from "pusher";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// ============================================================
// المزامنة الحية عبر Pusher Channels (تعمل على Vercel Serverless)
//
// المادة (4) تتطلب محرك Socket.IO، لكنه لا يعمل على Vercel
// Serverless لأن اتصالات WebSocket طويلة الأمد غير مدعومة هناك.
// لذلك نعتمد على Pusher كخدمة خارجية آمنة تحقق الغرض ذاته:
//  - مصادقة لكل اتصال (مقيّم لجنة الجلسة فقط — المادة 8/2)
//  - بث التحديثات لجميع أفراد اللجنة في نفس الجلسة فقط
//  - عزل الجلسات عن بعضها (لا يمكن الاشتراك في جلسة ليست لك)
//  - إعادة الاتصال تلقائياً عند انقطاع الشبكة (Pusher manages it)
//  - حفظ الحالة النهائية في قاعدة البيانات PostgreSQL (Neon)
// ============================================================

const APP_ID = process.env.PUSHER_APP_ID;
const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const SECRET = process.env.PUSHER_SECRET;
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "eu";

let server: Pusher | null = null;

/** عميل Pusher منفرد (Singleton) — جانب الخادم فقط */
function getServer(): Pusher {
  if (server) return server;
  if (!APP_ID || !KEY || !SECRET) {
    throw new Error(
      "إعدادات Pusher ناقصة: يجب ضبط PUSHER_APP_ID و NEXT_PUBLIC_PUSHER_KEY و PUSHER_SECRET"
    );
  }
  server = new Pusher({
    appId: APP_ID,
    key: KEY,
    secret: SECRET,
    cluster: CLUSTER,
    useTLS: true,
  });
  return server;
}

/**
 * اسم القناة الخاصة بجلسة تقييم معينة
 * private-assessment-{sessionId}
 */
export function channelNameFor(sessionId: string): string {
  return `private-assessment-${sessionId}`;
}

/**
 * القناة الخاصة بإشعارات مستخدم معين
 * private-user-{userId}
 */
export function userChannelNameFor(userId: string): string {
  return `private-user-${userId}`;
}

/**
 * بث إشعار لحظي لمستخدم محدد (يُحدّث الشارة/قائمة الإشعارات إن كان متصلاً)
 */
export async function pushUserNotification(
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!process.env.PUSHER_APP_ID) return; // بيئة بلا إعدادات — لا بث
  await getServer().trigger(userChannelNameFor(userId), "notification:new", payload);
}

/**
 * بث تحديث تقييم إلى لجنة معينة (المقيّمون في نفس الجلسة فقط)
 * تُستدعى من lib/actions/assessment-actions.ts بعد كل حفظ.
 */
export async function broadcastAssessmentUpdate(
  sessionId: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!process.env.PUSHER_APP_ID) return; // بيئة بلا إعدادات — لا بث
  await getServer().trigger(channelNameFor(sessionId), "assessment:update", payload);
}

/**
 * مصادقة الاشتراك في قناة خاصة (تُستدعى من API /api/pusher/auth):
 *  1) قناة التقييم تسمح فقط للمقيّمين في لجنة هذه الجلسة (المادة 8/2).
 *  2) يُرفض الاشتراك في جلسة لا يعمل فيها المستخدم (عزل الجلسات).
 *
 * الاستجابة: { auth: "<signature>" }
 */
export async function authenticateChannel(
  socketId: string,
  requestChannel: string,
  userId: string
): Promise<{ auth: string }> {
  // 1) القناة الخاصة بإشعارات المستخدم: يُسمح للمستخدم بقناته فقط
  if (requestChannel === userChannelNameFor(userId)) {
    return getServer().authorizeChannel(requestChannel, socketId);
  }

  // 2) قناة التقييم: فقط المقيّمون في لجنة هذه الجلسة (المادة 8/2)
  const sessionId = requestChannel.replace("private-assessment-", "");
  if (requestChannel.startsWith("private-assessment-")) {
    if (!sessionId || sessionId.length < 5) {
      throw new Error("القناة غير صالحة");
    }

    const session = await prisma.examSession.findFirst({
      where: { id: sessionId },
      select: { id: true, teacher1Id: true, teacher2Id: true },
    });
    if (!session) {
      throw new Error("جلسة التقييم غير موجودة");
    }
    if (session.teacher1Id !== userId && session.teacher2Id !== userId) {
      throw new Error("غير مصرح: لا يمكنك الاشتراك في جلسة ليست من لجنتك");
    }

    return getServer().authorizeChannel(requestChannel, socketId);
  }

  // 3) أي قناة أخرى: مرفوض
  throw new Error("القناة غير مسموح بها");
}