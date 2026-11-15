-- CreateEnum
CREATE TYPE "UserEventAction" AS ENUM ('CREATED', 'APPROVED', 'ROLE_CHANGED', 'DEACTIVATED', 'REACTIVATED');

-- CreateTable
CREATE TABLE "user_event" (
    "id" TEXT NOT NULL,
    "action" "UserEventAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fromRole" "Role",
    "toRole" "Role",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_event_createdAt_idx" ON "user_event"("createdAt");

-- CreateIndex
CREATE INDEX "user_event_targetId_createdAt_idx" ON "user_event"("targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_event" ADD CONSTRAINT "user_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event" ADD CONSTRAINT "user_event_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
