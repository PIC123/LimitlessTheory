import * as THREE from 'three';

// Direct port of the *shape* of LT's action stack: each action is an object with
// a name and onUpdateActive(entity, dt, world) hook. When the action believes its
// task is done, it calls entity.popAction(). New behaviors can be pushed on top.

const _f = new THREE.Vector3();
const _t = new THREE.Vector3();

// Steers e toward targetPos, aligning the +Z forward to target.
// Mirrors LT's flyToward helper without the full inertial-tensor math.
export function flyToward(e, targetPos, dt, opts = {}) {
  const arriveDist = opts.arriveDist ?? 0;
  const maxSpeed = opts.maxSpeed ?? e.thrust * 4;

  _f.copy(targetPos).sub(e.position);
  const dist = _f.length();
  if (dist < 1e-3) return 0;
  _f.divideScalar(dist);

  // Compute desired ship orientation: forward toward target, up world-up.
  const desiredQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(_t.copy(_f).multiplyScalar(-1).add(e.position), e.position, new THREE.Vector3(0, 1, 0))
  );
  // slerp toward desired.
  e.quaternion.slerp(desiredQuat, Math.min(1, opts.turnRate ?? 2.4 * dt));

  // Apply forward thrust roughly in alignment with current facing.
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(e.quaternion);
  const align = Math.max(0, fwd.dot(_f));
  const speedTarget = Math.min(maxSpeed, Math.max(0, dist - arriveDist) * 1.6);
  const desiredVel = _t.copy(fwd).multiplyScalar(speedTarget * align);
  // Gentle accel.
  e.velocity.lerp(desiredVel, Math.min(1, 1.6 * dt));
  return dist;
}

// ---- MoveTo ----
export function MoveTo(target, range = 60) {
  return {
    name: 'MoveTo',
    target, range,
    onUpdateActive(e, dt, world) {
      if (!target.alive && target.kind !== 'station' && target.kind !== 'planet') {
        e.popAction(); return;
      }
      const dist = flyToward(e, target.position, dt, { arriveDist: range, maxSpeed: e.thrust * 4 });
      if (dist <= range + (target.radius || 0)) e.popAction();
    }
  };
}

