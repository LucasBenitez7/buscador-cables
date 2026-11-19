-- CreateEnum
CREATE TYPE "SavedKind" AS ENUM ('CABLE', 'TRAY', 'EQUIPMENT');

-- CreateTable
CREATE TABLE "saved_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_item" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "kind" "SavedKind" NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_folder_userId_name_key" ON "saved_folder"("userId", "name");

-- CreateIndex
CREATE INDEX "saved_item_kind_key_idx" ON "saved_item"("kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "saved_item_folderId_kind_key_key" ON "saved_item"("folderId", "kind", "key");

-- AddForeignKey
ALTER TABLE "saved_folder" ADD CONSTRAINT "saved_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "saved_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
