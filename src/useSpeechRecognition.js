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

      if (!hasHeardSpeech.current) {
        hasHeardSpeech.current = true;
        clearTimeout(noSpeechTimer.current);
      }

      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        if (didAutoStop.current) return;
        didAutoStop.current = true;
        const t = transcriptRef.current;
        stop();
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
      if (recognitionRef.current !== recognition) return;
      if (hadError.current) return;
      // If silence timer already handled auto-stop, do nothing
      if (didAutoStop.current) return;
      // Save accumulated text before restart
      accumulatedText.current = transcriptRef.current;
      // Try to restart — keeps recognition alive for manual-stop mode (chat)
      try { recognition.start(); } catch (_) {
        // Can't restart — trigger auto-stop as fallback
        if (hasHeardSpeech.current) {
          didAutoStop.current = true;
          clearTimers();
          const t = transcriptRef.current;
          recognitionRef.current = null;
          onAutoStopRef.current?.(t);
        }
      }
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setFinalTranscript("");
    recognition.start();

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
