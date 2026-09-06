"use client";

import { Lottie } from "lottie-react";

type LottiePlayerProps = {
  /** مصدر الرسوم: مسار أو رابط JSON (من LottieFiles) أو كائن animationData جاهز */
  src?: string | object;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
};

/**
 * مكوّن قابل لإعادة الاستخدام لتشغيل رسوم Lottie المتحركة الخفيفة (LottieFiles).
 * يدعم التحميل من رابط خارجي أو من بيانات مضمّنة.
 */
export function LottiePlayer({
  src,
  className,
  loop = true,
  autoplay = true,
}: LottiePlayerProps) {
  if (!src) return null;
  return <Lottie src={src} loop={loop} autoplay={autoplay} className={className} />;
}
