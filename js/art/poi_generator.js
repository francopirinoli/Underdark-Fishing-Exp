/**
 * js/art/poi_generator.js
 * Generates bespoke 320x80 panoramic pixel art for Endgame Points of Interest.
 * V4 - Overhauled Myconid Colony: Trippy, highly vibrant bioluminescence and dense forests.
 */

import { drawScaledRect } from '../util/utils.js';

const GRID_W = 320;
const GRID_H = 80;
const DISPLAY_SCALE = 4;

export function generatePoiArt(options = {}) {
    const poiId = options.poiId;
    const rng = options.rng;
    
    const canvas = document.createElement('canvas');
    canvas.width = GRID_W * DISPLAY_SCALE;
    canvas.height = GRID_H * DISPLAY_SCALE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const bgGrid = Array(GRID_H).fill(null).map(() => Array(GRID_W).fill(null)); 
    const mgGrid = Array(GRID_H).fill(null).map(() => Array(GRID_W).fill(null)); 
    const fgGrid = Array(GRID_H).fill(null).map(() => Array(GRID_W).fill(null)); 

    function setBg(x, y, color) { if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) bgGrid[y][x] = color; }
    function setMg(x, y, color) { if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) mgGrid[y][x] = color; }
    function setFg(x, y, color) { if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) fgGrid[y][x] = color; }

    const horizonY = 60;
    
    // We will dynamically populate this array so the Outline Pass knows which colors to NOT outline (making them glow)
    let glowExclusions = [];

    // ==========================================
    // POI 1: THE MYCONID COLONY (Rot Garden)
    // ==========================================
    if (poiId === 'myconid_colony') {
        const cBg = '#09090B';       // Pitch black/void background
        const cWall = '#1E1B4B';     // Deep indigo distant cave walls
        const cWater = '#0F172A';    // Dark water
        const cGleam = '#C084FC';    // Purple water reflections
        const cLoam = '#18181B';     // Dark gray/brown compost dirt
        const cLoamShad = '#000000'; // Deep root shadows
        
        // Trippy Neon Palettes for the Mushrooms
        const shroomPals = [
            { cap: '#7E22CE', high: '#C084FC', shad: '#4C1D95', gill: '#22D3EE', stalk: '#CBD5E1', stalkShad: '#64748B' }, // Purple w/ Cyan gills
            { cap: '#047857', high: '#34D399', shad: '#064E3B', gill: '#BEF264', stalk: '#D1FAE5', stalkShad: '#6EE7B7' }, // Emerald w/ Lime gills
            { cap: '#BE185D', high: '#F472B6', shad: '#831843', gill: '#FDE047', stalk: '#FCE7F3', stalkShad: '#FBCFE8' }, // Pink w/ Yellow gills
            { cap: '#0369A1', high: '#38BDF8', shad: '#0C4A6E', gill: '#F472B6', stalk: '#E0F2FE', stalkShad: '#BAE6FD' }  // Blue w/ Pink gills
        ];
        
        // Register the neon colors so they don't get trapped inside black outlines
        glowExclusions = ['#C084FC', '#22D3EE', '#34D399', '#BEF264', '#F472B6', '#FDE047', '#38BDF8', '#A855F7'];

        // 1. Cave Background (Pitch black with faint indigo silhouettes)
        for (let y = 0; y < horizonY; y++) {
            for (let x = 0; x < GRID_W; x++) {
                setBg(x, y, rng.chance((y - 20) / 40) ? cBg : cWall);
            }
        }

        // 2. Dark Water with Neon Ripples
        for (let y = horizonY; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                let c = cWater;
                if (rng.chance(0.08 + (y - horizonY) * 0.02) && x % 3 === 0) c = cGleam;
                setBg(x, y, c);
            }
        }

        // Helper: Draws a massive, detailed, glowing mushroom
        const drawShelf = (cx, cy, width, height, pal, isForeground) => {
            const layerFn = isForeground ? setFg : setMg;
            const darkStalk = isForeground ? pal.stalkShad : '#111827';
            const baseStalk = isForeground ? pal.stalk : cBg;
            
            const darkCap = isForeground ? pal.shad : '#111827';
            const baseCap = isForeground ? pal.cap : cBg;
            const highCap = isForeground ? pal.high : cWall;
            const gillColor = isForeground ? pal.gill : cBg;

            // Curving Stalk
            const stalkW = Math.max(2, Math.floor(width * 0.12));
            for (let y = cy; y < horizonY + 8; y++) {
                const wave = Math.round(Math.sin(y * 0.15) * 3);
                for (let x = -stalkW; x <= stalkW; x++) {
                    layerFn(cx + x + wave, y, x > 0 ? darkStalk : baseStalk);
                }
            }
            
            // Giant Cap
            for (let dy = 0; dy < height; dy++) {
                // Wide, umbrella-like curve
                const w = Math.floor(width * Math.sin(((dy+2) / height) * Math.PI));
                const ry = cy - dy;
                
                for (let x = -w; x <= w; x++) {
                    let c = baseCap;
                    
                    if (dy < height * 0.25) { 
                        // The glowing Gills underneath
                        c = (Math.abs(x) % 3 === 0) ? darkCap : gillColor;
                    } else {
                        // The Cap roof
                        if (dy > height * 0.6 || x < -w * 0.3) c = highCap;
                        if (isForeground && rng.chance(0.06)) c = gillColor; // Bioluminescent spots matching the gills
                    }
                    layerFn(cx + x, ry, c);
                }
            }
        };

        // 3. Background Silhouettes (Distant massive mushrooms)
        for (let i = 0; i < 15; i++) {
            drawShelf(rng.int(10, GRID_W - 10), rng.int(20, 45), rng.int(15, 25), rng.int(8, 15), shroomPals[0], false);
        }

        // 4. Foreground Loam Compost & Glowing Roots
        for (let y = horizonY - 8; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                if (x > GRID_W - 70) continue; // Gap for boat parking
                
                // Jagged, organic compost mounds
                const drop = Math.sin(x * 0.08) * 6 + Math.cos(x * 0.03) * 4;
                if (y > horizonY - 8 + drop) {
                    let c = cLoam;
                    if ((x+y)%4 === 0) c = cLoamShad; // Roots mixed in
                    
                    // Glowing mycelial network pulsating through the dirt
                    if (Math.sin(x * 0.2 + y * 0.5) > 0.85) {
                        c = rng.chance(0.5) ? '#A855F7' : '#22D3EE'; // Purple and Cyan veins
                    }
                    
                    if (y === Math.floor(horizonY - 8 + drop)) c = '#A855F7'; // Glowing purple moss edge
                    setFg(x, y, c);
                }
            }
        }

        // 5. The Dense Midground/Foreground Forest
        const numShrooms = rng.int(10, 14);
        for (let i = 0; i < numShrooms; i++) {
            const sx = rng.int(10, 240);
            const sy = horizonY - rng.int(8, 25);
            const sw = rng.int(25, 45); // Huge, wide caps
            const sh = rng.int(15, 25);
            const pal = rng.pick(shroomPals); // Pick a random neon palette for each mushroom
            drawShelf(sx, sy, sw, sh, pal, true);
        }

        // 6. Trippy Ambient Spores
        // A dense cloud of multi-colored spores floating everywhere
        for (let i = 0; i < 100; i++) {
            const px = rng.int(5, GRID_W - 5);
            const py = rng.int(5, horizonY + 5);
            if (!fgGrid[py][px] && !mgGrid[py][px]) {
                setFg(px, py, rng.pick(glowExclusions));
            }
        }
    }

    // ==========================================
    // POI 2: THE CRYSTAL MUSEUM (Grottos)
    // ==========================================
    else if (poiId === 'crystal_museum') {
        const cBg = '#020617';       // Void
        const cWall = '#0F172A';     // Deep slate
        const cPillar = '#1E293B';   // Foreground stone
        const cPillarHigh = '#334155';
        
        const cTankGlass = '#0284C7'; // Cyan glass
        const cTankGlow = '#38BDF8';  
        const cTankRim = '#94A3B8';   // Steel rim
        
        const cCrystal1 = '#818CF8';  // Indigo
        const cCrystal2 = '#C084FC';  // Purple
        const cCrystal3 = '#E879F9';  // Pink
        const cCrystal4 = '#22D3EE';  // Cyan
        
        // Add neon colors to the outline exclusion list so they glow
        glowExclusions.push(cTankGlass, cTankGlow, cCrystal1, cCrystal2, cCrystal3, cCrystal4);

        // 1. Slate Cathedral Background
        for (let y = 0; y < horizonY; y++) {
            for (let x = 0; x < GRID_W; x++) {
                // Vertical striated stone
                let c = cBg;
                if ((x + Math.floor(y/5)) % 6 < 3) c = cWall;
                setBg(x, y, c);
            }
        }

        // 2. Crystal Floor / Water
        for (let y = horizonY; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                let c = cPillar;
                if ((x - y) % 4 === 0) c = cPillarHigh; // Polished marble floor reflection
                if (rng.chance(0.1)) c = rng.pick([cCrystal1, cCrystal4]); // Embedded floor crystals
                setBg(x, y, c);
            }
        }

        // 3. Background Crystal Spires
        for (let i = 0; i < 12; i++) {
            const sx = rng.int(10, GRID_W - 10);
            const sh = rng.int(20, 50);
            const sw = rng.int(4, 8);
            const sColor = rng.pick([cCrystal1, cCrystal2, cCrystal4]);
            
            for (let y = horizonY; y >= horizonY - sh; y--) {
                const taper = Math.max(1, Math.floor(sw * ((y - (horizonY - sh)) / sh)));
                for (let x = -taper; x <= taper; x++) {
                    let c = sColor;
                    if (x === taper) c = cWall; // Shadow side
                    if (x === -taper + 1) c = '#FFFFFF'; // Sharp glint
                    setMg(sx + x, y, c);
                }
            }
        }

        // 4. The Suspended Geode Tanks
        const drawTank = (cx, cy, w, h) => {
            // Suspension chains
            for (let y = 0; y < cy - h; y++) {
                if (y % 3 !== 0) {
                    setFg(cx - w + 2, y, cTankRim);
                    setFg(cx + w - 2, y, cTankRim);
                }
            }
            
            // The Tank
            for (let y = -h; y <= h; y++) {
                for (let x = -w; x <= w; x++) {
                    let c = cTankGlass;
                    // Shiny glass diagonals
                    if ((x + y) % 8 === 0 || (x + y) % 8 === 1) c = cTankGlow;
                    
                    // Suspended specimens (random colored blobs)
                    if (Math.abs(x) < w - 4 && Math.abs(y) < h - 4) {
                        if (rng.chance(0.05)) c = rng.pick([cCrystal1, cCrystal2, cCrystal3, '#FFFFFF']);
                    }
                    
                    // Metallic Geode Rim
                    if (Math.abs(y) > h - 2 || Math.abs(x) > w - 2) c = cTankRim;
                    if (Math.abs(y) === h || Math.abs(x) === w) c = cPillarHigh;
                    
                    setFg(cx + x, cy + y, c);
                }
            }
        };

        // Draw 3 Massive Tanks
        drawTank(60, 30, 15, 20);
        drawTank(160, 25, 25, 15);
        drawTank(260, 35, 18, 22);

        // 5. Foreground Pillars & Museum Walkway
        for (let x = 110; x <= 210; x += 100) {
            for (let y = 10; y < GRID_H; y++) {
                const pw = 6;
                for (let px = -pw; px <= pw; px++) {
                    let c = cPillar;
                    if (px > 2) c = cPillarHigh;
                    if (px === pw) c = cWall;
                    // Etched runes
                    if (y % 8 === 0 && Math.abs(px) < 2) c = cCrystal4;
                    setFg(x + px, y, c);
                }
            }
        }
    }

    // ==========================================
    // POI 3: THE VOLCANIC ARENA (Sulphur Springs)
    // ==========================================
    else if (poiId === 'volcanic_arena') {
        const cBg = '#1C1917';        // Pitch dark ash
        const cWall = '#450A0A';      // Deep magma red wall
        const cWater = '#5e1313';     // Boiling blood-water
        const cGleam = '#DC2626';     // Magma reflection
        const cArenaBase = '#09090B'; // Pitch black obsidian
        const cArenaTrim = '#27272A'; // Gray basalt
        const cMagma = '#F59E0B';     // Hot orange magma
        const cMagmaCore = '#FEF08A'; // White hot center
        
        glowExclusions.push(cMagma, cMagmaCore, cGleam);

        // 1. Ash-choked background walls
        for (let y = 0; y < horizonY; y++) {
            for (let x = 0; x < GRID_W; x++) {
                setBg(x, y, rng.chance((y - 10) / 40) ? cWall : cBg);
            }
        }

        // 2. Boiling Magma Water
        for (let y = horizonY; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                let c = cWater;
                if (rng.chance(0.08 + (y - horizonY) * 0.02) && x % 3 === 0) c = cGleam;
                // Add floating ash to water surface
                if (rng.chance(0.02)) c = '#000000';
                setBg(x, y, c);
            }
        }

        // 3. Magma Falls in the background
        for (let i = 0; i < 4; i++) {
            const fx = rng.int(20, GRID_W - 20);
            const fw = rng.int(4, 8);
            for (let y = 20; y < horizonY + 5; y++) {
                const splash = Math.sin(y * 0.5) * 2;
                for (let x = -fw; x <= fw; x++) {
                    if (x === 0 && rng.chance(0.8)) setBg(fx + x + splash, y, cMagmaCore);
                    else if (Math.abs(x) < fw - 1) setBg(fx + x + splash, y, cMagma);
                    else setBg(fx + x + splash, y, cGleam);
                }
            }
            // Glow on the water below the fall
            for (let x = -fw - 5; x <= fw + 5; x++) {
                setBg(fx + x, horizonY + rng.int(0, 4), cGleam);
            }
        }

        // 4. The Giant Obsidian Fighting Ring
        const ringY = horizonY - 10;
        const ringX = 140; // Shifted left to leave room for the boat
        
        // Massive suspended basalt platform
        for (let y = ringY; y < GRID_H; y++) {
            const w = 90; 
            for (let x = -w; x <= w; x++) {
                // Slope the sides of the arena slightly
                if (y > ringY + 10 && Math.abs(x) > w - (y - (ringY + 10))) continue;
                
                let c = cArenaBase;
                if (y === ringY || y === ringY + 1) c = cArenaTrim; // Ring floor edge
                if (Math.abs(x) === w) c = cArenaTrim; // Ring side edge
                
                // Magma cracks running through the platform
                if (x % 20 === 0 && y > ringY + 5 && rng.chance(0.6)) c = cMagma;
                if (x % 20 === 1 && y > ringY + 5 && c === cMagma) c = cMagmaCore;

                setMg(ringX + x, y, c);
            }
        }

        // 5. Heavy Iron Chains suspending the arena
        const drawChain = (startX, startY, endX, endY) => {
            const dx = endX - startX;
            const dy = endY - startY;
            const dist = Math.hypot(dx, dy);
            for(let j = 0; j <= dist; j++) {
                const lx = Math.round(startX + (dx * (j/dist)));
                const ly = Math.round(startY + (dy * (j/dist)));
                if (j % 4 < 2) {
                    setMg(lx, ly, '#3F3F46'); // Link
                    setMg(lx + 1, ly, '#18181B');
                } else {
                    setMg(lx, ly, '#18181B'); // Gap
                }
            }
        };
        
        drawChain(ringX - 80, ringY, 10, -10);
        drawChain(ringX + 80, ringY, GRID_W - 40, -10);

        // 6. The Iron Gladiator Cages on the ring
        for (let cx = ringX - 50; cx <= ringX + 50; cx += 100) {
            for (let y = ringY - 20; y <= ringY; y++) {
                for (let x = -8; x <= 8; x++) {
                    let c = null;
                    if (y === ringY - 20 || y === ringY) c = cArenaTrim; // Top/bottom bars
                    else if (x % 4 === 0) c = '#3F3F46'; // Vertical bars
                    else if (y > ringY - 4) c = cArenaBase; // Shadow inside
                    
                    if (c) setMg(cx + x, y, c);
                }
            }
        }
    }

   // ==========================================
    // POI 4: THE ANGLERS CLUB (Frozen Fjord)
    // ==========================================
    else if (poiId === 'anglers_club') {
        const cBg = '#020617';       // Void
        const cWall = '#0F172A';     // Deep slate
        const cIce = '#38BDF8';      // Bright ice
        const cIceDark = '#0284C7';  // Deep blue ice shadow
        const cSnow = '#F8FAFC';     // Pure snow
        const cIceShad = '#94A3B8';  // Shadowed snow/ice
        const cWater = '#082F49';    // Freezing water
        const cFloe = '#0369A1';     // Submerged ice
        const cLog = '#1C1917';      // Dark obsidian wood
        const cLogHigh = '#292524';
        const cWindow = '#FDE047';   // Warm light
        const cWindowGlow = '#F59E0B';
        const cSmoke = '#64748B';
        
        glowExclusions.push(cWindow, cWindowGlow, cSnow);

        // 1. Solid Cave Background & Distant Glaciers
        for (let y = 0; y < horizonY; y++) {
            for (let x = 0; x < GRID_W; x++) {
                setBg(x, y, cBg); // Solid base fill prevents glitches!
                // Gentle stippling for distant cave wall
                if (rng.chance((y + 10) / 80)) setBg(x, y, cWall);
            }
        }
        
        // Distant Ice Spikes / Mountains in the background
        for (let i = 0; i < 8; i++) {
            const px = rng.int(0, GRID_W);
            const ph = rng.int(15, 30);
            for (let y = 0; y < ph; y++) {
                const pw = Math.floor((ph - y) * 0.4);
                for (let x = -pw; x <= pw; x++) {
                    setBg(px + x, horizonY - y, x > 0 ? cWall : cBg); 
                }
            }
        }

        // Hanging Icicles (Drawn on Midground to avoid erasing the sky)
        for (let x = 0; x < GRID_W; x += rng.int(4, 10)) {
            const iLen = rng.int(8, 25);
            for (let y = 0; y < iLen; y++) {
                const w = Math.max(0, Math.floor(2 - (y / iLen) * 2));
                for (let dx = -w; dx <= w; dx++) {
                    setMg(x + dx, y, dx <= 0 ? cIce : cIceDark); 
                }
            }
        }

        // 2. Frozen Water & Drifting Ice Floes
        for (let y = horizonY; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                setBg(x, y, cWater);
                // Subtle current lines
                if (rng.chance(0.05) && x % 4 === 0) setBg(x, y, cFloe);
            }
        }
        
        // Large Flat Ice Floes
        for (let i = 0; i < 30; i++) {
            const fx = rng.int(0, GRID_W);
            const fy = rng.int(horizonY + 2, GRID_H - 2);
            const fw = rng.int(10, 30);
            for (let x = 0; x < fw; x++) {
                if (rng.chance(0.9)) {
                    setMg(fx + x, fy, cSnow);
                    setMg(fx + x, fy + 1, cIceDark);
                }
            }
        }

        // 3. The Massive Glacial Pier (Extending from the left)
        const pierLimit = 160; 
        for (let y = horizonY - 6; y < GRID_H; y++) {
            for (let x = 0; x <= pierLimit; x++) {
                // Slope the ice edge gently into the water
                if (x > pierLimit - (y - (horizonY - 6)) * 1.5) continue;
                
                let c = cIceShad;
                if (y === horizonY - 6) c = cSnow; // Pure snow on top
                else if (y === horizonY - 5) c = cIce; // Frost edge
                else if (x % 20 === 0 || y % 10 === 0) c = cIceDark; // Giant block seams
                
                setMg(x, y, c);
            }
        }

        // 4. The Grand Obsidian Lodge
        const lodgeX = 80;
        const lodgeW = 100;
        const lodgeY = horizonY - 6; // Sits exactly on the pier
        
        // Foundation & Walls
        for (let y = lodgeY - 35; y <= lodgeY; y++) {
            for (let x = -lodgeW/2; x <= lodgeW/2; x++) {
                let c = cLog;
                if (y % 4 === 0) c = cLogHigh; // Horizontal log grain
                if (Math.abs(x) > lodgeW/2 - 3) c = cLogHigh; // Wall edges
                setMg(lodgeX + x, y, c);
            }
        }

        // Huge A-Frame Roof (Steep slope for heavy snow)
        const roofH = 45;
        for (let dy = 0; dy <= roofH; dy++) {
            const rw = (lodgeW/2 + 10) - (dy * 1.2);
            const ry = lodgeY - 35 - dy;
            if (rw < 0) continue;
            
            for (let x = -rw; x <= rw; x++) {
                let c = cLog; // Under-roof wood overhang
                // Thick slab of snow resting on top of the shingles
                if (Math.abs(x) > rw - 5) c = cSnow; 
                else if (Math.abs(x) > rw - 7) c = cIceShad;
                setMg(lodgeX + x, ry, c);
            }
        }

        // Snow Drifts banked against the walls
        for (let x = -lodgeW/2 - 15; x <= lodgeW/2 + 15; x++) {
            const driftH = rng.int(4, 10);
            for (let y = 0; y < driftH; y++) {
                if (rng.chance(0.9)) setMg(lodgeX + x, lodgeY - y, y === driftH - 1 ? cIceShad : cSnow);
            }
        }

        // Stone Chimney & Smoke
        const chimX = lodgeX + 35;
        for (let y = lodgeY - 55; y <= lodgeY - 20; y++) {
            for (let x = -4; x <= 4; x++) {
                setMg(chimX + x, y, (x+y)%2===0 ? cLog : cLogHigh); 
            }
        }
        for (let i = 0; i < 50; i++) {
            const sx = chimX + rng.int(-4, 20);
            const sy = lodgeY - 55 - rng.int(2, 30);
            if (rng.chance(0.6)) setMg(sx, sy, cSmoke);
        }

        // Warm Glowing Windows
        const drawWindow = (wx, wy) => {
            for (let y = 0; y < 12; y++) {
                for (let x = 0; x < 10; x++) {
                    let c = cWindow;
                    if (x === 0 || x === 9 || y === 0 || y === 11 || x === 4 || x === 5 || y === 5 || y === 6) c = cLog; 
                    setMg(wx + x, wy + y, c);
                }
            }
            // Glow spilling onto the snow
            for (let x = -5; x <= 14; x++) {
                for (let dy = 0; dy < 4; dy++) {
                    if (rng.chance(0.7 - dy*0.1)) setFg(wx + x, wy + 12 + dy, cWindowGlow);
                }
            }
        };
        drawWindow(lodgeX - 35, lodgeY - 20);
        drawWindow(lodgeX + 25, lodgeY - 20);

        // Solid Heavy Oak Door
        for (let y = lodgeY - 16; y <= lodgeY; y++) {
            for (let x = -8; x <= 8; x++) {
                setMg(lodgeX + x, y, (x+y)%2 === 0 ? '#0F172A' : cLog);
            }
        }

        // Giant Jawbone Trophy over the door
        for (let i = 0; i < 12; i++) {
            setMg(lodgeX - 12 + i, lodgeY - 24 + Math.abs(i - 6), cIce);
            setMg(lodgeX + 12 - i, lodgeY - 24 + Math.abs(i - 6), cIce);
            if (i % 2 === 0) {
                setMg(lodgeX - 12 + i, lodgeY - 22 + Math.abs(i - 6), cSnow);
                setMg(lodgeX + 12 - i, lodgeY - 22 + Math.abs(i - 6), cSnow);
            }
        }
    }
