import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySpeedCard,
  clampTurnDegrees,
  collisionState,
  directionVector,
  generateLatticePoints,
} from "../src/geometry.mjs";

test("generateLatticePoints returns the center plus six times each requested layer", () => {
  assert.equal(generateLatticePoints(0).length, 1);
  assert.equal(generateLatticePoints(1).length, 7);
  assert.equal(generateLatticePoints(2).length, 19);
  assert.equal(generateLatticePoints(3).length, 37);
});

test("generateLatticePoints marks the center as robot and other lattice points as obstacles", () => {
  const points = generateLatticePoints(1);
  const center = points.find((point) => point.q === 0 && point.r === 0);

  assert.equal(center.kind, "robot-start");
  assert.equal(points.filter((point) => point.kind === "obstacle").length, 6);
});

test("collisionState ignores tangent contact and reports overlap as a collision", () => {
  const obstacle = { x: 9, y: 0, kind: "obstacle" };
  assert.equal(collisionState({ x: 0, y: 0 }, [obstacle]).hit, false);
  assert.equal(collisionState({ x: 0.2, y: 0 }, [obstacle]).hit, true);
});

test("turn cards clamp requests to five degrees in either direction", () => {
  assert.equal(clampTurnDegrees(12), 5);
  assert.equal(clampTurnDegrees(-8), -5);
  assert.equal(clampTurnDegrees(3.5), 3.5);
});

test("speed cards apply the requested game multipliers", () => {
  assert.equal(applySpeedCard(10, "accelerate"), 12.5);
  assert.equal(applySpeedCard(10, "decelerate"), 8);
  assert.equal(applySpeedCard(10, "none"), 10);
});

test("directionVector follows the browser canvas coordinate system", () => {
  assert.deepEqual(directionVector(0), { x: 1, y: 0 });
  const up = directionVector(270);
  assert.equal(Math.round(up.x), 0);
  assert.equal(Math.round(up.y), -1);
});
