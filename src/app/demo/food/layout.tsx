import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Try the demo — order food on WhatsApp",
  description:
    "See exactly what your customers experience: browse the daily menu, place an order, and get an instant confirmation, all inside WhatsApp.",
  openGraph: {
    title: "Try the demo — order food on WhatsApp",
    description:
      "See exactly what your customers experience: browse the daily menu, place an order, and get an instant confirmation, all inside WhatsApp.",
  },
};

export default function DemoFoodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
