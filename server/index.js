// ============================================================
// خادم Express — خدمة دقيقة (Microservice) تعمل بالتوازي مع Next.js
// - المهام الخلفية الثقيلة: تقارير PDF، معالجة كميات كبيرة، تكامل خارجي
// - إدارة طابور إنتاجي عبر BullMQ + Redis (المادة 8)
// - نقاط مراقبة (health) وإدارة طابور (queue/status, queue/enqueue)
// التشغيل: node server/index.js   (أو pnpm server)
// ============================================================
"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

// دعم ملفات .env عند التشغيل المحلي (قراءة البورت والمفاتيح)
try {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
} catch (_) {
  /* dotenv غير مثبّت — نعتمد على متغيرات البيئة الفعلية */
}

const app = express();
const PORT = process.env.MICROSERVICE_PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ------------------------------------------------------------
// طابور الإنتاج عبر BullMQ + Redis
// - إن لم تتوفر REDIS_URL، يتحوّل تلقائياً لوضع تدهوري في الذاكرة
//   (يتيح العمل محلياً واختبار نقاط النهاية دون خادم Redis)
// ------------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_TLS_URL || "";

function createConnection(required = false) {
  // BullMQ يوصي بإنشاء اتصال IORedis منفصل للـ queue والـ worker
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  // منع أي "error" غير معالَج من إسقاط العملية عند غياب Redis
  conn.on("error", () => {
    /* يتولّى setupBullMQ الكشف والتحويل للوضع التدهوري */
  });
  return conn;
}

const queue = {
  mode: "memory", // "bullmq" | "memory"
  pending: [],
  inProgress: 0,
  completed: 0,
  failed: 0,
};

let bullQueue = null;
let bullWorker = null;
let bullConnection = null;

// وضع الذاكرة (fallback) — عملية واحدة محاكية
function processMemoryJob(job) {
  queue.pending = queue.pending.filter((j) => j.id !== job.id);
  queue.inProgress += 1;
  setTimeout(() => {
    queue.inProgress -= 1;
    queue.completed += 1;
    if (job.onComplete && typeof job.onComplete === "function") {
      job.onComplete(job);
    }
  }, 2000);
}

async function setupBullMQ() {
  // إن لم يُحدَّد REDIS_URL، لا نحاول الاتصال إطلاقاً — وضع ذاكرة مباشرة
  if (!REDIS_URL) {
    console.log(
      "[BullMQ] REDIS_URL غير مضبوط — العمل بوضع الذاكرة التدهوري (للإنتاج اضبط REDIS_URL)"
    );
    queue.mode = "memory";
    return false;
  }

  try {
    bullConnection = createConnection();
    await bullConnection.connect();
    const ping = await bullConnection.ping().catch(() => null);
    if (ping !== "PONG") {
      throw new Error("redis unreachable");
    }

    bullQueue = new Queue("heavy-jobs", { connection: bullConnection });
    queue.mode = "bullmq";

    bullWorker = new Worker(
      "heavy-jobs",
      async (job) => {
        queue.inProgress += 1;
        // معالجة تجريبية للمهام الثقيلة
        await new Promise((resolve) => setTimeout(resolve, 2000));
        queue.inProgress -= 1;
        queue.completed += 1;
      },
      { connection: createConnection() }
    );

    bullWorker.on("failed", (_job, err) => {
      queue.failed += 1;
      console.error("[BullMQ] فشل معالجة مهمة:", err.message);
    });

    console.log("[BullMQ] تم تفعيل الطابور الإنتاجي عبر Redis");
    return true;
  } catch (err) {
    console.warn(
      `[BullMQ] تعذّر الاتصال بـ Redis (${err.message}) — العمل بوضع الذاكرة التدهوري`
    );
    bullConnection?.disconnect();
    bullConnection = null;
    queue.mode = "memory";
    return false;
  }
}

// ------------------------------------------------------------
// نقاط نهاية أساسية
// ------------------------------------------------------------

// فحص الصحة — تستخدمه Nginx/موازن الأحمال للتأكد من حيوية الخدمة
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "smart-test-manager-microservice",
    queueMode: queue.mode,
    redisUrl: REDIS_URL ? "configured" : "not-configured",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// حالة الطابور — تُستهلك من لوحة المراقبة أو Next.js
app.get("/api/queue/status", async (_req, res) => {
  if (queue.mode === "bullmq" && bullQueue) {
    try {
      const counts = await bullQueue.getJobCounts("waiting", "active", "completed", "failed");
      return res.json({
        mode: queue.mode,
        ...counts,
        pending: counts.waiting || 0,
        inProgress: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        total:
          (counts.waiting || 0) +
          (counts.active || 0) +
          (counts.completed || 0),
      });
    } catch (err) {
      return res.status(500).json({ error: `تعذر قراءة حالة الطابور: ${err.message}` });
    }
  }
  res.json({
    mode: queue.mode,
    pending: queue.pending.length,
    inProgress: queue.inProgress,
    completed: queue.completed,
    failed: queue.failed,
    total: queue.pending.length + queue.inProgress + queue.completed,
  });
});

// نقطة حجز مهمة ثقيلة في الطابور
app.post("/api/queue/enqueue", async (req, res) => {
  const { type, payload } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: "type مطلوب" });
  }

  if (queue.mode === "bullmq" && bullQueue) {
    try {
      const job = await bullQueue.add(type, payload || {}, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      return res
        .status(201)
        .json({ job: { id: job.id.toString(), type, payload: payload || {}, createdAt: new Date().toISOString() } });
    } catch (err) {
      return res.status(500).json({ error: `تعذر حجز المهمة: ${err.message}` });
    }
  }

  const job = {
    id: `job_${Date.now()}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  queue.pending.push(job);
  processMemoryJob(job);
  res.status(201).json({ job });
});

// ------------------------------------------------خطأ عام
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// ----- تشغيل الخادم مع دعم الرصد (PM2 / systemd) -----
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`[Express] خادم الخدمة الدقيقة يعمل على المنفذ ${PORT}`);
    await setupBullMQ();
  });
}

module.exports = app;
