import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { prisma } from "../../lib/prisma";
import { uploadFile, deleteFile, isStoredUrl } from "../../lib/file-storage";
import { validateFileUpload } from "../../lib/upload-security";

// ============================================================
// B2 — رفع شعار من /super-admin/settings (الدورة الكاملة على مستوى الكود/DB)
// يعادل ما يحدث عبر الواجهة: validate → upload → save URL → refresh → default
// ============================================================

// 1x1 transparent PNG (67 bytes) — Magic Bytes صحيحة 89 50 4E 47
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c62f8cfc0f01f0005000101ff2f2ce79b0000000049454e44ae426082",
  "hex"
);

const DEFAULT_LOGO = "/logo.svg";

async function currentLogo() {
  const row = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  return { logoUrl: row?.logoUrl ?? null, logoFileId: row?.logoFileId ?? null };
}

test("B2: validateFileUpload يقبل PNG ويصدّ SVG (كما في updatePlatformSettings)", () => {
  assert.doesNotThrow(() =>
    validateFileUpload(TINY_PNG, "image/png", "logo.png", {
      maxBytes: 5 * 1024 * 1024,
      allowedMimes: ["image/png", "image/jpeg", "image/webp"],
    })
  );
  assert.throws(() =>
    validateFileUpload(TINY_PNG, "image/svg+xml", "logo.svg", {
      maxBytes: 5 * 1024 * 1024,
      allowedMimes: ["image/png", "image/jpeg", "image/webp"],
    })
  );
});

test("B2: رفع → حفظ URL → إعادة قراءة (أعلى بريس) → قابل للعرض", async (t) => {
  const before = await currentLogo();

  let fileId: string | null = null;
  try {
    const uploaded = await uploadFile(TINY_PNG, "logo.png", "image/png");
    fileId = uploaded.fileId;
    const url = uploaded.url;
    assert.ok(fileId, "fileId من UploadThing");
    assert.ok(url.startsWith("https://"), `URL: ${url}`);
    assert.ok(isStoredUrl(url), "URL يُقدَّم عبر الخادم (isStoredUrl)");

    // حفظ في DB كما يفعل updatePlatformSettings:
    //   data.logoUrl = uploaded.url; data.logoFileId = uploaded.fileId;
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: { logoUrl: url, logoFileId: fileId },
      create: { id: "singleton", logoUrl: url, logoFileId: fileId },
    });

    // إعادة جلب الإعدادات (دورة التحديث كما في getPlatformSettings)
    const after = await currentLogo();
    assert.equal(after.logoUrl, url);
    assert.equal(after.logoFileId, fileId);

    // الرابط يخدم صورة فعلية بصيغة PNG
    const res = await fetch(url);
    assert.ok(res.ok, `الرابط يستجيب "${res.status}"`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "يبدأ بـ PNG magic bytes");
  } finally {
    if (fileId) {
      await deleteFile(fileId).catch(() => {});
    }
    // استعادة الحالة قبل الاختبار
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: { logoUrl: before.logoUrl, logoFileId: before.logoFileId },
      create: { id: "singleton" },
    });
  }
});

test("B2: غياب الشعار → الشعار الافتراضي /logo.svg لا يُكسر", async () => {
  await prisma.appSettings.update({
    where: { id: "singleton" },
    data: { logoUrl: null, logoFileId: null },
  });
  const { logoUrl } = await currentLogo();
  const src = logoUrl || DEFAULT_LOGO;
  assert.equal(src, DEFAULT_LOGO);
});