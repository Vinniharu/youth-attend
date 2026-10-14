import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { destinationPoint, haversineM, pointSchema, pointSql } from "@/lib/geo";

const CHURCH = { lat: 6.5244, lng: 3.3792 };

describe("pointSql", () => {
  it("passes longitude first to ST_MakePoint", () => {
    const { sql, params } = new PgDialect().sqlToQuery(pointSql(CHURCH));
    expect(sql).toBe("ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography");
    expect(params).toEqual([CHURCH.lng, CHURCH.lat]);
  });
});

describe("destinationPoint", () => {
  it.each([
    [100, 0],
    [100, 137],
    [99, 270],
    [1500, 45],
  ])("lands %i m away at bearing %i°", (distance, bearing) => {
    const p = destinationPoint(CHURCH, distance, bearing);
    expect(Math.abs(haversineM(CHURCH, p) - distance)).toBeLessThan(0.5);
  });

  it("moves north along the meridian at bearing 0", () => {
    const p = destinationPoint(CHURCH, 1000, 0);
    expect(p.lat).toBeGreaterThan(CHURCH.lat);
    expect(p.lng).toBeCloseTo(CHURCH.lng, 9);
  });
});

describe("pointSchema", () => {
  it("accepts valid coordinates", () => {
    expect(pointSchema.safeParse({ lat: -90, lng: 180 }).success).toBe(true);
  });

  it.each([
    { lat: 91, lng: 0 },
    { lat: 0, lng: -181 },
    { lat: "6.5", lng: 3.3 },
    { lat: Number.NaN, lng: 0 },
  ])("rejects %o", (value) => {
    expect(pointSchema.safeParse(value).success).toBe(false);
  });
});
