// Reward Screen — post-walk reflection.
import React, { useMemo, useState } from "react";
import "./RewardScreen.css";

const MOCK_WALK = {
  distanceMiles: 1.5,
  screenChecks: 2,
  totalMins: 42,
  immersedMins: 31,
  stops: [
    { id: 1, name: "Sightglass Coffee",          category: "Coffee Shop", vibe: "coffee",     immersedMins: 12, totalMins: 14, lingerMins: 14 },
    { id: 2, name: "Golden Gate Park",           category: "Park",        vibe: "park",       immersedMins: 15, totalMins: 20, lingerMins: 20 },
    { id: 3, name: "City Lights Books",          category: "Bookshop",    vibe: "bookshop",   immersedMins: 3,  totalMins: 5,  lingerMins: 5  },
    { id: 4, name: "Ferry Building Marketplace", category: "Market",      vibe: "market",     immersedMins: 1,  totalMins: 3,  lingerMins: 3  },
  ],
};

const SIMILAR_PLACES = [
  { id: "s1", name: "Presidio Coastal Trail", category: "Park" },
  { id: "s2", name: "Alamo Square",           category: "Park" },
];

const HERO_BG_IMAGES = {
  coffee:     "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=720&h=1280&fit=crop&q=80",
  park:       "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=720&h=1280&fit=crop&q=80",
  bookshop:   "https://images.unsplash.com/photo-1526243741027-444d633d7365?w=720&h=1280&fit=crop&q=80",
  historic:   "https://images.unsplash.com/photo-1534081333815-ae5019106622?w=720&h=1280&fit=crop&q=80",
  market:     "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=720&h=1280&fit=crop&q=80",
  waterfront: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=720&h=1280&fit=crop&q=80",
};

const STOP_TINTS = {
  coffee:     "radial-gradient(circle at 30% 28%, #F7D8C6 0%, #E4A988 70%, #C77F5E 100%)",
  park:       "radial-gradient(circle at 30% 28%, #E4EECB 0%, #B6CE95 70%, #7FA266 100%)",
  bookshop:   "radial-gradient(circle at 30% 28%, #FFE76B 0%, #F2B400 70%, #B68300 100%)",
  historic:   "radial-gradient(circle at 30% 28%, #D8C4EE 0%, #A67FD5 70%, #7048B3 100%)",
  market:     "radial-gradient(circle at 30% 28%, #FFCFB2 0%, #FF9A6B 70%, #C86440 100%)",
  waterfront: "radial-gradient(circle at 30% 28%, #D9F0F3 0%, #98C9CF 70%, #608E94 100%)",
};

const TONE_SUBHEADERS = {
  celebratory: "You're a true wanderer. Here's what you picked up along the way.",
  encouraging: "You're finding your rhythm. Here's what the city showed you.",
  gentle:      "A quieter walk today. Here's what still found you.",
};

