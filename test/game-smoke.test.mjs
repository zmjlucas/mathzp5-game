import assert from "node:assert/strict";
import { test } from "node:test";

function makeElement(overrides = {}) {
  const listeners = new Map();

  return {
    checked: false,
    clientWidth: 900,
    clientHeight: 700,
    dataset: {},
    disabled: false,
    style: {},
    textContent: "",
    value: "",
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    click() {
      listeners.get("click")?.({ target: this });
    },
    dispatch(type) {
      listeners.get(type)?.({ target: this });
    },
    getBoundingClientRect() {
      return { width: this.clientWidth, height: this.clientHeight };
    },
    ...overrides,
  };
}

function makeCanvasContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  return {
    calls,
    arc(...args) {
      calls.push(["arc", ...args]);
    },
    beginPath() {},
    clearRect(...args) {
      calls.push(["clearRect", ...args]);
    },
    closePath() {},
    createRadialGradient() {
      return gradient;
    },
    fill() {},
    fillRect(...args) {
      calls.push(["fillRect", ...args]);
    },
    lineTo() {},
    moveTo() {},
    restore() {},
    save() {},
    setLineDash() {},
    setTransform() {},
    stroke() {},
    set fillStyle(_value) {},
    set lineJoin(_value) {},
    set lineWidth(_value) {},
    set strokeStyle(_value) {},
  };
}

async function setupGame() {
  const elements = new Map();
  const ids = [
    "play",
    "pause",
    "previous-tick",
    "next-tick",
    "reset",
    "undo",
    "redo",
    "turn-left",
    "turn-right",
    "accelerate",
    "decelerate",
    "turn-angle-value",
    "direction-value",
    "layers-value",
    "speed",
    "distance",
    "time",
    "tick-label",
  ];

  for (const id of ids) elements.set(id, makeElement());
  elements.set("tick-bar", makeElement({ value: "0" }));

  elements.set(
    "arena",
    makeElement({
      canvasContext: makeCanvasContext(),
      getContext() {
        return this.canvasContext;
      },
    }),
  );
  elements.set("turn-angle", makeElement({ value: "5" }));
  elements.set("direction", makeElement({ value: "0" }));
  elements.set("layers", makeElement({ value: "3" }));
  elements.set("rotating", makeElement({ checked: false }));

  globalThis.document = {
    querySelector(selector) {
      return elements.get(selector.slice(1));
    },
  };
  const windowListeners = new Map();
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener(type, handler) {
      windowListeners.set(type, handler);
    },
    dispatchKey(key, options = {}) {
      let defaultPrevented = false;
      const event = {
        key,
        repeat: false,
        target: { tagName: "BODY", isContentEditable: false },
        preventDefault() {
          defaultPrevented = true;
        },
        ...options,
      };
      windowListeners.get("keydown")?.(event);
      return defaultPrevented;
    },
    requestAnimationFrame(callback) {
      this.lastFrame = callback;
      return 1;
    },
  };

  await import(`../src/game.mjs?smoke=${Date.now()}-${Math.random()}`);

  return { elements, window: globalThis.window };
}

async function setupGameWithCollapsedCanvas() {
  const setup = await setupGame();
  const canvas = setup.elements.get("arena");
  canvas.clientWidth = 0;
  canvas.clientHeight = 0;

  return setup;
}

test("game controller initializes and responds to primary controls", async () => {
  const { elements } = await setupGame();

  assert.equal(elements.get("speed").textContent, "10.00 m/s");
  assert.equal(elements.get("distance").textContent, "0.00 m");
  assert.equal(elements.get("time").textContent, "0.0 s");

  elements.get("play").click();
  assert.equal(elements.get("play").disabled, true);

  elements.get("pause").click();
  assert.equal(elements.get("play").disabled, false);

  elements.get("turn-right").click();
  assert.equal(elements.get("direction-value").textContent, "5 deg");

  elements.get("accelerate").click();
  assert.equal(elements.get("speed").textContent, "12.50 m/s");

  elements.get("next-tick").click();
  assert.equal(elements.get("speed").textContent, "12.50 m/s");
  assert.equal(elements.get("direction-value").textContent, "5 deg");
  assert.equal(elements.get("tick-label").textContent, "Tick 1 / 1");
});

