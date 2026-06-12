export const GRID_SPACING_METERS = 20;
export const ROBOT_RADIUS_METERS = 1;
export const OBSTACLE_RADIUS_METERS = 8;
export const COLLISION_DISTANCE_METERS = ROBOT_RADIUS_METERS + OBSTACLE_RADIUS_METERS;
export const TURN_LIMIT_DEGREES = 5;

const SQRT_3 = Math.sqrt(3);

export function axialToWorld(q, r, spacing = GRID_SPACING_METERS) {
  return {
    x: spacing * (q + r / 2),
    y: spacing * (SQRT_3 / 2) * r,
  };
}

export function axialLayer(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

export function generateLatticePoints(layers, spacing = GRID_SPACING_METERS) {
  const points = [];

  for (let q = -layers; q <= layers; q += 1) {
    for (let r = -layers; r <= layers; r += 1) {
      const layer = axialLayer(q, r);
      if (layer > layers) continue;

      const world = axialToWorld(q, r, spacing);
      points.push({
        q,
        r,
        layer,
        x: world.x,
        y: world.y,
        kind: q === 0 && r === 0 ? "robot-start" : "obstacle",
      });
    }
  }

  return points.sort((a, b) => a.layer - b.layer || a.r - b.r || a.q - b.q);
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function collisionState(robot, points, collisionDistance = COLLISION_DISTANCE_METERS) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    if (point.kind !== "obstacle") continue;

    const currentDistance = distance(robot, point);
    if (currentDistance < nearestDistance) {
      nearest = point;
      nearestDistance = currentDistance;
    }

    if (currentDistance < collisionDistance) {
      return {
        hit: true,
        obstacle: point,
        distance: currentDistance,
      };
    }
  }

  return {
    hit: false,
    obstacle: nearest,
    distance: nearestDistance,
  };
}

export function clampTurnDegrees(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  return Math.max(-TURN_LIMIT_DEGREES, Math.min(TURN_LIMIT_DEGREES, degrees));
}

export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function directionVector(degrees) {
  const radians = (normalizeDegrees(degrees) * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);

  return {
    x: Math.abs(x) < 1e-12 ? 0 : x,
    y: Math.abs(y) < 1e-12 ? 0 : y,
  };
}

export function applySpeedCard(speed, card) {
  if (card === "accelerate") return speed * 1.25;
  if (card === "decelerate") return speed * 0.8;
  return speed;
}

export function rotatePoint(point, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    ...point,
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}
