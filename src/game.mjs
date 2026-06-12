import {
  COLLISION_DISTANCE_METERS,
  OBSTACLE_RADIUS_METERS,
  ROBOT_RADIUS_METERS,
  collisionState,
  directionVector,
  generateLatticePoints,
  rotatePoint,
} from "./geometry.mjs";
import { CARD_LIMIT, TICK_SECONDS, createReplayTimeline } from "./replay-engine.mjs";

const canvas = document.querySelector("#arena");
const ctx = canvas.getContext("2d");
const tickBar = document.querySelector("#tick-bar");
const tickLabel = document.querySelector("#tick-label");
const playButton = document.querySelector("#play");
const pauseButton = document.querySelector("#pause");
const previousTickButton = document.querySelector("#previous-tick");
const nextTickButton = document.querySelector("#next-tick");
const resetButton = document.querySelector("#reset");
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");
const leftButton = document.querySelector("#turn-left");
const rightButton = document.querySelector("#turn-right");
const accelerateButton = document.querySelector("#accelerate");
const decelerateButton = document.querySelector("#decelerate");
const angleInput = document.querySelector("#turn-angle");
const angleValue = document.querySelector("#turn-angle-value");
const directionInput = document.querySelector("#direction");
const directionValue = document.querySelector("#direction-value");
const layersInput = document.querySelector("#layers");
const layersValue = document.querySelector("#layers-value");
const rotatingInput = document.querySelector("#rotating");
const statusText = document.querySelector("#status");
const speedText = document.querySelector("#speed");
const cardCountText = document.querySelector("#card-count");
const distanceText = document.querySelector("#distance");
const nearestText = document.querySelector("#nearest");
const timeText = document.querySelector("#time");

const BASE_SPEED = 10;
const ROTATION_PERIOD_SECONDS = 60;
const MAX_FRAME_SECONDS = 0.5;

const state = {
  running: false,
  timeline: null,
  lastFrameTime: null,
  tickAccumulator: 0,
};

function obstaclePointsAt(elapsed) {
  const layers = Number(layersInput.value);
  const points = generateLatticePoints(layers);

  if (!rotatingInput.checked) return points;

  const degrees = (elapsed / ROTATION_PERIOD_SECONDS) * 360;
  return points.map((point) => (point.kind === "obstacle" ? rotatePoint(point, degrees) : point));
}

function currentPoints() {
  return obstaclePointsAt(state.timeline.currentState.elapsed);
}

function createTimeline() {
  return createReplayTimeline({
    heading: Number(directionInput.value),
    speed: BASE_SPEED,
    obstacleProvider: obstaclePointsAt,
  });
}

function resetGame() {
  state.running = false;
  state.timeline = createTimeline();
  state.lastFrameTime = null;
  state.tickAccumulator = 0;
  playButton.textContent = "Start";
  updateReadouts();
  draw();
}

function worldBounds(points) {
  const trail = state.timeline.states.slice(0, state.timeline.currentTick + 1).map((item) => item.robot);
  const currentRobot = state.timeline.currentState.robot;
  const xs = points.map((point) => point.x).concat(trail.map((point) => point.x), [currentRobot.x]);
  const ys = points.map((point) => point.y).concat(trail.map((point) => point.y), [currentRobot.y]);
  const extent = Math.max(
    Math.max(...xs.map(Math.abs)) + 30,
    Math.max(...ys.map(Math.abs)) + 30,
    80,
  );

  return extent;
}

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 0));
  const cssHeight = Math.max(320, Math.floor(rect.height || canvas.clientHeight || 0));
  const width = Math.floor(cssWidth * dpr);
  const height = Math.floor(cssHeight * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    width: cssWidth,
    height: cssHeight,
  };
}

function worldToScreen(point, scale, centerX, centerY) {
  return {
    x: centerX + point.x * scale,
    y: centerY + point.y * scale,
  };
}