test("game simulation advances in fixed ten-per-second ticks", async () => {
  const { elements, window } = await setupGame();

  elements.get("play").click();
  window.lastFrame(0);
  window.lastFrame(50);

  assert.equal(elements.get("time").textContent, "0.0 s");
  assert.equal(elements.get("distance").textContent, "0.00 m");

  window.lastFrame(100);

  assert.equal(elements.get("time").textContent, "0.1 s");
  assert.equal(elements.get("distance").textContent, "1.00 m");
});

test("paused replay controls step through ticks and undo card edits", async () => {
  const { elements } = await setupGame();

  elements.get("turn-right").click();
  assert.equal(elements.get("direction-value").textContent, "5 deg");

  elements.get("undo").click();
  assert.equal(elements.get("direction-value").textContent, "0 deg");

  elements.get("redo").click();
  assert.equal(elements.get("direction-value").textContent, "5 deg");

  elements.get("next-tick").click();
  assert.equal(elements.get("direction-value").textContent, "5 deg");
  assert.equal(elements.get("tick-label").textContent, "Tick 1 / 1");

  elements.get("tick-bar").value = "0";
  elements.get("tick-bar").dispatch("input");
  assert.equal(elements.get("tick-label").textContent, "Tick 0 / 1");

  elements.get("previous-tick").click();
  assert.equal(elements.get("tick-label").textContent, "Tick 0 / 1");

  elements.get("turn-left").click();
  assert.equal(elements.get("tick-label").textContent, "Tick 0 / 0");
  elements.get("next-tick").click();
  assert.equal(elements.get("direction-value").textContent, "0 deg");
});

test("initial direction can only be changed at tick zero", async () => {
  const { elements } = await setupGame();

  assert.equal(elements.get("direction").disabled, false);

  elements.get("next-tick").click();
  assert.equal(elements.get("tick-label").textContent, "Tick 1 / 1");
  assert.equal(elements.get("direction").disabled, true);

  elements.get("previous-tick").click();
  assert.equal(elements.get("tick-label").textContent, "Tick 0 / 1");
  assert.equal(elements.get("direction").disabled, false);
});

test("keyboard shortcuts control replay unless focus is editable", async () => {
  const { elements, window } = await setupGame();

  assert.equal(window.dispatchKey(" "), true);
  assert.equal(elements.get("play").disabled, true);

  assert.equal(window.dispatchKey(" "), true);
  assert.equal(elements.get("play").disabled, false);

  assert.equal(window.dispatchKey("ArrowRight"), true);
  assert.equal(elements.get("tick-label").textContent, "Tick 1 / 1");

  assert.equal(window.dispatchKey("ArrowLeft"), true);
  assert.equal(elements.get("tick-label").textContent, "Tick 0 / 1");

  assert.equal(window.dispatchKey("ArrowRight", { repeat: true }), false);
  assert.equal(elements.get("tick-label").textContent, "Tick 0 / 1");

  assert.equal(
    window.dispatchKey("ArrowRight", { target: { tagName: "INPUT", isContentEditable: false } }),
    false,
  );
  assert.equal(elements.get("tick-label").textContent, "Tick 0 / 1");
});

test("arena draws with a fallback viewport when CSS reports collapsed canvas dimensions", async () => {
  const { elements, window } = await setupGameWithCollapsedCanvas();
  const canvas = elements.get("arena");
  canvas.canvasContext.calls.length = 0;

  window.lastFrame(0);

  const fillCall = canvas.canvasContext.calls.find((call) => call[0] === "fillRect");
  assert.deepEqual(fillCall, ["fillRect", 0, 0, 320, 320]);
});

test("player draw omits the oversized clearance circle", async () => {
  const { elements, window } = await setupGame();
  const canvas = elements.get("arena");
  canvas.canvasContext.calls.length = 0;

  window.lastFrame(0);

  const clearanceRadius = 35;
  const hasClearanceArc = canvas.canvasContext.calls.some(
    (call) => call[0] === "arc" && Math.abs(call[3] - clearanceRadius) < 0.000001,
  );
  assert.equal(hasClearanceArc, false);
});
