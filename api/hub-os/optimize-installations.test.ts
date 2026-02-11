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

  it("buildGoogleMapsUrl without startCoords and 2 stops has no waypoints", () => {
    const url = buildGoogleMapsUrl([
      { coords: [-46.6333, -23.5505] },
      { coords: [-46.64, -23.56] },
    ]);

    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.pathname).toBe("/maps/dir/");
    expect(parsed.searchParams.get("origin")).toBe("-23.5505,-46.6333");
    expect(parsed.searchParams.get("destination")).toBe("-23.56,-46.64");
    expect(parsed.searchParams.get("waypoints")).toBeNull();
  });

  it("buildGoogleMapsUrl without startCoords and 3 stops keeps only middle as waypoint", () => {
    const url = buildGoogleMapsUrl([
      { coords: [-46.6333, -23.5505] },
      { coords: [-46.625, -23.552] },
      { coords: [-46.64, -23.56] },
    ]);

    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe("-23.5505,-46.6333");
    expect(parsed.searchParams.get("destination")).toBe("-23.56,-46.64");
    expect(parsed.searchParams.get("waypoints")).toBe("-23.552,-46.625");
  });

  it("buildGoogleMapsUrl with startCoords keeps first stop as waypoint", () => {
    const url = buildGoogleMapsUrl(
      [
        { coords: [-46.6333, -23.5505] },
        { coords: [-46.64, -23.56] },
      ],
      [-46.62, -23.54]
    );

    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe("-23.54,-46.62");
    expect(parsed.searchParams.get("destination")).toBe("-23.56,-46.64");
    expect(parsed.searchParams.get("waypoints")).toBe("-23.5505,-46.6333");
  });

  it("buildGoogleMapsUrl without startCoords and single stop returns search URL", () => {
    const url = buildGoogleMapsUrl([{ coords: [-46.6333, -23.5505] }]);

    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.pathname).toBe("/maps/search/");
    expect(parsed.searchParams.get("api")).toBe("1");
    expect(parsed.searchParams.get("query")).toBe("-23.5505,-46.6333");
    expect(parsed.searchParams.get("waypoints")).toBeNull();
  });
});
