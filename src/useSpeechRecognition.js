// FEATURE: shared-hook
// OWNER: shared
// DEPENDS ON: window.SpeechRecognition / window.webkitSpeechRecognition
// CONSUMED BY: ./HomeScreen, ./useJourneyVoice
//
// Browser STT wrapper. Returns { start, stop, reset, getTranscript, supported }
// + an `onAutoStop` callback fired after 1s of silence following speech.
// Stable / single-purpose — phase plan keeps this file as-is.

import { useState, useRef, useCallback } from "react";

const SILENCE_AFTER_SPEECH_MS = 1000;  // 1s silence after last words → auto-stop
const NO_SPEECH_TIMEOUT_MS   = 5000;  // 5s with nothing heard → auto-stop
const MAX_LISTEN_MS          = 30000; // 30s hard cap

export function useSpeechRecognition({ onAutoStop } = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;
  const recognitionRef = useRef(null);
  const silenceTimer = useRef(null);
  const noSpeechTimer = useRef(null);
  const maxTimer = useRef(null);
  const hasHeardSpeech = useRef(false);
  const hadError = useRef(false);
  const didAutoStop = useRef(false);
  const onAutoStopRef = useRef(onAutoStop);
  onAutoStopRef.current = onAutoStop;
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const transcriptRef = useRef("");
  const accumulatedText = useRef(""); // carries over across restarts

  const clearTimers = useCallback(() => {
    clearTimeout(silenceTimer.current);
    clearTimeout(noSpeechTimer.current);
    clearTimeout(maxTimer.current);
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
  }, [clearTimers]);

  const start = useCallback(() => {
    if (!supported) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) {}
    }
    hasHeardSpeech.current = false;
    hadError.current = false;
    didAutoStop.current = false;
    accumulatedText.current = "";
    clearTimers();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      const prefix = accumulatedText.current;
      setFinalTranscript(prefix + final);
      const combined = prefix + final + interim;
      setTranscript(combined);
      transcriptRef.current = combined;
      console.log("[STT] onresult →", combined);

      if (!hasHeardSpeech.current) {
        hasHeardSpeech.current = true;
        clearTimeout(noSpeechTimer.current);
      }

      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        console.log("[STT] silence timer fired (1s pause)");
        if (didAutoStop.current) {
          console.log("[STT] didAutoStop already true → skipping");
          return;
        }
        didAutoStop.current = true;
        const t = transcriptRef.current;
        stop();
        console.log("[STT] firing onAutoStop with:", t);
        onAutoStopRef.current?.(t);
      }, SILENCE_AFTER_SPEECH_MS);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      console.warn("Speech recognition error:", event.error);
      if (event.error === "network" || event.error === "not-allowed" || event.error === "service-not-allowed") {
        hadError.current = true;
        clearTimers();
        recognitionRef.current = null;
        setTranscript("Could not connect. Check your internet and try again.");
      }
    };

    recognition.onend = () => {
      console.log("[STT] onend fired (recognizer ended)");
      if (recognitionRef.current !== recognition) {
        console.log("[STT] onend: stale recognizer, ignoring");
        return;
      }
      if (hadError.current) {
        console.log("[STT] onend: had error, ignoring");
        return;
      }
      // If silence timer already handled auto-stop, do nothing
      if (didAutoStop.current) {
        console.log("[STT] onend: didAutoStop already true, exiting cleanly");
        return;
      }
      // Save accumulated text before restart
      accumulatedText.current = transcriptRef.current;
      console.log("[STT] onend: attempting restart to keep listening");
      // Try to restart — keeps recognition alive for manual-stop mode (chat)
      try {
        recognition.start();
        console.log("[STT] onend: restart succeeded");
      } catch (err) {
        console.warn("[STT] onend: restart threw:", err?.name);
        // Can't restart — trigger auto-stop as fallback
        if (hasHeardSpeech.current) {
          didAutoStop.current = true;
          clearTimers();
          const t = transcriptRef.current;
          recognitionRef.current = null;
          console.log("[STT] onend fallback: firing onAutoStop with:", t);
          onAutoStopRef.current?.(t);
        }
      }
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setFinalTranscript("");
    try {
      recognition.start();
      console.log("[STT] recognition.start() succeeded");
    } catch (err) {
      console.warn("[STT] recognition.start() threw:", err?.name, err?.message);
    }

    noSpeechTimer.current = setTimeout(() => {
      if (!hasHeardSpeech.current && !didAutoStop.current) {
        didAutoStop.current = true;
        stop();
        onAutoStopRef.current?.("");
      }
    }, NO_SPEECH_TIMEOUT_MS);

    maxTimer.current = setTimeout(() => {
      if (didAutoStop.current) return;
      didAutoStop.current = true;
      const t = transcriptRef.current;
      stop();
      onAutoStopRef.current?.(t);
    }, MAX_LISTEN_MS);
  }, [supported, SpeechRecognition, clearTimers, stop]);

  const reset = useCallback(() => {
    setTranscript("");
    setFinalTranscript("");
  }, []);

  return { transcript, finalTranscript, supported, start, stop, reset, getTranscript: () => transcriptRef.current };
}
