// FEATURE: intro
// LAST UPDATED BY: Evelyn Wong
// UPDATE DATE: 2026-05-04
// BUILD: e5021a5
// DEPENDS ON: leaf
// CONSUMED BY: ./App.js
//
// Boot/loading animation. Pure presentational. Calls onComplete after its
// timed sequence so App.js advances to the IntroScreen.

// Loading Screen — playful, Marauder's-Map-style boot trail that walks the
// Strollo wordmark into being. Two boot SVGs (the "ll" of strollo) come
// striding in along curved paths from opposite corners; small footprint marks
// fade in along the trail behind them; the whole thing settles into the
// finished wordmark, then the screen fades out.
import React, { useEffect, useState } from "react";
import leftBootImg from "./assets/loading-left-boot.png";
import rightBootImg from "./assets/loading-right-boot.png";
import "./LoadingScreen.css";

const TOTAL_MS = 5800;
const FADE_MS = 600;

// Footprints scattered along each boot's incoming path. Coordinates are in
// the loading-stage's own coordinate space (centered on the boots' final
// spot). The trails sweep through wide S-curves before converging on the
// logo so it reads as a meandering walk, not a straight march.
const TRAIL_RIGHT = [
  // Starts bottom-left, dips further down-right, loops back up-left,
  // curves up-right into the center.
  { x: -160, y:  225, rot:  28, delay:  200 },
  { x: -120, y:  235, rot:   8, delay:  380 },
  { x:  -80, y:  220, rot: -16, delay:  560 },
  { x:  -65, y:  185, rot: -32, delay:  740 },
  { x:  -95, y:  150, rot:  22, delay:  920 },
  { x: -135, y:  120, rot: -10, delay: 1100 },
  { x: -120, y:   80, rot:  35, delay: 1280 },
  { x:  -80, y:   55, rot:  -8, delay: 1460 },
  { x:  -45, y:   30, rot:  18, delay: 1640 },
  { x:  -18, y:   10, rot:  -4, delay: 1820 },
];
const TRAIL_LEFT = [
  // Mirrored S-curve from the top-right: starts top-right, arcs up-left,
  // loops back down-right, then curves down-left to the center.
  { x:  170, y: -225, rot: -28, delay:  280 },
  { x:  130, y: -240, rot:  -6, delay:  460 },
  { x:   90, y: -225, rot:  18, delay:  640 },
  { x:   75, y: -190, rot:  32, delay:  820 },
  { x:  105, y: -155, rot: -22, delay: 1000 },
  { x:  145, y: -125, rot:  10, delay: 1180 },
  { x:  130, y:  -85, rot: -32, delay: 1360 },
  { x:   90, y:  -58, rot:   8, delay: 1540 },
  { x:   52, y:  -32, rot: -16, delay: 1720 },
  { x:   22, y:  -10, rot:   4, delay: 1900 },
];

function Footprint({ x, y, rot, delay, mirror }) {
  // Shoe-sole footprint: a rounded rectangle for the forefoot/arch and a
  // smaller rounded oval for the heel, separated by a tiny gap — reads as a
  // generic shoe imprint rather than a bare foot.
  return (
    <svg
      className="ls-footprint"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: `translate(-50%, -50%) rotate(${rot}deg)${mirror ? " scaleX(-1)" : ""}`,
        animationDelay: `${delay}ms`,
      }}
      width="14"
      height="22"
      viewBox="0 0 14 22"
      fill="none"
      aria-hidden="true"
    >
      {/* forefoot + arch (outer shoe outline) */}
      <path
        d="M3 2.6 Q7 0.6 11 2.6 Q12.4 5 12 8.5 Q11.4 12 10 13.4 L4 13.4 Q2.6 12 2 8.5 Q1.6 5 3 2.6 Z"
        fill="#A969C8"
      />
      {/* heel pad */}
      <ellipse cx="7" cy="17.4" rx="3.2" ry="2.6" fill="#A969C8" />
    </svg>
  );
}

export default function LoadingScreen({ onComplete }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!onComplete) return;
    const tFade = setTimeout(() => setFading(true), TOTAL_MS - FADE_MS);
    const tDone = setTimeout(() => onComplete(), TOTAL_MS);
    return () => { clearTimeout(tFade); clearTimeout(tDone); };
  }, [onComplete]);

  return (
    <div className={`loading-screen${fading ? " loading-screen--fading" : ""}`}>
      {/* Soft ambient blobs (matches Strollo's quiz/voice aesthetic) */}
      <div className="ls-blobs">
        <div className="ls-blob ls-blob--1" />
        <div className="ls-blob ls-blob--2" />
        <div className="ls-blob ls-blob--3" />
      </div>

      {/* The wordmark — text appears first, boots walk in to fill the gap. */}
      <div className="ls-wordmark" aria-label="strollo">
        <span className="ls-text ls-text--left">stro</span>

        <div className="ls-boots">
          {/* Footprint trails laid down first, behind the boots */}
          {TRAIL_RIGHT.map((p, i) => (
            <Footprint key={`r-${i}`} {...p} mirror={false} />
          ))}
          {TRAIL_LEFT.map((p, i) => (
            <Footprint key={`l-${i}`} {...p} mirror />
          ))}

          {/* Final pose matches the Strollo logo: upright boot on the left
              and kicking boot on the right overlap to form the inverted-V
              "M" between "stro" and "o". Each boot is a span (carrying the
              walk-in translate animation) wrapping an img (carrying the
              counter-rotation that keeps the boot upright during the walk,
              and the delayed settle-tilt that drops it into the natural
              artwork angle once it lands in the wordmark). */}
          <span className="ls-boot ls-boot--left">
            <img
              className="ls-boot-tilt ls-boot-tilt--left"
              src={leftBootImg}
              width="31"
              height="46"
              alt=""
              aria-hidden="true"
            />
          </span>
          <span className="ls-boot ls-boot--right">
            <img
              className="ls-boot-tilt ls-boot-tilt--right"
              src={rightBootImg}
              width="53"
              height="48"
              alt=""
              aria-hidden="true"
            />
          </span>
        </div>

        <span className="ls-text ls-text--right">o</span>
      </div>

      <div className="ls-tagline">Pocket the map. Unpack the city.</div>
    </div>
  );
}
