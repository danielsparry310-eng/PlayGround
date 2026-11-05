import * as THREE from 'three';
import { clamp, lerp, damp, resolveCircleBox } from './utils.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class Player {
  constructor(camera, world, callbacks = {}) {
    this.camera = camera;
    this.world = world;
    this.callbacks = callbacks;
    this.position = new THREE.Vector3(world.playerSpawn.x, 0, world.playerSpawn.z);
    this.yaw = world.playerSpawn.yaw;
    this.pitch = -0.04;
    this.radius = 0.38;
    this.standEye = 1.72;
    this.crouchEye = 1.12;
    this.eyeHeight = this.standEye;
    this.velocityY = 0;
    this.grounded = true;
    this.crouching = false;
    this.sprinting = false;
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 1;
    this.speed = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.shake = 0;
    this.shakeTime = 0;
    this.damageFlash = 0;
    this.lastDamageAt = -99;
    this.dead = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.footstepTimer = 0;
    this.stepIndex = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelPitch = 0;
    this.recoilVelYaw = 0;
    this.time = 0;
    this.landImpact = 0;
    this._camPos = new THREE.Vector3();
  }

  reset(spawn) {
    this.position.set(spawn.x, 0, spawn.z);
    this.yaw = spawn.yaw || 0;
    this.pitch = -0.04;
    this.velocityY = 0;
    this.grounded = true;
    this.health = this.maxHealth;
    this.stamina = 1;
    this.dead = false;
    this.shake = 0;
    this.damageFlash = 0;
    this.lastDamageAt = -99;
    this.eyeHeight = this.standEye;
    this.recoilPitch = this.recoilYaw = 0;
    this.recoilVelPitch = this.recoilVelYaw = 0;
  }

  look(dx, dy) {
    if (this.dead) return;
    const s = 0.0022 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.48, 1.42);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  addRecoil(pitch, yaw) {
    this.recoilVelPitch -= pitch;
    this.recoilVelYaw += yaw;
  }

  takeDamage(amount, sourcePos, kind = 'shot') {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = this.time;
    this.damageFlash = 1;
    this.shake = Math.min(1.4, this.shake + 0.5 + amount * 0.025);
    if (sourcePos) {
      const dx = sourcePos.x - this.position.x;
      const dz = sourcePos.z - this.position.z;
      const angle = Math.atan2(dx, -dz);
      this.callbacks.onDamage?.(amount, angle, kind);
    } else {
      this.callbacks.onDamage?.(amount, 0, kind);
    }
    if (this.health <= 0) {
      this.dead = true;
      this.callbacks.onDeath?.();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.callbacks.onHeal?.(amount);
  }

  update(dt, input) {
    if (this.dead) {
      // death camera drop
      this.eyeHeight = damp(this.eyeHeight, 0.35, 4, dt);
      this.updateCamera(dt, 0);
      return;
    }
    this.time += dt;

    // recoil spring
    this.recoilPitch += this.recoilVelPitch * dt;
    this.recoilYaw += this.recoilVelYaw * dt;
    this.recoilVelPitch *= Math.pow(0.001, dt);
    this.recoilVelYaw *= Math.pow(0.001, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 12, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 12, dt);

    // crouch / sprint
    const wantCrouch = input.crouch;
    this.crouching = wantCrouch;
    const moving = input.forward || input.back || input.left || input.right;
    this.sprinting = input.sprint && !this.crouching && input.forward && this.stamina > 0.02 && !input.fire;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 0.22);
    } else {
      this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.12 : 0.2));
    }

    const targetEye = this.crouching ? this.crouchEye : this.standEye;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 12, dt);

    // movement vectors
    const speedBase = this.crouching ? 2.7 : this.sprinting ? 8.4 : 5.3;
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let mx = 0, mz = 0;
    if (input.forward) { mx += _fwd.x; mz += _fwd.z; }
    if (input.back) { mx -= _fwd.x; mz -= _fwd.z; }
    if (input.right) { mx += _right.x; mz += _right.z; }
    if (input.left) { mx -= _right.x; mz -= _right.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0.001) { mx /= len; mz /= len; }
    this.speed = len > 0 ? speedBase : 0;

    // horizontal movement with axis-separated collision
    if (len > 0.001) {
      const step = speedBase * dt;
      this.position.x += mx * step;
      this.resolveCollisions('x');
      this.position.z += mz * step;
      this.resolveCollisions('z');
    }
    this.position.x = clamp(this.position.x, -42.5, 42.5);
    this.position.z = clamp(this.position.z, -42.5, 42.5);

    // jump / gravity
    if (input.jump && this.grounded && !this.crouching) {
      this.velocityY = 7.0;
      this.grounded = false;
      this.callbacks.onJump?.();
    }
    this.velocityY -= 22 * dt;
    this.position.y += this.velocityY * dt;
    if (this.position.y <= 0) {
      if (!this.grounded && this.velocityY < -4) {
        this.landImpact = clamp(-this.velocityY / 12, 0, 1);
        this.shake = Math.min(1, this.shake + this.landImpact * 0.25);
        this.callbacks.onLand?.(this.landImpact);
      }
      this.position.y = 0;
      this.velocityY = 0;
      this.grounded = true;
    }

    // bob
    if (this.grounded && len > 0.001) {
      this.bobPhase += dt * (this.sprinting ? 13 : 9.5);
      this.bobAmount = damp(this.bobAmount, this.sprinting ? 1.25 : 0.8, 8, dt);
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = this.sprinting ? 0.3 : 0.44;
        this.stepIndex++;
        this.callbacks.onFootstep?.(this.stepIndex, this.sprinting);
      }
    } else {
      this.bobAmount = damp(this.bobAmount, 0, 8, dt);
    }
    this.landImpact = damp(this.landImpact, 0, 6, dt);

    // health regen after 6.5s
    if (this.time - this.lastDamageAt > 6.5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 9);
    }
    this.damageFlash = damp(this.damageFlash, 0, 5, dt);

    this.updateCamera(dt, len);
  }

  resolveCollisions(axis) {
    const feet = this.position.y;
    for (const c of this.world.colliders) {
      if (feet > c.maxY - 0.06) continue;
      const r = resolveCircleBox(this.position.x, this.position.z, this.radius, c);
      if (r) {
        if (axis === 'x') this.position.x = r.x;
        else this.position.z = r.z;
      }
    }
  }

  updateCamera(dt, moving) {
    this.shakeTime += dt;
    const shake = this.shake;
    this.shake = damp(this.shake, 0, 7, dt);
    const sx = (Math.sin(this.shakeTime * 63) + Math.sin(this.shakeTime * 41)) * 0.5 * shake * 0.055;
    const sy = (Math.sin(this.shakeTime * 71) + Math.cos(this.shakeTime * 47)) * 0.5 * shake * 0.045;
    const bob = this.bobAmount * 0.035;
    const bx = Math.sin(this.bobPhase) * bob;
    const by = Math.abs(Math.cos(this.bobPhase)) * bob * 0.75;
    this._camPos.set(this.position.x + bx, this.position.y + this.eyeHeight + by - this.landImpact * 0.12, this.position.z);
    this.camera.position.copy(this._camPos);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + this.recoilYaw + sx * 0.2;
    this.camera.rotation.x = this.pitch + this.recoilPitch + sy;
    this.camera.rotation.z = -bx * 0.12 + sx * 0.4;
  }

  getForward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    return out;
  }

  getEye(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }
}
