// Intro Screen — shown once after the launch loading animation. Frames the
// Strollo value prop ("phone in pocket, eyes on the city") with a looping
// animation of a phone sliding into a pocket and emitting a haptic-nudge
// glow + sound-wave arcs.
import React, { useState } from "react";
import "./IntroScreen.css";

const EXIT_MS = 420;

export default function IntroScreen({ onContinue }) {
  const [leaving, setLeaving] = useState(false);

  const handleContinue = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onContinue?.(), EXIT_MS);
  };

  return (
    <div className={`intro-screen${leaving ? " intro-screen--leaving" : ""}`}>
      <div className="intro-stage" aria-hidden="true">
        {/* Bottom haptic rings — rise from the pocket once the phone is in. */}
        <span className="intro-ring intro-ring--1" />
        <span className="intro-ring intro-ring--2" />

        {/* Pocket silhouette — back panel + front lip (the phone slides
            BEHIND the front lip when tucked in). Muted purple gradients. */}
        <svg className="intro-pocket" viewBox="0 0 200 180" fill="none">
          <defs>
            <linearGradient id="pocketBackGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#8E84A6" />
              <stop offset="100%" stopColor="#6B6286" />
            </linearGradient>
            <linearGradient id="pocketFrontGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#A097B5" />
              <stop offset="100%" stopColor="#7E7493" />
            </linearGradient>
          </defs>
          {/* back of pocket */}
          <path
            d="M 28 80 L 36 168 Q 38 174 46 174 L 154 174 Q 162 174 164 168 L 172 80
               Q 174 72 168 70 L 32 70 Q 26 72 28 80 Z"
            fill="url(#pocketBackGrad)"
          />
          <path
            d="M 32 84 L 40 166 Q 41 170 46 170 L 154 170 Q 159 170 160 166 L 168 84"
            stroke="#FFD501" strokeWidth="1.2" strokeDasharray="3 3" fill="none" opacity="0.7"
          />
          {/* front lip — the phone slides BEHIND this */}
          <path
            d="M 22 70 Q 100 56 178 70 L 174 96 Q 100 84 26 96 Z"
            fill="url(#pocketFrontGrad)"
          />
          <path
            d="M 26 74 Q 100 60 174 74"
            stroke="#FFD501" strokeWidth="1.2" strokeDasharray="3 3" fill="none" opacity="0.7"
          />
        </svg>

        {/* Phone — slides down behind the front lip and rests in the pocket */}
        <div className="intro-phone">
          <svg viewBox="0 0 64 116" fill="none">
            <defs>
              <linearGradient id="phoneBodyGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"  stopColor="#928AA4" />
                <stop offset="100%" stopColor="#5E586E" />
              </linearGradient>
              {/* Bright yellow screen — Strollo brand wash */}
              <linearGradient id="phoneScreenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#FFE76B" />
                <stop offset="100%" stopColor="#F0B900" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="112" rx="12" ry="12"
              fill="url(#phoneBodyGrad)" />
            {/* screen */}
            <rect x="7" y="9" width="50" height="98" rx="6" ry="6" fill="url(#phoneScreenGrad)" />
            {/* notch */}
            <rect x="26" y="6" width="12" height="3" rx="1.5" ry="1.5" fill="#0E0828" />
            {/* Tiny map-pin glyph on screen — purple pin on the yellow wash */}
            <path
              d="M 32 38 C 27 38 24 41 24 46 C 24 53 32 64 32 64 C 32 64 40 53 40 46 C 40 41 37 38 32 38 Z"
              fill="#3B1F6E"
            />
            <circle cx="32" cy="46" r="3" fill="#FFE76B" />
          </svg>
        </div>
      </div>

      <h1 className="intro-headline">
        Pocket your phone.<br />We've got the route.
      </h1>

      <p className="intro-body">
        Welcome to Strollo! Tell us what you're into and we'll do the rest.
      </p>
      <p className="intro-body">
        You can now explore the city without having to follow along your screen.
      </p>

      <button type="button" className="intro-cta" onClick={handleContinue}>
        Let's get started
      </button>
    </div>
  );
}
