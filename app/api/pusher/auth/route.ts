import { NextResponse } from "next/server";
import { requireUser } from "@/lib/security";
import { authenticateChannel } from "@/lib/realtime";

/**
 * نقطة مصادقة قنوات Pusher الخاصة.
 * يُستدعى تلقائياً من pusher-js عند محاولة الاشتراك في قناة خاصة.
 * عزل الجلسات: لا يمكن الاشتراك إلا في قناة جلسة المستخدم (المادة 8/2).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.text();
    const params = new URLSearchParams(body);
    const socketId = params.get("socket_id");
    const channelName = params.get("channel_name");

    if (!socketId || !channelName) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const auth = await authenticateChannel(socketId, channelName, user.id);
    return NextResponse.json(auth);
  } catch (e) {
    // عدم كشف تفاصيل داخلية (OWASP — Security Misconfiguration)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
}