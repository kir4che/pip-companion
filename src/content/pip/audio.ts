"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.PipAudio = (() => {
  type AudioChain = {
    source: MediaElementAudioSourceNode;
    gain: GainNode;
  };

  let context: AudioContext | null = null;
  let activeChain: AudioChain | null = null;
  let activeVideo: HTMLVideoElement | null = null;
  let active = false;
  let expectedVolume = 1;
  let expectedMuted = false;
  let lastAudibleVolumePercent = 100;
  let applyingPiPVolume = false;
  const chains = new WeakMap<HTMLVideoElement, AudioChain>();

  const isActiveFor = (video: HTMLVideoElement | null) =>
    active && activeVideo === video && activeChain !== null;

  function isSameOrigin(url: string) {
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  function maxVolume(video: HTMLVideoElement | null) {
    return isActiveFor(video) ? 300 : 100;
  }

  function getVolumePercent(video: HTMLVideoElement | null) {
    if (!video || video.muted) return 0;
    const chain = activeChain;
    if (chain && isActiveFor(video)) {
      return Math.max(
        0,
        Math.min(300, video.volume * chain.gain.gain.value * 100),
      );
    }
    return Math.max(0, Math.min(100, video.volume * 100));
  }

  function setVolumePercent(
    video: HTMLVideoElement | null,
    percent: number,
    unmute: boolean,
    player: YouTubePlayer | null,
  ) {
    if (!video) return;
    const volume = Math.max(0, Math.min(maxVolume(video), Math.round(percent)));
    const chain = activeChain;
    if (chain && isActiveFor(video)) {
      applyingPiPVolume = true;
      try {
        if (volume <= 100) {
          video.volume = volume / 100;
          chain.gain.gain.value = 1;
        } else {
          video.volume = 1;
          chain.gain.gain.value = volume / 100;
        }
        if (unmute && volume > 0) video.muted = false;
        expectedVolume = video.volume;
        expectedMuted = video.muted;
        if (volume > 0) lastAudibleVolumePercent = volume;
      } finally {
        applyingPiPVolume = false;
      }
      return;
    }

    video.volume = volume / 100;
    if (volume > 0) lastAudibleVolumePercent = volume;
    if (unmute && volume > 0) {
      try {
        if (player?.isMuted?.()) player.unMute?.();
        else video.muted = false;
      } catch {
        video.muted = false;
      }
    }
  }

  function toggleMute(
    video: HTMLVideoElement | null,
    player: YouTubePlayer | null,
  ) {
    if (!video) return;
    let muted = video.muted || video.volume === 0;
    try {
      muted = muted || Boolean(player?.isMuted?.());
    } catch {
      // YouTube 播放器 API 不可用時，改用 media 元素的靜音狀態。
    }

    const currentVolume = getVolumePercent(video);
    if (currentVolume > 0) lastAudibleVolumePercent = currentVolume;

    const activeForVideo = isActiveFor(video);
    if (activeForVideo) applyingPiPVolume = true;
    try {
      if (muted && player?.unMute) player.unMute();
      else if (!muted && player?.mute) player.mute();
      else video.muted = !muted;
    } catch {
      video.muted = !muted;
    } finally {
      if (activeForVideo) {
        expectedVolume = video.volume;
        expectedMuted = video.muted;
        applyingPiPVolume = false;
      }
    }

    if (muted) setVolumePercent(video, lastAudibleVolumePercent, true, player);
  }

  function prepare() {
    try {
      if (!context || context.state === "closed") context = new AudioContext();
      const ctx = context;
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    } catch {
      context = null;
    }
  }

  function start(video: HTMLVideoElement | null, pipWindow: Window | null) {
    if (!video) return false;
    if (!isSameOrigin(video.currentSrc)) return false;

    prepare();
    const ctx = context;
    if (!ctx || ctx.state === "closed") return false;
    let chain = chains.get(video);
    try {
      if (!chain) {
        const source = ctx.createMediaElementSource(video);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);
        chain = { source, gain };
        chains.set(video, chain);
      }
    } catch {
      stop();
      return false;
    }
    if (!chain) return false;

    activeChain = chain;
    activeVideo = video;
    active = true;
    chain.gain.gain.value = 1;
    expectedVolume = video.volume;
    expectedMuted = video.muted;
    if (video.volume > 0)
      lastAudibleVolumePercent = Math.round(video.volume * 100);

    const resume = () => {
      if (context?.state === "suspended") void context.resume().catch(() => {});
    };
    pipWindow?.addEventListener("pointerdown", resume);
    pipWindow?.addEventListener("keydown", resume);
    resume();
    return true;
  }

  function stop() {
    if (activeChain) activeChain.gain.gain.value = 1;
    active = false;
    activeChain = null;
    activeVideo = null;
    expectedVolume = 1;
    expectedMuted = false;
    applyingPiPVolume = false;
  }

  function resetToNative(video: HTMLVideoElement) {
    const chain = activeChain;
    if (!chain || !isActiveFor(video)) return;
    chain.gain.gain.value = 1;
    expectedVolume = video.volume;
    expectedMuted = video.muted;
    if (video.volume > 0)
      lastAudibleVolumePercent = Math.round(video.volume * 100);
  }

  function syncNativeVolume(video: HTMLVideoElement) {
    if (
      !applyingPiPVolume &&
      isActiveFor(video) &&
      (video.volume !== expectedVolume || video.muted !== expectedMuted)
    )
      resetToNative(video);
  }

  return {
    getVolumePercent,
    isActiveFor,
    maxVolume,
    prepare,
    resetToNative,
    setVolumePercent,
    start,
    stop,
    syncNativeVolume,
    toggleMute,
  };
})();
