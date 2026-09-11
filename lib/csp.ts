// ============================================================
// بناء سياسة أمان المحتوى (CSP) — متوافق مع Edge Runtime (Middleware)
// - script-src بدون unsafe-inline/unsafe-eval: كل سكربت داخلي يجب
//   أن يحمل nonce يُولَّد لكل طلب في Middleware (المادة 8)
// - style-src يتيح Tailwind/nonced styles (بدون closed why: Tailwind يضخ
//   CSS ديناميكياً عبر style element مُولّد بواسطة Next.js)
// - connect-src يشمل Pusher (المزامنة الحية) مع نشرته
// ============================================================

const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "eu";

/**
 * يولّد سياسة CSP كاملة لطلبٍ واحد بناءً على nonce عشوائي.
 */
export function buildCsp(nonce: string): string {
  const pusherOrigins = [
    `https://${PUSHER_CLUSTER}.pusher.com`,
    `wss://ws-${PUSHER_CLUSTER}.pusher.com`,
    `https://sockjs-${PUSHER_CLUSTER}.pusher.com`,
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://drive.google.com https://lh3.googleusercontent.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com ${pusherOrigins}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}