// LockScreen represents the phone's lock screen state during a walk —
// it is NOT an in-app screen. When the user locks their phone mid-walk,
// the OS shows this: a dark backdrop with the Walk Companion widget
// pinned to the top. Renders the SAME shared WalkCompanionWidget the
// NavigationMapScreen uses, just with no map underneath.
import React from "react";
import WalkCompanionWidget from "./WalkCompanionWidget";

export default function LockScreen({
  destination = "fox & feather",
  instruction = "turn right in 280 ft",
  distance = "280 ft",
  eta = "3 min",
  progress = 0.4,
  atTarget = false,
  canSkip = false,
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "100vh",
        background: "#1E1541",
      }}
    >
      <WalkCompanionWidget
        destination={destination}
        instruction={instruction}
        distance={distance}
        eta={eta}
        progress={progress}
        atTarget={atTarget}
        canSkip={canSkip}
      />
    </div>
  );
}
