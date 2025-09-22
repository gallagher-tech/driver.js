import { easeInOutQuad } from "./utils";
import { onDriverClick } from "./events";
import { emit } from "./emitter";
import { getConfig } from "./config";
import { getState, setState } from "./state";

export type StageDefinition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// This method calculates the animated new position of the
// stage (called for each frame by requestAnimationFrame)
export function transitionStage(elapsed: number, duration: number, from: Element, to: Element) {
  let activeStagePosition = getState("__activeStagePosition");

  const fromDefinition = activeStagePosition ? activeStagePosition : from.getBoundingClientRect();
  const toDefinition = to.getBoundingClientRect();

  const x = easeInOutQuad(elapsed, fromDefinition.x, toDefinition.x - fromDefinition.x, duration);
  const y = easeInOutQuad(elapsed, fromDefinition.y, toDefinition.y - fromDefinition.y, duration);
  const width = easeInOutQuad(elapsed, fromDefinition.width, toDefinition.width - fromDefinition.width, duration);
  const height = easeInOutQuad(elapsed, fromDefinition.height, toDefinition.height - fromDefinition.height, duration);

  activeStagePosition = {
    x,
    y,
    width,
    height,
  };

  renderOverlay(activeStagePosition);
  setState("__activeStagePosition", activeStagePosition);
}

export function trackActiveElement(element: Element) {
  if (!element) {
    return;
  }

  const definition = element.getBoundingClientRect();

  const activeStagePosition: StageDefinition = {
    x: definition.x,
    y: definition.y,
    width: definition.width,
    height: definition.height,
  };

  setState("__activeStagePosition", activeStagePosition);

  renderOverlay(activeStagePosition);
}

export function refreshOverlay() {
  const activeStagePosition = getState("__activeStagePosition");
  const overlaySvg = getState("__overlaySvg");

  if (!activeStagePosition) {
    return;
  }

  if (!overlaySvg) {
    console.warn("No stage svg found.");
    return;
  }

  const windowX = window.innerWidth;
  const windowY = window.innerHeight;

  overlaySvg.setAttribute("viewBox", `0 0 ${windowX} ${windowY}`);
}

function mountOverlay(stagePosition: StageDefinition) {
  const overlaySvg = createOverlaySvg(stagePosition);
  document.body.appendChild(overlaySvg);

  onDriverClick(overlaySvg, e => {
    const target = e.target as SVGElement;
    if (target.tagName !== "path") {
      return;
    }

    emit("overlayClick");
  });

  setState("__overlaySvg", overlaySvg);
}

function renderOverlay(stagePosition: StageDefinition) {
  let overlaySvg = getState("__overlaySvg");

  if (!overlaySvg) {
    mountOverlay(stagePosition);
    overlaySvg = getState("__overlaySvg");
    if (!overlaySvg) return; // Safety
  }

  let pathElement = overlaySvg.querySelector("path") as SVGPathElement | null;

  // Create the path if it doesn't exist
  if (!pathElement) {
    pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathElement.style.fill = getConfig("overlayColor") || "rgb(0,0,0)";
    pathElement.style.opacity = `${getConfig("overlayOpacity")}`;
    pathElement.style.pointerEvents = "auto";
    pathElement.style.cursor = "auto";
    pathElement.setAttribute("filter", "url(#softEdgeBlur)");

    overlaySvg.appendChild(pathElement);
  }

  // Update the path geometry
  pathElement.setAttribute("d", generateStageSvgPathString(stagePosition));

  // Re-apply the filter to ensure soft edges
  pathElement.setAttribute("filter", "url(#softEdgeBlur)");
}

function createOverlaySvg(stage: StageDefinition): SVGSVGElement {
  const windowX = window.innerWidth;
  const windowY = window.innerHeight;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("driver-overlay", "driver-overlay-animated");

  svg.setAttribute("viewBox", `0 0 ${windowX} ${windowY}`);
  svg.setAttribute("xmlSpace", "preserve");
  svg.setAttribute("xmlnsXlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("version", "1.1");
  svg.setAttribute("preserveAspectRatio", "xMinYMin slice");

  svg.style.fillRule = "evenodd";
  svg.style.clipRule = "evenodd";
  svg.style.strokeLinejoin = "round";
  svg.style.strokeMiterlimit = "2";
  svg.style.zIndex = "10000";
  svg.style.position = "fixed";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";

  // --- Add blur filter for soft edges ---
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", "softEdgeBlur");
  filter.setAttribute("x", "-50%");
  filter.setAttribute("y", "-50%");
  filter.setAttribute("width", "200%");
  filter.setAttribute("height", "200%");

  const feGaussianBlur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
  feGaussianBlur.setAttribute("in", "SourceGraphic");
  feGaussianBlur.setAttribute("stdDeviation", "8"); // adjust for softer/harder edges

  filter.appendChild(feGaussianBlur);
  defs.appendChild(filter);
  svg.appendChild(defs);
  // --------------------------------------

  const stagePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  stagePath.setAttribute("d", generateStageSvgPathString(stage));

  stagePath.style.fill = getConfig("overlayColor") || "rgb(0,0,0)";
  stagePath.style.opacity = `${getConfig("overlayOpacity")}`;
  stagePath.style.pointerEvents = "auto";
  stagePath.style.cursor = "auto";

  // Apply the blur filter to the path
  stagePath.setAttribute("filter", "url(#softEdgeBlur)");

  svg.appendChild(stagePath);

  return svg;
}

function generateStageSvgPathString(stage: StageDefinition) {
  const windowX = window.innerWidth;
  const windowY = window.innerHeight;

  const stagePadding = getConfig("stagePadding") || 0;
  const stageRadius = getConfig("stageRadius") || 0;

  const stageWidth = stage.width + stagePadding * 2;
  const stageHeight = stage.height + stagePadding * 2;

  // prevent glitches when stage is too small for radius
  const limitedRadius = Math.min(stageRadius, stageWidth / 2, stageHeight / 2);

  // no value below 0 allowed + round down
  const normalizedRadius = Math.floor(Math.max(limitedRadius, 0));

  const highlightBoxX = stage.x - stagePadding + normalizedRadius;
  const highlightBoxY = stage.y - stagePadding;
  const highlightBoxWidth = stageWidth - normalizedRadius * 2;
  const highlightBoxHeight = stageHeight - normalizedRadius * 2;

  return `M${windowX},0L0,0L0,${windowY}L${windowX},${windowY}L${windowX},0Z
    M${highlightBoxX},${highlightBoxY} h${highlightBoxWidth} a${normalizedRadius},${normalizedRadius} 0 0 1 ${normalizedRadius},${normalizedRadius} v${highlightBoxHeight} a${normalizedRadius},${normalizedRadius} 0 0 1 -${normalizedRadius},${normalizedRadius} h-${highlightBoxWidth} a${normalizedRadius},${normalizedRadius} 0 0 1 -${normalizedRadius},-${normalizedRadius} v-${highlightBoxHeight} a${normalizedRadius},${normalizedRadius} 0 0 1 ${normalizedRadius},-${normalizedRadius} z`;
}

export function destroyOverlay() {
  const overlaySvg = getState("__overlaySvg");
  if (overlaySvg) {
    overlaySvg.remove();
  }
}
