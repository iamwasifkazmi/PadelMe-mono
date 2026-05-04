/** Great-circle distance between two WGS84 points (kilometres). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function distanceKmBetweenUsers(
  viewerLat: number | null | undefined,
  viewerLng: number | null | undefined,
  targetLat: number | null | undefined,
  targetLng: number | null | undefined,
): number | null {
  if (
    viewerLat == null ||
    viewerLng == null ||
    targetLat == null ||
    targetLng == null ||
    Number.isNaN(viewerLat) ||
    Number.isNaN(viewerLng) ||
    Number.isNaN(targetLat) ||
    Number.isNaN(targetLng)
  ) {
    return null;
  }
  return Math.round(haversineKm(viewerLat, viewerLng, targetLat, targetLng));
}
