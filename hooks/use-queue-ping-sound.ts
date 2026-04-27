'use client';

import { useEffect } from 'react';

type QueuePingSoundInput = {
  queueId?: string | null;
  status?: string | null;
  responseAt?: string | null;
};

function playPingSound() {
  const AudioContextConstructor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  const audioContext = new AudioContextConstructor();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(660, now + 0.12);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.36);
  oscillator.addEventListener('ended', () => {
    void audioContext.close();
  });
}

export function useQueuePingSound({ queueId, status, responseAt }: QueuePingSoundInput) {
  useEffect(() => {
    if (!queueId || status !== 'now_serving' || responseAt) {
      return;
    }

    const playAlert = () => {
      try {
        playPingSound();
      } catch {
        // Browsers can block audio until the user interacts with the page.
      }
    };

    playAlert();
    const intervalId = window.setInterval(playAlert, 1200);

    return () => window.clearInterval(intervalId);
  }, [queueId, responseAt, status]);
}