// ---- Attack ----
export function Attack(target) {
  let timer = 0, offset = new THREE.Vector3(), radius = 80;
  return {
    name: 'Attack',
    target,
    onUpdateActive(e, dt, world) {
      if (!target.alive) { e.popAction(); return; }
      timer -= dt;
      const distSq = e.position.distanceToSquared(target.position);
      // Re-pick attack offset every few seconds.
      if (timer <= 0) {
        offset.set((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize();
        radius = 60 + Math.random() * 90;
        timer = 4 + Math.random() * 4;
      }
      _t.copy(target.position).addScaledVector(offset, radius);
      flyToward(e, _t, dt, { arriveDist: 30, maxSpeed: e.thrust * 4, turnRate: 3.0 * dt });

      // Fire if facing the target and within range.
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(e.quaternion);
      const dir = _f.copy(target.position).sub(e.position);
      const dist = Math.sqrt(distSq);
      dir.divideScalar(dist);
      const align = fwd.dot(dir);
      if (align > 0.9 && dist < e.weapon.range && e.weapon.cooldown <= 0 && e.energy > e.weapon.energy) {
        world.weapons.fireBolt(e, target);
      }
    }
  };
}

// ---- Mine ----
export function Mine(asteroid) {
  return {
    name: 'Mine',
    target: asteroid,
    onUpdateActive(e, dt, world) {
      if (!asteroid.alive || (e.cargoUsed() >= e.cargoCap)) { e.popAction(); return; }
      const dist = e.position.distanceTo(asteroid.position);
      if (dist > e.miner.range + asteroid.radius) {
        flyToward(e, asteroid.position, dt, { arriveDist: e.miner.range + asteroid.radius * 0.8, maxSpeed: e.thrust * 4 });
        return;
      }
      // Stop and mine.
      e.velocity.multiplyScalar(Math.exp(-3 * dt));
      if (e.miner.cooldown <= 0 && e.energy > e.miner.energy) {
        world.weapons.fireMiner(e, asteroid);
      }
    }
  };
}

// ---- Escort ----
export function Escort(leader, offset) {
  const off = offset.clone();
  return {
    name: 'Escort',
    target: leader,
    onUpdateActive(e, dt, world) {
      if (!leader.alive) { e.popAction(); return; }
      // Look for nearby threats while escorting.
      const threat = world.findNearestHostile(e, 1500);
      if (threat) { e.pushAction(Attack(threat)); return; }
      const target = _t.copy(leader.position).add(off);
      flyToward(e, target, dt, { arriveDist: 40, maxSpeed: e.thrust * 5 });
    }
  };
}

// ---- Trade ----
// LT had a flow-based economy where traders picked Mine / Transport jobs by
// payout. We approximate that here: an NPC trader scans every (buyStation,
// sellStation, item) triple in the system, picks the most profitable route
// (constrained by buy stock + ship cargo cap), flies to the buy station,
// loads up, flies to the sell station, dumps the cargo, and re-picks.
//
// The market mutates with each transaction (buy decreases stock + nudges
// sell-price up; sell increases stock + nudges buy-price down) so prices
// converge over time and routes naturally rotate.
export function Trade() {
  let route = null;
  let phase = 'pickRoute';   // 'pickRoute' | 'goToBuy' | 'goToSell'
  return {
    name: 'Trade',
    onUpdateActive(e, dt, world) {
      // Re-route at the start, or after a delivery.
      if (phase === 'pickRoute') {
        route = pickBestRoute(world, e);
        if (!route) {
          // Nothing tradable; idle and let Think rerun later.
          e.popAction();
          return;
        }
        phase = e.cargoUsed() > 0 ? 'goToSell' : 'goToBuy';
      }

      const target = (phase === 'goToBuy') ? route.from : route.to;
      if (!target.alive) { phase = 'pickRoute'; return; }

      const arriveDist = (target.radius || 200) + 60;
      const dist = e.position.distanceTo(target.position);
      if (dist > arriveDist) {
        flyToward(e, target.position, dt, { arriveDist, maxSpeed: e.thrust * 4 });
        return;
      }

      // Arrived. Transact.
      e.velocity.multiplyScalar(Math.exp(-2 * dt));
      if (phase === 'goToBuy') {
        const m = route.from.metadata.market[route.item];
        const free = e.cargoCap - e.cargoUsed();
        const take = Math.min(m.stock, free, 12);
        if (take > 0) {
          m.stock = Math.max(0, m.stock - take);
          // Stock dropped → sell-price drifts up.
          m.sellPrice = Math.max(1, Math.round(m.sellPrice * 1.01));
          e.cargoAdd(route.item, take);
        }
        phase = 'goToSell';
      } else {
        const m = route.to.metadata.market[route.item];
        const have = e.cargo.get(route.item) || 0;
        if (have > 0) {
          m.stock = m.stock + have;
          // Stock rose → station's buy-price drifts down.
          m.buyPrice = Math.max(1, Math.round(m.buyPrice * 0.99));
          e.cargo.delete(route.item);
        }
        // Done — pop so Think can repick.
        e.popAction();
        route = null;
        phase = 'pickRoute';
      }
    }
  };
}

function pickBestRoute(world, ship) {
  const stations = world.stations || [];
  if (stations.length < 2) return null;
  let best = null, bestProfit = 1;
  for (const a of stations) {
    if (!a.alive) continue;
    for (const b of stations) {
      if (a === b || !b.alive) continue;
      const aMarket = a.metadata?.market;
      const bMarket = b.metadata?.market;
      if (!aMarket || !bMarket) continue;
      for (const itemId of Object.keys(aMarket)) {
        const buy  = aMarket[itemId];   // a SELLS at sellPrice; we BUY here
        const sell = bMarket[itemId];   // b BUYS at buyPrice; we SELL here
        if (buy.stock <= 0) continue;
        const profit = sell.buyPrice - buy.sellPrice;
        if (profit <= 0) continue;
        // Prefer routes near the ship to amortize travel.
        const proximity = 1 / (1 + ship.position.distanceTo(a.position) * 0.0002);
        const score = profit * proximity;
        if (score > bestProfit) {
          bestProfit = score;
          best = { from: a, to: b, item: itemId, profit };
        }
      }
    }
  }
  return best;
}

// ---- Wander ----
export function Wander(home, radius = 1500) {
  let dest = null;
  let pickAt = 0;
  return {
    name: 'Wander',
    onUpdateActive(e, dt, world) {
      if (!dest || pickAt <= 0) {
        dest = home.clone().add(new THREE.Vector3(
          (Math.random()-0.5)*radius,
          (Math.random()-0.5)*radius*0.3,
          (Math.random()-0.5)*radius
        ));
        pickAt = 6 + Math.random() * 6;
      }
      pickAt -= dt;
      flyToward(e, dest, dt, { arriveDist: 80, maxSpeed: e.thrust * 2.5 });
    }
  };
}

// ---- Think (top-level AI) ----
// Mirrors LT's Think/Action: every couple seconds, pick a job by payout.
// Pirates prefer Attack; traders prefer Trade; patrols prefer hunting hostiles.
export function Think() {
  let timer = 0;
  return {
    name: 'Think',
    onUpdateActive(e, dt, world) {
      timer -= dt;
      if (timer > 0) return;
      timer = 1.2 + Math.random() * 1.5;

      // Already actively engaged? Don't preempt.
      if (e.actions.length > 1) return;

      if (e.metadata.preferAttack || e.faction === 'Pirates') {
        const target = world.findNearestHostile(e, 4000);
        if (target) { e.pushAction(Attack(target)); return; }
      } else if (e.faction === 'Coalition') {
        const threat = world.findNearestHostile(e, 4500);
        if (threat) { e.pushAction(Attack(threat)); return; }
      } else if (e.faction === 'Traders') {
        // Defend self if a hostile is on top of us, else run trade routes.
        const threat = world.findNearestHostile(e, 1500);
        if (threat) { e.pushAction(Attack(threat)); return; }
        e.pushAction(Trade());
        return;
      }

      // Default: wander.
      const home = e.position.clone();
      e.pushAction(Wander(home, 2000));
    }
  };
}
