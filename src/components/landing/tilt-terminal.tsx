"use client";

// The hero's Live Dossier Terminal, tilting in 3D towards the pointer. Framer Motion springs make it feel
// weighty: it leans in a little behind the mouse and settles without wobbling. A mint glare follows the
// pointer across the glass. Mouse only (touch scrolls as normal), and still for anyone who prefers
// reduced motion. The markup is the same on the server and in the browser, so nothing re-renders on load.

import { domAnimation, LazyMotion, m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import type { PointerEvent, ReactNode } from "react";

// Stiff enough to follow the hand, damped just under critical so it eases in without overshooting, and a
// little mass so it carries weight. The scale and glare use a softer spring.
const TILT_SPRING = { stiffness: 150, damping: 19, mass: 0.8 };
const LIFT_SPRING = { stiffness: 120, damping: 20, mass: 0.6 };
const MAX_TILT_DEG = 8;

export function TiltTerminal({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  // Where the pointer is across the terminal, 0–1 on each axis (0.5 = centre, level).
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const x = useSpring(px, TILT_SPRING);
  const y = useSpring(py, TILT_SPRING);
  const lift = useSpring(0, LIFT_SPRING); // 0 = resting, 1 = hovered

  const rotateY = useTransform(x, [0, 1], [-MAX_TILT_DEG, MAX_TILT_DEG]);
  const rotateX = useTransform(y, [0, 1], [MAX_TILT_DEG, -MAX_TILT_DEG]);
  const scale = useTransform(lift, [0, 1], [1, 1.025]);
  const glareX = useTransform(x, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(y, [0, 1], ["0%", "100%"]);
  const glare = useMotionTemplate`radial-gradient(520px circle at ${glareX} ${glareY}, rgba(0, 191, 165, 0.13), transparent 55%)`;
  const halo = useTransform(lift, [0, 1], [0.35, 0.75]);

  const active = (e: PointerEvent) => e.pointerType === "mouse" && !reduceMotion;
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!active(e)) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function onPointerEnter(e: PointerEvent<HTMLDivElement>) {
    if (active(e)) lift.set(1);
  }
  function onPointerLeave() {
    px.set(0.5);
    py.set(0.5);
    lift.set(0);
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="relative [perspective:1200px]" onPointerMove={onPointerMove} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
        {/* A mint halo behind the glass that brightens as it lifts. */}
        <m.div
          aria-hidden="true"
          style={{ opacity: halo }}
          className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(0,191,165,0.22),transparent)] blur-2xl"
        />
        <m.div style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" }} className="relative will-change-transform">
          {children}
          <m.div aria-hidden="true" style={{ backgroundImage: glare, opacity: lift }} className="pointer-events-none absolute inset-0 rounded-2xl" />
        </m.div>
      </div>
    </LazyMotion>
  );
}
