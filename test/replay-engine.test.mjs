import assert from "node:assert/strict";
import { test } from "node:test";

import { generateLatticePoints } from "../src/geometry.mjs";
import { createReplayTimeline } from "../src/replay-engine.mjs";

function makeTimeline() {
  return createReplayTimeline({
    heading: 0,
    speed: 10,
    obstaclePoints: generateLatticePoints(3),
  });
}

test("card actions are recorded on the current tick and affect the next tick", () => {
  const timeline = makeTimeline();

  timeline.addAction({ type: "turn", degrees: 5 });
  assert.equal(timeline.displayState.heading, 5);
  assert.equal(timeline.currentState.heading, 0);

  timeline.nextTick();

  assert.equal(timeline.currentState.tick, 1);
  assert.equal(timeline.currentState.heading, 5);
  assert.equal(timeline.currentState.cardCount, 1);
  assert.ok(timeline.currentState.robot.x > 0.99);
  assert.ok(timeline.currentState.robot.y > 0.08);
});

test("speed cards update the displayed current speed before the next tick", () => {
  const timeline = makeTimeline();

  timeline.addAction({ type: "accelerate" });

  assert.equal(timeline.displayState.speed, 12.5);
  assert.equal(timeline.currentState.speed, 10);
});

test("crash freezes the timeline at the crash tick instead of resetting", () => {
  const timeline = makeTimeline();

  timeline.advanceTicks(50);
  const crashedState = timeline.currentState;
  timeline.nextTick();

  assert.equal(crashedState.crashed, true);
  assert.equal(timeline.currentState.tick, crashedState.tick);
  assert.deepEqual(timeline.currentState.robot, crashedState.robot);
});

test("editing an earlier tick truncates later states and later card actions", () => {
  const timeline = makeTimeline();

  timeline.advanceTicks(3);
  timeline.addAction({ type: "turn", degrees: 3 });
  timeline.advanceTicks(4);
  const oldFuture = timeline.states.at(-1);

  timeline.previousTick();
  timeline.previousTick();
  timeline.previousTick();
  timeline.previousTick();
  timeline.previousTick();
  timeline.addAction({ type: "turn", degrees: -5 });
  timeline.advanceTicks(4);

  assert.equal(timeline.currentState.tick, 6);
  assert.notDeepEqual(timeline.currentState.robot, oldFuture.robot);
  assert.equal(timeline.actionsAtTick(3).length, 0);
});

test("undo and redo remove and restore card edits on the current branch", () => {
  const timeline = makeTimeline();

  timeline.addAction({ type: "turn", degrees: 5 });
  assert.equal(timeline.currentState.cardCount, 1);

  timeline.undo();
  assert.equal(timeline.currentState.cardCount, 0);
  assert.equal(timeline.actionsAtTick(0).length, 0);

  timeline.redo();
  assert.equal(timeline.currentState.cardCount, 1);
  assert.equal(timeline.actionsAtTick(0).length, 1);
});

test("active card actions are capped at one hundred", () => {
  const timeline = makeTimeline();

  for (let index = 0; index < 100; index += 1) {
    assert.equal(timeline.addAction({ type: "turn", degrees: 0.1 }), true);
  }

  assert.equal(timeline.currentState.cardCount, 100);
  assert.equal(timeline.addAction({ type: "decelerate" }), false);
  assert.equal(timeline.currentState.cardCount, 100);
});

test("card cap ignores future actions that will be discarded by an earlier branch edit", () => {
  const timeline = makeTimeline();

  timeline.nextTick();
  for (let index = 0; index < 100; index += 1) {
    assert.equal(timeline.addAction({ type: "turn", degrees: 0.1 }), true);
  }

  timeline.previousTick();
  assert.equal(timeline.cardCountThrough(timeline.currentTick), 0);
  assert.equal(timeline.addAction({ type: "turn", degrees: -5 }), true);
  assert.equal(timeline.actionsAtTick(1).length, 0);
  assert.equal(timeline.activeCardCount, 1);
});
