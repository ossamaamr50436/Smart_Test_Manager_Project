"use client";

import { io, Socket } from "socket.io-client";

// إعداد اتصال Socket.IO العميل (تمهيد للمرحلة القادمة)
// المزامنة الحية بين المعلمين أثناء التقييم تمر عبر WebSocket

let socket: Socket | null = null;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

/**
 * إحضار اتصال Socket.IO عام (Singleton) مع مصادقة توكن المستخدم الحالي
 */
export function getSocket(token?: string): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["polling", "websocket"],
      auth: { token },
    });
  } else if (typeof token === "string") {
    // تحديث التوكن قبل الاتصال (دعم توكن محدث عند إعادة الإنشاء)
    socket.auth = { token };
  }
  return socket;
}

/**
 * الاتصال بالخادم — استدعِ قبل الاشتراك في الأحداث للحصول على التحديثات الحية
 */
export function connectSocket(token?: string): Socket {
  const s = getSocket(token);
  if (!s.connected) {
    s.connect();
  }
  return s;
}

/**
 * قطع الاتصال (عند تسجيل الخروج مثلاً)
 */
export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
  socket = null;
}