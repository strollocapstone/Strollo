// LockScreen represents the phone's lock screen state during a walk —
// it is NOT an in-app screen. When the user locks their phone mid-walk,
// the OS shows this: a full #34233E backdrop with the Walk Companion's
// minimized pill widget floating on top. The pill here is the same
// component used in WalkCompanionScreen.js, minus the drag-to-expand
// gesture (no way to open the full app from the lock screen) and
// without the map underneath.
import React, { useState } from "react";
import { WalkCompanionPill } from "./WalkCompanionScreen";

export default function LockScreen() {
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
        background: "#34233E",
      }}
    >
      <WalkCompanionPill
        listening={listening}
        locked={locked}
        muted={muted}
        aiSpeaking={false}
        userText=""
        aiText=""
        onMuteToggle={() => setMuted((m) => !m)}
        onListenStart={() => setListening(true)}
        onListenEnd={() => setListening(false)}
        onDragLock={() => setLocked(true)}
        onUnlock={() => { setLocked(false); setListening(false); }}
      />
    </div>
  );
}
