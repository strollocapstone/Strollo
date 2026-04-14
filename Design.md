# Strollo — Project Context for Claude Code

## What is Strollo?
Strollo is a solo urban exploration mobile app. It helps users go on walks in cities by offering
low-disruption, personalized guidance — before, during, and after the walk.

The core philosophy: empower the user's own agency. The app should feel like an invisible,
sensory companion and not a rigid navigator.

---

### Friction Points (High Priority)
- Unwanted unknowns (construction, safety issues, getting lost)
- Disruptive tech (constant screen-checking, repetitive notifications)
- Untrustworthy recommendations (prefers human testimony over AI)

### Advisor Feedback (Coye)
- Balance spontaneity and structure — that tension IS the challenge
- Decenter AI: make it fit the problem, not the other way around
- Three phases: **Pre-walk**, **During walk**, **Post-walk / Reflection**
- Tech should scale (with headphones, haptics) but work with just a phone

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
→ Option to take detour (add new location to plan)
→ Finish walk
→ AI reflects on walk / provides reward for immmersing in environment during walk

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

---

## Screen Specs

### Loading Screen (App Launch)
The first screen a user sees when opening Strollo. Should feel warm, whimsical, and inviting.

### Quiz Screen (New User Onboarding)
Shown once on first launch. Collects user preferences to 
personalize the algorithm and journey recommendations.

### Home Screen (Pre-Walk)
The homescreen is a neutral starting point — it shows the map with the user's current location and nearby recommendations, but requires no action from the user. From here the user has two paths:

- **Start Walking** — jumps straight into the walk with 
  no constraints set. The app uses the user's location 
  and default preferences to guide them.
- **Set Constraints** — opens the Pre-Walk Constraints 
  screen where the user can input their mood, destination, 
  time, and other preferences before starting.

### Walk Companion Screen (During-Walk)
Activates automatically when the user taps "Start Walking" 
This screen has two states: Full Screen and Minimized (Wdiget). The Navigation Screen map always lives underneath and is visible when this screen is minimized.

Key design requirements prioritize a minimal, ambient experience where the user is not constantly staring at the screen. 
Look Up nudges and Detour nudges surface during the 
walk to encourage organic discovery and disengagement from the screen.

### Lock Screen (During-Walk)
The lock screen is the same component as the minimized 
Walk Companion minimized widget. When the user pockets their phone during a walk, this is what they see when they 
wake their screen — the minimized widget showing the 
directional arrow, ETA, and voice controls. 

### Navigation Map Screen (During-Walk)
It lives underneath the Walk Companion screen at all times and is accessible by minimizing the Walk Companion to the widget.
- **User's current location** — animated boots for user's avatar
- **Path already walked** — shoe sole footsteps trailing 
  behind the user in fading purple
- **Route ahead** — a soft purple line connecting the 
  user's position to each upcoming stop in order
- **Journey stops** — locations added to the journey 
- **Interest points in the vicinity** — nearby recommended 
  locations shown as muted labels on the map, always 
  visible even if not added to the journey, unless user dismisses it.

### Journey Edit Screen (During-Walk)
Accessible during a walk by tapping the flag icon on 
the Navigation Map Screen. Opens as a bottom sheet 
overlay over the map.

- Lists all locations currently added to the journey 
  in order
- User can:
  - Remove a location from the journey
  - Add a new location between existing stops
  - Reorder stops by dragging
  - Pause the walk
  - End the walk
- Drag handle at the top to close this overlay by dragging down
- Can be expanded to full screen by dragging up
- When in voice mode, this screen is not accessible — 
  all journey edits are handled through voice commands 
  instead
- Walk Companion widget remains visible above 
  the overlay at all times

### Reward Screen (Post-Walk)
Celebrates the user's walk and rewards them for staying immersed in their environment.
**Immersion Score**
- Hero element of the screen — a warm celebratory stat 
  showing how present the user was
- Example: "You walked 1.5 miles and only checked your 
  screen twice. You're a true wanderer."
- Tone: personal, celebratory, never clinical

**Journey Collectibles**
- The walk is visualized as a trail of illustrated 
  collectibles representing the places and moments 
  the user walked through
- Each location or area unlocks a themed collectible 
  (e.g. a flower from a park, a book from a bookshop 
  street, a coffee cup from a café district, a lantern 
  from a historic area)
- Collectibles are displayed in a fun, whimsical layout 
  — like a visual souvenir collection from the walk
- Tone: playful and surprising — the user shouldn't 
  know what they'll collect until after the walk

**Location Favouriting**
- Each stop visited during the walk is listed with a 
  heart icon so the user can quickly fave any locations 
  they enjoyed
- Faved locations are saved to their Faves tab on the 
  Homescreen for future walks

**Actions**
- Share walk summary and collectibles with friends/family
- Return to Homescreen to plan another walk
