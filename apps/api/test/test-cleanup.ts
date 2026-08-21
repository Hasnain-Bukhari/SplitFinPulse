import type { PrismaService } from "../src/database/prisma.service";

export async function deleteTraceRecords(
  prisma: PrismaService,
  userIds: readonly string[],
): Promise<void> {
  if (!userIds.length) return;
  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { recipientId: { in: [...userIds] } },
        { actorId: { in: [...userIds] } },
      ],
    },
    select: { id: true },
  });
  await prisma.notificationDelivery.deleteMany({
    where: { notificationId: { in: notifications.map((item) => item.id) } },
  });
  await prisma.notification.deleteMany({
    where: { id: { in: notifications.map((item) => item.id) } },
  });
  await prisma.notificationChannelPreference.deleteMany({
    where: { userId: { in: [...userIds] } },
  });
  await prisma.pushDevice.deleteMany({
    where: { userId: { in: [...userIds] } },
  });
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "ActivityEvent" DISABLE TRIGGER USER; ALTER TABLE "ActivityAudience" DISABLE TRIGGER USER; ALTER TABLE "AuditEvent" DISABLE TRIGGER USER',
  );
  try {
    const events = await prisma.activityEvent.findMany({
      where: {
        OR: [
          { actorId: { in: [...userIds] } },
          { audiences: { some: { userId: { in: [...userIds] } } } },
        ],
      },
      select: { id: true },
    });
    const eventIds = events.map((event) => event.id);
    await prisma.activityAudience.deleteMany({
      where: {
        OR: [{ userId: { in: [...userIds] } }, { eventId: { in: eventIds } }],
      },
    });
    await prisma.activityEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: [...userIds] } },
    });
  } finally {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AuditEvent" ENABLE TRIGGER USER; ALTER TABLE "ActivityAudience" ENABLE TRIGGER USER; ALTER TABLE "ActivityEvent" ENABLE TRIGGER USER',
    );
  }
}
