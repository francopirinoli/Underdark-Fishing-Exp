/**
 * js/fishing/arena_engine.js
 * Headless combat resolver for The Volcanic Arena.
 * V2 - Rebalanced HP/ATK scaling, non-stacking shields, and evasion nerfs.
 */

// --- ELEMENTAL / CLASS DEFINITIONS ---
const CLASSES = {
    PREDATOR: { id: 'PREDATOR', families: ['shark', 'deepsea'], strongVs: 'SLIPPERY' },
    SLIPPERY: { id: 'SLIPPERY', families: ['eel', 'cephalopod'], strongVs: 'ARMORED' },
    ARMORED:  { id: 'ARMORED',  families: ['crustacean', 'ray'], strongVs: 'AMORPHOUS' },
    AMORPHOUS:{ id: 'AMORPHOUS',families: ['jellyfish', 'fish'], strongVs: 'PREDATOR' }
};

// Rebalanced Size Modifiers
const SIZE_MODS = {
    'Tiny':    { hp: 0.6, atk: 0.6, cdPenalty: -1.0, evasion: 0.25 },
    'Small':   { hp: 1.0, atk: 1.0, cdPenalty: -0.5, evasion: 0.15 },
    'Medium':  { hp: 1.5, atk: 1.5, cdPenalty:  0.0, evasion: 0.05 },
    'Large':   { hp: 2.5, atk: 2.5, cdPenalty:  1.0, evasion: 0.00 },
    'Massive': { hp: 4.0, atk: 4.0, cdPenalty:  2.0, evasion: 0.00 }
};

export class ArenaEngine {
    constructor(playerTeamData, enemyTeamData, onEventCallback = null) {
        this.onEvent = onEventCallback || (() => {});
        this.state = 'INIT'; 
        this.timeElapsed = 0;
        
        this.playerTeam = playerTeamData.map((fish, i) => this.createFighter(fish, 'player', i));
        this.enemyTeam = enemyTeamData.map((fish, i) => this.createFighter(fish, 'enemy', i));
    }

    getClassId(family) {
        for (const key in CLASSES) {
            if (CLASSES[key].families.includes(family)) return CLASSES[key].id;
        }
        return 'AMORPHOUS';
    }

    createFighter(fishData, team, position) {
        if (!fishData) return null;
        
        const family = fishData.identity.family;
        const size = fishData.physical.sizeTier;
        const mods = SIZE_MODS[size];
        
        // --- REBALANCED STAT TRANSLATION ---
        // Reduced HP multiplier to account for Rarity stamina bloat
        const maxHp = Math.max(50, Math.round(4 * fishData.combat.stamina * mods.hp));
        
        // Increased ATK scaling so damage outpaces healing/shielding
        const atk = Math.max(5, Math.round(25 * mods.atk * (1.0 + fishData.combat.aggression)));
        
        // Attack Cooldown (Clamped safely between 1.5s and 6.0s)
        const baseCd = 4.0 - ((fishData.combat.speed / 100) * 1.5);
        const cd = Math.max(1.5, Math.min(6.0, baseCd + mods.cdPenalty));
        
        let aiProfile = 'HUNTER';
        if (fishData.combat.aggression >= 0.7) aiProfile = 'FRENZY';
        else if (fishData.combat.aggression <= 0.35) aiProfile = 'CAUTIOUS';

        return {
            id: fishData.instanceId || fishData.id || `${team}_${position}`,
            name: fishData.identity.name,
            team: team,
            position: position,
            family: family,
            classId: this.getClassId(family),
            size: size,
            aiProfile: aiProfile,
            rarity: fishData.identity.rarity,
            
            // --- FIX: Pass the image data so the renderer can see it! ---
            imageDataUrl: fishData.imageDataUrl || (fishData.art ? fishData.art.imageDataUrl : ''),

            speed: fishData.combat.speed, 
            maxHp: maxHp,
            hp: maxHp,
            atk: atk,
            maxCd: cd,
            cd: cd,
            evasion: mods.evasion,
            
            isDead: false,
            attackCount: 0,
            shield: 0,
            stunTimer: 0,
            blindStacks: 0,
            cautiousGuardTimer: 0,
            poisonStacks: []
        };
    }

