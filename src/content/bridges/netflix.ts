"use strict";

interface NetflixPlayer {
  seek(timeMs: number): void;
  isReady?: () => boolean;
  isPlaying?: () => boolean;
}

interface NetflixVideoPlayerApi {
  getAllPlayerSessionIds(): string[];
  getVideoPlayerBySessionId(sessionId: string): NetflixPlayer | null;
}

interface NetflixApp {
  appContext?: {
    state?: {
      playerApp?: {
        getAPI?: () => { videoPlayer?: NetflixVideoPlayerApi };
      };
    };
  };
}

(() => {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isReady(player: NetflixPlayer): boolean {
    if (typeof player.isReady !== "function") return true;
    try {
      return player.isReady();
    } catch {
      return false;
    }
  }

  function isPlaying(player: NetflixPlayer): boolean {
    try {
      return player.isPlaying?.() ?? false;
    } catch {
      return false;
    }
  }

  let lastFailure = "";
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !isRecord(data) ||
      data.type !== "PIP_NETFLIX_SEEK"
    )
      return;

    const targetSeconds = data.targetSeconds;
    if (
      typeof targetSeconds !== "number" ||
      !Number.isFinite(targetSeconds) ||
      targetSeconds < 0
    )
      return;

    try {
      const netflix = (window as Window & { netflix?: NetflixApp }).netflix;
      const videoPlayer =
        netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
      if (!videoPlayer) throw new Error("Netflix player API is unavailable");

      const players = videoPlayer
        .getAllPlayerSessionIds()
        .map((id) => videoPlayer.getVideoPlayerBySessionId(id))
        .filter((player): player is NetflixPlayer =>
          Boolean(player && typeof player.seek === "function"),
        );
      const readyPlayers = players.filter(isReady);
      const candidates = readyPlayers.length > 0 ? readyPlayers : players;
      const player = candidates.find(isPlaying) ?? candidates[0] ?? null;
      if (!player)
        throw new Error("Netflix video player session was not found");

      player.seek(targetSeconds * 1000);
      lastFailure = "";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Netflix seek failed";
      if (message !== lastFailure) {
        console.warn("[PiP Companion] Netflix seek failed:", message);
        lastFailure = message;
      }
    }
  });
})();
