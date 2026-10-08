-- CreateTable
CREATE TABLE "Junction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "phase" TEXT NOT NULL DEFAULT 'ALL_RED',
    "controllerStatus" TEXT NOT NULL DEFAULT 'ONLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Junction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JunctionState" (
    "junctionId" TEXT NOT NULL,
    "desiredNorth" TEXT NOT NULL DEFAULT 'RED',
    "desiredSouth" TEXT NOT NULL DEFAULT 'RED',
    "desiredEast" TEXT NOT NULL DEFAULT 'RED',
    "desiredWest" TEXT NOT NULL DEFAULT 'RED',
    "actualNorth" TEXT NOT NULL DEFAULT 'RED',
    "actualSouth" TEXT NOT NULL DEFAULT 'RED',
    "actualEast" TEXT NOT NULL DEFAULT 'RED',
    "actualWest" TEXT NOT NULL DEFAULT 'RED',
    "emergencyActive" BOOLEAN NOT NULL DEFAULT false,
    "emergencyDirection" TEXT,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JunctionState_pkey" PRIMARY KEY ("junctionId")
);

-- CreateTable
CREATE TABLE "SensorEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "junctionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "vehicleId" TEXT,
    "vehicleType" TEXT,
    "sequenceNo" INTEGER,
    "sensorTimestamp" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',

    CONSTRAINT "SensorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "junctionId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'WAITING',

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "junctionId" TEXT NOT NULL,
    "requestedState" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "junctionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "direction" TEXT,
    "previousState" TEXT,
    "newState" TEXT,
    "commandId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SensorEvent_eventId_key" ON "SensorEvent"("eventId");

-- CreateIndex
CREATE INDEX "SensorEvent_junctionId_receivedAt_idx" ON "SensorEvent"("junctionId", "receivedAt");

-- CreateIndex
CREATE INDEX "QueueEntry_junctionId_status_idx" ON "QueueEntry"("junctionId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_junctionId_direction_status_idx" ON "QueueEntry"("junctionId", "direction", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Command_commandId_key" ON "Command"("commandId");

-- CreateIndex
CREATE INDEX "Command_junctionId_status_idx" ON "Command"("junctionId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_junctionId_createdAt_idx" ON "AuditLog"("junctionId", "createdAt");

-- AddForeignKey
ALTER TABLE "JunctionState" ADD CONSTRAINT "JunctionState_junctionId_fkey" FOREIGN KEY ("junctionId") REFERENCES "Junction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorEvent" ADD CONSTRAINT "SensorEvent_junctionId_fkey" FOREIGN KEY ("junctionId") REFERENCES "Junction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_junctionId_fkey" FOREIGN KEY ("junctionId") REFERENCES "Junction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_junctionId_fkey" FOREIGN KEY ("junctionId") REFERENCES "Junction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_junctionId_fkey" FOREIGN KEY ("junctionId") REFERENCES "Junction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
