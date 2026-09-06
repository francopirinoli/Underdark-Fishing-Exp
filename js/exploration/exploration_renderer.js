/**
 * js/exploration/exploration_renderer.js
 * The Visual Camera and Lighting Engine for Local Map Exploration.
 * V5 - Optimized Lighting Engine (Downscaled lighting canvas for massive FPS boost).
 */

import { TILE } from './local_map.js';

export const ExplorationRenderer = {
    TILE_SIZE: 2, 
    VIEW_W: 800,
    VIEW_H: 600,

    container: null,
    mainCanvas: null,
    ctx: null,
    
    lightCanvas: null,
    lightCtx: null,
    lightScale: 0.5, 

    offscreenMap: null,
    boatImage: null,

    camX: 0,
    camY: 0,
    dockPositions:[], 

    hazardParticles:[],
    wakeParticles:[],     
    ambientRipples:[],    
    fleeSplashes:[],      
    currentBiome: null,   
    currentWeather: null,
    whirlpoolCanvas: null, 

    spawnFleeSplashes(tileX, tileY, count) {
        for (let i = 0; i < count; i++) {
            this.fleeSplashes.push({
                wx: tileX * this.TILE_SIZE + (Math.random() - 0.5) * 40,
                wy: tileY * this.TILE_SIZE + (Math.random() - 0.5) * 40,
                radius: 1,
                maxRadius: Math.random() * 15 + 10,
                life: 1.0,
                delay: Math.random() * 0.4 
            });
        }
    },

    init(containerElement, width = 800, height = 600) {
        this.container = containerElement;
        this.VIEW_W = width;
        this.VIEW_H = height;

        this.container.style.position = 'relative';
        this.container.innerHTML = ''; 

        this.mainCanvas = document.createElement('canvas');
        this.mainCanvas.width = this.VIEW_W;
        this.mainCanvas.height = this.VIEW_H;
        this.mainCanvas.style.backgroundColor = "#020617";
        this.mainCanvas.style.imageRendering = "pixelated";
        this.mainCanvas.style.display = "block";
        
        this.ctx = this.mainCanvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.lightCanvas = document.createElement('canvas');
        this.lightCanvas.width = this.VIEW_W * this.lightScale;
        this.lightCanvas.height = this.VIEW_H * this.lightScale;
        this.lightCtx = this.lightCanvas.getContext('2d');

        this.container.appendChild(this.mainCanvas);
        console.log("🎥 Exploration Renderer V5 Initialized.");
    },

    loadBoat(topDownDataUrl) {
        this.boatImage = new Image();
        this.boatImage.src = topDownDataUrl;
    },

    buildMapCache(localMap, biome, globalNode = null) {
        this.currentBiome = biome; 
        this.currentNode = globalNode; 
        
        if (!this.offscreenMap) {
            this.offscreenMap = document.createElement('canvas');
        }
        
        if (this.offscreenMap.width !== localMap.width * this.TILE_SIZE || 
            this.offscreenMap.height !== localMap.height * this.TILE_SIZE) {
            this.offscreenMap.width = localMap.width * this.TILE_SIZE;
            this.offscreenMap.height = localMap.height * this.TILE_SIZE;
        }

        const offCtx = this.offscreenMap.getContext('2d', { willReadFrequently: true });
        offCtx.imageSmoothingEnabled = false;

        this.dockPositions = []; 
        this.ambientRipples = []; 

        const pal = biome.palette;
        const hexToRgb = (hex) => {
            const bigint = parseInt(hex.replace('#', ''), 16);
            return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
        };

        const isMyconid = globalNode && globalNode.poi === 'myconid_colony';
        const isMuseum = globalNode && globalNode.poi === 'crystal_museum'; 
        const isArena = globalNode && globalNode.poi === 'volcanic_arena'; 
        const isClub = globalNode && globalNode.poi === 'anglers_club'; 
        const isMageTower = globalNode && globalNode.poi === 'mage_tower'; // Added

        const colors = {
            [TILE.WATER]: hexToRgb(pal.water),
            [TILE.DEEP_WATER]: hexToRgb(pal.deepWater),
            [TILE.LAND]: hexToRgb(pal.land),
            [TILE.ROCK]: hexToRgb(pal.rock),
            [TILE.FLORA]: hexToRgb(pal.flora),
            [TILE.DOCK]: isMyconid ? hexToRgb('#18181B') : (isMuseum ? hexToRgb('#0369A1') : (isArena ? hexToRgb('#1C1917') : (isClub ? hexToRgb('#E2E8F0') : (isMageTower ? hexToRgb('#110E2D') : [120, 53, 15])))) // Updated
        };

        const imgData = offCtx.createImageData(this.offscreenMap.width, this.offscreenMap.height);
        const data = imgData.data;

        for (let y = 0; y < localMap.height; y++) {
            for (let x = 0; x < localMap.width; x++) {
                const tileId = localMap.grid[y][x];
                let [r, g, b] = colors[tileId] || [255, 0, 255]; 

                if (tileId === TILE.DOCK) {
                    this.dockPositions.push({ x, y });
                }
                
                if ((tileId === TILE.WATER || tileId === TILE.DEEP_WATER) && Math.random() < 0.02) {
                    this.ambientRipples.push({
                        wx: x * this.TILE_SIZE + Math.random() * this.TILE_SIZE,
                        wy: y * this.TILE_SIZE + Math.random() * this.TILE_SIZE,
                        phase: Math.random() * Math.PI * 2, speed: Math.random() * 2 + 1, width: Math.random() * 4 + 2
                    });
                }

                for (let dy = 0; dy < this.TILE_SIZE; dy++) {
                    for (let dx = 0; dx < this.TILE_SIZE; dx++) {
                        const px = (x * this.TILE_SIZE) + dx;
                        const py = (y * this.TILE_SIZE) + dy;
                        const i = (py * this.offscreenMap.width + px) * 4;

                        let finalR = r, finalG = g, finalB = b;

                        if (tileId === TILE.DOCK) {
                            if (isMyconid) {
                                if ((dx + dy) % 2 === 0) { finalR -= 10; finalG -= 10; finalB -= 10; }
                            } else if (isMuseum) {
                                if (dx === 0 && dy === 0) { finalR += 20; finalG += 50; finalB += 80; }
                                if ((dx + dy) % 3 === 0) { finalR -= 10; finalG -= 20; finalB -= 20; }
                            } else if (isArena) {
                                if (dx === 0 || dy === 0) { finalR += 80; finalG += 10; finalB += 10; } 
                                if (dx === 1 && dy === 1) { finalR += 120; finalG += 50; } 
                            } else if (isClub) {
                                if (dx === 0 || dy === 0) { finalR -= 50; finalG -= 40; finalB -= 20; } 
                                if (dx === 1 && dy === 1) { finalR += 20; finalG += 20; finalB += 20; } 
                            } else if (isMageTower) { // Added
                                if (dx === 0 || dy === 0) { finalR += 40; finalB += 80; } 
                                if (dx === 1 && dy === 1) { finalR += 20; finalB += 40; } 
                            } else {
                                if (dx === 0 || dy === 0) { finalR -= 20; finalG -= 10; finalB -= 5; } 
                                if (dx === 1 && dy === 1) { finalR += 20; finalG += 10; } 
                            }
                        }

                        data[i] = finalR;
                        data[i+1] = finalG;
                        data[i+2] = finalB;
                        data[i+3] = 255;
                    }
                }
            }
        }
        offCtx.putImageData(imgData, 0, 0);
    },

    initHazards(biomeId, weather) {
        this.currentBiomeId = biomeId;
        this.currentWeather = weather;
        this.hazardParticles = [];

        if (weather === 'whirlpool') {
            this._precomputeWhirlpool();
        }

        if (biomeId === 'volcanic') {
            for (let i = 0; i < 60; i++) {
                this.hazardParticles.push({
                    x: Math.random() * this.VIEW_W, y: Math.random() * this.VIEW_H,
                    vx: (Math.random() - 0.5) * 20, vy: -(Math.random() * 50 + 20),
                    size: Math.random() * 2 + 1, color: Math.random() > 0.5 ? '#F59E0B' : '#EF4444'
                });
            }
        } else if (biomeId === 'frozen') {
            for (let i = 0; i < 100; i++) {
                this.hazardParticles.push({
                    x: Math.random() * this.VIEW_W, y: Math.random() * this.VIEW_H,
                    vx: Math.random() * 30 + 10, vy: Math.random() * 50 + 20,
                    size: Math.random() * 2 + 1, color: Math.random() > 0.3 ? '#FFFFFF' : '#93C5FD'
                });
            }
        }

        if (weather === 'spores') {
            for (let i = 0; i < 50; i++) {
                this.hazardParticles.push({
                    x: Math.random() * this.VIEW_W, y: Math.random() * this.VIEW_H,
                    vx: (Math.random() - 0.5) * 15, vy: Math.random() * 20 + 5,
                    size: Math.random() * 3 + 2, color: Math.random() > 0.5 ? '#4ADE80' : '#86EFAC'
                });
            }
        } else if (weather === 'shatter') {
            for (let i = 0; i < 30; i++) {
                this.hazardParticles.push({
                    x: Math.random() * this.VIEW_W, y: Math.random() * this.VIEW_H,
                    vx: 0, vy: Math.random() * 300 + 200,
                    size: Math.random() * 15 + 10, color: '#22D3EE'
                });
            }
        }
    },

    _precomputeWhirlpool() {
        if (this.whirlpoolCanvas) return;
        const RADIUS = 70;
        this.whirlpoolCanvas = document.createElement('canvas');
        this.whirlpoolCanvas.width = RADIUS * 2;
        this.whirlpoolCanvas.height = RADIUS * 2;
        const ctx = this.whirlpoolCanvas.getContext('2d');
        
        const voidGrad = ctx.createRadialGradient(RADIUS, RADIUS, 0, RADIUS, RADIUS, RADIUS);
        voidGrad.addColorStop(0, '#000000');
        voidGrad.addColorStop(0.4, 'rgba(15, 23, 42, 0.9)'); 
        voidGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = voidGrad;
        ctx.fillRect(0, 0, RADIUS * 2, RADIUS * 2);

        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            const startAngle = (i * Math.PI / 3); 
            for (let r = 5; r < RADIUS; r += 4) {
                const angle = startAngle - (r * 0.045);
                const px = RADIUS + Math.cos(angle) * r;
                const py = RADIUS + Math.sin(angle) * r;
                if (r === 5) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            const armGrad = ctx.createRadialGradient(RADIUS, RADIUS, 10, RADIUS, RADIUS, RADIUS);
            armGrad.addColorStop(0, 'rgba(168, 85, 247, 0.9)'); 
            armGrad.addColorStop(0.5, 'rgba(34, 211, 238, 0.5)'); 
            armGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.strokeStyle = armGrad;
            ctx.stroke();
        }
    },

    screenToWorld(screenX, screenY) {
        return {
            x: (this.camX + screenX) / this.TILE_SIZE,
            y: (this.camY + screenY) / this.TILE_SIZE
        };
    },

    _renderHazards(engine, dt) { // <-- Updated signature
        if (this.currentWeather === 'spores') {
            this.ctx.fillStyle = 'rgba(22, 101, 52, 0.15)'; 
            this.ctx.fillRect(0, 0, this.VIEW_W, this.VIEW_H);
        }

        // --- NEW: ASTRAL SEA ROOM VISUALS ---
        if (engine && engine.biomeId === 'astral_sea') {
            const timeSec = Date.now() / 1000;
            
            // 1. Cosmic Storm (Purple lightning flashes and spatial static)
            if (engine.roomType === 'cosmic_storm') {
                if (Math.random() < 0.15) {
                    this.ctx.fillStyle = 'rgba(168, 85, 247, 0.15)'; // Ambient violet flash
                    this.ctx.fillRect(0, 0, this.VIEW_W, this.VIEW_H);
                    
                    // Lightning crack
                    if (Math.random() < 0.3) {
                        this.ctx.strokeStyle = '#E9D5FF';
                        this.ctx.lineWidth = Math.random() * 3 + 1;
                        this.ctx.beginPath();
                        const startX = Math.random() * this.VIEW_W;
                        this.ctx.moveTo(startX, 0);
                        this.ctx.lineTo(startX + (Math.random() - 0.5) * 100, this.VIEW_H / 2);
                        this.ctx.lineTo(startX + (Math.random() - 0.5) * 200, this.VIEW_H);
                        this.ctx.stroke();
                    }
                }
            }
            
            // 2. Siren Trap (Gravity Wells around stardust flora)
            if (engine.roomType === 'siren_trap' && engine.localMap) {
                const startX = Math.max(0, Math.floor(this.camX / this.TILE_SIZE));
                const startY = Math.max(0, Math.floor(this.camY / this.TILE_SIZE));
                const endX = Math.min(engine.localMap.width, startX + Math.ceil(this.VIEW_W / this.TILE_SIZE) + 1);
                const endY = Math.min(engine.localMap.height, startY + Math.ceil(this.VIEW_H / this.TILE_SIZE) + 1);

                this.ctx.save();
                this.ctx.lineWidth = 2;
                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        if (engine.localMap.grid[y][x] === TILE.FLORA) {
                            const px = x * this.TILE_SIZE - this.camX;
                            const py = y * this.TILE_SIZE - this.camY;
                            
                            // Expanding, swirling gravity anomalies
                            for (let i = 0; i < 3; i++) {
                                // 3 concentric rings that expand outward to radius 45, then loop
                                const offset = (timeSec * 25 + i * 15) % 45; 
                                const alpha = Math.max(0, 1 - (offset / 45)); // Fades out as it expands
                                
                                this.ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
                                this.ctx.beginPath();
                                // Half-circle arcs spinning rapidly
                                this.ctx.arc(px, py, offset, timeSec * 4 + i, timeSec * 4 + i + Math.PI);
                                this.ctx.stroke();
                            }
                        }
                    }
                }
                this.ctx.restore();
            }
        }

        this.hazardParticles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.x < 0) p.x = this.VIEW_W;
            if (p.x > this.VIEW_W) p.x = 0;
            if (p.y < 0) p.y = this.VIEW_H;
            if (p.y > this.VIEW_H) p.y = 0;

            this.ctx.fillStyle = p.color;
            if (this.currentWeather === 'shatter') {
                this.ctx.fillRect(p.x, p.y, 2, p.size); 
            } else {
                this.ctx.fillRect(p.x, p.y, p.size, p.size);
            }
        });

        if (this.currentWeather === 'whirlpool' && this.whirlpoolCanvas) {
            const mapCenterPx = (512 / 2) * this.TILE_SIZE;
            const screenCX = mapCenterPx - this.camX;
            const screenCY = mapCenterPx - this.camY;

            if (screenCX > -100 && screenCX < this.VIEW_W + 100 && screenCY > -100 && screenCY < this.VIEW_H + 100) {
                const time = Date.now() / 1000;
                const RADIUS = 70;
                
                this.ctx.save();
                this.ctx.translate(screenCX, screenCY);
                
                const safeRotation = (time * 3.5) % (Math.PI * 2);
                this.ctx.rotate(safeRotation); 
                
                this.ctx.drawImage(this.whirlpoolCanvas, -RADIUS, -RADIUS);
                this.ctx.restore();

                this.ctx.fillStyle = '#E2E8F0';
                for(let i = 0; i < 15; i++) {
                    const angle = (i * Math.PI * 2 / 15) + (time * 4);
                    const r = RADIUS - ((time * 50 + i * 25) % RADIUS); 
                    const px = screenCX + Math.cos(angle - (r * 0.045)) * r;
                    const py = screenCY + Math.sin(angle - (r * 0.045)) * r;
                    this.ctx.globalAlpha = Math.max(0, r / RADIUS); 
                    this.ctx.fillRect(px, py, 2, 2);
                }
                this.ctx.globalAlpha = 1.0;
            }
        }
    },

    _renderAtmospherics(engine, dt) {
        if (!this.currentBiome) return;
        
        const time = Date.now() / 1000;
        const gleamColor = this.currentBiome.palette.waterGleam;

        this.ctx.fillStyle = gleamColor;
        this.ambientRipples.forEach(r => {
            const screenX = r.wx - this.camX;
            const screenY = r.wy - this.camY;

            if (screenX > 0 && screenX < this.VIEW_W && screenY > 0 && screenY < this.VIEW_H) {
                const pulse = (Math.sin(time * r.speed + r.phase) + 1) / 2;
                if (pulse > 0.2) {
                    this.ctx.globalAlpha = pulse * 0.5; 
                    const currentWidth = r.width * pulse;
                    this.ctx.fillRect(screenX - currentWidth/2, screenY, currentWidth, 1);
                }
            }
        });
        this.ctx.globalAlpha = 1.0; 

        const speed = Math.abs(engine.velocity);
        if (speed > 10) {
            const sternDistance = 12; 
            const sternX = (engine.x * this.TILE_SIZE) - Math.cos(engine.heading) * sternDistance;
            const sternY = (engine.y * this.TILE_SIZE) - Math.sin(engine.heading) * sternDistance;
            
            for(let i = 0; i < (speed > 40 ? 2 : 1); i++) {
                const spreadAngle = engine.heading + (Math.PI / 2);
                const spreadDist = (Math.random() - 0.5) * 8; 

                this.wakeParticles.push({
                    x: sternX + Math.cos(spreadAngle) * spreadDist,
                    y: sternY + Math.sin(spreadAngle) * spreadDist,
                    vx: -Math.cos(engine.heading) * (speed * 0.1) + (Math.random() - 0.5) * 5,
                    vy: -Math.sin(engine.heading) * (speed * 0.1) + (Math.random() - 0.5) * 5,
                    life: 1.0,
                    maxLife: 1.0
                });
            }
        }

        for (let i = this.wakeParticles.length - 1; i >= 0; i--) {
            const p = this.wakeParticles[i];
            p.life -= dt * 1.5; 
            
            if (p.life <= 0) {
                this.wakeParticles.splice(i, 1);
                continue;
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            const screenX = p.x - this.camX;
            const screenY = p.y - this.camY;

            if (screenX > 0 && screenX < this.VIEW_W && screenY > 0 && screenY < this.VIEW_H) {
                const size = Math.max(1, 3 * (p.life / p.maxLife));
                this.ctx.fillStyle = gleamColor;
                this.ctx.globalAlpha = p.life * 0.6; 
                this.ctx.fillRect(screenX, screenY, size, size);
            }
        }
        this.ctx.globalAlpha = 1.0; 

        this.ctx.lineWidth = 1.5;
        for (let i = this.fleeSplashes.length - 1; i >= 0; i--) {
            const s = this.fleeSplashes[i];
            if (s.delay > 0) {
                s.delay -= dt;
                continue;
            }
            s.life -= dt * 1.5;
            s.radius += dt * 40;
            
            if (s.life <= 0) {
                this.fleeSplashes.splice(i, 1);
                continue;
            }
            
            const screenX = s.wx - this.camX;
            const screenY = s.wy - this.camY;
            
            if (screenX > 0 && screenX < this.VIEW_W && screenY > 0 && screenY < this.VIEW_H) {
                this.ctx.beginPath();
                this.ctx.arc(screenX, screenY, s.radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(226, 232, 240, ${s.life})`; 
                this.ctx.stroke();
            }
        }
    },

    render(engine, lightRadius, dt, castState = null, isFishingPhase = false, secondaryLights =[], chestPos = null, npcBoats =[]) {
        if (!this.offscreenMap || !this.boatImage) return;

        const playerPxX = engine.x * this.TILE_SIZE;
        const playerPxY = engine.y * this.TILE_SIZE;

        const VISIBLE_W = this.VIEW_W - 256; 

        this.camX = playerPxX - (VISIBLE_W / 2);
        this.camY = playerPxY - (this.VIEW_H / 2);

        const maxCamX = Math.max(0, this.offscreenMap.width - VISIBLE_W);
        const maxCamY = Math.max(0, this.offscreenMap.height - this.VIEW_H);
        
        this.camX = Math.max(0, Math.min(this.camX, maxCamX));
        this.camY = Math.max(0, Math.min(this.camY, maxCamY));

        this.ctx.clearRect(0, 0, this.VIEW_W, this.VIEW_H);
        
        this.ctx.drawImage(
            this.offscreenMap, 
            this.camX, this.camY, VISIBLE_W, this.VIEW_H, 
            0, 0, VISIBLE_W, this.VIEW_H
        );

        // --- NEW: ASTRAL SEA PARALLAX STARFIELD ---
        if (engine.biomeId === 'astral_sea' && !isFishingPhase) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'screen';
            const timeSec = Date.now() / 1000;
            
            // Draw 80 drifting stars with parallax offset based on camera position
            for (let i = 0; i < 80; i++) {
                const layer = (i % 3) + 1; // Layers 1, 2, 3 (creates 3D depth)
                // Parallax shift: camera moves right -> stars move left at different speeds
                const parallaxX = (i * 137 - this.camX * 0.15 * layer) % VISIBLE_W;
                // Continuous slow drift upwards + parallax Y
                const parallaxY = (i * 251 - this.camY * 0.15 * layer - timeSec * 15 * layer) % this.VIEW_H;
                
                const px = parallaxX < 0 ? parallaxX + VISIBLE_W : parallaxX;
                const py = parallaxY < 0 ? parallaxY + this.VIEW_H : parallaxY;
                
                this.ctx.fillStyle = i % 2 === 0 ? '#C084FC' : '#22D3EE';
                this.ctx.globalAlpha = 0.3 + Math.sin(timeSec * 2 + i) * 0.5; // Twinkling effect
                this.ctx.fillRect(px, py, layer, layer);
            }
            this.ctx.restore();
        }

        if (!isFishingPhase) {
            this._renderAtmospherics(engine, dt);
        }

        const screenBoatX = playerPxX - this.camX;
        const screenBoatY = playerPxY - this.camY;

        if (castState && !isFishingPhase) {
            this._drawCastingReticle(screenBoatX, screenBoatY, castState);
        }

        this.ctx.save();
        this.ctx.translate(screenBoatX, screenBoatY);
        this.ctx.rotate(engine.heading + (Math.PI / 2)); 
        
        const BOAT_VISUAL_SCALE = 0.4; 
        const bw = this.boatImage.width * BOAT_VISUAL_SCALE;
        const bh = this.boatImage.height * BOAT_VISUAL_SCALE;
        
        this.ctx.drawImage(this.boatImage, -bw / 2, -bh / 2, bw, bh);
        this.ctx.restore();

        const activeLights =[];
        activeLights.push({ x: screenBoatX, y: screenBoatY, radius: lightRadius });

        if (npcBoats && npcBoats.length > 0 && !isFishingPhase) {
            npcBoats.forEach(npc => {
                const fx = (npc.x * this.TILE_SIZE) - this.camX;
                const fy = (npc.y * this.TILE_SIZE) - this.camY;
                
                const bob = Math.sin((Date.now() + npc.bobOffset) / 400) * 2;
                let rot = Math.sin((Date.now() + npc.bobOffset) / 800) * 0.05;
                
                // --- NEW: Use calculated heading for Phantom ships ---
                if (npc.isPhantom && npc.heading !== undefined) {
                    rot = npc.heading + (Math.PI / 2); // PI/2 offsets the sprite so the bow points forward
                }
                
                const fbw = npc.img.width * BOAT_VISUAL_SCALE;
                const fbh = npc.img.height * BOAT_VISUAL_SCALE;

                this.ctx.save();
                this.ctx.translate(fx, fy + bob);
                this.ctx.rotate(rot);
                
                // --- NEW: GHOSTLY PHANTOM RENDERING ---
                if (npc.isPhantom) {
                    // Pulsing, semi-transparent purple glow
                    const pulse = 0.35 + (Math.sin(Date.now() / 200) + 1) * 0.15;
                    this.ctx.globalAlpha = pulse; 
                }

                this.ctx.drawImage(npc.img, -fbw / 2, -fbh / 2, fbw, fbh);
                this.ctx.globalAlpha = 1.0; // Reset
                
                if (npc.isTournament) {
                    this.ctx.fillStyle = '#F59E0B'; 
                    this.ctx.fillRect(-2, -fbh/2 - 12, 2, 12); 
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, -fbh/2 - 12);
                    this.ctx.lineTo(12, -fbh/2 - 8);
                    this.ctx.lineTo(0, -fbh/2 - 4);
                    this.ctx.fill();
                }
                
                this.ctx.restore();

                const glowColor = npc.isTournament ? 'rgba(34, 211, 238, 0.4)' : 'rgba(251, 191, 36, 0.4)';
                activeLights.push({ x: fx, y: fy + bob, radius: 100, color: glowColor });
            });
        }

        if (this.dockPositions.length > 0) {
            const firstDock = this.dockPositions[0];
            const dx = (firstDock.x * this.TILE_SIZE + (this.TILE_SIZE * 3)) - this.camX;
            const dy = (firstDock.y * this.TILE_SIZE + (this.TILE_SIZE * 3)) - this.camY;
            
            if (this.currentNode && this.currentNode.poi === 'myconid_colony') {
                this.ctx.save();
                this.ctx.translate(dx, dy);
                
                const time = Date.now() / 800;
                const pulse = Math.sin(time) * 0.5;

                const drawPixelCircle = (radius, color, offsetX = 0, offsetY = 0) => {
                    this.ctx.fillStyle = color;
                    const r = Math.round(radius);
                    for(let py = -r; py <= r; py++) {
                        const pxW = Math.round(Math.sqrt(r * r - py * py));
                        this.ctx.fillRect((offsetX - pxW) * 2, (offsetY + py) * 2, pxW * 4, 2);
                    }
                };

                drawPixelCircle(9 + pulse, '#7E22CE');
                drawPixelCircle(6 + pulse, '#C084FC', -1, -1);

                this.ctx.fillStyle = '#BEF264';
                [[-4, -5], [5, -3], [2, 6], [-6, 3], [0, -2], [-2, 2]].forEach(d => {
                    this.ctx.fillRect(d[0] * 2, d[1] * 2, 2, 2);
                });
                
                this.ctx.restore();

                const grad = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, 150);
                grad.addColorStop(0, 'rgba(168, 85, 247, 0.5)'); 
                grad.addColorStop(0.5, 'rgba(74, 222, 128, 0.3)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath(); this.ctx.arc(dx, dy, 150, 0, Math.PI * 2); this.ctx.fill();

                activeLights.push({ x: dx, y: dy, radius: 150 });

            } else if (this.currentNode && this.currentNode.poi === 'crystal_museum') {
                // --- RESTORED CRYSTAL MUSEUM DOCK AND ctx.restore() ---
                this.ctx.save();
                this.ctx.translate(dx, dy);
                
                const time = Date.now() / 1000;
                const glow = Math.sin(time * 2) * 0.2 + 0.8;

                // Diamond Base
                this.ctx.fillStyle = '#0284C7';
                this.ctx.beginPath();
                this.ctx.moveTo(0, -20); this.ctx.lineTo(20, 0); this.ctx.lineTo(0, 20); this.ctx.lineTo(-20, 0);
                this.ctx.fill();

                // Inner Bright Crystal
                this.ctx.fillStyle = '#38BDF8';
                this.ctx.beginPath();
                this.ctx.moveTo(0, -12); this.ctx.lineTo(12, 0); this.ctx.lineTo(0, 12); this.ctx.lineTo(-12, 0);
                this.ctx.fill();

                // Center Core
                this.ctx.fillStyle = `rgba(255, 255, 255, ${glow})`;
                this.ctx.fillRect(-2, -2, 4, 4);
                
                this.ctx.restore();

                const grad = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, 180);
                grad.addColorStop(0, 'rgba(56, 189, 248, 0.6)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath(); this.ctx.arc(dx, dy, 180, 0, Math.PI * 2); this.ctx.fill();

                activeLights.push({ x: dx, y: dy, radius: 180 });

            } else if (this.currentNode && this.currentNode.poi === 'volcanic_arena') {
                this.ctx.save();
                this.ctx.translate(dx, dy);
                
                this.ctx.fillStyle = '#1C1917';
                this.ctx.fillRect(-14, -14, 28, 28);
                
                this.ctx.fillStyle = '#EF4444';
                this.ctx.fillRect(-10, -10, 20, 2);
                this.ctx.fillRect(-10, 8, 20, 2);
                this.ctx.fillRect(-10, -10, 2, 20);
                this.ctx.fillRect(8, -10, 2, 20);

                this.ctx.fillStyle = '#F59E0B';
                [[-12,-12], [9,-12], [-12,9], [9,9]].forEach(pos => {
                    this.ctx.fillRect(pos[0], pos[1], 3, 3);
                });

                this.ctx.restore();

                const grad = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, 140);
                grad.addColorStop(0, 'rgba(239, 68, 68, 0.5)'); 
                grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.2)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath(); this.ctx.arc(dx, dy, 140, 0, Math.PI * 2); this.ctx.fill();

                activeLights.push({ x: dx, y: dy, radius: 140 });

            } else if (this.currentNode && this.currentNode.poi === 'anglers_club') {
                this.ctx.save();
                this.ctx.translate(dx, dy);
                
                this.ctx.fillStyle = '#94A3B8';
                this.ctx.fillRect(-14, -14, 28, 28);
                this.ctx.fillStyle = '#E2E8F0';
                this.ctx.fillRect(-12, -12, 24, 24);

                this.ctx.fillStyle = '#38BDF8';
                [[-10,-10], [6,6]].forEach(pos => {
                    this.ctx.fillRect(pos[0], pos[1], 4, 4);
                    this.ctx.fillStyle = '#FFFFFF';
                    this.ctx.fillRect(pos[0]+1, pos[1]+1, 2, 2);
                });

                this.ctx.restore();

                const grad = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, 150);
                grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)'); 
                grad.addColorStop(0.5, 'rgba(148, 163, 184, 0.1)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath(); this.ctx.arc(dx, dy, 150, 0, Math.PI * 2); this.ctx.fill();

                activeLights.push({ x: dx, y: dy, radius: 150 });

            } else if (this.currentNode && this.currentNode.poi === 'mage_tower') {
                // --- NEW: 3D MINIATURE OBSIDIAN SPIRE & GRAVITY RING ---
                this.ctx.save();
                this.ctx.translate(dx, dy);
                
                // Draw a mini obsidian octagon pedestal
                this.ctx.fillStyle = '#090514';
                this.ctx.beginPath();
                this.ctx.moveTo(-14, -7); this.ctx.lineTo(-7, -14);
                this.ctx.lineTo(7, -14); this.ctx.lineTo(14, -7);
                this.ctx.lineTo(14, 7); this.ctx.lineTo(7, 14);
                this.ctx.lineTo(-7, 14); this.ctx.lineTo(-14, 7);
                this.ctx.fill();

                // Draw central spire
                this.ctx.fillStyle = '#1E1B4B'; // Indigo basalt
                this.ctx.fillRect(-3, -20, 6, 24);
                
                // Glowing tip
                this.ctx.fillStyle = '#C084FC'; // Lavender glow
                this.ctx.fillRect(-1, -24, 2, 4);

                // Swirling gravity ring (horizontal ellipse)
                const time = Date.now() / 600;
                const ringSwayY = Math.sin(time) * 3;
                
                this.ctx.strokeStyle = '#E879F9';
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                this.ctx.ellipse(0, -6 + ringSwayY, 15, 4, 0, 0, Math.PI * 2);
                this.ctx.stroke();

                this.ctx.restore();

                // Glowing violet/purple radial light cast
                const grad = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, 160);
                grad.addColorStop(0, 'rgba(168, 85, 247, 0.6)'); 
                grad.addColorStop(0.5, 'rgba(192, 132, 252, 0.2)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath(); this.ctx.arc(dx, dy, 160, 0, Math.PI * 2); this.ctx.fill();

                // Connect a light source so shadows cast outwards from the spire
                activeLights.push({ x: dx, y: dy, radius: 160 });

            } else if (this.currentNode && this.currentNode.poi === 'astral_sea') {
                // --- NEW: THE ABOLETH'S MAGICAL CONTAINMENT CAGE ---
                this.ctx.save();
                this.ctx.translate(dx, dy);
                
                const time = Date.now() / 600;
                const floatY = Math.sin(time) * 3;

                // Draw circular energy base
                this.ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 16, 0, Math.PI * 2);
                this.ctx.fill();

                // Draw glowing obsidian pillars surrounding the cage
                this.ctx.fillStyle = '#090514'; // Obsidian
                for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
                    const px = Math.cos(a) * 14;
                    const py = Math.sin(a) * 14;
                    this.ctx.fillRect(px - 2, py - 6, 4, 10);
                    this.ctx.fillStyle = '#A855F7'; // Glowing tip
                    this.ctx.fillRect(px - 1, py - 8, 2, 2);
                }

                // Draw cage bars & core
                this.ctx.strokeStyle = '#22D3EE'; // Cyan laser bars
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeRect(-8, -14 + floatY, 16, 24);
                this.ctx.strokeRect(-5, -14 + floatY, 10, 24);
                
                // Faint purple silhouette of the Aboleth inside
                this.ctx.fillStyle = 'rgba(192, 132, 252, 0.5)';
                this.ctx.fillRect(-3, -8 + floatY, 6, 12);
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.fillRect(-1, -4 + floatY, 2, 2); // Glowing eye

                this.ctx.restore();

                // Cyan-violet light source
                const grad = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, 180);
                grad.addColorStop(0, 'rgba(34, 211, 238, 0.5)'); 
                grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath(); this.ctx.arc(dx, dy, 180, 0, Math.PI * 2); this.ctx.fill();

                activeLights.push({ x: dx, y: dy, radius: 180 });

            } else {
                const grad = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, 120);
                grad.addColorStop(0, 'rgba(251, 191, 36, 0.3)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath(); this.ctx.arc(dx, dy, 120, 0, Math.PI * 2); this.ctx.fill();

                activeLights.push({ x: dx, y: dy, radius: 120 });
            }
        }

        secondaryLights.forEach(L => {
            activeLights.push({
                x: (L.x * this.TILE_SIZE) - this.camX,
                y: (L.y * this.TILE_SIZE) - this.camY,
                radius: L.radius
            });
        });

        if (!isFishingPhase) {
            this._renderHazards(engine, dt); // <-- Updated to pass engine
        }

        this._drawLighting(activeLights);

        if (chestPos && !isFishingPhase) {
            const cx = (chestPos.x * this.TILE_SIZE) - this.camX;
            const cy = (chestPos.y * this.TILE_SIZE) - this.camY;
            
            const time = Date.now() / 400; 
            const glint = Math.pow(Math.sin(time), 20); 
            
            if (glint > 0.1) {
                this.ctx.fillStyle = `rgba(255, 255, 255, ${glint})`;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, 1 + glint * 2, 0, Math.PI * 2);
                this.ctx.fill();
                
                if (glint > 0.6) {
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${glint * 0.8})`;
                    this.ctx.fillRect(cx - 3, cy, 6, 1);
                    this.ctx.fillRect(cx, cy - 3, 1, 6);
                }
            }
        }
    },

    _drawCastingReticle(boatX, boatY, castState) {
        this.ctx.save(); 

        const { mouseX, mouseY, isCharging, chargePct, maxDist } = castState;
        
        let dx = mouseX - boatX;
        let dy = mouseY - boatY;
        const dist = Math.hypot(dx, dy);
        
        let aimedX = mouseX;
        let aimedY = mouseY;

        if (dist > maxDist) {
            aimedX = boatX + (dx / dist) * maxDist;
            aimedY = boatY + (dy / dist) * maxDist;
        }

        this.ctx.beginPath();
        this.ctx.setLineDash([4, 4]);
        this.ctx.moveTo(boatX, boatY);
        this.ctx.lineTo(aimedX, aimedY);
        this.ctx.strokeStyle = isCharging ? 'rgba(251, 191, 36, 0.5)' : 'rgba(34, 211, 238, 0.4)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
        this.ctx.setLineDash([]); 

        let targetX = aimedX;
        let targetY = aimedY;

        if (isCharging) {
            const actualAimedDist = Math.min(dist, maxDist);
            const currentDist = actualAimedDist * chargePct;
            targetX = boatX + (dx / dist) * currentDist;
            targetY = boatY + (dy / dist) * currentDist;
            this.ctx.fillStyle = '#FBBF24'; 
        } else {
            this.ctx.fillStyle = '#22D3EE'; 
        }

        this.ctx.beginPath();
        this.ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        this.ctx.restore(); 
    },

    lightCache: {}, 

    _getLightCanvas(radius) {
        const key = radius.toString();
        if (this.lightCache[key]) return this.lightCache[key];

        const c = document.createElement('canvas');
        c.width = radius * 2;
        c.height = radius * 2;
        const ctx = c.getContext('2d');

        const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1.0)');   
        gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.7)'); 
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');   
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(radius, radius, radius, 0, Math.PI * 2);
        ctx.fill();

        this.lightCache[key] = c;
        return c;
    },

    _drawLighting(sources) {
        const lw = this.lightCanvas.width;
        const lh = this.lightCanvas.height;
        const ls = this.lightScale;

        this.lightCtx.clearRect(0, 0, lw, lh);

        this.lightCtx.globalCompositeOperation = 'source-over';
        this.lightCtx.fillStyle = 'rgba(2, 6, 23, 0.95)'; 
        this.lightCtx.fillRect(0, 0, lw, lh);

        this.lightCtx.globalCompositeOperation = 'destination-out';
        
        sources.forEach(src => {
            const r = src.radius * ls;
            const x = src.x * ls;
            const y = src.y * ls;

            if (r > 0 && isFinite(x) && isFinite(y) && isFinite(r)) {
                const img = this._getLightCanvas(r);
                this.lightCtx.drawImage(img, x - r, y - r);
            }
        });

        this.lightCtx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(this.lightCanvas, 0, 0, lw, lh, 0, 0, this.VIEW_W, this.VIEW_H);
    }
};