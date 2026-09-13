-- CreateIndex
CREATE INDEX "assessments_tenantId_status_idx" ON "assessments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "assessments_tenantId_examSessionId_idx" ON "assessments"("tenantId", "examSessionId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_timestamp_idx" ON "audit_logs"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_action_idx" ON "audit_logs"("tenantId", "action");

-- CreateIndex
CREATE INDEX "certificates_tenantId_status_idx" ON "certificates"("tenantId", "status");

-- CreateIndex
CREATE INDEX "exam_models_tenantId_branch_seasonId_idx" ON "exam_models"("tenantId", "branch", "seasonId");

-- CreateIndex
CREATE INDEX "exam_models_tenantId_seasonId_idx" ON "exam_models"("tenantId", "seasonId");

-- CreateIndex
CREATE INDEX "exam_sessions_tenantId_status_idx" ON "exam_sessions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "exam_sessions_tenantId_examDate_idx" ON "exam_sessions"("tenantId", "examDate");

-- CreateIndex
CREATE INDEX "exam_sessions_tenantId_teacher1Id_idx" ON "exam_sessions"("tenantId", "teacher1Id");

-- CreateIndex
CREATE INDEX "exam_sessions_tenantId_teacher2Id_idx" ON "exam_sessions"("tenantId", "teacher2Id");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_tenantId_idx" ON "notifications"("userId", "isRead", "tenantId");

-- CreateIndex
CREATE INDEX "students_tenantId_status_idx" ON "students"("tenantId", "status");

-- CreateIndex
CREATE INDEX "students_tenantId_institutionId_idx" ON "students"("tenantId", "institutionId");

-- CreateIndex
CREATE INDEX "students_tenantId_committeeId_idx" ON "students"("tenantId", "committeeId");

-- CreateIndex
CREATE INDEX "students_tenantId_createdAt_idx" ON "students"("tenantId", "createdAt");