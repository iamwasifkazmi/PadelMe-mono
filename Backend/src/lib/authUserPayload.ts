import type { User } from "@prisma/client";

export function authUserPayload(user: User) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isSubscribed: user.isSubscribed,
    subscriptionSince: user.subscriptionSince?.toISOString() ?? null,
    photoVerified: user.photoVerified,
    idVerified: user.idVerified,
  };
}
