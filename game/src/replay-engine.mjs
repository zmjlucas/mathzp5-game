import {
  applySpeedCard,
  clampTurnDegrees,
  collisionState,
  directionVector,
  normalizeDegrees,
} from "./geometry.mjs";

export const TICKS_PER_SECOND = 10;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;
export const CARD_LIMIT = 100;

let nextActionId = 1;

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function cloneState(state) {
  return {
    ...state,
    robot: clonePoint(state.robot),
  };
}

function makeInitialState({ heading = 0, speed = 10 } = {}) {
  return {
    tick: 0,
    elapsed: 0,
    robot: { x: 0, y: 0 },
    heading: normalizeDegrees(heading),
    speed,
    cardCount: 0,
    crashed: false,
  };
}

function normalizeAction(action) {
  return {
    ...action,
    id: action.id ?? nextActionId++,
  };
}

function isSpeedAction(action) {
  return action.type === "accelerate" || action.type === "decelerate";
}

function applyActions(state, actions) {
  let heading = state.heading;
  let speed = state.speed;

  for (const action of actions) {
    if (action.type === "turn") {
      heading = normalizeDegrees(heading + clampTurnDegrees(action.degrees));
    } else if (isSpeedAction(action)) {
      speed = applySpeedCard(speed, action.type);
    }
  }

  return { heading, speed };
}

function activeActionCount(actionsByTick) {
  let count = 0;
  for (const actions of actionsByTick.values()) count += actions.length;
  return count;
}

function deleteTicksAfter(map, tick) {
  for (const key of [...map.keys()]) {
    if (key > tick) map.delete(key);
  }
}

export function createReplayTimeline(options = {}) {
  const obstaclePoints = options.obstaclePoints ?? [];
  const obstacleProvider = options.obstacleProvider ?? null;
  const timeline = {
    states: [makeInitialState(options)],
    currentTick: 0,
    actionsByTick: new Map(),
    undoStack: [],
    redoStack: [],

    get currentState() {
      return this.states[this.currentTick];
    },

    get displayState() {
      const state = this.currentState;
      const motion = applyActions(state, this.actionsByTick.get(state.tick) ?? []);
      return {
        ...cloneState(state),
        heading: motion.heading,
        speed: motion.speed,
        cardCount: this.activeCardCount,
      };
    },

    get latestTick() {
      return this.states.length - 1;
    },

    get canUndo() {
      return this.undoStack.length > 0;
    },

    get canRedo() {
      return this.redoStack.length > 0;
    },

    get activeCardCount() {
      return activeActionCount(this.actionsByTick);
    },

    cardCountThrough(tick) {
      let count = 0;
      for (const [actionTick, actions] of this.actionsByTick.entries()) {
        if (actionTick <= tick) count += actions.length;
      }
      return count;
    },

    actionsAtTick(tick) {
      return [...(this.actionsByTick.get(tick) ?? [])];
    },

    truncateAfter(tick) {
      this.states = this.states.slice(0, tick + 1);
      deleteTicksAfter(this.actionsByTick, tick);
      if (this.currentTick > tick) this.currentTick = tick;
      this.recountCards();
    },

    recountCards() {
      const countsByTick = new Map();
      let count = 0;
      for (const state of this.states) {
        if (state.tick > 0) {
          count += countsByTick.get(state.tick - 1) ?? 0;
        }
        state.cardCount = count;
        countsByTick.set(state.tick, (this.actionsByTick.get(state.tick) ?? []).length);
      }
      this.states[this.currentTick].cardCount = this.activeCardCount;
    },

    addAction(action) {
      const tick = this.currentTick;
      const normalized = normalizeAction(action);
      this.truncateAfter(tick);
      if (this.activeCardCount >= CARD_LIMIT) return false;
      const actions = this.actionsByTick.get(tick) ?? [];
      actions.push(normalized);
      this.actionsByTick.set(tick, actions);
      this.undoStack.push({ tick, action: normalized });
      this.redoStack = [];
      this.states[tick].cardCount = this.activeCardCount;
      return true;
    },

    removeAction(tick, actionId) {
      const actions = this.actionsByTick.get(tick) ?? [];
      const nextActions = actions.filter((action) => action.id !== actionId);
      if (nextActions.length === actions.length) return false;
      if (nextActions.length === 0) this.actionsByTick.delete(tick);
      else this.actionsByTick.set(tick, nextActions);
      this.truncateAfter(tick);
      this.states[tick].cardCount = this.activeCardCount;
      return true;
    },

    undo() {
      const edit = this.undoStack.pop();
      if (!edit) return false;
      const removed = this.removeAction(edit.tick, edit.action.id);
      if (removed) {
        this.currentTick = edit.tick;
        this.redoStack.push(edit);
      }
      return removed;
    },

    redo() {
      const edit = this.redoStack.pop();
      if (!edit || this.activeCardCount >= CARD_LIMIT) return false;

      this.currentTick = Math.min(edit.tick, this.latestTick);
      this.truncateAfter(edit.tick);
      const actions = this.actionsByTick.get(edit.tick) ?? [];
      actions.push(edit.action);
      this.actionsByTick.set(edit.tick, actions);
      this.undoStack.push(edit);
      this.states[edit.tick].cardCount = this.activeCardCount;
      return true;
    },

    computeNextState() {
      const state = this.currentState;
      if (state.crashed) return null;

      const displayState = this.displayState;
      const vector = directionVector(displayState.heading);
      const robot = {
        x: state.robot.x + vector.x * displayState.speed * TICK_SECONDS,
        y: state.robot.y + vector.y * displayState.speed * TICK_SECONDS,
      };
      const obstacles =
        typeof obstacleProvider === "function"
          ? obstacleProvider(state.elapsed + TICK_SECONDS)
          : obstaclePoints;
      const collision = collisionState(robot, obstacles);

      return {
        tick: state.tick + 1,
        elapsed: state.elapsed + TICK_SECONDS,
        robot,
        heading: displayState.heading,
        speed: displayState.speed,
        cardCount: this.activeCardCount,
        crashed: collision.hit,
      };
    },

    nextTick() {
      if (this.currentTick < this.latestTick) {
        this.currentTick += 1;
        return true;
      }

      const nextState = this.computeNextState();
      if (!nextState) return false;

      this.states.push(nextState);
      this.currentTick += 1;
      return true;
    },

    previousTick() {
      if (this.currentTick <= 0) return false;
      this.currentTick -= 1;
      return true;
    },

    goToTick(tick) {
      const target = Math.max(0, Math.min(this.latestTick, Math.floor(tick)));
      this.currentTick = target;
      return true;
    },

    advanceTicks(count) {
      for (let index = 0; index < count; index += 1) {
        if (!this.nextTick()) break;
        if (this.currentState.crashed) break;
      }
      return cloneState(this.currentState);
    },

    reset(nextOptions = {}) {
      const merged = { ...options, ...nextOptions };
      this.states = [makeInitialState(merged)];
      this.currentTick = 0;
      this.actionsByTick = new Map();
      this.undoStack = [];
      this.redoStack = [];
    },
  };

  return timeline;
}
