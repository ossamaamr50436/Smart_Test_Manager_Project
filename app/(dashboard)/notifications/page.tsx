import type { Metadata } from "next";
import { NotificationsList } from "@/components/notification/notifications-list";

export const metadata: Metadata = {
  title: "الإشعارات",
};

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الإشعارات</h1>
        <p className="mt-1 text-muted-foreground">
          جميع الإشعارات الخاصة بك — مرتبة من الأحدث إلى الأقدم
        </p>
      </div>

      <NotificationsList />
    </div>
  );
}
