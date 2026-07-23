import { Injectable } from '@nestjs/common';

export interface Coordinates {
  lat: number;
  lng: number;
}

// Grille de confidentialité : arrondi à 2 décimales (~1 km). On ne stocke JAMAIS
// la position GPS brute du téléphone (AGENTS §6.5).
const GRID = 100; // 2 décimales

@Injectable()
export class GeoService {
  roundToGrid(coord: Coordinates): Coordinates {
    return {
      lat: Math.round(coord.lat * GRID) / GRID,
      lng: Math.round(coord.lng * GRID) / GRID,
    };
  }

  // Distance haversine en km. La recherche par rayon en base (SQL raw) arrive en Phase 6.
  static haversineKm(a: Coordinates, b: Coordinates): number {
    const R = 6371;
    const toRad = (d: number): number => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
}
