// FEATURE: intro
// LAST UPDATED BY: Eric Tsai
// UPDATE DATE: 2026-04-28
// BUILD: f718df0
// DEPENDS ON: leaf
// CONSUMED BY: ./App.js
//
// Intro animation shown once after the loading screen. Pure presentational —
// no state beyond a "Continue" callback handed up to App.js.

// Intro Screen — shown once after the launch loading animation. Frames the
// Strollo value prop ("see something new today") with a looping animation of
// walk-themed emojis bubbling up like rising thoughts.
import React, { useState } from "react";
import "./IntroScreen.css";


// Walk-themed emojis bubbling up from the bottom of the stage. Each gets its
// own start position, drift, scale, duration and delay so the loop never
// looks regimented. Total cycle ≈ 6s with 8 bubbles staggered ~0.8s apart so
// at any given moment 2–3 are floating mid-stage.
const INTRO_EMOJIS = [
  { char: "🚶",                 left: "50%", delay: "0.0s", dur: "5.6s", drift: "-22px", scale: 1.05 }, // walking
  { char: "🌳",                 left: "20%", delay: "0.7s", dur: "6.2s", drift: "14px",  scale: 1.0  }, // tree
  { char: "🍦",                 left: "76%", delay: "1.4s", dur: "5.8s", drift: "-16px", scale: 0.95 }, // ice cream
  { char: "☕",                       left: "35%", delay: "2.1s", dur: "6.4s", drift: "20px",  scale: 1.0  }, // coffee
  { char: "🏙️",          left: "65%", delay: "2.8s", dur: "5.6s", drift: "-18px", scale: 1.10 }, // city skyline
  { char: "🔭",                 left: "10%", delay: "3.5s", dur: "6.0s", drift: "22px",  scale: 0.95 }, // telescope (binoculars-ish)
  { char: "🎨",                 left: "85%", delay: "4.2s", dur: "5.7s", drift: "-20px", scale: 1.0  }, // art palette
  { char: "🥐",                 left: "45%", delay: "4.9s", dur: "6.1s", drift: "16px",  scale: 0.95 }, // croissant
];

export default function IntroScreen({ onContinue }) {
  const [leaving, setLeaving] = useState(false);

  const handleContinue = () => {
    if (leaving) return;
    setLeaving(true);
    // Hold the screen swap until the fade-out has mostly played; without
    // the delay, IntroScreen unmounts synchronously and the leaving
    // animation is never seen — the cut to QuizScreen feels abrupt.
    setTimeout(() => onContinue?.(), 320);
  };

  return (
    <div className={`intro-screen${leaving ? " intro-screen--leaving" : ""}`}>
      <div className="intro-stage" aria-hidden="true">
        {INTRO_EMOJIS.map((e, i) => (
          <span
            key={i}
            className="intro-bubble"
            style={{
              left: e.left,
              animationDuration: e.dur,
              animationDelay: e.delay,
              "--drift": e.drift,
              "--scale": e.scale,
            }}
          >
            {e.char}
          </span>
        ))}
      </div>

      <h1 className="intro-headline">
        Explore somewhere<br />new today.
      </h1>

      <p className="intro-body">
        Variety is the spice of life.
      </p>
      <p className="intro-body">
        Take a walk and enjoy what the world has to offer.
      </p>

      <button type="button" className="intro-cta" onClick={handleContinue}>
        Let's get started
      </button>
    </div>
  );
}
