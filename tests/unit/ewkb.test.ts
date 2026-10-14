import { describe, expect, it } from "vitest";

import { parseWkbPoint } from "@/db/point";

describe("parseWkbPoint", () => {
  it("parses little-endian EWKB with SRID (what PostGIS returns)", () => {
    // Captured from PostGIS: SELECT ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography
    const hex = "0101000020E6100000462575029A080B40F0164850FC181A40";
    expect(parseWkbPoint(hex)).toEqual({ lng: 3.3792, lat: 6.5244 });
  });

  it("parses big-endian WKB without SRID", () => {
    const buf = Buffer.alloc(21);
    buf.writeUInt8(0, 0);
    buf.writeUInt32BE(1, 1);
    buf.writeDoubleBE(-0.1276, 5);
    buf.writeDoubleBE(51.5072, 13);
    expect(parseWkbPoint(buf.toString("hex"))).toEqual({ lng: -0.1276, lat: 51.5072 });
  });

  it("rejects non-point geometries", () => {
    // A LINESTRING header (type 2)
    expect(() => parseWkbPoint("010200000000000000")).toThrow(/Point/);
  });
});
