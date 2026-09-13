-- ============================================================
-- RLS — Row Level Security (Layer 2) — مؤجل عمداً (create-only)
-- ============================================================
-- ⚠️  لا تُطبَّق هذه الهجرة الآن (تُنشأ بصيغة --create-only فقط).
-- التفعيل الفعلي مؤجل للإصدار التالي، لأن تطبيقها يتطلب أولاً
-- لفّ كل Server Action بـ withTenantContext (lib/tenancy-db.ts)
-- فما لم يُضبط سياق app.tenant_id في الاتصال، تعمل السياسات
-- بمنطق رفض-صمت (fail-closed) وستُعيد صفر صفوف لجميع المستخدمين.
--
-- جداول الـ 11 المشمولة هي الجداول ذات الحاصلة tenantId:
--   students, institutions, exam_seasons, committees, exam_models,
--   exam_sessions, assessment_settings, assessments, certificates,
--   notifications, audit_logs
-- المستثناة عمداً:
--   users        — الدخول يتطلب استعلاما عاما بالبريد قبل أي سياق (pre-auth)
--   tenants      — جدول المستأجرين نفسه (النطاق العام)
--   app_settings — إعدادات منصة عامة (singleton)
--   rate_limits  — خطة Rate Limit عامة بلا tenantId
--   committee_model_allocations — جدول ربط بلا tenantId
--
-- آلية السياق (ثلاث قيم مميزة):
--   SET LOCAL app.tenant_id = '<tenantId>'  ← مستخدم مؤسسة: صفوف مؤسسته فقط
--   SET LOCAL app.tenant_id = ''            ← SUPER_ADMIN: يرى الكل (بما فيه null)
--   (بدون سياق / app.tenant_id غير مضبوط)   → fail-closed (لا شيء)
--
-- FORCE ROW LEVEL SECURITY: الاتصال (Neon primary user) مالك الجداول،
-- وبدون FORCE يتجاوز المالك السياسات — لذا نُجبر التفعيل على الجميع.
--
-- تفعيل لاحقاً (بعد لف كل Server Actions):
--   npx prisma migrate deploy
-- ⚠️ يُمنع تنفيذها الآن (غير قابلة للتراجع بسهولة على بيانات حية).
-- ============================================================

CREATE OR REPLACE FUNCTION _rls_tenant_context() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT current_setting('app.tenant_id', true) $$;

-- 1) institutions
ALTER TABLE "institutions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institutions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_institutions" ON "institutions"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 2) students
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_students" ON "students"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 3) exam_seasons
ALTER TABLE "exam_seasons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_seasons" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_exam_seasons" ON "exam_seasons"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 4) committees
ALTER TABLE "committees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "committees" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_committees" ON "committees"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 5) exam_models
ALTER TABLE "exam_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_models" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_exam_models" ON "exam_models"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 6) exam_sessions
ALTER TABLE "exam_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_exam_sessions" ON "exam_sessions"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 7) assessment_settings
ALTER TABLE "assessment_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_assessment_settings" ON "assessment_settings"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 8) assessments
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_assessments" ON "assessments"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 9) certificates
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_certificates" ON "certificates"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 10) notifications — tenantId nullable (سجلات مستوى المنصة null)
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_notifications" ON "notifications"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));

-- 11) audit_logs — tenantId nullable (تنبيهات مستوى المنصة null)
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_audit_logs" ON "audit_logs"
  FOR ALL TO PUBLIC
  USING (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()))
  WITH CHECK (_rls_tenant_context() IS NOT NULL AND (_rls_tenant_context() = '' OR "tenantId" = _rls_tenant_context()));