-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'AWAITING_EMAIL_VERIFICATION';

-- AlterTable
ALTER TABLE "User"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "invite_token" VARCHAR(255),
  ADD COLUMN "invite_token_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_invite_token_key" ON "User"("invite_token");
