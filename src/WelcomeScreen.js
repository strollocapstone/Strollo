// FEATURE: intro
// LAST UPDATED BY: Evelyn Wong
// UPDATE DATE: 2026-05-02
// DEPENDS ON: ./assets/Strollo_logo.png, ./assets/WelcomeScreen_globe1.png, ./assets/Left_boot.png, ./assets/Right_boot.png
// CONSUMED BY: ./App.js
//
// Welcome Screen — single static screen shown after the loading animation.
// Static title; a shallow-sine-wave curving sentence runs edge-to-edge above
// the globe illustration, scrolling leftward continuously.

import React, { useState } from "react";
import strolloLogo from "./assets/Strollo_logo.png";
import globeImage from "./assets/WelcomeScreen_globe1.png";
import leftBoot from "./assets/Left_boot.png";
import rightBoot from "./assets/Right_boot.png";
import "./WelcomeScreen.css";

const TAGLINE = "Follow your feet, land somewhere great";
const ARC_SENTENCE =
  "There's a bookstore one block ahead with a great rare-books section. Worth a detour? · ";

export default function WelcomeScreen({ onContinue }) {
  const [leaving, setLeaving] = useState(false);

  const handleContinue = () => {
    if (leaving) return;
    setLeaving(true);
    // Match IntroScreen's 320ms hand-off so the fade-out plays before the
    // QuizScreen mounts on top.
    setTimeout(() => onContinue?.(), 320);
  };

  return (
    <div className={`welcome-screen${leaving ? " welcome-screen--leaving" : ""}`}>
      <img className="welcome-logo" src={strolloLogo} alt="Strollo" />

      {/* Shallow sine wave (one gentle peak, one gentle trough) spanning
          edge-to-edge. The text starts already filling the path from the
          left, so on first paint there's no empty wave waiting for text
          to slide in from the right. */}
      <svg className="welcome-arc" viewBox="0 0 320 120" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <path id="welcome-arc-path" d="M 0 60 Q 160 -20 320 60 T 640 60" fill="none" />
        </defs>
        <text className="welcome-arc-text">
          <textPath href="#welcome-arc-path" startOffset="0%">
            {ARC_SENTENCE.repeat(6)}
            <animate
              attributeName="startOffset"
              from="0%"
              to="-100%"
              dur="32s"
              repeatCount="indefinite"
            />
          </textPath>
        </text>
      </svg>

      <div className="welcome-globe-wrap">
        <img
          className="welcome-boot welcome-boot--left"
          src={leftBoot}
          alt=""
          aria-hidden="true"
        />
        <img
          className="welcome-boot welcome-boot--right"
          src={rightBoot}
          alt=""
          aria-hidden="true"
        />
        <img
          className="welcome-globe-image"
          src={globeImage}
          alt=""
          aria-hidden="true"
        />
      </div>

      <h2 className="welcome-tagline">{TAGLINE}</h2>

      <button type="button" className="welcome-cta" onClick={handleContinue}>
        Get started
      </button>
    </div>
  );
}
