import { test } from "node:test";
import assert from "node:assert/strict";

// ============================================================
// اختبارات عزل الصلاحيات (Authorization) وفق منطق التطبيق
// تحاكي قواعد RBAC والفصل بين الأدوار دون الحاجة لقاعدة بيانات
// ============================================================

// أدوار النظام (مطابقة لـ prisma/schema.prisma)
const Role = {
  ADMIN: "ADMIN",
  INSTITUTION: "INSTITUTION",
  EXAMINER: "EXAMINER",
  TEST_SPECIALIST: "TEST_SPECIALIST",
  HEAD_OF_AFFAIRS: "HEAD_OF_AFFAIRS",
  CERTIFICATE_SOURCE: "CERTIFICATE_SOURCE",
} as const;

// المصفوفات المسموحة لكل إجراء حساس (بحسب lib/actions/*)
const ROLE_ACCESS: Record<string, string[]> = {
  createStudentApplication: [Role.INSTITUTION],
  reviewStudentApplication: [Role.TEST_SPECIALIST],
  assignCommittee: [Role.TEST_SPECIALIST],
  saveAssessment: [Role.EXAMINER],
  specialistFinalApprove: [Role.TEST_SPECIALIST],
  headOfAffairsFinalApprove: [Role.HEAD_OF_AFFAIRS],
  generateCertificate: [Role.CERTIFICATE_SOURCE],
  signCertificate: [Role.ADMIN, Role.HEAD_OF_AFFAIRS],
  updatePlatformSettings: [Role.ADMIN],
  getAuditLogs: [Role.ADMIN, Role.TEST_SPECIALIST],
  getExamSeasons: [Role.ADMIN, Role.TEST_SPECIALIST, Role.HEAD_OF_AFFAIRS],
  getCertificateDriveLink: [Role.CERTIFICATE_SOURCE, Role.INSTITUTION, Role.ADMIN],
};

function canAccess(role: string, action: string): boolean {
  const allowed = ROLE_ACCESS[action];
  if (!allowed) return false;
  return allowed.includes(role);
}

test("Authorization: منع Vertical Privilege Escalation", () => {
  // أدوار منخفضة لا تستطيع تنفيذ إجراءات الأدوار الأعلى
  assert.equal(canAccess(Role.INSTITUTION, "specialistFinalApprove"), false);
  assert.equal(canAccess(Role.EXAMINER, "headOfAffairsFinalApprove"), false);
  assert.equal(canAccess(Role.INSTITUTION, "updatePlatformSettings"), false);
  assert.equal(canAccess(Role.EXAMINER, "assignCommittee"), false);
  assert.equal(canAccess(Role.INSTITUTION, "generateCertificate"), false);
  assert.equal(canAccess(Role.INSTITUTION, "signCertificate"), false);
});

test("Authorization: كل دور يصل فقط لإجراءاته المسموحة", () => {
  // الجهة التعليمية
  assert.equal(canAccess(Role.INSTITUTION, "createStudentApplication"), true);
  assert.equal(canAccess(Role.INSTITUTION, "reviewStudentApplication"), false);
  // الأخصائي
  assert.equal(canAccess(Role.TEST_SPECIALIST, "reviewStudentApplication"), true);
  assert.equal(canAccess(Role.TEST_SPECIALIST, "saveAssessment"), false);
  // المقيّم
  assert.equal(canAccess(Role.EXAMINER, "saveAssessment"), true);
  assert.equal(canAccess(Role.EXAMINER, "reviewStudentApplication"), false);
  // رئيس الشؤون
  assert.equal(canAccess(Role.HEAD_OF_AFFAIRS, "headOfAffairsFinalApprove"), true);
  assert.equal(canAccess(Role.HEAD_OF_AFFAIRS, "generateCertificate"), false);
  // مصدر الشهادات
  assert.equal(canAccess(Role.CERTIFICATE_SOURCE, "generateCertificate"), true);
  assert.equal(canAccess(Role.CERTIFICATE_SOURCE, "headOfAffairsFinalApprove"), false);
});

test("Authorization: ADMIN وحده يدير إعدادات المنصة", () => {
  assert.equal(canAccess(Role.ADMIN, "updatePlatformSettings"), true);
  assert.equal(canAccess(Role.INSTITUTION, "updatePlatformSettings"), false);
  assert.equal(canAccess(Role.EXAMINER, "updatePlatformSettings"), false);
  assert.equal(canAccess(Role.TEST_SPECIALIST, "updatePlatformSettings"), false);
  assert.equal(canAccess(Role.HEAD_OF_AFFAIRS, "updatePlatformSettings"), false);
  assert.equal(canAccess(Role.CERTIFICATE_SOURCE, "updatePlatformSettings"), false);
});

test("Authorization: التوقيع محصور على ADMIN و HEAD_OF_AFFAIRS", () => {
  assert.equal(canAccess(Role.ADMIN, "signCertificate"), true);
  assert.equal(canAccess(Role.HEAD_OF_AFFAIRS, "signCertificate"), true);
  assert.equal(canAccess(Role.CERTIFICATE_SOURCE, "signCertificate"), false);
  assert.equal(canAccess(Role.TEST_SPECIALIST, "signCertificate"), false);
});

test("Authorization: سجل التدقيق محصور على ADMIN و TEST_SPECIALIST", () => {
  assert.equal(canAccess(Role.ADMIN, "getAuditLogs"), true);
  assert.equal(canAccess(Role.TEST_SPECIALIST, "getAuditLogs"), true);
  assert.equal(canAccess(Role.INSTITUTION, "getAuditLogs"), false);
  assert.equal(canAccess(Role.EXAMINER, "getAuditLogs"), false);
  assert.equal(canAccess(Role.HEAD_OF_AFFAIRS, "getAuditLogs"), false);
});

test("Authorization: عزل الجهة في مستوى الطالب", () => {
  // منطق assertInstitutionOwnsStudent من lib/security.ts
  function institutionOwnsStudent(
    userInstitutionId: string | null,
    studentInstitutionId: string | null
  ): boolean {
    if (userInstitutionId === null) return false;
    return userInstitutionId === studentInstitutionId;
  }

  // الجهة A لا تصل لطالب الجهة B
  assert.equal(institutionOwnsStudent("inst-A", "inst-B"), false);
  // الجهة A تصل لطالبها
  assert.equal(institutionOwnsStudent("inst-A", "inst-A"), true);
  // جهة بلا ربط لا تصل لأي طالب
  assert.equal(institutionOwnsStudent(null, "inst-A"), false);
});

test("Authorization: عزل المقيّم في جلسة محددة", () => {
  // منطق assertExaminerInSession: المقيّم يجب أن يكون teacher1/teacher2
  function examinerInSession(
    userId: string,
    teacher1Id: string,
    teacher2Id: string
  ): boolean {
    return userId === teacher1Id || userId === teacher2Id;
  }

  // المقيّم A ضمن لجنته فقط
  assert.equal(examinerInSession("examiner-A", "examiner-A", "examiner-B"), true);
  // المقيّم C خارج اللجنة — لا يصل
  assert.equal(examinerInSession("examiner-C", "examiner-A", "examiner-B"), false);
});
