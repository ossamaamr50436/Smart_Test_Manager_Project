import { PrismaClient } from "@prisma/client";

// إعادة استخدام اتصال واحد في وضع التطوير لتجنب استنفاد الاتصالات (Neon)
// توسيع آمن للنطاق العام (widening cast) بدل `as unknown as`
const globalForPrisma = global as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
