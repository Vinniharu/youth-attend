import { sql, type SQL } from "drizzle-orm";

export type LatLng = { lat: number; lng: number };

/**
 * The ONLY place that builds a PostGIS geography point.
 * ST_MakePoint takes longitude first; getting this backwards is the classic PostGIS bug.
 */
export function pointSql({ lat, lng }: LatLng): SQL {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

/**
 * Parses a PostGIS point returned as hex (E)WKB, e.g. "0101000020E6100000…".
 * Supports both byte orders and the optional SRID flag. Points only.
 */
export function parseWkbPoint(hex: string): LatLng {
  const buf = Buffer.from(hex, "hex");
  const littleEndian = buf.readUInt8(0) === 1;
  const readUInt32 = (offset: number) =>
    littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
  const readDouble = (offset: number) =>
    littleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);

  const type = readUInt32(1);
  const hasSrid = (type & 0x20000000) !== 0;
  if ((type & 0xffff) !== 1) {
    throw new Error(`Expected a WKB Point, got geometry type ${type & 0xffff}`);
  }

  const coordsOffset = hasSrid ? 9 : 5;
  return { lng: readDouble(coordsOffset), lat: readDouble(coordsOffset + 8) };
}
