/** Whether the client should show the post-signup onboarding flow. */
export function userNeedsOnboarding(user) {
    if (user.profileComplete)
        return false;
    const hasLegacyProfile = Boolean(String(user.bio || "").trim()) &&
        user.locationLat != null &&
        user.locationLng != null &&
        !Number.isNaN(user.locationLat) &&
        !Number.isNaN(user.locationLng) &&
        user.skillLevel != null;
    if (hasLegacyProfile)
        return false;
    return true;
}
