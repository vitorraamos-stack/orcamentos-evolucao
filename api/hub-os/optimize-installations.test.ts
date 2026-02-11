import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsUrl,
  buildOptimizationPayload,
  clusterByGeoRadius,
  haversineDistanceKm,
  normalizeAddress,
} from "./optimize-installations";

describe("optimize-installations helpers", () => {
  it("normalizeAddress trims and collapses spaces", () => {
    expect(normalizeAddress("  Rua   A,   123  ")).toBe("Rua A, 123");
  });

  it("haversineDistanceKm returns near-zero for same coords", () => {
    expect(
      haversineDistanceKm([-46.6333, -23.5505], [-46.6333, -23.5505])
    ).toBeLessThan(0.001);
  });

  it("clusterByGeoRadius groups nearby points", () => {
    const stops = [
      {
        os: { id: "1" } as any,
        coords: [-46.6333, -23.5505] as [number, number],
      },
      {
        os: { id: "2" } as any,
        coords: [-46.634, -23.551] as [number, number],
      },
      {
        os: { id: "3" } as any,
        coords: [-43.1729, -22.9068] as [number, number],
      },
    ];

    const clusters = clusterByGeoRadius(stops as any, 2);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].length + clusters[1].length).toBe(3);
  });

  it("buildOptimizationPayload keeps [lon,lat] job order", () => {
    const payload = buildOptimizationPayload(
      [
        {
          os: { id: "1" } as any,
          coords: [-46.6333, -23.5505] as [number, number],
        },
        {
          os: { id: "2" } as any,
          coords: [-43.1729, -22.9068] as [number, number],
        },
      ] as any,
      [-46.6333, -23.5505]
    );

    expect(payload.jobs[0].location).toEqual([-46.6333, -23.5505]);
    expect(payload.jobs[1].location).toEqual([-43.1729, -22.9068]);
    expect(payload.vehicles[0].start).toEqual([-46.6333, -23.5505]);
  });

  it("buildGoogleMapsUrl creates directions URL", () => {
    const url = buildGoogleMapsUrl([
      { coords: [-46.6333, -23.5505] },
      { coords: [-46.64, -23.56] },
    ]);

    expect(url).toContain("google.com/maps/dir");
    expect(url).toContain("origin=");
    expect(url).toContain("destination=");
  });
});
