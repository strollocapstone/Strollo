# Strollo — Project Context for Claude Code

## What is Strollo?
Strollo is a solo urban exploration mobile app. It helps users go on walks in cities by offering
low-disruption, personalized guidance — before, during, and after the walk.

The core philosophy: empower the user's own agency. The app should feel like an invisible,
sensory companion — not a rigid navigator.

---

## Research Insights (Interview Synthesis)

### Core Hypothesis
Delight comes from organic discovery, not structured orchestration. Users want an
"invisible" companion that prioritizes their agency over algorithms.

### Key Takeaways
1. **Fixed anchor + spontaneous journey** — 5/6 users preferred having a destination
   (e.g. a coffee shop) as a psychological safety net, while keeping the route open.
2. **Screen-free guidance preferred** — 4/6 users wanted auditory or haptic feedback
   to stay immersed in the walk, not staring at a phone.
3. **Nudges over rigid routes** — 5/6 users wanted suggestions that empower their
   own decision-making, not turn-by-turn instructions.

### User Types
- **The Meticulous Navigator** — structured, curated list, efficiency-driven
- **The Meditative Wanderer** — introspective, open, process-oriented
- **The Cultural Immersion Seeker** — sensory, atmosphere-driven, authenticity-focused

### Friction Points (High Priority)
- Unwanted unknowns (construction, safety issues, getting lost)
- Disruptive tech (constant screen-checking, repetitive notifications)
- Untrustworthy recommendations (prefers human testimony over AI)

### Advisor Feedback (Coye)
- Balance spontaneity and structure — that tension IS the challenge
- Decenter AI: make it fit the problem, not the other way around
- Three phases: **Pre-walk**, **During walk**, **Post-walk / Reflection**
- Tech should scale (with headphones, haptics) but work with just a phone
- Consider: is it personalized to the individual, or to their close network?

---

## User Flow Summary
**New user path:**
Open App → Quiz for preferences → Algorithm builds personalized knowledge

**Returning user:**
Input constraints (location, group size, preferences)
→ Recommendations / Plan Options
→ Add locations to plan
→ Start walking (AI active in background)
→ Low-disruption walking guide (live recommendations)
→ Option to Take Detour (add new to plan)
→ Finish walk
→ AI reflects on walk / consolidates trip plan
→ Feedback for AI + Share with friends/family

---

## Current Focus: Homescreen & Navigation Screens

### Homescreen (Pre-Walk / Discovery)
This is the PRE-WALK phase where users set their intentions and discover nudges.
- **Map Interface:** The primary view is a map featuring a transparent purple radial gradient centered on the user's location.
- **User Avatar:** The user's location is represented by moving feet/boots (inspired by the Marauder's Map).
- **Location Focus:** A small, nondescript focus icon in the bottom right allows the user to re-center the map on their current location if they manually pan away.
- **Search Bar:** Located at the bottom with placeholder text "I'm in the mood for...". Users can tap to type or use the integrated mic button for voice commands.
- **Recommendations Overlay:** Dragging the search bar up reveals a panel covering less than half the screen, featuring tabs for **Suggested**, **Recent**, and **Faves**.
- **Map Syncing:** When the overlay is dragged open, the map dynamically updates to show pins for the locations listed in the recommendations.
- **Adding Locations:** Beside each recommendation on the left is a transparent purple plus sign. Once clicked to add to the journey, it transitions to a less transparent purple location icon with a plus sign inside.
- **Swipe Actions:** Users can swipe items in the recommendations list to reveal a heart icon (Fave) or a minus sign in a circle (Remove).

### Navigation Screen (Low-Disruption Walking Guide)
This is the DURING-WALK phase. Key design requirements prioritize a minimal, ambient experience where the user is not constantly staring at the screen.
- **Map Interface:** Uses the same base map, feet/boots user avatar, and bottom-right location focus icon as the Homescreen. The search bar is removed.
- **Path Tracking:** Small, low-transparency purple trailing footsteps appear behind the user avatar to visually track where the user has walked.
- **Ambient Nudges (Heatmaps):** Areas of interest (based on the algorithm and past journeys) are highlighted on the map with a transparent yellow heatmap overlay that grows darker at the center of the spot.
- **Sound Control:** A sound button at the bottom of the map activates voice navigation, allowing the user to speak to and hear the AI for hands-free guidance.
- **Journey Edit Control:** A flag icon with trailing dots sits at the bottom of the map. Clicking this opens an overlay showing the locations currently added to the journey. Within this overlay, the user can **pause** or **end** their journey, **remove** locations, and **add** new locations between their existing stops.

### Voice Interaction State (Full & Minimized)
This is a primary, interactive state within the During-walk phase, activated by the sound button. It should feel non-disruptive, allowing the user to remain present.
- **Full Screen Overlay (Opaque, Whimsical)**
  - **Aesthetic:** A full-screen, opaque background using Strollo colors (the map is *not* visible). The design is fun and whimsical, keeping the vibe light.
  - **Status Indicators:** Clear visual cues are present to indicate when the AI is actively **Listening** (e.g., pulsing/animating sound waves) versus **Thinking** (e.g., a processing animation).
  - **Live Transcripts:** The interaction features speech bubbles that type out exactly what the user and the AI are saying, keeping a visual log of the conversation.
  - **User Feedback:** Small thumbs up and thumbs down icons sit directly below the AI's speech bubbles, allowing the user to instantly provide feedback on whether the recommendations are good or if the AI correctly understood them.
  - **Drag Handle:** A small line at the top center of the screen allows the user to easily drag the view down into the minimized overlay mode.
  - **Controls:** - **Active Sound Icon:** The main interaction point is the same sound icon from the map, now shown in an active state. Clicking this icon again takes the user out of voice mode entirely.
    - **Mute AI Speaker Icon:** A secondary speaker icon lets the user turn off the AI's audio output. The user remains in voice mode and can still speak to the app (and read the text bubbles), but the AI will not speak back aloud.
- **Minimized Overlay Mode**
  - **Placement & Appearance:** Dragging the top handle down minimizes the voice screen into a smaller overlap at the bottom of the screen.
  - **Map Visibility:** This minimized mode restores visibility of the map behind it, allowing the user to seamlessly reference their location while keeping voice controls and live transcript snippets accessible.

---

## Design System

### Colors
| Role        | Color Description         | Hex Code  |
|-------------|---------------------------|-----------|
| Primary     | Strollo yellow            | #FFD501   |
| Accent      | Light purple              | #E1B1FF   |
| Accent 2    | Deep purple               | #8851D4   |
| Warning     | Orange                    | #FF9900   |
| Background  | Off-white / warm grey     | #F7F3F5   |
| Caption     | Muted dark purple         | #5A4B64   |
| Body text   | Dark purple/black         | #34233E   |

### Fonts
- **App name / hero headings**: Unbounded (Google Fonts)
- **All other UI text**: Satoshi (Fontshare)

### Logo
- "Strollo" wordmark in bold black, quirky rounded letterforms
- The double-l uses a stylized diagonal slash motif

### Aesthetic Direction
- Warm, earthy, cozy but modern
- Minimal and calm — not busy or data-heavy
- Should feel like a walk companion, not a dashboard

---

## Tech Stack (to be decided / in progress)
- Mobile-first web app or React Native
- Claude API for personalized nudges and recommendations
- Potentially integrates with Apple Health / location services