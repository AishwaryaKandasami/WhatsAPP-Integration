import { ImageResponse } from "next/og";

export const alt = "AI order assistant for WhatsApp, for home food businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#1F4D3A",
        }}
      >
        <div style={{ fontSize: 30, color: "#E8A93A" }}>
          For home food businesses
        </div>
        <div
          style={{
            fontSize: 62,
            fontWeight: 600,
            color: "#FDF8EE",
            marginTop: 20,
            maxWidth: 900,
          }}
        >
          Your AI order assistant on WhatsApp
        </div>
        <div style={{ fontSize: 28, color: "#FDF8EE", opacity: 0.8, marginTop: 28 }}>
          Never miss a customer. Open 24/7.
        </div>
      </div>
    ),
    { ...size }
  );
}
