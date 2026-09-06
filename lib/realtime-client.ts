"use client";

import Pusher, { type Channel } from "pusher-js";

// ============================================================
// عميل Pusher (pusher-js) — جانب المتصفح فقط
// لا يستورد أي كود خادم (يضمن عدم تسريب المفاتيح السرية للعميل)
// ============================================================

const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "eu";

let pusher: Pusher | null = null;

/** إنشاء عميل Pusher منفرد (Singleton) مع مصادقة عبر واجهتنا */
function getPusher(): Pusher | null {
  if (!PUSHER_KEY) return null; // بدون مفتاح عام — لا مزامنة (نهائي العنوان المحلي)
  if (pusher) return pusher;
  pusher = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    enabledTransports: ["wss", "xhr_streaming", "xhr_polling"],
    channelAuthorization: {
      endpoint: "/api/pusher/auth",
      transport: "ajax",
    },
  });
  return pusher;
}

/** شكل البيانات المرسلة عبر قناة التقييم */
export type AssessmentUpdatePayload = {
  assessmentId?: string;
  finalScore?: number;
  evaluatorId?: string;
  counts?: Record<string, { errors: number; doubts: number; tajweed: number }>;
  assessmentStatus?: string;
};

/**
 * الاشتراك في قناة جلسة تقييم محددة (قناة خاصة)
 * يرجع دالة إلغاء الاشتراك.
 */
export function subscribeToSession(
  sessionId: string,
  onAssessmentUpdate: (payload: AssessmentUpdatePayload) => void
): () => void {
  const client = getPusher();
  if (!client) return () => {};
  const channel: Channel = client.subscribe(`private-assessment-${sessionId}`);
  channel.bind("assessment:update", onAssessmentUpdate);
  return () => {
    channel.unbind("assessment:update", onAssessmentUpdate);
    client.unsubscribe(`private-assessment-${sessionId}`);
  };
}