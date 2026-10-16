"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);

globalThis.PipCompanion.playbackControls = {
  create(
    doc: Document,
    translate: (key: string, substitutions?: string | string[]) => string,
    makeButton: (
      action: string,
      label: string,
      ariaLabel: string,
    ) => HTMLButtonElement,
    volumeIconPath: string,
  ): PlaybackControlsElements {
    const speedButton = makeButton(
      "speed",
      "1×",
      translate("pipPlaybackSpeed", "1×"),
    );
    speedButton.className = "speed-button";
    const timeGroup = doc.createElement("span");
    timeGroup.className = "time";
    const timeCurrent = doc.createElement("input");
    timeCurrent.type = "text";
    timeCurrent.className = "time-current";
    timeCurrent.value = "0:00";
    timeCurrent.size = 4;
    timeCurrent.maxLength = 12;
    timeCurrent.setAttribute("inputmode", "numeric");
    timeCurrent.setAttribute("aria-label", translate("pipCurrentTime"));
    const timeDuration = doc.createElement("span");
    timeDuration.className = "time-duration";
    timeDuration.textContent = "/ 0:00";
    timeGroup.append(timeCurrent, timeDuration);
    const progress = doc.createElement("input");
    progress.className = "progress";
    progress.type = "range";
    progress.min = "0";
    progress.max = "1000";
    progress.value = "0";
    progress.setAttribute("aria-label", translate("pipProgress"));
    const progressMax = Number(progress.max);
    const volumeControl = doc.createElement("div");
    volumeControl.className = "volume-control";
    const volumeButton = makeButton(
      "volume",
      "",
      translate("pipVolumeControl"),
    );
    const volumeIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    volumeIcon.setAttribute("viewBox", "0 0 24 24");
    volumeIcon.setAttribute("aria-hidden", "true");
    const volumePath = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    volumePath.setAttribute("d", volumeIconPath);
    volumeIcon.append(volumePath);
    volumeButton.append(volumeIcon);
    const volumePopover = doc.createElement("div");
    volumePopover.className = "volume-popover";
    const volumeValue = doc.createElement("input");
    volumeValue.type = "text";
    volumeValue.className = "volume-value";
    volumeValue.value = "100";
    volumeValue.setAttribute("aria-label", translate("pipVolumeValue"));
    volumeValue.setAttribute("inputmode", "numeric");
    volumeValue.maxLength = 3;
    const volumeSlider = doc.createElement("input");
    volumeSlider.className = "volume-slider";
    volumeSlider.type = "range";
    volumeSlider.min = "0";
    volumeSlider.max = "300";
    volumeSlider.step = "1";
    volumeSlider.value = "100";
    volumeSlider.setAttribute("aria-label", translate("pipVolume"));
    volumePopover.append(volumeValue, volumeSlider);
    volumeControl.append(volumeButton, volumePopover);
    const speedControl = doc.createElement("div");
    speedControl.className = "speed-control";
    const speedPopover = doc.createElement("div");
    speedPopover.className = "speed-popover";
    const speedSlider = doc.createElement("input");
    speedSlider.className = "speed-slider";
    speedSlider.type = "range";
    speedSlider.min = "0.25";
    speedSlider.max = "5";
    speedSlider.step = "0.05";
    speedSlider.value = "1";
    speedSlider.setAttribute("aria-label", translate("pipSpeed"));
    speedPopover.append(speedSlider);
    speedControl.append(speedButton, speedPopover);
    return {
      speedButton,
      timeGroup,
      timeCurrent,
      timeDuration,
      progress,
      progressMax,
      volumeControl,
      volumeButton,
      volumePath,
      volumeValue,
      volumeSlider,
      speedControl,
      speedSlider,
    };
  },
};
