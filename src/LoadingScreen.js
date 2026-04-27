// Loading Screen — playful, Marauder's-Map-style boot trail that walks the
// Strollo wordmark into being. Two boot SVGs (the "ll" of strollo) come
// striding in along curved paths from opposite corners; small footprint marks
// fade in along the trail behind them; the whole thing settles into the
// finished wordmark, then the screen fades out.
import React, { useEffect, useState } from "react";
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
        fill="#34233E"
      />
      {/* heel pad */}
      <ellipse cx="7" cy="17.4" rx="3.2" ry="2.6" fill="#34233E" />
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
              (Vector 22) and kicking boot on the right (Vector 23) overlap to
              form the inverted-V "M" between "stro" and "o". */}
          <svg
            className="ls-boot ls-boot--left"
            width="31"
            height="46"
            viewBox="0 0 31 46"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.45905 22.8849C9.71539 20.7834 18.2006 7.58113 22.7119 1.12256C25.2104 1.68282 28.6111 6.10266 29.9992 8.24255C30.0917 11.324 22.172 22.1324 18.2006 27.1514C23.6372 28.6688 29.7254 36.1077 29.0738 40.691C28.4747 44.9053 26.6833 44.3483 24.7939 43.6091L3.04756 32.2871C0.614161 30.8737 -0.445456 24.8459 4.45905 22.8849Z"
              fill="#34233E"
              stroke="#A969C8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <svg
            className="ls-boot ls-boot--right"
            width="53"
            height="48"
            viewBox="0 0 53 48"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14.4954 1.15656C13.4811 0.233265 5.69659 3.61869 1.93115 5.42681C4.12125 7.04257 8.66283 10.7588 9.30833 12.6978C12.19 13.9673 18.6821 27.1772 20.0283 29.3171C21.1619 31.119 22.1031 43.3974 25.2154 45.9364C27.7052 47.9677 31.3246 46.6289 32.8231 45.7056C34.8982 44.4271 49.3065 33.8182 50.9202 33.0103C52.2113 32.364 51.9961 30.125 51.7271 29.0863C49.8828 25.2084 45.2721 24.4698 43.1973 24.5852C40.4308 24.1236 34.36 27.7783 31.6704 29.6633C30.0567 22.9694 15.7634 2.31068 14.4954 1.15656Z"
              fill="#34233E"
              stroke="#A969C8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <span className="ls-text ls-text--right">o</span>
      </div>

      <div className="ls-tagline">Pocket the map. Unpack the city.</div>
    </div>
  );
}
