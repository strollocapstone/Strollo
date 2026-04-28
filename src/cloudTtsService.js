// Cloud TTS audio path. iOS Safari / iOS Chrome route window.speechSynthesis
// through the system speech audio session, which is muted by the iPhone's
// silent switch. HTML5 <audio> uses the media session, which ignores the
// switch — so on phones we synthesize MP3 server-side via Google Cloud TTS
// and play it through a single persistent <audio> element.

const KEY = process.env.REACT_APP_GOOGLE_TTS_API_KEY;
const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

// One-frame silent WAV — used to "unlock" the persistent audio element on
// the user's first gesture so subsequent .play() calls don't require one.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRhwAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

let audioEl = null;
let unlocked = false;

function getAudio() {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = "auto";
  return audioEl;
}

export function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function isCloudTtsConfigured() {
  return Boolean(KEY);
}

// Call from a user gesture (click / pointerdown). Plays a silent clip on
// the audio element so iOS / Android grant playback for later src swaps.
export function unlockMobileAudio() {
  if (unlocked) return;
  const a = getAudio();
  try {
    a.src = SILENT_WAV;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => { unlocked = true; console.log("[CloudTTS] audio unlocked"); })
       .catch((e) => console.warn("[CloudTTS] unlock play() rejected:", e?.name));
    } else {
      unlocked = true;
    }
  } catch (e) {
    console.warn("[CloudTTS] unlock threw:", e);
  }
}

let currentRequestId = 0;

export async function speakViaCloud(text, opts = {}) {
  if (!KEY) throw new Error("REACT_APP_GOOGLE_TTS_API_KEY missing");
  if (!text) return;
  const a = getAudio();
  const myReq = ++currentRequestId;
  // Stop whatever is playing; the new utterance supersedes it.
  try { a.pause(); a.currentTime = 0; } catch (_e) {}
  const body = {
    input: { text },
    voice: { languageCode: "en-US", name: opts.voice || "en-US-Neural2-F" },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: typeof opts.rate === "number" ? opts.rate : 1.0,
      pitch: typeof opts.pitch === "number" ? opts.pitch : 0,
    },
  };
  const res = await fetch(`${ENDPOINT}?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Cloud TTS HTTP ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.audioContent) throw new Error("Cloud TTS empty audioContent");
  // If a newer request superseded us mid-fetch, drop this one.
  if (myReq !== currentRequestId) return;
  a.src = `data:audio/mp3;base64,${data.audioContent}`;
  await a.play();
  // Resolve only when the clip actually finishes (or is paused / errors),
  // so callers using `await speakViaCloud()` can react at end-of-speech.
  await new Promise((resolve) => {
    const done = () => {
      a.removeEventListener("ended", done);
      a.removeEventListener("pause", done);
      a.removeEventListener("error", done);
      resolve();
    };
    a.addEventListener("ended", done);
    a.addEventListener("pause", done);
    a.addEventListener("error", done);
  });
}

export function cancelCloudTts() {
  if (!audioEl) return;
  try { audioEl.pause(); audioEl.currentTime = 0; } catch (_e) {}
  // iOS holds the playback audio session even after pause(), which blocks
  // SpeechRecognition from receiving mic input. Clearing src + load()
  // forces the WebKit audio session to release so the mic can take over.
  try { audioEl.removeAttribute("src"); audioEl.load(); } catch (_e) {}
  currentRequestId++;
}

export function isCloudTtsPlaying() {
  return Boolean(audioEl && !audioEl.paused && !audioEl.ended);
}
