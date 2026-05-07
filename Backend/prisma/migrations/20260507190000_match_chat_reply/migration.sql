-- Match group chat: reply / quote snapshots
ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "replyToTextSnapshot" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "replyToSenderSnapshot" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "replyToSenderEmail" TEXT;
