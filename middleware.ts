import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// الحارس (Middleware): يقرأ الـ JWT ويوجّه المستخدم حسب دوره
// لا يحتوي على أي استدعاءات لقاعدة البيانات — متوافق مع Edge Runtime
export default NextAuth(authConfig).auth;

export const config = {
  // حماية كل المسارات ماعدا صفحات API وأصول ثابتة (صور وأيقونات وملفات CSS/JS)
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|css|js|woff|woff2|ttf|eot|pdf)).*)",
  ],
};
