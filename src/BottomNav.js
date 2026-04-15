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
            <div className="bottom-nav-indicator">
              <span className="material-symbols-rounded bottom-nav-icon">
                {tab.icon}
              </span>
            </div>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
