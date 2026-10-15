"use client";

import { type IScannerError, Scanner, setZXingModuleOverrides } from "@yudiel/react-qr-scanner";

// Client-only (camera); load with next/dynamic, ssr: false.
//
// Browsers without a native BarcodeDetector (iPhone Safari) decode with zxing-wasm,
// which by default downloads its .wasm from a public CDN. Serve our own copy instead:
// no third-party request, and it works under a strict Content-Security-Policy.
// The file name carries the zxing-wasm version; tests/unit/zxing-wasm.test.ts fails
// if the installed version moves without the copy being refreshed.
export const ZXING_WASM_URL = "/vendor/zxing_reader-3.1.3.wasm";

setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) =>
    path.endsWith(".wasm") ? ZXING_WASM_URL : prefix + path,
});

type Props = {
  onScan: (text: string) => void;
  onError: (error: IScannerError) => void;
  paused?: boolean;
};

export default function CameraScanner({ onScan, onError, paused }: Props) {
  return (
    <Scanner
      onScan={(codes) => {
        const text = codes[0]?.rawValue;
        if (text) onScan(text);
      }}
      onError={onError}
      formats={["qr_code"]}
      paused={paused}
      constraints={{ facingMode: "environment" }}
      sound={false}
      components={{ finder: true, torch: true }}
      classNames={{ container: "size-full", video: "size-full object-cover" }}
    />
  );
}