    start() {
        this.state = 'FIGHTING';
        this.emit('BATTLE_START');
    }

    tick(dt) {
        if (this.state !== 'FIGHTING') return;
        this.timeElapsed += dt;

        this._processTeam(this.playerTeam, this.enemyTeam, dt);
        this._processTeam(this.enemyTeam, this.playerTeam, dt);

        this._checkWinConditions();
    }

    _processTeam(team, opposingTeam, dt) {
        team.forEach(fighter => {
            if (!fighter || fighter.isDead) return;

            this._processStatusEffects(fighter, dt);

            if (fighter.stunTimer > 0) return;

            fighter.cd -= dt;
            if (fighter.cd <= 0) {
                this._executeAttack(fighter, opposingTeam, team);
                fighter.cd = fighter.maxCd; 
            }
        });
    }

    _processStatusEffects(fighter, dt) {
        if (fighter.stunTimer > 0) fighter.stunTimer -= dt;
        if (fighter.cautiousGuardTimer > 0) fighter.cautiousGuardTimer -= dt;

        if (fighter.poisonStacks.length > 0) {
            for (let i = fighter.poisonStacks.length - 1; i >= 0; i--) {
                const stack = fighter.poisonStacks[i];
                stack.duration -= dt;
                stack.tickTimer -= dt;

                if (stack.tickTimer <= 0) {
                    stack.tickTimer = 1.0; // Tick every 1s
                    this._applyDamage(fighter, stack.damage, 'POISON', null);
                }
                if (stack.duration <= 0) fighter.poisonStacks.splice(i, 1);
            }
        }
    }

    _executeAttack(attacker, opposingTeam, allyTeam) {
        const target = this._findTarget(attacker, opposingTeam);
        if (!target) return; 

        attacker.attackCount++;

        // 1. PRE-ATTACK ABILITIES
        if (attacker.aiProfile === 'CAUTIOUS') {
            attacker.cautiousGuardTimer = 1.0; 
        }

        if (attacker.family === 'cephalopod' && attacker.attackCount % 5 === 0) {
            target.blindStacks++;
            this.emit('ABILITY', { attacker, target, ability: 'Ink Jet' });
        }

        if (attacker.family === 'fish' && attacker.attackCount % 4 === 0) {
            const lowestAlly = this._findTarget(attacker, allyTeam, 'FRENZY'); 
            if (lowestAlly) {
                const shieldAmt = Math.round(attacker.atk * 2.0);
                if (lowestAlly.shield < shieldAmt) {
                    lowestAlly.shield = shieldAmt;
                    this.emit('ABILITY', { attacker, target: lowestAlly, ability: 'Schooling Shield', value: shieldAmt });
                }
            }
        }

        // 2. HIT / MISS CHECK
        if (attacker.blindStacks > 0) {
            attacker.blindStacks--;
            this.emit('MISS', { attacker, target, reason: 'Blinded' });
            return;
        }

        if (Math.random() < target.evasion) {
            this.emit('MISS', { attacker, target, reason: 'Evaded' });
            return;
        }

        // 3. DAMAGE CALCULATION
        let damage = attacker.atk;
        
        // --- NEW: Variance (+/- 15%) ---
        const variance = 0.85 + (Math.random() * 0.30);
        damage *= variance;

        // --- NEW: Critical Hit Check ---
        // Base 5% chance + up to ~15% bonus based on the fish's combat speed
        const critChance = 0.05 + ((attacker.speed / 150) * 0.15);
        let isCrit = false;
        if (Math.random() < critChance) {
            isCrit = true;
            damage *= 1.5; // 50% Bonus Damage on Crit
        }

        const attackerClass = CLASSES[attacker.classId];
        let isSuperEffective = false;
        
        if (attackerClass.strongVs === target.classId) {
            damage *= 1.5;
            isSuperEffective = true;
        }

        // Blood Frenzy Buff
        if (attacker.family === 'shark' && (target.hp / target.maxHp) <= 0.5) {
            damage *= 1.5; 
            this.emit('ABILITY', { attacker, target, ability: 'Blood Frenzy' });
        }

        // Defensive Modifiers
        if (target.family === 'crustacean') damage *= 0.7; // 30% DR
        if (target.cautiousGuardTimer > 0) damage *= 0.7; // 30% DR

        damage = Math.max(1, Math.round(damage));

        // 4. APPLY DAMAGE (Pass isCrit)
        this._applyDamage(target, damage, 'ATTACK', attacker, isSuperEffective, isCrit);

        // 5. POST-ATTACK ABILITIES
        if (attacker.family === 'eel' && attacker.attackCount % 5 === 0) {
            target.stunTimer = 1.5; 
            this.emit('ABILITY', { attacker, target, ability: 'Bio-Shock' });
        }

        if (attacker.family === 'jellyfish' && attacker.attackCount % 3 === 0) {
            if (target.poisonStacks.length < 3) {
                const pDmg = Math.max(1, Math.round(attacker.atk * 0.25));
                target.poisonStacks.push({ duration: 4.0, tickTimer: 1.0, damage: pDmg });
                this.emit('ABILITY', { attacker, target, ability: 'Spore-Sting' });
            }
        }

        if (attacker.family === 'ray') {
            const splashDmg = Math.max(1, Math.round(damage * 0.4));
            const adjacents = opposingTeam.filter(t => t && !t.isDead && Math.abs(t.position - target.position) === 1);
            adjacents.forEach(adj => {
                this._applyDamage(adj, splashDmg, 'SPLASH', attacker);
            });
            if (adjacents.length > 0) this.emit('ABILITY', { attacker, target, ability: 'Tail-Whip' });
        }

        if (attacker.family === 'deepsea') {
            const healAmt = Math.max(1, Math.round(damage * 0.5));
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
            this.emit('ABILITY', { attacker, target: attacker, ability: 'Vampiric Bite', value: healAmt });
        }
    }

