import { PrismaClient } from "@prisma/client";

// إعادة استخدام اتصال واحد في وضع التطوير لتجنب استنفاد الاتصالات (Neon)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