const COLLECTIBLES = {
  coffee: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-coffee-body" x1="20%" y1="10%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#C8895A" />
          <stop offset="45%" stopColor="#8B5A2B" />
          <stop offset="100%" stopColor="#4A2C12" />
        </linearGradient>
        <linearGradient id="g-coffee-steam" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#D9BEF0" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#8851D4" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="g-coffee-cream" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0C89E" />
        </linearGradient>
      </defs>
      <path d="M52 24 C 46 34, 56 42, 50 52" stroke="url(#g-coffee-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M70 20 C 64 32, 76 42, 70 54" stroke="url(#g-coffee-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M88 24 C 82 34, 92 42, 86 52" stroke="url(#g-coffee-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M100 72 h6 a12 12 0 0 1 12 12 v4 a12 12 0 0 1 -12 12 h-6 Z" fill="url(#g-coffee-body)" />
      <path d="M32 64 H100 V96 a20 20 0 0 1 -20 20 H52 a20 20 0 0 1 -20 -20 Z" fill="url(#g-coffee-body)" />
      <ellipse cx="66" cy="68" rx="34" ry="6" fill="url(#g-coffee-cream)" />
      <ellipse cx="48" cy="74" rx="10" ry="3" fill="#FFFFFF" opacity="0.45" />
      <path d="M38 70 Q 36 90, 40 108" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.22" fill="none" />
    </svg>
  ),
  park: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-park-petal" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#E1C0FA" />
          <stop offset="50%" stopColor="#A875E6" />
          <stop offset="100%" stopColor="#6B3FB8" />
        </radialGradient>
        <radialGradient id="g-park-center" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FFE36B" />
          <stop offset="60%" stopColor="#FF9A2B" />
          <stop offset="100%" stopColor="#B8500A" />
        </radialGradient>
        <linearGradient id="g-park-stem" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7FB56B" />
          <stop offset="100%" stopColor="#4A7A3E" />
        </linearGradient>
      </defs>
      <path d="M70 120 L 70 50" stroke="url(#g-park-stem)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <ellipse cx="58" cy="86" rx="8" ry="14" fill="url(#g-park-stem)" transform="rotate(-30 58 86)" />
      <ellipse cx="84" cy="96" rx="8" ry="14" fill="url(#g-park-stem)" transform="rotate(35 84 96)" />
      <g transform="translate(70 52)">
        <ellipse cx="-22" cy="-4" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(-40 -22 -4)" />
        <ellipse cx="22" cy="-4" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(40 22 -4)" />
        <ellipse cx="-18" cy="20" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(-20 -18 20)" />
        <ellipse cx="18" cy="20" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(20 18 20)" />
        <ellipse cx="0" cy="-22" rx="14" ry="20" fill="url(#g-park-petal)" />
        <circle r="14" fill="url(#g-park-center)" />
        <ellipse cx="-4" cy="-4" rx="5" ry="3" fill="#FFFFFF" opacity="0.55" />
      </g>
    </svg>
  ),
  bookshop: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-book-cover" x1="20%" y1="10%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#5EA3FF" />
          <stop offset="50%" stopColor="#2668F0" />
          <stop offset="100%" stopColor="#0E3BA8" />
        </linearGradient>
        <linearGradient id="g-book-spine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3378F2" />
          <stop offset="100%" stopColor="#0A2F8F" />
        </linearGradient>
        <linearGradient id="g-book-page" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9D4E5" />
        </linearGradient>
        <linearGradient id="g-book-mark" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF7A5A" />
          <stop offset="100%" stopColor="#C82A1B" />
        </linearGradient>
      </defs>
      <path d="M 34 42 L 108 42 L 108 104 L 34 104 Z" fill="url(#g-book-page)" />
      <path d="M 38 46 L 112 46 L 112 108 L 38 108 Z" fill="#E8ECF3" />
      <path d="M 26 36 Q 22 34, 26 32 L 112 32 Q 116 34, 112 36 L 112 112 Q 116 114, 112 116 L 26 116 Q 22 114, 26 112 Z"
            fill="url(#g-book-cover)" />
      <path d="M 26 36 L 30 36 L 30 112 L 26 112 Z" fill="url(#g-book-spine)" />
      <rect x="56" y="26" width="28" height="12" rx="6" fill="url(#g-book-spine)" />
      <rect x="60" y="30" width="20" height="4" rx="2" fill="#FFFFFF" opacity="0.9" />
      <path d="M 30 38 Q 28 46, 32 54 L 44 54 Q 40 44, 46 38 Z" fill="#FFFFFF" opacity="0.22" />
      <path d="M 48 98 L 76 98 L 76 122 L 62 112 L 48 122 Z" fill="url(#g-book-mark)" />
      <path d="M 50 100 L 58 100 L 58 116 L 54 112 L 50 116 Z" fill="#FFFFFF" opacity="0.25" />
    </svg>
  ),
  historic: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-hist-glass" x1="20%" y1="10%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#FFE36B" />
          <stop offset="55%" stopColor="#FFB02E" />
          <stop offset="100%" stopColor="#A85A00" />
        </linearGradient>
        <linearGradient id="g-hist-cap" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5E4276" />
          <stop offset="100%" stopColor="#2E1C42" />
        </linearGradient>
        <radialGradient id="g-hist-flame" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#FFD501" />
          <stop offset="100%" stopColor="#FF7A2B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M70 18 V28" stroke="#34233E" strokeWidth="3" strokeLinecap="round" />
      <path d="M58 28 H82" stroke="#34233E" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 32 H84 L80 44 H60 Z" fill="url(#g-hist-cap)" />
      <path d="M52 46 H88 L84 54 H56 Z" fill="url(#g-hist-cap)" />
      <rect x="54" y="54" width="32" height="48" rx="6" fill="url(#g-hist-glass)" />
      <path d="M56 56 L 58 100" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <rect x="62" y="62" width="16" height="32" rx="3" fill="#FFF4D9" opacity="0.35" />
      <ellipse cx="70" cy="80" rx="12" ry="14" fill="url(#g-hist-flame)" />
      <circle cx="70" cy="78" r="4" fill="#FFFFFF" opacity="0.85" />
      <path d="M52 102 H88 L84 112 H56 Z" fill="url(#g-hist-cap)" />
      <rect x="60" y="112" width="20" height="5" rx="2" fill="url(#g-hist-cap)" />
    </svg>
  ),
  market: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-mkt-basket" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2DBB7" />
          <stop offset="100%" stopColor="#A87440" />
        </linearGradient>
        <radialGradient id="g-mkt-apple" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFB088" />
          <stop offset="60%" stopColor="#E84A20" />
          <stop offset="100%" stopColor="#8C2006" />
        </radialGradient>
        <radialGradient id="g-mkt-lemon" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF3A6" />
          <stop offset="60%" stopColor="#FFC91A" />
          <stop offset="100%" stopColor="#A87A00" />
        </radialGradient>
        <radialGradient id="g-mkt-green" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#DBF0AE" />
          <stop offset="60%" stopColor="#7CB94A" />
          <stop offset="100%" stopColor="#3E6F1A" />
        </radialGradient>
        <radialGradient id="g-mkt-berry" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#F8A6C0" />
          <stop offset="60%" stopColor="#C83E78" />
          <stop offset="100%" stopColor="#6F1440" />
        </radialGradient>
      </defs>
      <path d="M40 56 C 48 30, 92 30, 100 56" fill="none" stroke="#5C3D1F" strokeWidth="3" strokeLinecap="round" />
      <circle cx="56" cy="62" r="13" fill="url(#g-mkt-apple)" />
      <circle cx="72" cy="58" r="14" fill="url(#g-mkt-lemon)" />
      <circle cx="88" cy="64" r="13" fill="url(#g-mkt-green)" />
      <circle cx="64" cy="78" r="11" fill="url(#g-mkt-berry)" />
      <circle cx="82" cy="78" r="11" fill="url(#g-mkt-apple)" />
      <ellipse cx="52" cy="58" rx="3.5" ry="2.5" fill="#FFFFFF" opacity="0.65" />
      <ellipse cx="68" cy="54" rx="3.5" ry="2.5" fill="#FFFFFF" opacity="0.65" />
      <ellipse cx="84" cy="60" rx="3.5" ry="2.5" fill="#FFFFFF" opacity="0.65" />
      <path d="M32 66 H108 L100 112 a10 10 0 0 1 -10 8 H50 a10 10 0 0 1 -10 -8 Z" fill="url(#g-mkt-basket)" />
      <path d="M40 80 H100 M42 92 H98 M44 104 H96" stroke="#5C3D1F" strokeWidth="2" strokeLinecap="round" opacity="0.4" fill="none" />
      <path d="M34 68 L 106 68" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.55" fill="none" />
    </svg>
  ),
  waterfront: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-shell-body" cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#FFDCC4" />
          <stop offset="50%" stopColor="#FF8E6C" />
          <stop offset="100%" stopColor="#A8391B" />
        </radialGradient>
        <linearGradient id="g-shell-rib" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF7043" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7A200A" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M70 28 C 38 48, 24 88, 40 112 C 54 120, 86 120, 100 112 C 116 88, 102 48, 70 28 Z"
            fill="url(#g-shell-body)" />
      <path d="M70 36 C 64 58, 58 88, 50 110" stroke="url(#g-shell-rib)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M70 36 C 76 58, 82 88, 90 110" stroke="url(#g-shell-rib)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M70 36 V 108" stroke="url(#g-shell-rib)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M58 44 C 56 60, 58 76, 60 96" stroke="url(#g-shell-rib)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M82 44 C 84 60, 82 76, 80 96" stroke="url(#g-shell-rib)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="70" cy="30" r="6" fill="#FFFFFF" />
      <circle cx="68" cy="28" r="2.5" fill="#FFFFFF" opacity="0.9" />
      <ellipse cx="52" cy="52" rx="8" ry="4" fill="#FFFFFF" opacity="0.35" transform="rotate(-20 52 52)" />
    </svg>
  ),
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tues","Wed","Thurs","Fri","Sat"];

