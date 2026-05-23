import { prisma } from "./prisma.js";

/** UK clubs commonly used in Base44 demos — idempotent upsert so town search works out of the box. */
const STARTER_VENUES: Array<{
  name: string;
  sport: string;
  address?: string;
  city: string;
  postcode?: string;
  lat?: number;
  lng?: number;
}> = [
  {
    name: "Crawlery",
    sport: "padel",
    address: "36 Chaucer Road",
    city: "Crawley",
    postcode: "RH10 3AS",
    lat: 51.1237185,
    lng: -0.1560813,
  },
  {
    name: "Smash Padel Mid Sussex",
    sport: "padel",
    address: "Whitemans Green",
    city: "Crawley",
    postcode: "RH17 5HX",
    lat: 51.0146597,
    lng: -0.1507211,
  },
  {
    name: "Rocket Padel",
    sport: "padel",
    address: "Circus Road East, Nine Elms",
    city: "London",
    postcode: "SW11 8AH",
    lat: 51.4812,
    lng: -0.1445,
  },
  {
    name: "Stratford Padel Club",
    sport: "padel",
    address: "221 High Street",
    city: "London",
    postcode: "E15 2AE",
    lat: 51.5422,
    lng: -0.0026,
  },
];

let starterVenuesEnsured = false;

export async function ensureStarterVenues(): Promise<void> {
  if (starterVenuesEnsured) return;
  starterVenuesEnsured = true;
  try {
    for (const v of STARTER_VENUES) {
      const existing = await prisma.venue.findFirst({
        where: { name: v.name, city: v.city },
      });
      if (!existing) {
        await prisma.venue.create({ data: v });
      }
    }
  } catch (e) {
    starterVenuesEnsured = false;
    // eslint-disable-next-line no-console
    console.warn("[starterVenues] ensure failed:", e);
  }
}
