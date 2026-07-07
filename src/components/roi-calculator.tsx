"use client";

import { useState } from "react";

function formatINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

const STARTER_PRICE = 499;

/**
 * Interactive ROI estimator for the landing page.
 * A prospect adjusts their own numbers and sees the revenue recovered from
 * missed / after-hours orders. Two qualitative wins (repeat questions handled,
 * orders logged automatically) are shown alongside without invented numbers.
 */
export default function RoiCalculator() {
  const [avgOrder, setAvgOrder] = useState(150);
  const [missedPerDay, setMissedPerDay] = useState(3);
  const [recoveryPct, setRecoveryPct] = useState(50);

  const monthlyRecovered = avgOrder * missedPerDay * 30 * (recoveryPct / 100);
  const net = monthlyRecovered - STARTER_PRICE;

  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-center">
      {/* Inputs */}
      <div className="space-y-6">
        <Slider
          label="Average order value"
          value={avgOrder}
          display={formatINR(avgOrder)}
          min={50}
          max={600}
          step={10}
          onChange={setAvgOrder}
        />
        <Slider
          label="Orders you miss per day"
          hint="after-hours, dinner rush, while cooking"
          value={missedPerDay}
          display={`${missedPerDay}`}
          min={1}
          max={20}
          step={1}
          onChange={setMissedPerDay}
        />
        <Slider
          label="Orders the bot recovers"
          value={recoveryPct}
          display={`${recoveryPct}%`}
          min={30}
          max={100}
          step={5}
          onChange={setRecoveryPct}
        />
      </div>

      {/* Result */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white shadow-lg">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-100">
          Extra revenue recovered / month
        </p>
        <p className="mt-2 text-4xl font-bold sm:text-5xl">
          {formatINR(monthlyRecovered)}
        </p>
        <div className="mt-5 space-y-2 border-t border-white/25 pt-4 text-sm">
          <div className="flex items-center justify-between text-emerald-50">
            <span>Your plan (Starter)</span>
            <span>− ₹499</span>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <span>Net gain / month</span>
            <span>{formatINR(net)}</span>
          </div>
        </div>

        {/* Value beyond recovered orders */}
        <div className="mt-5 space-y-2 border-t border-white/25 pt-4 text-sm">
          <p className="font-medium text-emerald-50">Plus, on every order:</p>
          <div className="flex items-start gap-2">
            <span>💬</span>
            <span>
              <strong>Repeat questions answered automatically</strong> —
              price, menu, delivery area — so you&apos;re not retyping the
              same replies all day.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span>📋</span>
            <span>
              <strong>Every order logged automatically</strong> to your
              dashboard — no notebook, no lost or forgotten orders.
            </span>
          </div>
        </div>

        <p className="mt-5 text-xs text-emerald-100">
          Estimate only — drag the sliders for your own numbers.
        </p>
      </div>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-sm font-medium text-slate-700">
          {label}
          {hint && (
            <span className="ml-1 text-xs font-normal text-slate-400">
              ({hint})
            </span>
          )}
        </label>
        <span className="text-lg font-bold text-emerald-600">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-600"
      />
    </div>
  );
}
