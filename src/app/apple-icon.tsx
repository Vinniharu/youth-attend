import { ImageResponse } from "next/og";

import { PULSE_MARK_PATH } from "@/components/brand/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon. iOS rounds the corners itself, so the square is full-bleed.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b6bcb",
      }}
    >
      <svg width="132" height="132" viewBox="0 0 32 32">
        <path
          d={PULSE_MARK_PATH}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    size,
  );
}
