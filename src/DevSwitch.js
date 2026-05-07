// FEATURE: intro
// LAST UPDATED BY: Eric Tsai
// UPDATE DATE: 2026-04-28
// BUILD: f718df0
// DEPENDS ON: leaf
// CONSUMED BY: ./App.js
//
// First-launch toggle to skip the loading + intro + quiz flow during
// development. Production users go through "Normal user". Not user-facing on
// the deployed build (App.js could gate by env var if needed).

// Dev Switch — first screen shown on launch. Lets the engineer skip the
// loading + intro + quiz flow during development. Picking "Normal user"
// proceeds with the real flow; "Dev" jumps straight to home with all quiz
// answers preset to YES.
import React from "react";
import "./DevSwitch.css";

export default function DevSwitch({ onDev, onNormalUser }) {
  return (
    <div className="dev-switch">
      <div className="dev-switch__card">
        <h1 className="dev-switch__title">strollo</h1>
        <p className="dev-switch__subtitle">Choose a mode</p>
        <div className="dev-switch__buttons">
          <button
            type="button"
            className="dev-switch__btn dev-switch__btn--primary"
            onClick={onDev}
          >
            Dev
          </button>
          <button
            type="button"
            className="dev-switch__btn"
            onClick={onNormalUser}
          >
            Normal user
          </button>
        </div>
        <p className="dev-switch__hint">
          Dev mode skips the intro and quiz; every quiz answer is YES.
        </p>
      </div>
    </div>
  );
}
