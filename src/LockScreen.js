// LockScreen represents the phone's lock screen state during a walk —
// it is NOT an in-app screen. When the user locks their phone mid-walk,
// the OS shows this: a dark backdrop with the Walk Companion widget
// pinned to the top. Same widget as NavigationMapScreen, minus the
// drag-to-expand gesture (no way to open the full app from the lock
// screen) and without the map underneath.
import React, { useState } from "react";
import WalkCompanionWidget from "./WalkCompanionWidget";

export default function LockScreen({
  nextWaypoint = "fox & feather",
  distance = "280 ft",
  turn = "right",
  eta = "3:24",
}) {
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [locked, setLocked] = useState(false);

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
        nextWaypoint={nextWaypoint}
        distance={distance}
        turn={turn}
        eta={eta}
        listening={listening}
        locked={locked}
        muted={muted}
        onMuteToggle={() => setMuted((m) => !m)}
        onListenStart={() => setListening(true)}
        onListenEnd={() => setListening(false)}
        onDragLock={() => setLocked(true)}
        onUnlock={() => { setLocked(false); setListening(false); }}
      />
    </div>
  );
}
