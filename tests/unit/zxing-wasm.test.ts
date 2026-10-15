import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The scanner serves its own copy of zxing-wasm's decoder (see camera-scanner.tsx).
// A mismatched .wasm would break scanning on iPhones silently, so pin it here.
describe("self-hosted zxing decoder", () => {
  it("matches the installed zxing-wasm version byte for byte", () => {
    const { version } = JSON.parse(
      readFileSync("node_modules/zxing-wasm/package.json", "utf8"),
    ) as { version: string };
    const served = `public/vendor/zxing_reader-${version}.wasm`;
    expect(
      existsSync(served),
      `copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to ${served} and update ZXING_WASM_URL`,
    ).toBe(true);
    expect(
      readFileSync(served).equals(
        readFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"),
      ),
    ).toBe(true);

    const component = readFileSync("src/components/qr/camera-scanner.tsx", "utf8");
    expect(component).toContain(`/vendor/zxing_reader-${version}.wasm`);
  });
});
