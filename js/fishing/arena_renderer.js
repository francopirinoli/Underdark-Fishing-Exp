/**
 * js/fishing/arena_renderer.js
 * Visual Engine for the Volcanic Arena Auto-Battler.
 * V3 - Fluid Organic Wandering, Dynamic Pitch, and Guaranteed Snappy Lunge Animations.
 */
import { SFX } from '../audio/sfx_generator.js'; // <-- ADD THIS IMPORT

export const ArenaRenderer = {
    canvas: null,
    ctx: null,
    width: 800,
    height: 450,
    
    animFrameId: null,
    lastTime: 0,
    
    // Environment & VFX
    particles: [],
    flora: [],
    vfxQueue: [],
    impactRings: [],

    // Entities
    visualFighters: [],

    // Volcanic Palette
    pal: {
        water: '#5e1313',      // Boiling red
        deepWater: '#330707',  // Pitch magma dark
        land: '#2b2727',       // Basalt
        rock: '#171515',       // Obsidian
        flora: '#f59e0b',      // Fiery orange/yellow
        ember: '#FBBF24',
        ash: '#EF4444'
    },

    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx.imageSmoothingEnabled = false;

        this._initEnvironment();
        console.log("🌋 Arena Renderer Initialized.");
    },

    _initEnvironment() {
        this.particles = [];
        for (let i = 0; i < 60; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                speed: Math.random() * 40 + 20,
                wobbleSpeed: Math.random() * 2 + 1,
                wobblePhase: Math.random() * Math.PI * 2,
                size: Math.random() * 3 + 1,
                color: Math.random() > 0.3 ? this.pal.ember : this.pal.ash
            });
        }

        this.flora = [];
        for (let i = 0; i < 15; i++) {
            this.flora.push({
                x: Math.random() * this.width,
                height: Math.random() * 60 + 40,
                thickness: Math.random() * 4 + 2,
                swaySpeed: Math.random() * 2 + 1,
                phase: Math.random() * Math.PI * 2
            });
        }
    },

    loadFighters(playerTeam, enemyTeam) {
        this.visualFighters = [];

        // SHRUNK SIZES: Prevent UI bloating
        const sizeScales = {
            'Tiny': 0.20,
            'Small': 0.30,
            'Medium': 0.40,
            'Large': 0.55,
            'Massive': 0.70
        };

        // WIDE V-FORMATION: Gives them plenty of room to swim
        // 0: Front (Tank), 1: Middle (Vanguard), 2: Back (Support)
        const getAnchor = (team, pos) => {
            const isPlayer = team === 'player';
            const xPct = isPlayer ? [0.40, 0.20, 0.05][pos] : [0.60, 0.80, 0.95][pos];
            const yPct = [0.50, 0.25, 0.75][pos];
            
            return { x: this.width * xPct, y: this.height * yPct };
        };

        const loadTeam = (teamData) => {
            teamData.forEach(fighter => {
                if (!fighter) return;

                const anchor = getAnchor(fighter.team, fighter.position);
                const img = new Image();
                img.src = fighter.imageDataUrl || ''; 

                this.visualFighters.push({
                    id: fighter.id,
                    team: fighter.team,
                    position: fighter.position,
                    img: img,
                    scale: sizeScales[fighter.size] || 0.4,
                    facing: fighter.team === 'player' ? 1 : -1,
                    
                    // Positions
                    anchorX: anchor.x,
                    anchorY: anchor.y,
                    x: anchor.x,
                    y: anchor.y,
                    
                    // Animation State
                    state: 'IDLE', // IDLE, LUNGE_OUT, LUNGE_IN, DEAD
                    lungeTargetX: 0,
                    lungeTargetY: 0,
                    lungeSpeed: 2500, // Very fast strike
                    returnSpeed: 1000, // Smooth glide back
                    
                    // Fluid Idle Wander Math (Lissajous Curve)
                    wanderTime: Math.random() * 100,
                    wanderSpeed: Math.random() * 0.8 + 0.8,
                    wanderRadiusX: Math.random() * 40 + 20, // Wide left/right swims
                    wanderRadiusY: Math.random() * 20 + 10, // Slight up/down bobbing
                    
                    pitchAngle: 0, // Dynamic rotation based on vertical velocity
                    
                    engineRef: fighter 
                });
            });
        };

        loadTeam(playerTeam);
        loadTeam(enemyTeam);
    },

    // --- EVENT HOOKS FOR THE ENGINE ---

    handleEvent(e) {
        // 1. GUARANTEED LUNGE TRIGGERS
        const isDirectAttack = (e.type === 'DAMAGE' && e.dmgType === 'ATTACK') || e.type === 'MISS' || e.type === 'SHIELD_BLOCK';
        
        if (isDirectAttack) {
            const atkRef = e.source || e.attacker;
            const tgtRef = e.target;
            
            if (atkRef && tgtRef) {
                const visAttacker = this.visualFighters.find(f => f.id === atkRef.id);
                const visTarget = this.visualFighters.find(f => f.id === tgtRef.id);
                
                if (visAttacker && visTarget && visAttacker.state !== 'DEAD') {
                    visAttacker.state = 'LUNGE_OUT';
                    visAttacker.lungeTargetX = visTarget.x - (visAttacker.facing * 50); 
                    visAttacker.lungeTargetY = visTarget.y;
                }
            }
        }

        // --- NEW: SOUND EFFECTS ---
        if (e.type === 'DAMAGE' && e.dmgType === 'ATTACK') {
            if (e.isCrit) SFX.playArenaCrit();
            else SFX.playArenaHit();
        } else if (e.type === 'MISS') {
            SFX.playArenaEvade();
        } else if (e.type === 'SHIELD_BLOCK') {
            SFX.playArenaBlock();
        }

        // 2. SPAWN FLOATING TEXT & IMPACT RINGS
        if (e.target) {
            const visTarget = this.visualFighters.find(f => f.id === e.target.id);
            if (visTarget) {
                let text = '';
                let color = '#FFF';

                if (e.type === 'DAMAGE') {
                    // Make critical hits obvious in the floating text
                    text = e.isCrit ? `! ${e.amount} !` : `-${e.amount}`;
                    color = (e.isSuperEffective || e.isCrit) ? '#FBBF24' : '#EF4444'; 
                    if (e.dmgType === 'POISON') color = '#22C55E';
                    if (e.dmgType === 'SPLASH') color = '#FCA5A5';
                    
                    if (e.dmgType === 'ATTACK') {
                        this.impactRings.push({ x: visTarget.x, y: visTarget.y, radius: e.isCrit ? 10 : 5, life: 1.0 });
                    }
                } 
                else if (e.type === 'MISS') { text = e.reason; color = '#94A3B8'; } 
                else if (e.type === 'ABILITY') {
                    text = e.ability; color = '#A855F7';
                    if (e.ability === 'Vampiric Bite') { text = `+${e.value}`; color = '#F472B6'; }
                    if (e.ability === 'Schooling Shield') { text = `SHIELD`; color = '#38BDF8'; }
                } 
                else if (e.type === 'SHIELD_BLOCK') { text = `BLOCK`; color = '#38BDF8'; }

                if (text !== '') this._spawnVfx(visTarget.x, visTarget.y - 40, text, color);
            }
        } 
        
        if (e.type === 'DEATH') {
            const visTarget = this.visualFighters.find(f => f.id === e.target.id);
            if (visTarget) {
                visTarget.state = 'DEAD';
                this._spawnVfx(visTarget.x, visTarget.y, 'DEFEATED', '#000000');
            }
        }
    },

    _spawnVfx(x, y, text, color) {
        this.vfxQueue.push({
            x: x + (Math.random() - 0.5) * 30, // Slight scatter to prevent overlapping
            y: y,
            text: text,
            color: color,
            life: 1.0,
            maxLife: 1.0
        });
    },

    // --- MAIN LOOP ---

    start() {
        if (!this.animFrameId) {
            this.lastTime = performance.now();
            this._loop(this.lastTime);
        }
    },

    stop() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    },

    _loop(time) {
        const dt = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;

        this._update(dt);
        this._render();

        this.animFrameId = requestAnimationFrame((t) => this._loop(t));
    },

    _update(dt) {
        // 1. Update Environment
        this.particles.forEach(p => {
            p.y -= p.speed * dt;
            p.wobblePhase += p.wobbleSpeed * dt;
            if (p.y < 0) {
                p.y = this.height;
                p.x = Math.random() * this.width;
            }
        });

        // 2. Update Fighters (Physics & AI)
        this.visualFighters.forEach(vf => {
            // Death state overrides all
            if (vf.state === 'DEAD') {
                vf.y += 60 * dt; // Sink
                vf.pitchAngle = Math.PI; // Flip upside down
                return;
            }

            const oldY = vf.y;
            const oldX = vf.x;

            if (vf.state === 'IDLE') {
                // Organic wandering around anchor using Lissajous curves
                vf.wanderTime += dt * vf.wanderSpeed;
                const targetX = vf.anchorX + Math.sin(vf.wanderTime) * vf.wanderRadiusX;
                const targetY = vf.anchorY + Math.cos(vf.wanderTime * 1.3) * vf.wanderRadiusY;
                
                // Soft lerp back to fluid target
                vf.x += (targetX - vf.x) * 3 * dt;
                vf.y += (targetY - vf.y) * 3 * dt;
            } 
            else if (vf.state === 'LUNGE_OUT') {
                const dx = vf.lungeTargetX - vf.x;
                const dy = vf.lungeTargetY - vf.y;
                const dist = Math.hypot(dx, dy);

                if (dist < 15) {
                    vf.state = 'LUNGE_IN'; // Reached target, snap back
                } else {
                    const step = Math.min(dist, vf.lungeSpeed * dt);
                    vf.x += (dx / dist) * step;
                    vf.y += (dy / dist) * step;
                }
            } 
            else if (vf.state === 'LUNGE_IN') {
                // Return to the *current* idle target so it doesn't snap weirdly
                vf.wanderTime += dt * vf.wanderSpeed;
                const targetX = vf.anchorX + Math.sin(vf.wanderTime) * vf.wanderRadiusX;
                const targetY = vf.anchorY + Math.cos(vf.wanderTime * 1.3) * vf.wanderRadiusY;

                const dx = targetX - vf.x;
                const dy = targetY - vf.y;
                const dist = Math.hypot(dx, dy);

                if (dist < 10) {
                    vf.state = 'IDLE'; // Reached home
                } else {
                    const step = Math.min(dist, vf.returnSpeed * dt);
                    vf.x += (dx / dist) * step;
                    vf.y += (dy / dist) * step;
                }
            }

            // Calculate dynamic pitch angle based on Y movement
            const vy = (vf.y - oldY) / dt;
            // Limit the tilt so they don't spin in circles
            const targetPitch = Math.max(-0.4, Math.min(0.4, vy * 0.001 * vf.facing));
            vf.pitchAngle += (targetPitch - vf.pitchAngle) * 10 * dt;
        });

        // 3. Update Text VFX
        for (let i = this.vfxQueue.length - 1; i >= 0; i--) {
            const vfx = this.vfxQueue[i];
            vfx.life -= dt;
            vfx.y -= 40 * dt; // Float up smoothly
            if (vfx.life <= 0) this.vfxQueue.splice(i, 1);
        }

        // 4. Update Impact Rings
        for (let i = this.impactRings.length - 1; i >= 0; i--) {
            const ring = this.impactRings[i];
            ring.life -= dt * 2; 
            ring.radius += dt * 100; // Expand rapidly
            if (ring.life <= 0) this.impactRings.splice(i, 1);
        }
    },

    _render() {
        const ctx = this.ctx;
        const timeSec = performance.now() / 1000;

        // 1. Background Gradient
        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, this.pal.water);
        grad.addColorStop(1, this.pal.deepWater);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);

        // 2. Background Flora
        ctx.fillStyle = this.pal.flora;
        this.flora.forEach(f => {
            const sway = Math.sin(timeSec * f.swaySpeed + f.phase) * 15;
            ctx.beginPath();
            ctx.moveTo(f.x, this.height);
            ctx.quadraticCurveTo(f.x + sway, this.height - (f.height / 2), f.x + sway * 1.5, this.height - f.height);
            ctx.lineWidth = f.thickness;
            ctx.strokeStyle = this.pal.flora;
            ctx.stroke();
        });

        // 3. Embers & Ash
        this.particles.forEach(p => {
            ctx.fillStyle = p.color;
            const drawX = p.x + Math.sin(p.wobblePhase) * 15;
            ctx.fillRect(drawX, p.y, p.size, p.size);
        });

        // 4. Floor
        ctx.fillStyle = this.pal.land;
        ctx.fillRect(0, this.height - 40, this.width, 40);
        
        ctx.fillStyle = this.pal.rock;
        for (let i = 0; i < this.width / 40 + 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 40, this.height - 40);
            ctx.lineTo(i * 40 + 20, this.height - 70 + (i % 2 * 15));
            ctx.lineTo(i * 40 + 40, this.height - 40);
            ctx.fill();
        }

        // 5. Center Clash Line indicator
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(this.width / 2, 0);
        ctx.lineTo(this.width / 2, this.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // 6. Draw Fighters
        // Sort by Y so fish lower on the screen draw on top of higher ones
        const sortedFighters = [...this.visualFighters].sort((a, b) => a.y - b.y);

        sortedFighters.forEach(vf => {
            if (!vf.img.complete) return;

            const w = vf.img.width * vf.scale;
            const h = vf.img.height * vf.scale;

            ctx.save();
            ctx.translate(vf.x, vf.y);
            
            // Flip enemy fish to face left
            if (vf.facing === -1) ctx.scale(-1, 1);
            
            // Apply Dynamic Pitch
            ctx.rotate(vf.pitchAngle);

            if (vf.state === 'DEAD') ctx.globalAlpha = 0.4; // Fade dead fish

            ctx.drawImage(vf.img, -w / 2, -h / 2, w, h);
            ctx.restore();

            // 7. Draw Tiny Status Bars (Only for alive fish)
            if (vf.state !== 'DEAD' && vf.engineRef) {
                const barW = 40;
                const barH = 4;
                const barX = vf.x - barW / 2;
                const barY = vf.y + h / 2 + 10; // Float under the sprite

                // HP Track
                ctx.fillStyle = '#020617';
                ctx.fillRect(barX, barY, barW, barH);
                
                // HP Fill
                const hpPct = Math.max(0, vf.engineRef.hp / vf.engineRef.maxHp);
                ctx.fillStyle = '#22C55E';
                ctx.fillRect(barX, barY, barW * hpPct, barH);

                // Shield Fill (Draws over right side of HP)
                if (vf.engineRef.shield > 0) {
                    const shieldPct = Math.min(1.0, vf.engineRef.shield / vf.engineRef.maxHp);
                    ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
                    ctx.fillRect(barX + (barW * hpPct) - (barW * shieldPct), barY, barW * shieldPct, barH);
                }

                // CD Track
                ctx.fillStyle = '#000';
                ctx.fillRect(barX, barY + barH + 1, barW, 2);
                
                // CD Fill
                const cdPct = Math.max(0, 1 - (vf.engineRef.cd / vf.engineRef.maxCd));
                ctx.fillStyle = '#FBBF24';
                ctx.fillRect(barX, barY + barH + 1, barW * cdPct, 2);

                // Status Icons
                let statOffX = barX;
                const drawIcon = (color) => {
                    ctx.fillStyle = color;
                    ctx.beginPath(); ctx.arc(statOffX + 3, barY + barH + 6, 3, 0, Math.PI * 2); ctx.fill();
                    statOffX += 8;
                };

                if (vf.engineRef.stunTimer > 0) drawIcon('#FDE047');
                if (vf.engineRef.blindStacks > 0) drawIcon('#0F172A');
                if (vf.engineRef.poisonStacks.length > 0) drawIcon('#22C55E');
            }
        });

        // 8. Draw Impact Rings
        ctx.lineWidth = 2;
        this.impactRings.forEach(ring => {
            ctx.strokeStyle = `rgba(255, 255, 255, ${ring.life})`;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
            ctx.stroke();
        });

        // 9. Draw Floating VFX Text
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        this.vfxQueue.forEach(vfx => {
            ctx.fillStyle = vfx.color;
            ctx.globalAlpha = Math.max(0, vfx.life / vfx.maxLife);
            
            // Text Stroke for readability
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(vfx.text, vfx.x, vfx.y);
            ctx.fillText(vfx.text, vfx.x, vfx.y);
        });
        ctx.globalAlpha = 1.0;
    }
};