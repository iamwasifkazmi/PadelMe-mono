export function authUserPayload(user) {
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
