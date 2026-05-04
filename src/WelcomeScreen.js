// FEATURE: intro
// LAST UPDATED BY: Evelyn Wong
// UPDATE DATE: 2026-05-04
// BUILD: 02f1547
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

const TAGLINE = "Follow your feet, land somewhere delightful";
// Arc text is split so the leading "Psst" can be italicized via a <tspan>
// while the rest of the sentence stays regular weight. The whole pair
// repeats ARC_REPEATS times so the wave path stays full of characters
// throughout the leftward scroll.
const ARC_PSST = "Psst";
const ARC_REST = ". The city is buzzing...give it a listen?  ·  ";
const ARC_REPEATS = 6;

export default function WelcomeScreen({ onContinue }) {
  const [leaving, setLeaving] = useState(false);

  const handleContinue = () => {
    if (leaving) return;
    setLeaving(true);
    // 320ms hand-off so the fade-out plays before the QuizScreen mounts
    // on top.
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
            {Array.from({ length: ARC_REPEATS }, (_, i) => (
              <React.Fragment key={i}>
                <tspan fontStyle="italic">{ARC_PSST}</tspan>
                {ARC_REST}
              </React.Fragment>
            ))}
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