function drawGrid(points, scale, centerX, centerY) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(84, 97, 112, 0.28)";
  ctx.setLineDash([3, 5]);

  for (const a of points) {
    for (const b of points) {
      if (a === b) continue;
      const dq = Math.abs(a.q - b.q);
      const dr = Math.abs(a.r - b.r);
      const ds = Math.abs(a.q + a.r - b.q - b.r);
      if (Math.max(dq, dr, ds) !== 1) continue;

      const start = worldToScreen(a, scale, centerX, centerY);
      const end = worldToScreen(b, scale, centerX, centerY);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawLayerPaths(points, scale, centerX, centerY) {
  const layers = [
    { layer: 1, color: "#d79a46" },
    { layer: 2, color: "#8a55d7" },
    { layer: 3, color: "#d04e8a" },
  ];

  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";

  for (const { layer, color } of layers) {
    const ring = points
      .filter((point) => point.layer === layer)
      .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
    if (ring.length < 2) continue;

    ctx.strokeStyle = color;
    ctx.beginPath();
    ring.forEach((point, index) => {
      const screen = worldToScreen(point, scale, centerX, centerY);
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

function drawObstacles(points, scale, centerX, centerY) {
  ctx.save();

  for (const point of points) {
    if (point.kind !== "obstacle") continue;
    const screen = worldToScreen(point, scale, centerX, centerY);
    const radius = OBSTACLE_RADIUS_METERS * scale;

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(
      screen.x - radius * 0.35,
      screen.y - radius * 0.4,
      radius * 0.1,
      screen.x,
      screen.y,
      radius,
    );
    gradient.addColorStop(0, "#31a8ff");
    gradient.addColorStop(1, "#006fd3");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1e456e";
    ctx.stroke();
  }

  ctx.restore();
}

function drawTrail(scale, centerX, centerY) {
  const trail = state.timeline.states.slice(0, state.timeline.currentTick + 1).map((item) => item.robot);
  if (trail.length < 2) return;

  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#df3838";
  ctx.beginPath();
  trail.forEach((point, index) => {
    const screen = worldToScreen(point, scale, centerX, centerY);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawRobot(scale, centerX, centerY) {
  const current = state.timeline.displayState;
  const screen = worldToScreen(current.robot, scale, centerX, centerY);
  const robotRadius = Math.max(4.5, ROBOT_RADIUS_METERS * scale);
  const vector = directionVector(current.heading);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(screen.x, screen.y);
  ctx.lineTo(screen.x + vector.x * 24, screen.y + vector.y * 24);
  ctx.strokeStyle = "#b7192a";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, robotRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#e21b2d";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#7d0f19";
  ctx.stroke();
  ctx.restore();
}

function draw() {
  const viewport = fitCanvas();

  const width = viewport.width;
  const height = viewport.height;
  const points = currentPoints();
  const extent = worldBounds(points);
  const scale = Math.min(width, height) / (extent * 2);
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f7fafc";
  ctx.fillRect(0, 0, width, height);

  drawGrid(points, scale, centerX, centerY);
  drawLayerPaths(points, scale, centerX, centerY);
  drawTrail(scale, centerX, centerY);
  drawObstacles(points, scale, centerX, centerY);
  drawRobot(scale, centerX, centerY);
}

function updateReadouts() {
  const current = state.timeline.displayState;
  const recordedCurrent = state.timeline.currentState;
  const currentBranchCards = state.timeline.cardCountThrough(state.timeline.currentTick);
  const canEdit = !state.running && !recordedCurrent.crashed && currentBranchCards < CARD_LIMIT;

  angleValue.textContent = `${Number(angleInput.value).toFixed(1)} deg`;
  directionValue.textContent = `${Math.round(current.heading)} deg`;
  layersValue.textContent = layersInput.value;
  speedText.textContent = `${current.speed.toFixed(2)} m/s`;
  if (cardCountText) cardCountText.textContent = `${state.timeline.activeCardCount}/${CARD_LIMIT}`;
  distanceText.textContent = `${Math.hypot(current.robot.x, current.robot.y).toFixed(2)} m`;
  timeText.textContent = `${current.elapsed.toFixed(1)} s`;
  tickLabel.textContent = `Tick ${state.timeline.currentTick} / ${state.timeline.latestTick}`;
  tickBar.max = String(state.timeline.latestTick);
  tickBar.value = String(state.timeline.currentTick);

  const collision = collisionState(current.robot, currentPoints());
  if (nearestText) {
    nearestText.textContent = Number.isFinite(collision.distance)
      ? `${Math.max(0, collision.distance - COLLISION_DISTANCE_METERS).toFixed(2)} m`
      : "n/a";
  }

  playButton.disabled = state.running;
  pauseButton.disabled = !state.running;
  previousTickButton.disabled = state.running || state.timeline.currentTick <= 0;
  nextTickButton.disabled = state.running || current.crashed;
  tickBar.disabled = state.running || state.timeline.latestTick <= 0;
  undoButton.disabled = state.running || !state.timeline.canUndo;
  redoButton.disabled = state.running || !state.timeline.canRedo;
  directionInput.disabled = state.timeline.currentTick !== 0;
  leftButton.disabled = !canEdit;
  rightButton.disabled = !canEdit;
  accelerateButton.disabled = !canEdit;
  decelerateButton.disabled = !canEdit;

  if (recordedCurrent.crashed) {
    if (statusText) {
      statusText.textContent = "Collision";
      statusText.dataset.state = "bad";
    }
  } else if (state.running) {
    if (statusText) {
      statusText.textContent = "Running";
      statusText.dataset.state = "good";
    }
  } else {
    if (statusText) {
      statusText.textContent = "Ready";
      statusText.dataset.state = "idle";
    }
  }
}

function useTurnCard(sign) {
  if (state.running || state.timeline.currentState.crashed) return;
  state.timeline.addAction({ type: "turn", degrees: Number(angleInput.value) * sign });
  updateReadouts();
  draw();
}

function useSpeedCard(card) {
  if (state.running || state.timeline.currentState.crashed) return;
  state.timeline.addAction({ type: card });
  updateReadouts();
  draw();
}

function stepTick() {
  if (!state.running || state.timeline.currentState.crashed) return;

  state.timeline.nextTick();
  if (state.timeline.currentState.crashed) {
    state.running = false;
    playButton.textContent = "Start";
  }

  updateReadouts();
}

function frame(now) {
  if (state.lastFrameTime === null) state.lastFrameTime = now;
  const deltaSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - state.lastFrameTime) / 1000));
  state.lastFrameTime = now;

  if (state.running && !state.timeline.currentState.crashed) {
    state.tickAccumulator += deltaSeconds;

    while (
      state.tickAccumulator + Number.EPSILON >= TICK_SECONDS &&
      state.running &&
      !state.timeline.currentState.crashed
    ) {
      stepTick();
      state.tickAccumulator -= TICK_SECONDS;
    }
  }

  draw();
  window.requestAnimationFrame(frame);
}

function startReplay() {
  if (state.timeline.currentState.crashed) return;
  state.running = true;
  state.lastFrameTime = null;
  state.tickAccumulator = 0;
  playButton.textContent = "Running";
  updateReadouts();
}

function pauseReplay() {
  state.running = false;
  state.lastFrameTime = null;
  state.tickAccumulator = 0;
  playButton.textContent = "Start";
  updateReadouts();
}

function previousTick() {
  state.running = false;
  state.timeline.previousTick();
  playButton.textContent = "Start";
  updateReadouts();
  draw();
}

function nextTick() {
  state.running = false;
  state.timeline.nextTick();
  playButton.textContent = "Start";
  updateReadouts();
  draw();
}

function isEditableKeyTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return (
    target?.isContentEditable ||
    tagName === "input" ||
    tagName === "button" ||
    tagName === "select" ||
    tagName === "textarea"
  );
}

function handleKeyDown(event) {
  if (event.repeat || isEditableKeyTarget(event.target)) return;

  if (event.key === "ArrowLeft") {
    if (state.running) return;
    event.preventDefault();
    previousTick();
  } else if (event.key === "ArrowRight") {
    if (state.running) return;
    event.preventDefault();
    nextTick();
  } else if (event.key === " " || event.key === "Spacebar" || event.code === "Space") {
    event.preventDefault();
    if (state.running) pauseReplay();
    else startReplay();
  }
}

playButton.addEventListener("click", startReplay);
pauseButton.addEventListener("click", pauseReplay);
resetButton.addEventListener("click", resetGame);
previousTickButton.addEventListener("click", previousTick);
nextTickButton.addEventListener("click", nextTick);
window.addEventListener("keydown", handleKeyDown);
undoButton.addEventListener("click", () => {
  state.running = false;
  state.timeline.undo();
  updateReadouts();
  draw();
});
redoButton.addEventListener("click", () => {
  state.running = false;
  state.timeline.redo();
  updateReadouts();
  draw();
});
leftButton.addEventListener("click", () => useTurnCard(-1));
rightButton.addEventListener("click", () => useTurnCard(1));
accelerateButton.addEventListener("click", () => useSpeedCard("accelerate"));
decelerateButton.addEventListener("click", () => useSpeedCard("decelerate"));

angleInput.addEventListener("input", updateReadouts);
directionInput.addEventListener("input", () => {
  if (state.running) return;
  resetGame();
});
layersInput.addEventListener("input", () => {
  if (state.running) return;
  resetGame();
});
rotatingInput.addEventListener("change", () => {
  if (state.running) return;
  resetGame();
});
tickBar.addEventListener("input", () => {
  state.running = false;
  state.timeline.goToTick(Number(tickBar.value));
  playButton.textContent = "Start";
  updateReadouts();
  draw();
});
window.addEventListener("resize", draw);

resetGame();
window.requestAnimationFrame(frame);
