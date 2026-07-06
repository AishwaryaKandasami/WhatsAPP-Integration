import type { Metadata } from "next";

const sellerName = process.env.SELLER_BUSINESS_NAME || "Kitchen";

export const metadata: Metadata = {
  title: `${sellerName} — Menu manager`,
  description: "Update the daily menu in seconds.",
  robots: { index: false, follow: false },
};

export default function KitchenMenuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
