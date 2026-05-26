/**
 * js/fishing/fishing_engine.js
 * The core physics and AI state machine for the fishing minigame.
 * V12 - Smoothed Weight Curves and Stat-Driven "Breathing" Sweet Spots.
 */

import { getRandomInRange, clamp } from '../util/utils.js';

// Define how the fish behaves physically in each state
// V12: Widened base sweet spot ranges. The engine now adds dynamic drift on top of these.
const BEHAVIORS = {
    HOLD:        { pullMult: 0.1, drainMult: -0.8, targetSweet: [65, 95], invincible: false }, 
    RUN:         { pullMult: 1.4, drainMult: 1.8,  targetSweet: [20, 45],  invincible: false }, 
    THRASH:      { pullMult: 0.8, drainMult: 1.2,  targetSweet: 'wobble',  invincible: false }, 
    BURST:       { pullMult: 2.5, drainMult: 2.5,  targetSweet: [5, 25],   invincible: false }, 
    INANIMATE:   { pullMult: 0.0, drainMult: 0.0,  targetSweet: [50, 60],  invincible: false }, 
    SECOND_WIND: { pullMult: 0.4, drainMult: 0.0,  targetSweet: [35, 65],  invincible: true  }  
};

export const FishingEngine = {
    phase: 'IDLE', 

    playerStats: null,
    fishPool: [],
    fishData: null, 
    lureStats: null,

    // Depth & Physics Mechanics
    currentDepth: 0,
    targetDepth: 0,
    maxDepth: 20,
    waterCurrent: 0, 
    
    // Core Minigame Vitals
    tension: 0,
    maxTension: 100,
    fishStamina: 0,
    maxFishStamina: 0,
    playerStamina: 0,
    maxPlayerStamina: 0,
    playerStaminaRegen: 0, 
    playerStaminaDelayTimer: 0, 
    catchProgress: 0, 
    
    // Dynamic Sweet Spot Mechanics
    reelPower: 50,      
    currentSweetSpot: 50, 
    targetSweetSpot: 50,  
    currentTolerance: 8, // <-- ADD THIS LINE
    inSweetSpot: false,
    
    currentTimeMins: 480, 
    hookTimerMs: 0,
    fightTimer: 0,    
    maxFightTimer: 0,

    // --- NEW: Boss Mechanics State ---
    bossState: { heatVentTimer: 0, splitTargets: [50, 50] },
    onBossStrike: null, // Callback to damage the player's hull
    
    ai: { state: 'HOLD', timer: 0, aggression: 0, isResting: false },

    startCast(effectivePlayerStats, rawPlayerStaminaStat, fishPool, maxDepth, currentTimeMins = 480) {
        this.playerStats = effectivePlayerStats;
        this.lureStats = effectivePlayerStats.activeLure;
        this.fishPool = fishPool;
        this.fishData = null;

        this.maxDepth = maxDepth;
        this.currentDepth = 0; 
        this.targetDepth = 0;
        this.waterCurrent = 0;
        this.currentTimeMins = currentTimeMins; 

        this.maxPlayerStamina = this.playerStats.minigame.stamina;
        this.playerStamina = this.maxPlayerStamina;
        this.playerStaminaRegen = 15 + (rawPlayerStaminaStat * 5); 
        this.playerStaminaDelayTimer = 0;

        this.maxTension = this.playerStats.minigame.maxTension;
        this.tension = 0;
        this.catchProgress = 0;
        
        this.reelPower = 50;      
        this.currentSweetSpot = 50; 
        this.targetSweetSpot = 50;  
        this.currentTolerance = this.playerStats.minigame.sweetSpotTolerance; 
        this.inSweetSpot = false;
        
        this.bossState = { heatVentTimer: 0, splitTargets: [50, 50] }; // <-- NEW
        this.onBossStrike = null; // <-- NEW
        
        this.phase = 'SINKING';
        this.ai.isResting = false;
    },

    scrollDepth(delta) {
        if (this.phase === 'SINKING') this.targetDepth = clamp(this.targetDepth + delta, 0, this.maxDepth);
    },

    scrollReelPower(delta) {
        const baseIncrement = 1.0; 
        const speedMult = this.playerStats.minigame.reelScrollSpeed || 1.0;
        const normalizedDelta = delta / 100; 
        const scrollAmount = -normalizedDelta * baseIncrement * speedMult;
        this.reelPower = clamp(this.reelPower + scrollAmount, 10, 100);
    },

    getDepthZone() {
        const pct = this.currentDepth / this.maxDepth;
        if (pct < 0.33) return 'Surface';
        if (pct < 0.66) return 'Mid-water';
        return 'Bottom-feeder';
    },

    evaluateBite() {
        if (this.phase !== 'SINKING') return false;

        const currentZone = this.getDepthZone();
        const lure = this.lureStats;
        const currentHour = this.currentTimeMins / 60; 
        let validCandidates = [];

        for (const fish of this.fishPool) {
            if (fish.environment.depthPref !== currentZone) continue;

            // --- Bare Hook Penalty ---
            // If the player is using a bare hook, only Common fish can bite.
            if (lure.isBareHook === true && fish.identity.rarity !== 'Common' && fish.invType !== 'chest_encounter') {
                continue; 
            }

            const activeHours = fish.environment.activeHours;
            let isActive = false;
            
            if (activeHours === 'Always Active') isActive = true;
            else if (activeHours === 'Diurnal') isActive = (currentHour >= 6 && currentHour < 18); 
            else if (activeHours === 'Nocturnal') isActive = (currentHour >= 18 || currentHour < 6); 
            else if (activeHours === 'Crepuscular') isActive = ((currentHour >= 4 && currentHour <= 8) || (currentHour >= 16 && currentHour <= 20)); 

            const prefs = fish.lurePrefs;
            const totalDiff = Math.abs(prefs.color - lure.color) + Math.abs(prefs.sound - lure.sound) + Math.abs(prefs.light - lure.light) + Math.abs(prefs.weight - lure.weight);
            const maxAllowedDiff = prefs.tolerance * 800 * (isActive ? 1.0 : 0.5);

            if (totalDiff <= maxAllowedDiff) {
                let matchScore = 1.0 - (totalDiff / maxAllowedDiff);
                if (!isActive) matchScore *= 0.15; 
                validCandidates.push({ fish, matchScore });
            }
        }

        if (validCandidates.length === 0) {
            this.phase = 'IDLE'; 
            return false;
        }

        const chestCandidate = validCandidates.find(c => c.fish.invType === 'chest_encounter');
        if (chestCandidate) {
            this.fishData = chestCandidate.fish;
            this.phase = 'BITE';
            this.hookTimerMs = this.fishData.combat.hookWindowMs + this.playerStats.minigame.hookWindowMs;
            return true;
        }

        validCandidates.sort((a, b) => b.matchScore - a.matchScore);

        let selectedCandidate = validCandidates[0];
        for (const candidate of validCandidates) {
            if (Math.random() < 0.7) {
                selectedCandidate = candidate;
                break;
            }
        }

        this.fishData = selectedCandidate.fish;
        this.phase = 'BITE';
        this.hookTimerMs = this.fishData.combat.hookWindowMs + this.playerStats.minigame.hookWindowMs;
        
        return true;
    },

    attemptHook() {
        if (this.phase === 'BITE') {
            this.phase = 'FIGHT';
            this.fishStamina = this.fishData.combat.stamina;
            this.maxFishStamina = this.fishData.combat.stamina;
            
            const weightBonus = (this.fishData.actualWeight || 15) * 0.05;
            const stamBonus = this.fishData.combat.stamina * 0.2;
            this.maxFightTimer = clamp(35 + stamBonus + weightBonus, 30, 150);
            this.fightTimer = this.maxFightTimer;

            this.ai.aggression = this.fishData.combat.aggression;
            this.ai.state = 'RUN';
            this.ai.timer = 2.0; 
            this.ai.isResting = false;
            
            // Apply Leviathan Hunter: Increases Max Tension by +50 against Large/Massive fish
            const traits = this.playerStats.minigame.rodTraits || [];
            if (traits.includes('leviathan_hunter') && (this.fishData.physical.sizeTier === 'Large' || this.fishData.physical.sizeTier === 'Massive')) {
                this.maxTension = this.playerStats.minigame.maxTension + 50;
            } else {
                this.maxTension = this.playerStats.minigame.maxTension;
            }

            this.tension = this.maxTension * 0.2; 
            return true;
        }
        return false;
    },

    update(dt, isReeling) {
        this.waterCurrent = Math.sin(Date.now() / 1500) * 1.5;

        if (this.phase === 'SINKING') {
            const lerpSpeed = 3.0; 
            this.currentDepth += (this.targetDepth - this.currentDepth) * lerpSpeed * dt;
            return;
        }

        if (this.phase === 'BITE') {
            this.hookTimerMs -= (dt * 1000);
            if (this.hookTimerMs <= 0) this.phase = 'ESCAPED';
            return;
        }

        if (this.phase !== 'FIGHT') return;

        this.fightTimer -= dt;
        if (this.fightTimer <= 0) {
            this.phase = 'ESCAPED';
            return;
        }

        this._updateFishAI(dt, isReeling);
        this._applyPhysics(dt, isReeling);
        this._checkEndConditions();
    },

    _updateFishAI(dt, isReeling) {
        if (this.fishData.combat.aggression === 0) {
            this.ai.state = 'INANIMATE';
            return;
        }

        const fishStamPct = this.fishStamina / this.maxFishStamina;
        const traits = this.playerStats.minigame.rodTraits || [];

        if (this.fishStamina <= 0 && this.ai.state !== 'SECOND_WIND') {
            this.ai.state = 'SECOND_WIND';
            let duration = 1.5 + (this.fishData.combat.stamina / 250);
            
            // --- NEW: Boss Strict Timers ---
            if (this.fishData.identity.rarity === 'Boss') {
                if (this.fishData.id === 'vesper_bloom_leviathan') duration = 15.0; // 15s for Fungal
                else if (this.fishData.id === 'geode_monarch') duration = 12.0;       // 12s for Crystal
                else if (this.fishData.id === 'ignis_gorged_serpentine') duration = 13.0; // 13s for Lava
                else duration = 12.0; // Standard boss fallback
            }

            // Apply Second Wind Breaker: Cuts the invincible rest period by 50%
            if (traits.includes('second_wind_breaker')) {
                duration *= 0.5;
            }
            
            this.ai.timer = duration;
            this.targetSweetSpot = getRandomInRange(40, 60);
            return;
        }

        this.ai.timer -= dt;
        if (this.ai.timer <= 0) {
            const aggro = this.fishData.combat.aggression;
            const tensionPct = this.tension / this.maxTension;
            const slack = (!isReeling && this.reelPower < 30);

            let nextState = 'HOLD';
            let duration = getRandomInRange(1.0, 2.5);

            if (this.ai.state === 'SECOND_WIND') {
                // --- NEW: Boss Recovery Penalties ---
                if (this.fishData.identity.rarity === 'Boss') {
                    if (this.fishData.id === 'geode_monarch') {
                        this.fishStamina = this.maxFishStamina * 0.4; // 40% recovery for Crystal
                    } else if (this.fishData.id === 'ignis_gorged_serpentine') {
                        this.fishStamina = this.maxFishStamina * 0.5; // 50% recovery for Lava
                    } else {
                        this.fishStamina = this.maxFishStamina * 0.5; // 50% recovery for Fungal
                    }
                    nextState = 'THRASH';
                    duration = getRandomInRange(1.5, 3.0);
                } else {
                    nextState = Math.random() < 0.5 ? 'THRASH' : 'RUN';
                    duration = getRandomInRange(1.0, 2.0);
                }
            }

            else if (fishStamPct < 0.20 && fishStamPct > 0) {
                this.ai.isResting = false;
                if (slack) {
                    nextState = 'RUN';
                    duration = getRandomInRange(1.5, 3.0);
                } else {
                    nextState = Math.random() < 0.7 ? 'BURST' : 'THRASH';
                    duration = getRandomInRange(0.5, 1.2);
                }
            }
            else if (fishStamPct >= 0.20 && fishStamPct < 0.50) {
                this.ai.isResting = true;
                if (tensionPct > 0.8) {
                    nextState = 'THRASH'; 
                    duration = getRandomInRange(0.5, 1.0);
                } else {
                    nextState = 'HOLD'; 
                    duration = getRandomInRange(1.5, 3.0);
                }
            } 
            else {
                this.ai.isResting = false;
                if (tensionPct > 0.85) {
                    nextState = Math.random() < 0.6 ? 'THRASH' : 'BURST';
                    duration = getRandomInRange(0.5, 1.2);
                } 
                else if (slack) {
                    nextState = 'RUN';
                    duration = getRandomInRange(2.0, 4.0);
                } 
                else {
                    const roll = Math.random();
                    if (roll < 0.1 * aggro) nextState = 'BURST';
                    else if (roll < 0.4 * aggro) nextState = 'THRASH';
                    else if (roll < 0.7 + (0.2 * aggro)) nextState = 'RUN';
                    else nextState = 'HOLD';
                }
            }

            this.ai.state = nextState;
            
            // Apply Steady Hand: Behavior states last 33% longer (25% less frequent changes)
            if (traits.includes('steady_hand')) {
                duration *= 1.33;
            }
            this.ai.timer = duration;
        }

        if (this.ai.state === 'THRASH') {
            // Thrash violently jumps to new bounds frequently
            if (Math.random() < 12 * dt) this.targetSweetSpot = getRandomInRange(10, 90);
        } else {
            const range = BEHAVIORS[this.ai.state].targetSweet;
            if (range && range !== 'wobble') {
                // Pick a new base anchor occasionally even within the same state
                if (Math.random() < 2 * dt) {
                    this.targetSweetSpot = getRandomInRange(range[0], range[1]);
                }
            }
        }
    },

_applyPhysics(dt, isReeling) {
        const behavior = BEHAVIORS[this.ai.state];
        const fishSpeed = this.fishData.combat.speed;
        const fishAggro = this.fishData.combat.aggression;
        const fishStamPct = this.fishStamina / this.maxFishStamina;
        const traits = this.playerStats.minigame.rodTraits || [];

        // --- 1. WEIGHT FACTORS (Smoothed Curve) ---
        const actualWeight = this.fishData.actualWeight || 15;
        const wfProgress = Math.pow(actualWeight / 15, 0.25);
        const clampedWfProgress = clamp(wfProgress, 0.6, 3.0);
        
        const wfTension = Math.pow(actualWeight / 15, 0.1);
        const clampedWfTension = clamp(wfTension, 0.8, 1.8);

        // --- 2. DYNAMIC "BREATHING" SWEET SPOT & TOLERANCE ---
        let finalTargetSweet = this.targetSweetSpot;
        
        const baseTol = this.playerStats.minigame.sweetSpotTolerance;
        const fishPenalty = (fishSpeed * 0.025) + (fishAggro * 1.5); 
        
        this.currentTolerance = Math.max(3.5, baseTol - fishPenalty);
        
        const isIgnis = this.fishData.id === 'ignis_gorged_serpentine';
        const isIgnisPhase3 = (this.ai.state === 'SECOND_WIND' && isIgnis);
        const isIgnisPhase2 = (!isIgnisPhase3 && isIgnis && fishStamPct <= 0.5);
        
        // --- NEW: Boss Tolerance Overrides ---
        if (this.ai.state === 'SECOND_WIND' && this.fishData.identity.rarity === 'Boss') {
            if (this.fishData.id === 'vesper_bloom_leviathan') this.currentTolerance = 2.5; 
            else if (this.fishData.id === 'geode_monarch') this.currentTolerance = 2.0; 
            else if (isIgnisPhase3) this.currentTolerance = 2.0; 
            else this.currentTolerance = 2.0; 
        }
        
        const tol = this.currentTolerance; 
        const timeSec = Date.now() / 1000;
        
        // --- IGNIS SPLIT SWEET SPOT LOGIC ---
        if (isIgnisPhase3) {
            // Split into two rapidly drifting targets
            const target1 = clamp(35 + Math.sin(timeSec * 3.5) * 30, 5, 100);
            const target2 = clamp(65 + Math.cos(timeSec * 4.2) * 30, 5, 100);
            
            this.bossState.splitTargets[0] += (target1 - this.bossState.splitTargets[0]) * 10 * dt;
            this.bossState.splitTargets[1] += (target2 - this.bossState.splitTargets[1]) * 10 * dt;
            
            const powerDiff1 = this.reelPower - this.bossState.splitTargets[0];
            const powerDiff2 = this.reelPower - this.bossState.splitTargets[1];
            
            this.inSweetSpot = Math.abs(powerDiff1) <= tol || Math.abs(powerDiff2) <= tol;
        } 
        // STANDARD SWEET SPOT LOGIC
        else {
            if (this.ai.state !== 'INANIMATE' && this.ai.state !== 'THRASH') {
                let wobbleSpeed = fishSpeed * 0.025; 
                let wobbleWidth = fishSpeed * 0.12 * fishAggro; 
                
                if (this.ai.state === 'SECOND_WIND' && this.fishData.identity.rarity === 'Boss') {
                    if (this.fishData.id === 'vesper_bloom_leviathan') {
                        wobbleSpeed *= 2.5; wobbleWidth = 35; 
                        finalTargetSweet = clamp(this.targetSweetSpot + Math.sin(timeSec * wobbleSpeed) * wobbleWidth, 5, 100);
                    } else if (this.fishData.id === 'geode_monarch') {
                        finalTargetSweet = 50 + Math.sin(timeSec * 8.0) * 42; // Prismatic sweep
                    }
                } else {
                    finalTargetSweet = clamp(this.targetSweetSpot + Math.sin(timeSec * wobbleSpeed) * wobbleWidth, 5, 100);
                }
            }

            let shiftSpeed = 1.5 + (fishSpeed * 0.015); 
            if (this.ai.state === 'BURST') shiftSpeed = 12.0;
            if (this.ai.state === 'THRASH') shiftSpeed = 8.0;

            this.currentSweetSpot += (finalTargetSweet - this.currentSweetSpot) * shiftSpeed * dt;
            this.currentSweetSpot = clamp(this.currentSweetSpot, 5, 100);

            const powerDiff = this.reelPower - this.currentSweetSpot;
            this.inSweetSpot = Math.abs(powerDiff) <= tol;
        }

        const dragNorm = clamp(this.reelPower / 100, 0.1, 1.0);

        // --- NEW: IGNIS HULL DAMAGE HAZARDS ---
        if (isIgnisPhase2) {
            if (isReeling && !this.inSweetSpot) {
                this.bossState.heatVentTimer += dt;
                if (this.bossState.heatVentTimer >= 1.5) { // Needs 1.5s consecutive mistake to trigger
                    this.bossState.heatVentTimer = 0;
                    const isImmune = this.playerStats.exploration.immunities && this.playerStats.exploration.immunities.volcanic;
                    if (!isImmune && this.onBossStrike) {
                        this.onBossStrike(5, "Steam Vent");
                    }
                }
            } else {
                this.bossState.heatVentTimer = 0; // Resets cleanly
            }
        } else if (isIgnisPhase3) {
            // Eruption: Takes 10 damage per second if reeling outside sweet spots, or holding 100% tension
            if ((isReeling && !this.inSweetSpot) || this.reelPower >= 99) {
                this.bossState.heatVentTimer += dt;
                if (this.bossState.heatVentTimer >= 1.0) {
                    this.bossState.heatVentTimer = 0;
                    if (this.onBossStrike) this.onBossStrike(10, "Thermal Overload");
                }
            } else {
                this.bossState.heatVentTimer = 0;
            }
        }

        // --- 3. PLAYER EXHAUSTION & SHOCK ABSORBER MATH ---
        // (Keep the rest of your math logic identically below this line)
        const playerExhausted = this.playerStamina <= 0;
        
        let rawRodPower = this.playerStats.minigame.power;
        const activeBiomes = this.fishData.environment.biomes || [];
        if (traits.includes('abyssal_bane') && activeBiomes.includes('abyssal')) rawRodPower *= 1.20;
        if (traits.includes('fungal_bane') && activeBiomes.includes('fungal')) rawRodPower *= 1.20;
        if (traits.includes('crystal_bane') && activeBiomes.includes('crystal')) rawRodPower *= 1.20;
        if (traits.includes('volcanic_bane') && activeBiomes.includes('volcanic')) rawRodPower *= 1.20;
        if (traits.includes('frozen_bane') && activeBiomes.includes('frozen')) rawRodPower *= 1.20;

        const family = this.fishData.identity.family;
        if (traits.includes('shark_tamer') && family === 'shark') rawRodPower *= 1.25;
        if (traits.includes('eel_tamer') && family === 'eel') rawRodPower *= 1.25;
        if (traits.includes('ray_tamer') && family === 'ray') rawRodPower *= 1.25;
        if (traits.includes('cephalopod_tamer') && family === 'cephalopod') rawRodPower *= 1.25;
        if (traits.includes('crustacean_tamer') && family === 'crustacean') rawRodPower *= 1.25;
        if (traits.includes('jelly_tamer') && family === 'jellyfish') rawRodPower *= 1.25;
        if (traits.includes('deepsea_tamer') && family === 'deepsea') rawRodPower *= 1.25;
        if (traits.includes('fish_tamer') && family === 'fish') rawRodPower *= 1.25;

        const effectiveRodPower = playerExhausted ? (rawRodPower * 0.25) : rawRodPower;
        const tensionPenalty = playerExhausted ? 2.0 : 1.0; 

        let shockAbsorber = 1.0;
        if (this.ai.state === 'BURST' || this.ai.state === 'THRASH') {
            shockAbsorber = clamp(1.5 - (this.playerStats.minigame.flexibility * 0.5), 0.4, 2.0);
        }

        // --- 4. ELASTIC TENSION MATH ---
        let tensionDelta = 0;
        let burstMultiplier = 1.0;
        if (this.ai.state === 'BURST' && traits.includes('tension_dampener')) {
            burstMultiplier = 0.60;
        }
        const baseFishPull = fishSpeed * behavior.pullMult * shockAbsorber * clampedWfTension * burstMultiplier;

        if (isReeling) {
            this.playerStaminaDelayTimer = 1.0; 
            let tensionBuild = (baseFishPull * dragNorm * 1.35) + (this.reelPower * 0.45);
            
            if (!this.inSweetSpot) {
                let overpull = 0;
                if (isIgnisPhase3) {
                    // Punish based on the closest target
                    const diff1 = Math.max(0, Math.abs(this.reelPower - this.bossState.splitTargets[0]) - tol);
                    const diff2 = Math.max(0, Math.abs(this.reelPower - this.bossState.splitTargets[1]) - tol);
                    overpull = Math.min(diff1, diff2) / 50;
                } else {
                    const powerDiff = this.reelPower - this.currentSweetSpot;
                    overpull = Math.max(0, Math.abs(powerDiff) - tol) / 50;
                }
                tensionBuild *= (1.0 + Math.pow(overpull, 1.5) * 2.0); 
            } else {
                tensionBuild *= 0.45; 
            }

            tensionDelta = tensionBuild * tensionPenalty;
        } else {
            this.playerStaminaDelayTimer -= dt;
            const flex = this.playerStats.minigame.flexibility;
            const tensionDecay = 65 * flex * (1.1 - dragNorm);
            const passivePullTension = baseFishPull * dragNorm * 0.5;
            tensionDelta = passivePullTension - tensionDecay;
        }

        const maxTensionDelta = this.maxTension * 0.8;
        tensionDelta = clamp(tensionDelta, -maxTensionDelta, maxTensionDelta);
        this.tension = clamp(this.tension + tensionDelta * dt, 0, this.maxTension + 5);

        // --- 5. STAMINA DRAIN ---
        if (isReeling) {
            const resistance = Math.max(1.0, behavior.pullMult); 
            const drainRate = 35 * resistance * Math.pow(dragNorm + 0.2, 1.2); 
            this.playerStamina -= drainRate * dt;
        } else if (this.playerStaminaDelayTimer <= 0) {
            this.playerStamina += this.playerStaminaRegen * dt;
        }
        this.playerStamina = clamp(this.playerStamina, 0, this.maxPlayerStamina);

        let fishDrain = 0;
        if (behavior.invincible) {
            fishDrain = -(this.maxFishStamina * 0.15); 
        } else if (behavior.drainMult > 0) {
            fishDrain = behavior.drainMult * 9.0 * dragNorm; 
        } else {
            fishDrain = behavior.drainMult * 5; 
            const regenBoost = (this.maxFishStamina * 0.04);
            fishDrain -= regenBoost; 
        }
        
        if (isReeling && this.inSweetSpot && !behavior.invincible) {
            fishDrain += (14 * effectiveRodPower) / Math.pow(clampedWfProgress, 0.7);
        }

        if (!isReeling && !behavior.invincible && traits.includes('feather_cast')) {
            if (fishDrain > 0) fishDrain *= 1.20; 
            else if (fishDrain < 0) fishDrain *= 0.80; 
        }

        this.fishStamina -= fishDrain * dt;
        this.fishStamina = clamp(this.fishStamina, 0, this.maxFishStamina);


        // --- 6. CATCH PROGRESS ---
        let escapeSpeed = baseFishPull * (1.1 - dragNorm) * 0.10;
        if (this.ai.state === 'RUN') {
            const speedAdvantage = Math.max(0, fishSpeed - (effectiveRodPower * 30));
            escapeSpeed += speedAdvantage * 0.06 * clampedWfProgress;
        }
        
        if (!isReeling) {
            this.catchProgress -= escapeSpeed * dt;
            if (this.catchProgress <= 5) this.fightTimer -= dt * 2.0;
        } else {
            const armorFactor = behavior.invincible ? 1.0 : 1.0 + (fishStamPct * (clampedWfProgress * 1.5));
            let pullSpeed = (32 * effectiveRodPower * dragNorm) / (armorFactor * clampedWfProgress);
            
            if (this.inSweetSpot) pullSpeed *= 1.5;
            else pullSpeed *= 0.5;

            this.catchProgress += (pullSpeed - (escapeSpeed * 0.2)) * dt;
        }

        this.catchProgress = clamp(this.catchProgress, 0, 100);
    },

    _checkEndConditions() {
        if (this.tension >= this.maxTension) this.phase = 'SNAPPED';
        else if (this.catchProgress >= 100) this.phase = 'CAUGHT';
    }
};