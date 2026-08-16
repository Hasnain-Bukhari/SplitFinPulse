ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_state_timestamps_check" CHECK (
  (
    "status" = 'PENDING' AND
    "acceptedAt" IS NULL AND
    "declinedAt" IS NULL AND
    "removedAt" IS NULL
  ) OR
  (
    "status" = 'ACCEPTED' AND
    "acceptedAt" IS NOT NULL AND
    "declinedAt" IS NULL AND
    "removedAt" IS NULL
  ) OR
  (
    "status" = 'DECLINED' AND
    "acceptedAt" IS NULL AND
    "declinedAt" IS NOT NULL AND
    "removedAt" IS NULL
  ) OR
  (
    "status" = 'REMOVED' AND
    "declinedAt" IS NULL AND
    "removedAt" IS NOT NULL
  )
);
