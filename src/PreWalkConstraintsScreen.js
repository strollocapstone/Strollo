// Pre-Walk Constraints Screen — placeholder.
import React from "react";

export default function PreWalkConstraintsScreen({ onGoBack }) {
  return (
    <>
      <h1>Pre-Walk Constraints</h1>
      {onGoBack && <button onClick={onGoBack}>Back</button>}
    </>
  );
}