// ==========================================
    // POI 5: THE MAGE TOWER STUDY ROOM INTERIOR
    // ==========================================
    else if (poiId === 'mage_tower') {
        const cBg = '#050510';       // Deep abyssal void
        const cStone = '#1E1B4B';    // Indigo basalt stone
        const cStoneShad = '#090514';// Dark basalt shadow
        const cStoneHigh = '#312E81';// Basalt light
        const cWood = '#451A03';     // Dark mahogany wood
        const cWoodShad = '#270E01'; // Mahogany shadow
        const cWoodHigh = '#78350F'; // Mahogany highlight
        const cGold = '#FBBF24';     // Burnished brass / Gold
        const cGlow = '#C084FC';     // Lavender magical energy
        const cGlowHigh = '#E9D5FF'; // Silver-purple glow
        const cCyan = '#22D3EE';     // Pure cyan starlight
        const cWhite = '#FFFFFF';    // White-hot core
        
        glowExclusions = [cGlow, cGlowHigh, cCyan, cGold, '#F472B6', '#38BDF8'];
        const timeSec = Date.now() / 1000;

        // --- NEW: LOCAL HELPER FOR SAFE FOREGROUND WRITING ---
        const overFg = (x, y, color) => {
            x = Math.round(x); y = Math.round(y);
            if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && !fgGrid[y][x]) fgGrid[y][x] = color;
        };

        // 1. Draw solid stone walls & background base
        for (let y = 0; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                setBg(x, y, cStoneShad);
            }
        }

        // 2. Arched Windows (Randomized Layout: 1 huge center window vs 2 flanking windows)
        const windowStyle = rng.pick(['one_huge', 'two_arches']);
        const windows = [];
        if (windowStyle === 'one_huge') {
            windows.push({ cx: 160, cy: 30, rx: 55, ry: 25 });
        } else {
            windows.push({ cx: 110, cy: 32, rx: 32, ry: 22 });
            windows.push({ cx: 210, cy: 32, rx: 32, ry: 22 });
        }

        windows.forEach(w => {
            // Draw background sky & space nebulae
            for (let y = w.cy - w.ry; y <= w.cy + w.ry; y++) {
                const progress = (y - (w.cy - w.ry)) / (w.ry * 2);
                let rxAtY = w.rx;
                if (y < w.cy) {
                    const topProgress = (y - (w.cy - w.ry)) / w.ry;
                    rxAtY = Math.floor(w.rx * Math.sqrt(1 - Math.pow(1 - topProgress, 2))); // Arched curve
                }
                
                for (let x = w.cx - rxAtY; x <= w.cx + rxAtY; x++) {
                    let c = cBg;
                    if (Math.sin(x * 0.05 + y * 0.1) > 0.7) c = '#0F172A';
                    if (Math.sin(x * 0.03 - y * 0.05) > 0.8) c = '#1E1B4B';
                    setBg(x, y, c);
                }
            }
            
            // --- NEW: COHERENT, SCATTERED STARFIELD (SEEDED & NATURAL) ---
            const numStars = rng.int(15, 25);
            for (let i = 0; i < numStars; i++) {
                const sx = rng.int(w.cx - w.rx + 2, w.cx + w.rx - 2);
                const sy = rng.int(w.cy - w.ry + 2, w.cy + w.ry - 2);
                
                // Keep stars bound strictly inside the arched window curve
                const progress = (sy - (w.cy - w.ry)) / w.ry;
                let rxAtY = w.rx;
                if (sy < w.cy) {
                    const topProgress = (sy - (w.cy - w.ry)) / w.ry;
                    rxAtY = Math.floor(w.rx * Math.sqrt(1 - Math.pow(1 - topProgress, 2)));
                }
                
                if (Math.abs(sx - w.cx) < rxAtY - 2) {
                    const starColor = rng.pick([cWhite, cWhite, cCyan, cGold, cGlow]);
                    setBg(sx, sy, starColor);
                    
                    // Add subtle atmospheric glow to bright white stars
                    if (starColor === cWhite && rng.chance(0.5)) {
                        if (sx > 0) setBg(sx - 1, sy, '#0F172A');
                        if (sx < GRID_W - 1) setBg(sx + 1, sy, '#0F172A');
                    }
                }
            }
            
            // Arched stone window frame outlines
            for (let y = w.cy - w.ry - 2; y <= w.cy + w.ry + 1; y++) {
                let rxAtY = w.rx + 1;
                if (y < w.cy) {
                    const topProgress = (y - (w.cy - w.ry)) / w.ry;
                    rxAtY = Math.floor((w.rx + 1) * Math.sqrt(1 - Math.pow(1 - topProgress, 2)));
                }
                setMg(w.cx - rxAtY, y, cStone);
                setMg(w.cx + rxAtY, y, cStone);
                if (y === w.cy - w.ry - 2) {
                    for (let x = w.cx - 2; x <= w.cx + 2; x++) setMg(x, y, cStoneHigh);
                }
            }
        });

        // 3. Arched Support Columns & Polished Flagstone Floor
        const columnsX = [25, 75, 245, 295];
        columnsX.forEach(colX => {
            for (let y = 0; y < GRID_H; y++) {
                for (let x = -4; x <= 4; x++) {
                    let c = cStone;
                    if (x === -4) c = cStoneHigh;
                    if (x === 4) c = cStoneShad;
                    if (y % 16 === 0) c = cStoneShad; // Column seam lines
                    setMg(colX + x, y, c);
                }
            }
        });

        // Flagstone floor
        for (let y = horizonY - 5; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                let c = cStoneShad;
                if (y === horizonY - 5) c = cStone;
                else {
                    const progress = (y - (horizonY - 5)) / (GRID_H - (horizonY - 5));
                    c = progress > 0.55 ? '#04020A' : cStoneShad; // Fades to shadow
                    if ((x + Math.floor(y * 1.5)) % 40 === 0 || y % 8 === 0) c = '#020105'; // Seams
                }
                setMg(x, y, c);
            }
        }

        // 4. Large Curved Bookshelves (Framing the left and right walls)
        const drawBookshelf = (bx, by, w, h) => {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let c = cWood;
                    if (x === 0 || y === 0) c = cWoodHigh;
                    if (x === w - 1 || y === h - 1) c = cWoodShad;
                    if (y > 0 && y % 8 === 0) c = cWoodShad; // Internal shelves
                    setMg(bx + x, by + y, c);
                }
            }

            const numShelves = Math.floor(h / 8);
            const bookColors = ['#B91C1C', '#047857', '#0369A1', '#D97706', '#E2E8F0', '#475569'];

            for (let s = 0; s < numShelves; s++) {
                const sy = by + (s * 8) + 1;
                let currentX = bx + 2;
                while (currentX < bx + w - 3) {
                    const bookW = rng.int(2, 4);
                    const bookH = rng.int(4, 6);
                    const bookCol = rng.pick(bookColors);
                    const lean = rng.chance(0.2) && currentX < bx + w - 7; // Slanted book check

                    for (let bx_off = 0; bx_off < bookW; bx_off++) {
                        for (let by_off = 0; by_off < bookH; by_off++) {
                            let lx = currentX + bx_off;
                            let ly = sy + 6 - by_off;
                            if (lean) lx += Math.floor(by_off / 2); // Shear pixels to lean right
                            setFg(lx, ly, bookCol);
                            if (by_off === Math.floor(bookH / 2) && rng.chance(0.3)) setFg(lx, ly, cGold); // Spine ribs
                        }
                    }
                    currentX += bookW + (lean ? 3 : 1);
                }
            }
        };

        drawBookshelf(10, 8, 45, 48);
        drawBookshelf(265, 8, 45, 48);

        // 5. The Grand Study Desk (Central layout focus)
        const deskX = 120;
        const deskY = 48;
        const deskW = 80;
        const deskH = 12;

        for (let y = 0; y < deskH; y++) {
            for (let x = 0; x < deskW; x++) {
                let c = cWood;
                if (y === 0) c = cWoodHigh;
                if (x === 0 || x === deskW - 1 || y === deskH - 1) c = cWoodShad;
                if (y > 3 && (x < 6 || x > deskW - 7)) c = cWoodShad; // Thick pillars legs
                setFg(deskX + x, deskY + y, c);
            }
        }

        // 6. DESK REAGENTS & ANCIENT ARTIFACTS
        // A. The Spellbook (Tome of Gravitational Singularity)
        const bookX = deskX + 26;
        const bookY = deskY - 5;
        // Leather cover
        for (let x = 0; x < 28; x++) setFg(bookX + x, bookY + 4, '#7F1D1D');
        // Aged pages
        for (let x = 1; x < 27; x++) {
            const isLeftPage = x < 14;
            const pageSway = isLeftPage ? Math.sin((x / 13) * Math.PI) * 2 : Math.sin(((27 - x) / 13) * Math.PI) * 2;
            const py = bookY + 3 - Math.floor(pageSway);
            
            for (let dy = 0; dy < 3; dy++) {
                let c = '#FEF08A'; 
                if (dy === 2) c = '#CA8A04'; // Page shading
                setFg(bookX + x, py + dy, c);
                
                // Glowing script lines
                if (dy === 1 && x > 2 && x < 25 && x !== 13 && x !== 14) {
                    if (x % 3 === 0) setFg(bookX + x, py + dy, cGlow);
                }
            }
            setFg(bookX + 13, bookY + 3, cWoodShad);
            setFg(bookX + 14, bookY + 3, cWoodShad);
        }

        // B. Left Desk Object (Procedural: Floating Orb vs Rolled Map Scrolls)
        const leftObject = rng.pick(['orb', 'scroll_pile']);
        if (leftObject === 'orb') {
            const orbX = deskX + 8;
            const orbY = deskY - 8;
            for (let y = 0; y < 4; y++) {
                for (let x = -2; x <= 2; x++) setFg(orbX + x, deskY - 1 - y, cStone); // Stand
            }
            for (let y = -3; y <= 3; y++) {
                const w = Math.floor(4 * Math.sqrt(1 - Math.pow(y / 4, 2)));
                for (let x = -w; x <= w; x++) {
                    let c = cGlow;
                    if (x === -1 && y === -1) c = cWhite; // Glint
                    if (x === w || y === 3) c = cGlowHigh;
                    setFg(orbX + x, orbY + y, c);
                }
            }
            // Glow emission
            for (let dy = -6; dy <= 6; dy++) {
                for (let dx = -6; dx <= 6; dx++) {
                    if (Math.hypot(dx, dy) < 6 && rng.chance(0.4)) {
                        overFg(orbX + dx, orbY + dy, cGlow);
                    }
                }
            }
        } else {
            const scrollX = deskX + 6;
            const scrollY = deskY - 1;
            for (let x = 0; x < 12; x++) {
                setFg(scrollX + x, scrollY, '#FEF08A');
                setFg(scrollX + x, scrollY - 1, '#FEF08A');
                if (x === 0 || x === 11) {
                    setFg(scrollX + x, scrollY, '#B45309'); // Straps
                    setFg(scrollX + x, scrollY - 1, '#B45309');
                }
            }
        }

        // C. Right Desk Object (Procedural: Flickering Candle vs Alchemical Flask)
        const rightObject = rng.pick(['candle', 'flask']);
        if (rightObject === 'candle') {
            const candX = deskX + deskW - 10;
            const candY = deskY - 1;
            setFg(candX - 1, candY, cStoneShad); setFg(candX, candY, cStoneHigh); setFg(candX + 1, candY, cStoneShad);
            
            for (let y = 1; y <= 5; y++) {
                setFg(candX, candY - y, '#F1F5F9'); 
                setFg(candX - 1, candY - y, '#CBD5E1'); 
            }
            setFg(candX - 1, candY - 2, '#CBD5E1'); // Wax drip
            setFg(candX, candY - 6, '#475569'); // Wick

            // Wave frequency for flicker
            const flameY = candY - 8 + Math.round(Math.sin(timeSec * 6.0) * 0.5);
            setFg(candX, flameY, cGold);
            setFg(candX, flameY - 1, cWhite);
            setFg(candX - 1, flameY, cGlow); 
            setFg(candX + 1, flameY, cGlow);
        } else {
            const flaskX = deskX + deskW - 10;
            const flaskY = deskY - 4;
            for (let y = -2; y <= 2; y++) {
                const w = 4 - Math.abs(y);
                for (let x = -w; x <= w; x++) {
                    let c = cCyan;
                    if (y > 0) c = '#0891B2'; // Liquid line
                    if (x === -w) c = cWhite; 
                    setFg(flaskX + x, flaskY + y, c);
                }
            }
            for (let y = -4; y < -2; y++) {
                setFg(flaskX, flaskY + y, cWhite);
                setFg(flaskX + 1, flaskY + y, '#0891B2');
            }
        }

        // 7. SCRIPTURE RUNES SCATTERED ACROSS FLOORS & AIR
        // Floor Glyphs
        const numRunes = rng.int(8, 14);
        for (let i = 0; i < numRunes; i++) {
            const rx = rng.int(deskX - 30, deskX + deskW + 30);
            const ry = rng.int(60, 75);
            if (fgGrid[ry][rx] === null && mgGrid[ry][rx] === null) {
                setFg(rx, ry, rng.chance(0.6) ? cGlow : cCyan);
            }
        }

        // Floating Air Runes
        const numAirRunes = rng.int(5, 9);
        for (let i = 0; i < numAirRunes; i++) {
            const rx = rng.int(70, 250);
            const ry = rng.int(10, 40);
            const phaseOffset = i * 45;
            const driftY = Math.round(Math.sin(timeSec * 2.0 + phaseOffset) * 2);
            
            if (fgGrid[ry + driftY][rx] === null && mgGrid[ry + driftY][rx] === null) {
                setFg(rx, ry + driftY, rng.chance(0.5) ? cGlow : cCyan);
                if (rng.chance(0.5)) setFg(rx + 1, ry + driftY + 1, cGlowHigh);
            }
        }

        // 8. Alistair's Familiar (Tiny Easter-Egg Spectral Owl!)
        if (rng.chance(0.3)) {
            const famLeft = rng.chance(0.5);
            const famX = famLeft ? 38 : 272;
            const famY = 6;
            
            for (let x = -2; x <= 2; x++) {
                for (let y = -3; y <= 3; y++) {
                    if (Math.abs(x) + Math.abs(y) < 5) {
                        setFg(famX + x, famY + y, cCyan);
                    }
                }
            }
            setFg(famX - 1, famY - 1, cGold); // Eyes
            setFg(famX + 1, famY - 1, cGold);
            setFg(famX - 2, famY - 4, cCyan); // Ears
            setFg(famX + 2, famY - 4, cCyan);
        }
    }

    // ==========================================
    // POI 6: THE VOID PORTAL (Astral Sea Entrance)
    // ==========================================
    else if (poiId === 'spawn') {
        const cBg = '#02020A';       // Deep void black
        const cSpace = '#0F172A';    // Stardust haze
        const cVortex = '#7C3AED';   // Swirling purple vortex
        const cVortexHigh = '#C084FC';
        const cWater = '#05030A';    // Black-violet water
        const cDock = '#1E1B4B';     // Basalt docks
        const cDockShad = '#090514';
        
        glowExclusions = [cVortex, cVortexHigh, '#22D3EE', '#FFFFFF'];
        const timeSec = Date.now() / 1000; // Added to fix ReferenceError

        // 1. Draw solid space backdrop
        for (let y = 0; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                let c = cBg;
                if (Math.sin(x * 0.05) > 0.8) c = cSpace;
                setBg(x, y, c);
            }
        }

        // 2. Stars
        const numStars = rng.int(20, 40);
        for (let i = 0; i < numStars; i++) {
            const sx = rng.int(5, GRID_W - 5);
            const sy = rng.int(5, horizonY - 5);
            setBg(sx, sy, rng.pick(['#FFFFFF', '#22D3EE', '#FBBF24', '#C084FC']));
        }

        // 3. Swirling Void Vortex (Main portal centerpiece)
        const pX = 140; // Center aligned
        const pY = horizonY - 15;
        const pR = 25;
        for (let y = -pR; y <= pR; y++) {
            const w = Math.floor(pR * Math.sqrt(1 - (y*y)/(pR*pR || 1)));
            for (let x = -w; x <= w; x++) {
                let c = cBg;
                const dist = Math.hypot(x, y);
                if (dist < 5) c = '#FFFFFF'; // core
                else if (dist < 12) c = cVortexHigh;
                else if ((x + y + Math.floor(timeSec * 5)) % 6 === 0) c = cVortex;
                setMg(pX + x, pY + y, c);
            }
        }

        // 4. Portal Rim Pillars
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -32; dx <= 32; dx++) {
                if (Math.abs(dx) > pR - 2 && Math.abs(dx) < pR + 4) {
                    setFg(pX + dx, pY + dy, cDockShad);
                }
            }
        }

        // 5. Water & Basalt Pier
        for (let y = horizonY; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                setBg(x, y, cWater);
            }
        }
        for (let y = horizonY - 4; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W - 40; x++) {
                let c = cDock;
                if (y === horizonY - 4) c = '#4338CA'; // neon rim
                if (x % 6 === 0) c = cDockShad;
                setFg(x, y, c);
            }
        }
    }
    // ==========================================
    // OUTLINE PASS & FINAL RENDER
    // ==========================================
    const outlineGrid = Array(GRID_H).fill(null).map(() => Array(GRID_W).fill(null));
    for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
            if (fgGrid[y][x] === null) {
                // Do not wrap black outlines around our glowing neon colors
                const isSolid = (c) => c !== null && !glowExclusions.includes(c);
                
                if (isSolid(y > 0 ? fgGrid[y - 1][x] : null) || 
                    isSolid(y < GRID_H - 1 ? fgGrid[y + 1][x] : null) || 
                    isSolid(x > 0 ? fgGrid[y][x - 1] : null) || 
                    isSolid(x < GRID_W - 1 ? fgGrid[y][x + 1] : null)) {
                    outlineGrid[y][x] = '#020617'; 
                }
            }
        }
    }

    for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
            let c = bgGrid[y][x]; 
            if (mgGrid[y][x]) c = mgGrid[y][x]; 
            if (outlineGrid[y][x]) c = outlineGrid[y][x]; 
            if (fgGrid[y][x]) c = fgGrid[y][x]; 
            
            if (c) drawScaledRect(ctx, x, y, 1, 1, c, DISPLAY_SCALE);
        }
    }

    return {
        imageDataUrl: canvas.toDataURL(),
        data: { poiId }
    };
}