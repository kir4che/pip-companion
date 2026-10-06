"use strict";

globalThis.CaptionPiP = globalThis.CaptionPiP || {};
globalThis.CaptionPiP.PipAudio = (() => {
  let context = null;
  let activeChain = null;
  let activeVideo = null;
  let active = false;
  let expectedVolume = 1;
  let expectedMuted = false;
  let lastAudibleVolumePercent = 100;
  let applyingPiPVolume = false;
  const chains = new WeakMap();

  const isActiveFor = (video) =>
    active && activeVideo === video && activeChain !== null;

  function maxVolume(video) {
    return isActiveFor(video) ? 300 : 100;
  }

  function getVolumePercent(video) {
    if (!video || video.muted) return 0;
    if (isActiveFor(video)) {
      return Math.max(
        0,
        Math.min(300, video.volume * activeChain.gain.gain.value * 100),
      );
    }
    return Math.max(0, Math.min(100, video.volume * 100));
  }

  function setVolumePercent(video, percent, unmute, player) {
    if (!video) return;
    const volume = Math.max(0, Math.min(maxVolume(video), Math.round(percent)));
    if (isActiveFor(video)) {
      applyingPiPVolume = true;
      try {
        if (volume <= 100) {
          video.volume = volume / 100;
          activeChain.gain.gain.value = 1;
        } else {
          video.volume = 1;
          activeChain.gain.gain.value = volume / 100;
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

  function toggleMute(video, player) {
    if (!video) return;
    let muted = video.muted || video.volume === 0;
    try {
      muted = muted || Boolean(player?.isMuted?.());
    } catch {
      // Use the media element mute state when YouTube's player API is unavailable.
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
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch {
      context = null;
    }
  }

  function start(video, pipWindow) {
    if (!video) return false;
    prepare();
    let chain = chains.get(video);
    try {
      if (!context || context.state === "closed") return false;
      if (!chain) {
        const source = context.createMediaElementSource(video);
        const gain = context.createGain();
        source.connect(gain);
        gain.connect(context.destination);
        chain = { source, gain };
        chains.set(video, chain);
      }
    } catch {
      stop();
      return false;
    }

    activeChain = chain;
    activeVideo = video;
    active = true;
    activeChain.gain.gain.value = 1;
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

  function resetToNative(video) {
    if (!isActiveFor(video)) return;
    activeChain.gain.gain.value = 1;
    expectedVolume = video.volume;
    expectedMuted = video.muted;
    if (video.volume > 0)
      lastAudibleVolumePercent = Math.round(video.volume * 100);
  }

  function syncNativeVolume(video) {
    if (
      !applyingPiPVolume &&
      isActiveFor(video) &&
      (video.volume !== expectedVolume || video.muted !== expectedMuted)
    ) {
      resetToNative(video);
    }
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
