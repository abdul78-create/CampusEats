-- CreateTable
CREATE TABLE "EventOutbox" (
    "id" TEXT NOT NULL,
    "channel" VARCHAR(100) NOT NULL,
    "sequenceNumber" BIGINT NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "aggregateType" VARCHAR(50) NOT NULL,
    "aggregateId" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventOutbox_channel_sequenceNumber_key" ON "EventOutbox"("channel", "sequenceNumber");

-- CreateIndex
CREATE INDEX "idx_outbox_replay" ON "EventOutbox"("channel", "sequenceNumber" ASC);

-- CreateIndex
CREATE INDEX "idx_outbox_unpublished" ON "EventOutbox"("publishedAt") WHERE "publishedAt" IS NULL;
