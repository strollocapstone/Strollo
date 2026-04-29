// FEATURE: shared-ui
// LAST UPDATED BY: Eric Tsai
// UPDATE DATE: 2026-04-28
// BUILD: f718df0
// DEPENDS ON: leaf
// CONSUMED BY: (currently none — design-preview component pending integration)
//
// Bottom tab bar. Not currently mounted by App.js; reserved for an upcoming
// nav redesign. If you wire this up, update CONSUMED BY accordingly.

import React from "react";
import "./BottomNav.css";

const TABS = [
  { id: "map",      icon: "map",       label: "Map" },
  { id: "timeline", icon: "timeline",  label: "Timeline" },
  { id: "explore",  icon: "explore",   label: "Explore" },
  { id: "profile",  icon: "person",    label: "Profile" },
];

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`bottom-nav-item ${active ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
          >
            <span className="material-symbols-rounded bottom-nav-icon">
              {tab.icon}
            </span>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
