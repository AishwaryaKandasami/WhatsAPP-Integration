import Link from "next/link";
import type { Metadata } from "next";
import RoiCalculator from "@/components/roi-calculator";
import OrderDashboardExample from "@/components/order-dashboard-example";
import { whatsappCtaUrl } from "@/lib/marketing";

// Product brand — chosen "OrderGenie" (2026-07). Change here to rebrand everywhere.
const BRAND = "OrderGenie";

const demoUrl = "/demo/food";
const getItUrl = whatsappCtaUrl();

// The dashboard-example section pulls real orders from Supabase. Revalidate
// periodically (ISR) so "Live example" stays reasonably fresh without making
// the whole landing page dynamic on every request.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "WhatsApp orders on autopilot for your kitchen",
  description:
    "OrderGenie is the AI employee your home kitchen tries for free — it takes orders on WhatsApp 24/7, in English and Tamil (including Tanglish). See real results before you pay anything.",
};

export default function Home() {
  return (
    <main className="bg-white text-slate-900">
      <Header />
      <Hero />
      <StatStrip />
      <Pillars />
      <HowItWorks />
      <DashboardSection />
      <RoiSection />
      <Pricing />
      <FinalCta />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{String.fromCodePoint(0x1f37d)}</span>
          <span className="text-lg font-bold tracking-tight">{BRAND}</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
          <a href="#how" className="hover:text-slate-900">
            How it works
          </a>
          <a href="#roi" className="hover:text-slate-900">
            ROI
          </a>
          <a href="#pricing" className="hover:text-slate-900">
            Pricing
          </a>
        </nav>
        <Link
          href={demoUrl}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          Try live demo
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          For home kitchens, cloud kitchens &amp; tiffin services
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          The AI employee your kitchen hires —{" "}
          <span className="text-emerald-600">try it free</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">
          {BRAND} takes orders on WhatsApp <strong>24/7</strong> — in English
          and Tamil, including <em>Tanglish</em>. It shows your menu, builds the
          cart, confirms the address, and drops the order straight to your
          phone. Try it free and watch real orders come in —{" "}
          <strong>pay only once you&apos;ve seen it work.</strong>
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={demoUrl}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Try it free →
          </Link>
          <a
            href={getItUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-slate-50"
          >
            Get it for my kitchen
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Free to try, no card needed · Works on your existing WhatsApp · Live
          in 10 minutes
        </p>
      </div>

      <div className="flex justify-center">
        <PhoneMock />
      </div>
    </section>
  );
}

/** Static WhatsApp-style chat mock to make the pitch feel real at a glance. */
function PhoneMock() {
  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-[2.2rem] border-8 border-slate-900 bg-slate-900 shadow-2xl">
      {/* WhatsApp header */}
      <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">
          {String.fromCodePoint(0x1f35a)}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">SR Kitchen</p>
          <p className="text-[11px] text-green-100">online</p>
        </div>
      </div>

      {/* Chat body */}
      <div
        className="space-y-2 px-3 py-4 text-[13px]"
        style={{ backgroundColor: "#ECE5DD" }}
      >
        <Bubble side="in">Vanakkam! 🙏 Inniki enna venum?</Bubble>
        <Bubble side="out">2 idli parcel venum, Adyar ku</Bubble>
        <Bubble side="in">
          Idli Set (4 pcs) × 2 = ₹80
          <br />
          Deliver to Adyar — free 🚗
          <br />
          Confirm pannalaama?
        </Bubble>
        <Bubble side="out">Ok confirm 👍</Bubble>
        <Bubble side="in">
          Order confirmed! ✅ 30 min-la ready. SR Kitchen team ungala contact pannuvaanga.
        </Bubble>
      </div>
    </div>
  );
}

function Bubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  const isIn = side === "in";
  return (
    <div className={isIn ? "flex justify-start" : "flex justify-end"}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
          isIn ? "bg-white text-slate-800" : "bg-[#DCF8C6] text-slate-800"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function StatStrip() {
  const stats = [
    ["24/7", "Always answering"],
    ["EN + தமிழ்", "Bilingual, incl. Tanglish"],
    ["10 min", "To go live"],
    ["₹0", "Extra apps for customers"],
  ];
  return (
    <section className="border-y border-slate-100 bg-slate-50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 sm:grid-cols-4">
        {stats.map(([big, small]) => (
          <div key={small} className="text-center">
            <p className="text-2xl font-bold text-slate-900">{big}</p>
            <p className="mt-1 text-xs text-slate-500">{small}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pillars() {
  const pillars = [
    {
      icon: String.fromCodePoint(0x1f9e0),
      title: "A real AI agent, not a flow builder",
      body: "No rigid menus to configure. Customers just chat naturally — “inniki enna iruku?”, “2 dosa parcel” — and the bot understands and takes the order.",
    },
    {
      icon: String.fromCodePoint(0x1f5e3),
      title: "English + Tamil out of the box",
      body: "Replies in whatever language the customer writes — English, Tamil, or Tanglish. No setup, no toggles. Your customers, their words.",
    },
    {
      icon: String.fromCodePoint(0x26a1),
      title: "Live in 10 minutes",
      body: "Add today’s menu, connect your WhatsApp, done. Every confirmed order lands on your phone with the item, address and total.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">
        Why kitchens switch to {BRAND}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
        Interakt and AiSensy are WhatsApp email-marketing tools. {BRAND} is a
        WhatsApp AI employee who also speaks Tamil.
      </p>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {pillars.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
          >
            <div className="text-3xl">{p.icon}</div>
            <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Add your menu",
      body: "Type today’s breakfast, lunch and dinner into your dashboard — or toggle items on/off as they sell out.",
    },
    {
      n: "2",
      title: "Customers order on WhatsApp",
      body: "They message your number like they always do. The bot answers instantly, in their language, and builds the order.",
    },
    {
      n: "3",
      title: "Order lands on your phone",
      body: "You get a clean summary — items, quantity, address, total — ready to cook and deliver. Reply to update the customer.",
    },
  ];
  return (
    <section id="how" className="bg-emerald-50/60 py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          How it works
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {s.body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            href={demoUrl}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            See it yourself — try the demo →
          </Link>
        </div>
      </div>
    </section>
  );
}

function DashboardSection() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-16 md:py-20">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Every order, logged automatically
          </h2>
          <p className="mt-4 text-slate-600">
            No notebook, no scrolling back through WhatsApp to remember what
            someone ordered. Every confirmed order lands straight in your
            dashboard — item, meal, total, status — updated in real time as
            you cook and deliver.
          </p>
          <p className="mt-4 text-sm text-slate-500">
            This is a live example pulled from our demo kitchen&apos;s own
            dashboard.
          </p>
        </div>
        <OrderDashboardExample />
      </div>
    </section>
  );
}

function RoiSection() {
  return (
    <section id="roi" className="mx-auto max-w-5xl px-5 py-16 md:py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">
        How much are missed orders costing you?
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
        Every message you can’t answer at the dinner rush is an order gone to
        the next kitchen. Slide your numbers and see what {BRAND} pays back.
      </p>
      <div className="mt-10 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-10">
        <RoiCalculator />
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    {
      name: "Free",
      price: "₹0",
      cadence: "forever",
      tagline: "For trying it out",
      features: ["50 AI conversations / mo", "WhatsApp only", "Menu + order taking", "English + Tamil"],
      cta: "Start free",
      highlight: false,
    },
    {
      name: "Starter",
      price: "₹499",
      cadence: "/ month",
      tagline: "For a busy home kitchen",
      features: ["1,000 conversations / mo", "Order-to-phone alerts", "Menu dashboard", "Basic analytics"],
      cta: "Get Starter",
      highlight: true,
    },
    {
      name: "Growth",
      price: "₹1,999",
      cadence: "/ month",
      tagline: "For cloud kitchens scaling up",
      features: ["5,000 conversations / mo", "+ Instagram DM", "Payment links", "Priority support"],
      cta: "Get Growth",
      highlight: false,
    },
  ];
  return (
    <section id="pricing" className="bg-slate-50 py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Simple pricing
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          Meta message fees are pass-through, no markup. Bilingual English +
          Tamil is included on every plan.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                plan.highlight
                  ? "border-emerald-300 ring-2 ring-emerald-500"
                  : "border-slate-100"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-sm text-slate-500">{plan.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-sm text-slate-500">{plan.cadence}</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={getItUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border border-slate-300 text-slate-800 hover:bg-slate-50"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-gradient-to-br from-emerald-600 to-teal-600 py-16 text-white md:py-20">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Stop losing orders to “sorry, saw this late”
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-emerald-50">
          Try it free and see real orders come in — or message us and we’ll
          set up your kitchen’s bot today.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={demoUrl}
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-base font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
          >
            Try the live demo
          </Link>
          <a
            href={getItUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-white/70 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            Chat with us on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="text-xl">{String.fromCodePoint(0x1f37d)}</span>
          <span className="font-semibold text-slate-700">{BRAND}</span>
          <span className="text-slate-400">· WhatsApp AI for food businesses</span>
        </div>
        <p className="text-slate-400">Made in Chennai · English &amp; தமிழ்</p>
      </div>
    </footer>
  );
}