    _applyDamage(target, amount, dmgType, source, isSuperEffective = false, isCrit = false) {
        if (target.isDead) return;

        let actualDamage = amount;

        if (target.shield > 0) {
            if (target.shield >= actualDamage) {
                target.shield -= actualDamage;
                actualDamage = 0;
                this.emit('SHIELD_BLOCK', { target, source, blocked: amount });
            } else {
                const blocked = target.shield;
                actualDamage -= target.shield;
                target.shield = 0;
                this.emit('SHIELD_BLOCK', { target, source, blocked: blocked });
            }
        }

        if (actualDamage > 0) {
            target.hp -= actualDamage;
            // Pass isCrit to the renderer
            this.emit('DAMAGE', { target, source, amount: actualDamage, dmgType, isSuperEffective, isCrit });

            if (target.hp <= 0) {
                target.hp = 0;
                target.isDead = true;
                this.emit('DEATH', { target });
            }
        }
    }

    _findTarget(attacker, team, forcedProfile = null) {
        const validTargets = team.filter(t => t && !t.isDead);
        if (validTargets.length === 0) return null;

        const profile = forcedProfile || attacker.aiProfile;
        if (profile === 'FRENZY') {
            return validTargets.reduce((prev, curr) => (curr.hp < prev.hp ? curr : prev));
        } else {
            validTargets.sort((a, b) => a.position - b.position);
            return validTargets[0];
        }
    }

    _checkWinConditions() {
        const playerAlive = this.playerTeam.some(t => t && !t.isDead);
        const enemyAlive = this.enemyTeam.some(t => t && !t.isDead);

        // Max match length timeout (preventing infinite stalls)
        if (this.timeElapsed > 120.0) {
            this.state = 'DRAW';
            this.emit('BATTLE_END', { winner: 'TIMEOUT' });
        } else if (!playerAlive && !enemyAlive) {
            this.state = 'DRAW';
            this.emit('BATTLE_END', { winner: 'DRAW' });
        } else if (!playerAlive) {
            this.state = 'ENEMY_WIN';
            this.emit('BATTLE_END', { winner: 'ENEMY' });
        } else if (!enemyAlive) {
            this.state = 'PLAYER_WIN';
            this.emit('BATTLE_END', { winner: 'PLAYER' });
        }
    }

    emit(eventType, data = {}) {
        this.onEvent({ type: eventType, time: this.timeElapsed, ...data });
    }
}