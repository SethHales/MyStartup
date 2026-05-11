let audioContext = null;

export function vibrate(pattern) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

export function primeTimerAudio() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
}

export function playTimerPing() {
  playToneSequence([
    { frequency: 880, start: 0, duration: 0.12, gain: 0.12 },
    { frequency: 1174.66, start: 0.11, duration: 0.18, gain: 0.11 },
  ]);
}

export function playMinuteTick() {
  playToneSequence([
    { frequency: 1046.5, start: 0, duration: 0.09, gain: 0.08 },
  ]);
}

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextConstructor();
  }

  return audioContext;
}

function playToneSequence(tones) {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  const now = context.currentTime;

  tones.forEach(({ frequency, start, duration, gain }) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const startTime = now + start;
    const endTime = startTime + duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(gain, startTime + 0.018);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.025);
  });
}
