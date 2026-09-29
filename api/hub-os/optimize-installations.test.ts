import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleMapsUrl,
  buildOptimizationPayload,
  clusterByGeoRadius,
  fetchWithTimeout,
  haversineDistanceKm,
  normalizeAddress,
  normalizeAddressForComparison,
  scoreGeocodeFeature,
  selectGeocodeCandidate,
  isLegacyGeocodeCacheCurrent,
  parseRequestBody,
  TimeoutExternalError,
} from "./optimize-installations";

describe("optimize-installations helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizeAddress trims and collapses spaces", () => {
    expect(normalizeAddress("  Rua   A,   123  ")).toBe("Rua A, 123");
  });

  it("normalizes accents and punctuation for geographic comparison", () => {
    expect(
      normalizeAddressForComparison(
        "Rua João Grumiche, 196 - Kobrasol - São José"
      )
    ).toBe("rua joao grumiche 196 kobrasol sao jose");
  });

  it("prefers textual and house-number agreement over higher confidence", () => {
    const address = "Rua Exemplo, 196 - Centro - Curitiba";
    const matching = scoreGeocodeFeature(address, {
      properties: {
        confidence: 0.85,
        layer: "address",
        street: "Rua Exemplo",
        housenumber: "196",
        locality: "Curitiba",
      },
    });
    const wrong = scoreGeocodeFeature(address, {
      properties: {
        confidence: 0.95,
        layer: "address",
        street: "Rua Distante",
        housenumber: "916",
        locality: "Outra Cidade",
      },
    });
    expect(matching.score).toBeGreaterThan(wrong.score);
    expect(matching.score - wrong.score).toBeGreaterThan(20);
  });

  it("keeps a legacy cache valid across a millisecond update-clock skew", () => {
    expect(
      isLegacyGeocodeCacheCurrent(
        "2026-09-29T10:00:00.000Z",
        "2026-09-29T10:00:00.020Z"
      )
    ).toBe(true);
    expect(
      isLegacyGeocodeCacheCurrent(
        "2026-09-29T09:59:50.000Z",
        "2026-09-29T10:00:00.000Z"
      )
    ).toBe(false);
  });

  it("rejects incompatible geocoding candidates as low confidence", () => {
    expect(() =>
      selectGeocodeCandidate("Rua Exemplo, 196 - Curitiba", [
        {
          geometry: { coordinates: [-48, -27] },
          properties: {
            confidence: 0.99,
            layer: "address",
            street: "Avenida Distante",
            locality: "Outra Cidade",
          },
        },
      ])
    ).toThrow("geocode_low_confidence");
  });

  it("rejects nearly equivalent candidates without decisive house number evidence", () => {
    const features = [1, 2].map(index => ({
      geometry: { coordinates: [-48 + index / 100, -27] as [number, number] },
      properties: {
        confidence: 0.85,
        layer: "street",
        street: "Rua Exemplo",
        locality: "Curitiba",
      },
    }));
    expect(() =>
      selectGeocodeCandidate("Rua Exemplo - Curitiba", features)
    ).toThrow("geocode_ambiguous");
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

  it("uses stop addresses in optimized order while coordinates remain available", () => {
    const url = buildGoogleMapsUrl([
      { address: "Rua A, 1", coords: [-46.1, -23.1] },
      { address: "Rua B, 2", coords: [-46.2, -23.2] },
      { address: "Rua C, 3", coords: [-46.3, -23.3] },
    ]);
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe("Rua A, 1");
    expect(parsed.searchParams.get("waypoints")).toBe("Rua B, 2");
    expect(parsed.searchParams.get("destination")).toBe("Rua C, 3");
  });

  it("prefers startAddress and preserves coordinate fallback", () => {
    const addressed = new URL(
      buildGoogleMapsUrl(
        [{ address: "Destino", coords: [-46, -23] }],
        [-45, -22],
        "Base textual"
      )!
    );
    expect(addressed.searchParams.get("origin")).toBe("Base textual");
    expect(addressed.searchParams.get("destination")).toBe("Destino");
  });

  it("buildGoogleMapsUrl with startCoords keeps first stop as waypoint", () => {
    const url = buildGoogleMapsUrl(
      [{ coords: [-46.6333, -23.5505] }, { coords: [-46.64, -23.56] }],
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

  it("parseRequestBody rejects payload above max allowed bytes", () => {
    const giantAddress = "A".repeat(200_000);
    expect(() =>
      parseRequestBody({
        startAddress: giantAddress,
      })
    ).toThrow(/Payload excede o limite/);
  });

  it("parseRequestBody rejects batches above max order limit", () => {
    const oversized = Array.from({ length: 201 }, (_, index) => `id-${index}`);
    expect(() =>
      parseRequestBody({
        orderIds: oversized,
      })
    ).toThrow(/excede o limite/);
  });

  it("deduplicates installationIds and gives them payload support", () => {
    expect(
      parseRequestBody({ installationIds: ["a", "a", " b "] }).installationIds
    ).toEqual(["a", "b"]);
    expect(() =>
      parseRequestBody({
        installationIds: Array.from({ length: 201 }, (_, i) => `i-${i}`),
      })
    ).toThrow(/excede o limite/);
  });

  it("fetchWithTimeout throws TimeoutExternalError on abort", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        init?.signal?.dispatchEvent(new Event("abort"));
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
    );

    await expect(
      fetchWithTimeout("https://example.com", { method: "GET" }, 1)
    ).rejects.toBeInstanceOf(TimeoutExternalError);
  });
});
