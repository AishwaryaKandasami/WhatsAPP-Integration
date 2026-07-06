import type { Metadata } from "next";

const sellerName = process.env.SELLER_BUSINESS_NAME || "Kitchen";

export const metadata: Metadata = {
  title: `${sellerName} — Orders`,
  description: "View and update incoming customer orders.",
  robots: { index: false, follow: false },
};

export default function KitchenOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
