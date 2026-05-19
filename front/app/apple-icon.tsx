import { ImageResponse } from "next/og"
import { BRAND_GRADIENT_CSS } from "@/lib/brand-gradient"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            backgroundImage: BRAND_GRADIENT_CSS,
            backgroundClip: "text",
            color: "transparent",
            lineHeight: 1,
          }}
        >
          Ann
        </div>
      </div>
    ),
    { ...size },
  )
}