function formatDateStamp(d = new Date()) {
  return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function phoneWord(n) {
  if (n === 0) return "zero times";
  if (n === 1) return "once";
  if (n === 2) return "twice";
  return `${n} times`;
}

function pickHero(stops) {
  return stops.reduce((best, s) => (s.immersedMins > best.immersedMins ? s : best), stops[0]);
}

function getTone(ratio) {
  if (ratio >= 0.7) return "celebratory";
  if (ratio >= 0.4) return "encouraging";
  return "gentle";
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 21s-7-4.5-9.2-9.1C1.5 8.5 3.6 5 7.2 5c2 0 3.6 1 4.8 2.6C13.2 6 14.8 5 16.8 5c3.6 0 5.7 3.5 4.4 6.9C19 16.5 12 21 12 21z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RevisitCard({ id, name, category, note, delay, isFaved, onToggleFave }) {
  return (
    <div className="reward-revisit-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="reward-revisit-text">
        <div className="reward-revisit-name">{name}</div>
        <div className="reward-revisit-cat">{category}</div>
        {note && <div className="reward-revisit-note">{note}</div>}
      </div>
      <button
        className={`reward-revisit-heart${isFaved ? " reward-revisit-heart--faved" : ""}`}
        onClick={() => onToggleFave(id)}
        aria-label={`${isFaved ? "Unfavorite" : "Favorite"} ${name}`}
      >
        <HeartIcon filled={isFaved} />
      </button>
    </div>
  );
}

function TrailStop({ stop, index, isHero, isStart }) {
  const floatDuration = 4.4 + (index % 3) * 0.6;
  const floatDelay = index * 0.45;
  return (
    <div className={`reward-trail-row reward-trail-row--${index % 2 === 0 ? "left" : "right"}`}>
      <div
        className={`reward-trail-stop${isHero ? " reward-trail-stop--hero" : ""}`}
        style={{ animationDelay: `${200 + index * 150}ms` }}
      >
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--a" />}
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--b" />}
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--c" />}
        <span
          className="reward-trail-stop-fill"
          style={{ background: STOP_TINTS[stop.vibe] || STOP_TINTS.park }}
        />
        <div
          className="reward-trail-stop-inner"
          style={{
            animationDuration: `${floatDuration}s`,
            animationDelay: `${floatDelay}s`,
          }}
        >
          {COLLECTIBLES[stop.vibe]}
        </div>
        {isStart && <span className="reward-trail-start-pill">START</span>}
      </div>
      <div className="reward-trail-label">{stop.name}</div>
    </div>
  );
}

export default function RewardScreen({ walkData = MOCK_WALK, similarPlaces = SIMILAR_PLACES, onComplete, onShare }) {
  const hero = useMemo(() => pickHero(walkData.stops), [walkData.stops]);
  const ratio = walkData.totalMins > 0 ? walkData.immersedMins / walkData.totalMins : 0;
  const tone = getTone(ratio);
  const topLingerStops = useMemo(
    () => [...walkData.stops].sort((a, b) => b.lingerMins - a.lingerMins).slice(0, 2),
    [walkData.stops]
  );
  const [faved, setFaved] = useState(() => new Set());
  const toggleFave = (id) => {
    setFaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bgImage = HERO_BG_IMAGES[hero.vibe] || HERO_BG_IMAGES.park;
  const dateStamp = formatDateStamp();

  return (
    <div className={`reward-screen reward-screen--${hero.vibe}`}>
      <img className="reward-bg-image" src={bgImage} alt="" aria-hidden="true" />
      <div className="reward-bg-frost" />

      <button className="reward-close" onClick={onComplete} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </button>

      <div className="reward-scroll">
        <div className="reward-date-stamp">{dateStamp}</div>

        <h1 className="reward-headline">
          You walked for <span className="reward-hl reward-hl--purple">{walkData.totalMins} minutes</span> and only checked your screen <span className="reward-hl reward-hl--yellow">{phoneWord(walkData.screenChecks)}</span>.
        </h1>

        <p className="reward-subheader">{TONE_SUBHEADERS[tone]}</p>

        <section className="reward-trail" aria-label="Your walk">
          <svg className="reward-trail-path" viewBox="0 0 280 640" preserveAspectRatio="none" aria-hidden="true">
            <path
              d="M 70 60 C 70 130, 210 150, 210 220 C 210 290, 70 310, 70 380 C 70 450, 210 470, 210 540"
              stroke="#8851D4"
              strokeWidth="2"
              strokeDasharray="3 7"
              strokeLinecap="round"
              fill="none"
              opacity="0.55"
            />
          </svg>
          <div className="reward-trail-stops">
            {walkData.stops.map((stop, i) => (
              <TrailStop
                key={stop.id}
                stop={stop}
                index={i}
                isHero={stop.id === hero.id}
                isStart={i === 0}
              />
            ))}
          </div>
        </section>

        <section className="reward-revisit">
          <h3>Save the stops for next time?</h3>

          <p className="reward-revisit-sub">You lingered here</p>
          {topLingerStops.map((stop, i) => (
            <RevisitCard
              key={stop.id}
              id={`linger-${stop.id}`}
              name={stop.name}
              category={stop.category}
              note={`You spent ${stop.lingerMins} mins here. Worth a return?`}
              delay={300 + i * 120}
              isFaved={faved.has(`linger-${stop.id}`)}
              onToggleFave={toggleFave}
            />
          ))}

          <p className="reward-revisit-sub">Places like this near you</p>
          {similarPlaces.map((p, i) => (
            <RevisitCard
              key={p.id}
              id={p.id}
              name={p.name}
              category={p.category}
              note=""
              delay={300 + (topLingerStops.length + i) * 120}
              isFaved={faved.has(p.id)}
              onToggleFave={toggleFave}
            />
          ))}
        </section>

        <div className="reward-actions">
          <button className="reward-share-btn" onClick={onShare}>
            <span>Share exploration</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 3v13M6 9l6-6 6 6M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
