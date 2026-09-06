/**
 * js/exploration/exploration_engine.js
 * The Physics and Collision Engine for Local Map Exploration.
 * Handles boat momentum, turning, wall collisions, NPC boat collisions, damage, zone transitions, and Stealth/Noise.
 */

import { TILE, LOCAL_MAP_SIZE } from './local_map.js';
import { clamp, getRandomInRange } from '../util/utils.js'; // <-- Added getRandomInRange

export const ExplorationEngine = {
    // --- State ---
    x: 256,
    y: 256,
    velocity: 0,
    heading: -Math.PI / 2, 
    currentNoise: 0, 
    npcBoats:[], 
    
    // --- Hazard State ---
    biomeId: null,
    weather: null,
    roomType: null, 
    volcanicTimer: 0,
    crystalTimer: 0,
    sirenAngle: 0, // <-- NEW
    sirenTimer: 0, // <-- NEW
    isWarping: false,
    
    // --- Data References ---
    boatStats: null,
    localMap: null,
    
    // --- Engine Constants ---
    collisionRadius: 6, 
    waterFriction: 1.5, 
    
    // --- Event Callbacks ---
    onDamage: null,
    onZoneTransition: null,
    onDockInteract: null,

    init(startX, startY, effectiveExplorationStats, localMapData, heading = -Math.PI / 2, velocity = 0, npcBoats =[], biomeId = null, weather = null, roomType = null) {
        this.x = startX;
        this.y = startY;
        this.velocity = velocity; 
        this.heading = heading;   
        this.currentNoise = 0;    
        this.npcBoats = npcBoats; 
        
        this.biomeId = biomeId;
        this.weather = weather;
        this.roomType = roomType; // Added
        this.volcanicTimer = 5.0; 
        this.crystalTimer = getRandomInRange(5.0, 15.0);
        this.isWarping = false; 
        
        this.boatStats = effectiveExplorationStats; 
        this.localMap = localMapData;
    },

    update(dt, input) {
        if (!this.boatStats || !this.localMap) return;

        const imm = this.boatStats.immunities || {};
        let envSpeedMult = 1.0;
        let envTurnMult = 1.0;
        if (this.biomeId === 'frozen' && !imm.frozen) {
            envSpeedMult = 0.5; 
            envTurnMult = 0.5;  
        }

        // --- 1. ROTATION ---
        const turnRate = (this.boatStats.turnSpeed * envTurnMult * (Math.PI / 180)) * dt;
        if (input.left)  this.heading -= turnRate;
        if (input.right) this.heading += turnRate;

        // --- 2. MOMENTUM PHYSICS (Acceleration & Friction) ---
        // A standard reference mass is 50. 
        // Skiff (Mass 20) = 2.5x acceleration, 2.5x friction (Stops instantly).
        // Dreadnought (Mass 150) = 0.33x acceleration, 0.33x friction (Glides like a train).
        const massFactor = 50 / Math.max(10, this.boatStats.mass);
        const frictionRate = 1.5 * massFactor;

        let thrust = 0;
        if (input.forward) thrust = this.boatStats.acceleration * envSpeedMult * massFactor;
        if (input.backward) thrust = -this.boatStats.acceleration * envSpeedMult * massFactor * 0.5;

        this.velocity += thrust * dt;
        
        // Apply friction
        let drag = this.velocity * frictionRate * dt;
        
        // Softly cap the top speed
        const maxSpeed = this.boatStats.speed * envSpeedMult;
        if (this.velocity > maxSpeed) drag += (this.velocity - maxSpeed) * 5 * dt;
        if (this.velocity < -maxSpeed * 0.4) drag += (this.velocity + maxSpeed * 0.4) * 5 * dt;

        this.velocity -= drag;

        // --- 3. MOVEMENT & HAZARD: ABYSSAL WHIRLPOOL ---
        let moveX = Math.cos(this.heading) * this.velocity * dt;
        let moveY = Math.sin(this.heading) * this.velocity * dt;

        if (this.weather === 'whirlpool' && !imm.abyssal) {
            const cx = LOCAL_MAP_SIZE / 2;
            const cy = LOCAL_MAP_SIZE / 2;
            const dist = Math.hypot(cx - this.x, cy - this.y);
            
            if (dist > 3) {
                const pullStrength = 8.0 + (80 / Math.max(5, dist)); 
                moveX += ((cx - this.x) / dist) * pullStrength * dt;
                moveY += ((cy - this.y) / dist) * pullStrength * dt;
            } else {
                if (!this.isWarping && this.onWhirlpoolWarp) {
                    this.isWarping = true;
                    this.onWhirlpoolWarp();
                }
            }
        }

        // --- NEW: COSMIC STORM ENGINE SHEAR ---
        if (this.roomType === 'cosmic_storm') {
            const maxSpeed = this.boatStats.speed;
            if (Math.abs(this.velocity) > (maxSpeed * 0.2)) {
                this.volcanicTimer -= dt; // Reuse volcanic timer as tick timer
                if (this.volcanicTimer <= 0) {
                    this.volcanicTimer = 1.0; // Tick damage every 1.0s
                    if (this.onDamage) this.onDamage(2, "Cosmic Storm");
                }
            }
        }

        // --- NEW: ASTRAL SIREN GRAVITY WELLS (Fluctuating Anomalies) ---
        if (this.roomType === 'siren_trap') {
            this.sirenTimer -= dt;
            if (this.sirenTimer <= 0) {
                // Pick a new random direction for the gravity wave to push
                this.sirenAngle = Math.random() * Math.PI * 2;
                this.sirenTimer = 1.0 + Math.random() * 2.0; // Changes direction every 1 to 3 seconds
            }

            const px = Math.floor(this.x);
            const py = Math.floor(this.y);
            const searchR = 30; 
            
            let nearestFlora = null;
            let minDist = Infinity;
            
            for (let dy = -searchR; dy <= searchR; dy += 2) { 
                for (let dx = -searchR; dx <= searchR; dx += 2) {
                    const tx = px + dx;
                    const ty = py + dy;
                    if (tx >= 0 && tx < LOCAL_MAP_SIZE && ty >= 0 && ty < LOCAL_MAP_SIZE) {
                        if (this.localMap.grid[ty][tx] === TILE.FLORA) {
                            const dist = Math.hypot(tx - this.x, ty - this.y);
                            if (dist < minDist) {
                                minDist = dist;
                                nearestFlora = { x: tx, y: ty };
                            }
                        }
                    }
                }
            }
            
            if (nearestFlora && minDist < 45) { 
                // Stronger push as you get closer to the flora
                const forceMult = Math.max(0, 1.0 - (minDist / 45));
                const pushForce = 50.0 * forceMult; // Strong directional shove
                
                // Apply the fluctuating gravity vector!
                moveX += Math.cos(this.sirenAngle) * pushForce * dt;
                moveY += Math.sin(this.sirenAngle) * pushForce * dt;
            }
        }

        // --- NEW: PHANTOM SHIPS CHASE AI (Tank Controls) ---
        if (this.roomType === 'phantom_room' && this.npcBoats && this.npcBoats.length > 0) {
            this.npcBoats.forEach(phantom => {
                if (!phantom.isPhantom) return;
                if (phantom.heading === undefined) phantom.heading = 0; // Initialize heading
                
                // --- NEW: RECOIL STUN LOGIC ---
                if (phantom.stunTimer > 0) {
                    phantom.stunTimer -= dt;
                    // Drift backward helplessly while stunned
                    phantom.x -= Math.cos(phantom.heading) * 20.0 * dt;
                    phantom.y -= Math.sin(phantom.heading) * 20.0 * dt;
                    return; // Skip chase AI this frame!
                }
                
                const distToPlayer = Math.hypot(this.x - phantom.x, this.y - phantom.y);
                const noise = this.currentNoise || 0;
                
                // Aggro if player makes noise OR if they sail too close (sentry proximity check)
                if (noise > 30 || distToPlayer < 60) { 
                    phantom.targetX = this.x;
                    phantom.targetY = this.y;
                    phantom.state = 'CHASE';
                } else if (distToPlayer > 180) {
                    // Head home if player slips away
                    phantom.targetX = phantom.homeX;
                    phantom.targetY = phantom.homeY;
                    phantom.state = 'RETURN';
                }

                if (phantom.state === 'CHASE' || phantom.state === 'RETURN') {
                    const dx = phantom.targetX - phantom.x;
                    const dy = phantom.targetY - phantom.y;
                    const dist = Math.hypot(dx, dy);
                    
                    if (dist > 5) {
                        // Determine desired angle to target
                        const targetAngle = Math.atan2(dy, dx);
                        
                        // Calculate shortest turn direction
                        let angleDiff = targetAngle - phantom.heading;
                        while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        
                        // Rotate smoothly towards target
                        const turnSpeed = 2.5; // Radians per second
                        if (Math.abs(angleDiff) < turnSpeed * dt) {
                            phantom.heading = targetAngle;
                        } else {
                            phantom.heading += Math.sign(angleDiff) * turnSpeed * dt;
                        }

                        // Move forward along heading (only if facing roughly the right way)
                        // SPEED NERF: Slowed down from 85 so the player isn't instantly overwhelmed
                        const chaseSpeed = phantom.state === 'CHASE' ? 45.0 : 25.0; 
                        if (Math.abs(angleDiff) < Math.PI / 2) {
                            phantom.x += Math.cos(phantom.heading) * chaseSpeed * dt;
                            phantom.y += Math.sin(phantom.heading) * chaseSpeed * dt;
                        }
                    } else if (phantom.state === 'RETURN') {
                        phantom.state = 'IDLE';
                    }
                }
            });
        }

        this.x += moveX;
        this.y += moveY;

        // --- 4. COLLISION DETECTION ---
        this._checkCollisions();

        // --- HAZARD: VOLCANIC BOILING WATER ---
        if (this.biomeId === 'volcanic' && !imm.volcanic) {
            this.volcanicTimer -= dt;
            if (this.volcanicTimer <= 0) {
                this.volcanicTimer = 20.0; 
                if (this.onDamage) this.onDamage(1, "Boiling Water");
            }
        }

        // --- 5. ZONE TRANSITIONS & DOCK ---
        this._checkZoneTransitions();
        if (input.action) this._checkDock();

        // --- 6. STEALTH & HAZARD: CRYSTAL SHATTER-STORMS ---
        let thrustNoise = (input.forward || input.backward) ? 60 : 0;
        let speedNoise = (Math.abs(this.velocity) / this.boatStats.speed) * 40;
        
        let rawNoise = thrustNoise + speedNoise;
        let targetNoise = rawNoise / Math.max(0.1, this.boatStats.stealth);
        
        if (targetNoise > this.currentNoise) this.currentNoise += (targetNoise - this.currentNoise) * 5.0 * dt;
        else this.currentNoise += (targetNoise - this.currentNoise) * 0.3 * dt;

        if (this.weather === 'shatter' && !imm.crystal) {
            this.crystalTimer -= dt;
            if (this.crystalTimer <= 0) {
                this.crystalTimer = getRandomInRange(5.0, 12.0); 
                this.currentNoise += getRandomInRange(50, 100);  
                
                if (Math.random() < 0.40) {
                    if (Math.random() > this.boatStats.evasion) {
                        // Apply Damage Reduction to the crystal shatter!
                        const rawDmg = Math.floor(getRandomInRange(5, 15));
                        const finalDmg = Math.max(0, Math.floor(rawDmg * (1 - this.boatStats.damageReduction)));
                        if (this.onDamage) this.onDamage(finalDmg, "Falling Crystal");
                    } else {
                        if (this.onDamage) this.onDamage(0, "Dodge");
                    }
                }
            }
        }

        this.currentNoise = clamp(this.currentNoise, 0, 100);
    },

    _checkCollisions() {
        const minX = Math.max(0, Math.floor(this.x - this.collisionRadius));
        const maxX = Math.min(LOCAL_MAP_SIZE - 1, Math.ceil(this.x + this.collisionRadius));
        const minY = Math.max(0, Math.floor(this.y - this.collisionRadius));
        const maxY = Math.min(LOCAL_MAP_SIZE - 1, Math.ceil(this.y + this.collisionRadius));

        let hitTerrain = false;
        let hitPhantom = false;
        let impactVelocity = Math.abs(this.velocity);

        // A. Check against rock/land tiles
        for (let ty = minY; ty <= maxY; ty++) {
            for (let tx = minX; tx <= maxX; tx++) {
                const tileId = this.localMap.grid[ty][tx];
                
                if (tileId === TILE.LAND || tileId === TILE.ROCK) {
                    const distX = this.x - (tx + 0.5);
                    const distY = this.y - (ty + 0.5);
                    const distance = Math.hypot(distX, distY);
                    const minSafeDistance = this.collisionRadius + 0.5;

                    if (distance < minSafeDistance) {
                        hitTerrain = true;
                        const overlap = minSafeDistance - distance;
                        this.x += (distX / distance) * overlap;
                        this.y += (distY / distance) * overlap;
                    }
                }
            }
        }

        // B. Check against NPC Boats / Phantoms
        if (this.npcBoats && this.npcBoats.length > 0) {
            for (const npc of this.npcBoats) {
                const distX = this.x - npc.x;
                const distY = this.y - npc.y;
                const distance = Math.hypot(distX, distY);
                const minSafeDistance = this.collisionRadius + 6;

                if (distance < minSafeDistance) {
                    const overlap = minSafeDistance - distance;
                    
                    // Push the player away (Elastic collision)
                    this.x += (distX / distance) * overlap * 0.5;
                    this.y += (distY / distance) * overlap * 0.5;
                    
                    if (npc.isPhantom) {
                        hitPhantom = true;
                        // Push the phantom away harder so it visibly recoils
                        npc.x -= (distX / distance) * overlap * 1.5;
                        npc.y -= (distY / distance) * overlap * 1.5;
                        
                        // --- NEW: TRIGGER STUN ---
                        npc.stunTimer = 1.5; // Stun the phantom for 1.5 seconds
                        
                        // Phantom ramming damage trigger
                        if (this.onDamage) {
                            const nowMs = Date.now();
                            // 2500ms (2.5s) i-frames gives the player time to bounce away and escape
                            if (!npc.lastDamageTime || nowMs - npc.lastDamageTime > 2500) {
                                npc.lastDamageTime = nowMs;
                                if (Math.random() < this.boatStats.evasion) {
                                    this.onDamage(0, "Dodge");
                                } else {
                                    const rawDmg = Math.floor(15 + Math.random() * 10); // 15 to 25 base damage
                                    const finalDmg = Math.max(1, Math.floor(rawDmg * (1.0 - this.boatStats.damageReduction)));
                                    this.onDamage(finalDmg, "Phantom Ram");
                                }
                            }
                        }
                    } else {
                        hitTerrain = true; // Treat regular boats like a terrain bounce
                    }
                }
            }
        }

        // C. Apply global bounce and terrain damage
        if (hitTerrain || hitPhantom) {
            const bounceFactor = Math.max(0.1, 0.4 * (50 / this.boatStats.mass));
            this.velocity = -this.velocity * bounceFactor; 

            if (hitTerrain && impactVelocity > 15 && this.onDamage) {
                if (Math.random() < this.boatStats.evasion) {
                    this.onDamage(0, "Dodge");
                } else {
                    let rawDmg = impactVelocity * 0.4;
                    rawDmg *= this.boatStats.collisionDamageMult; 
                    
                    // Multiply land crash damage by 1.5x in the Astral Sea
                    if (this.biomeId === 'astral_sea') {
                        rawDmg *= 1.5;
                    }
                    
                    const finalDmg = Math.floor(rawDmg * (1.0 - this.boatStats.damageReduction));
                    this.onDamage(finalDmg, "Collision");
                }
            }
        }
    },

    _checkZoneTransitions() {
        const edgeThreshold = 2; 
        if (this.x < edgeThreshold && this.onZoneTransition) this.onZoneTransition('w');
        else if (this.x > LOCAL_MAP_SIZE - edgeThreshold && this.onZoneTransition) this.onZoneTransition('e');
        else if (this.y < edgeThreshold && this.onZoneTransition) this.onZoneTransition('n');
        else if (this.y > LOCAL_MAP_SIZE - edgeThreshold && this.onZoneTransition) this.onZoneTransition('s');
    },

    _checkDock() {
        const gx = Math.floor(this.x);
        const gy = Math.floor(this.y);
        if (gx >= 0 && gx < LOCAL_MAP_SIZE && gy >= 0 && gy < LOCAL_MAP_SIZE) {
            const tileId = this.localMap.grid[gy][gx];
            if (tileId === TILE.DOCK && this.onDockInteract) {
                this.velocity = 0; 
                this.onDockInteract();
            }
        }
    }
};

window.ExplorationEngine = ExplorationEngine;