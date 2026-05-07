// FEATURE: shared-hook
// LAST UPDATED BY: Eric Tsai
// UPDATE DATE: 2026-04-28
// BUILD: f718df0
// DEPENDS ON: ./useSpeechRecognition, ./geminiService
// CONSUMED BY: ./NavigationMapScreen
//
// Pre-walk and during-walk voice flow: STT → Gemini → action callbacks
// (suggest place, add stop, etc.). PHASE 1 of the refactor will route the
// Gemini call through the new shared useGeminiPlaces hook so the chat loop
// stops being duplicated across this file, HomeScreen, and WalkCompanionWidget.

import { useState, useRef, useCallback } from "react";
import { useSpeechRecognition } from "./useSpeechRecognition";
import {
  buildSystemPrompt,
  sendMessage,
  extractPlaces,
  extractActions,
  cleanResponseText,
} from "./geminiService";

let msgIdCounter = 0;
const nextId = () => ++msgIdCounter;

export function useJourneyVoice({
  userLocation,
  journeyItems,
  mode = "pre-walk",
  vibePreferences = null,
  onSuggestStops,
  onApplyActions,
} = {}) {
  const [listening, setListening] = useState(false);
  const [locked, setLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userText, setUserText] = useState("");
  const [aiText, setAiText] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const messagesRef = useRef([]);
  messagesRef.current = messages;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const journeyItemsRef = useRef(journeyItems);
  journeyItemsRef.current = journeyItems;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const vibePreferencesRef = useRef(vibePreferences);
  vibePreferencesRef.current = vibePreferences;
  const onSuggestStopsRef = useRef(onSuggestStops);
  onSuggestStopsRef.current = onSuggestStops;
  const onApplyActionsRef = useRef(onApplyActions);
  onApplyActionsRef.current = onApplyActions;

  const handleAutoStop = useCallback(async (spokenText) => {
    setListening(false);
    setLocked(false);
    const text = (spokenText || "").trim();
    if (!text) return;

    setUserText(text);
    const userMsg = { id: nextId(), role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setAiSpeaking(true);

    try {
      const systemPrompt = buildSystemPrompt({
        userLocation: userLocationRef.current,
        journeyItems: journeyItemsRef.current,
        elapsedMinutes: 0,
        currentStopIndex: 0,
        totalStops: journeyItemsRef.current.length,
        mode: modeRef.current,
        vibePreferences: vibePreferencesRef.current,
      });
      const history = [...messagesRef.current, userMsg];
      const response = await sendMessage(history, systemPrompt);
      const displayText = cleanResponseText(response);

      if (modeRef.current === "during-walk") {
        const actions = extractActions(response);
        if (onApplyActionsRef.current) {
          await onApplyActionsRef.current(actions);
        }
      } else {
        const places = extractPlaces(response);
        if (places.length > 0 && onSuggestStopsRef.current) {
          onSuggestStopsRef.current(places);
        }
      }

      const aiMsg = { id: nextId(), role: "ai", text: displayText };
      setMessages(prev => [...prev, aiMsg]);
      setAiText(displayText);
    } catch (err) {
      console.error("useJourneyVoice error:", err);
      const errText = "Gemini is busy right now. Tap the mic to try again!";
      setMessages(prev => [...prev, { id: nextId(), role: "ai", text: errText }]);
      setAiText(errText);
    } finally {
      setLoading(false);
      setAiSpeaking(false);
    }
  }, []);

  const speech = useSpeechRecognition({ onAutoStop: handleAutoStop });

  const onListenStart = useCallback(() => {
    if (!speech.supported) return;
    setUserText("");
    setListening(true);
    speech.start();
  }, [speech]);

  const onListenEnd = useCallback(() => {
    if (!locked) {
      setListening(false);
      speech.stop();
      const t = speech.getTranscript();
      if (t && t.trim()) handleAutoStop(t);
    }
  }, [locked, speech, handleAutoStop]);

  const onDragLock = useCallback(() => {
    setLocked(true);
  }, []);

  const onUnlock = useCallback(() => {
    setLocked(false);
    setListening(false);
    speech.stop();
  }, [speech]);

  const onMuteToggle = useCallback(() => {
    setMuted(m => !m);
  }, []);

  const reset = useCallback(() => {
    setListening(false);
    setLocked(false);
    setAiSpeaking(false);
    setUserText("");
    setAiText("");
    setMessages([]);
    speech.reset();
  }, [speech]);

  return {
    listening, locked, muted, aiSpeaking,
    userText, aiText,
    messages, loading,
    speech,
    onListenStart, onListenEnd, onDragLock, onUnlock, onMuteToggle,
    reset,
  };
}
