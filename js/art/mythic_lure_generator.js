/**
 * js/art/mythic_lure_generator.js
 * Generates bespoke, highly detailed pixel art for Mythic Lures.
 */

import { drawScaledRect } from '../util/utils.js';

const GRID_SIZE = 64;
const DISPLAY_SCALE = 4;
const CANVAS_SIZE = GRID_SIZE * DISPLAY_SCALE;

export function generateMythicLure(options = {}) {
    const lureId = options.lureId;
    const rng = options.rng; 
    
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = CANVAS_SIZE;
    offscreenCanvas.height = CANVAS_SIZE;
    const ctx = offscreenCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

    function setPixel(x, y, colorCode) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) grid[y][x] = colorCode;
    }

    // --- FIX: Add forcePixel helper definition ---
    function forcePixel(x, y, colorCode) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) grid[y][x] = colorCode;
    }

    // ==========================================
    // MYTHIC LURE 1: THE MYCELIAL HOOK
    // ==========================================
    if (lureId === 'mycelial_hook') {
        const cx = 32;
        let cy = 16;
        
        const cLine = '#CBD5E1'; // Linen thread
        const cBoneBase = '#D4D4D8'; // Fossilized root base
        const cBoneShad = '#71717A'; 
        const cBoneDark = '#3F3F46';
        const cGlow = '#4ADE80'; // Bioluminescent pulse
        const cGlowHigh = '#BEF264';
        
        const cCapBase = '#166534';
        const cCapHigh = '#22C55E';
        const cCapShad = '#064E3B';

        // 1. The Braided Linen Line
        for (let y = 0; y < 12; y++) {
            setPixel(cx + Math.sin(y * 0.8), y, cLine);
        }

        // 2. The Eyelet (Root knot)
        for (let y = 12; y <= 16; y++) {
            for (let x = -2; x <= 2; x++) {
                if (Math.abs(x) + Math.abs(y - 14) <= 2) {
                    setPixel(cx + x, y, x > 0 ? cBoneShad : cBoneBase);
                }
            }
        }
        setPixel(cx, 14, null); // Hole

        // 3. Fossilized Fungal Cap (The Body)
        const capY = 22;
        for (let cy_off = -5; cy_off <= 3; cy_off++) {
            const w = 8 - Math.abs(cy_off + 1); // Bell shape
            for (let cx_off = -w; cx_off <= w; cx_off++) {
                if (cy_off > 1) {
                    setPixel(cx + cx_off, capY + cy_off, cCapShad); // Gills
                } else {
                    let c = cCapBase;
                    if (cx_off < -w/2 || cy_off < -2) c = cCapHigh;
                    if (rng.chance(0.2)) c = cGlow; // Spores
                    setPixel(cx + cx_off, capY + cy_off, c);
                }
            }
        }

        // 4. Fossilized Root Shank & Barb
        const shankEnd = 50;
        for (let y = 17; y <= shankEnd; y++) {
            // Wavy organic root
            const wave = Math.round(Math.sin(y * 0.4) * 1.5);
            setPixel(cx + wave - 1, y, cBoneBase);
            setPixel(cx + wave, y, cBoneBase);
            setPixel(cx + wave + 1, y, cBoneShad);
            setPixel(cx + wave + 2, y, cBoneDark);
            
            // Glowing Veins running down the shank
            if ((y + wave) % 4 === 0) {
                setPixel(cx + wave, y, cGlowHigh);
                setPixel(cx + wave - 1, y, cGlow);
            }
        }

        // The Hook Curve (Jagged root turning up)
        for (let i = 0; i <= 8; i++) {
            const hx = cx - i;
            const hy = shankEnd + Math.round(Math.sin(i * 0.4) * 4);
            setPixel(hx, hy, cBoneShad);
            setPixel(hx, hy - 1, cBoneBase);
            setPixel(hx, hy - 2, cBoneBase);
            if (i % 3 === 0) setPixel(hx, hy - 1, cGlow); // Glow on the curve
        }

        // The Barb (Sharp root tip)
        for (let i = 0; i <= 6; i++) {
            const bx = cx - 8 + Math.round(i * 0.5);
            const by = shankEnd + 2 - i;
            setPixel(bx, by, cBoneBase);
            setPixel(bx + 1, by, cBoneShad);
            if (i === 6) setPixel(bx, by, cGlowHigh); // Searing glowing tip
            
            // Inner barb point
            if (i === 3) {
                setPixel(bx + 2, by, cBoneBase);
                setPixel(bx + 3, by + 1, cBoneShad);
            }
        }
        
        // Ambient Floating Spores around the lure
        for (let i = 0; i < 15; i++) {
            const sx = rng.int(10, 54);
            const sy = rng.int(10, 54);
            if (!grid[sy][sx]) {
                setPixel(sx, sy, rng.chance(0.5) ? cGlow : cGlowHigh);
            }
        }
    }

// ==========================================
    // MYTHIC LURE 2: THE PRISMATIC GEODE HOOK
    // ==========================================
    else if (lureId === 'prismatic_geode_hook') {
        const cx = 32;
        let cy = 16;
        
        const cLine = '#E2E8F0';     // White silk
        const cKnot = '#94A3B8';     // Polished steel
        const cGeode = '#334155';    // Basalt gray
        const cGeodeShad = '#0F172A';// Deep basalt shadow
        const cGeodeDark = '#020617';// Void shadow

        // Spectral Prism Palettes
        const cBlue = '#4F46E5';
        const cPurple = '#9333EA';
        const cPink = '#EC4899';
        const cCyan = '#22D3EE';
        const cWhite = '#FFFFFF';

        // 1. The Strong Silk Line
        for (let y = 0; y < 12; y++) setPixel(cx, y, cLine);

        // 2. Polished Steel Connector Ring
        for (let y = 12; y <= 16; y++) {
            for (let x = -2; x <= 2; x++) {
                if (Math.abs(x) + Math.abs(y - 14) === 2) {
                    setPixel(cx + x, y, x > 0 ? cKnot : '#FFFFFF');
                }
            }
        }

        // 3. Cracked Geode Body (The Weight)
        const gy = 24;
        const gw = 7;
        for (let y = -6; y <= 6; y++) {
            const w = gw - Math.floor(Math.abs(y) * 0.5);
            for (let x = -w; x <= w; x++) {
                let c = cGeode;
                if (x > w - 2 || y > 4) c = cGeodeShad;
                if (x < -w + 2 && y < -4) c = cGeode;
                
                // Draw a distinct diagonal crack down the center
                const crackCenter = Math.round(y * 0.5);
                if (Math.abs(x - crackCenter) <= 2) {
                    c = cGeodeDark; // Deep interior void
                }
                setPixel(cx + x, gy + y, c);
            }
        }
        
        // Draw sharp crystal clusters growing inside the geode crack
        for (let dy = -2; dy <= 2; dy++) {
            forcePixel(cx + Math.round(dy * 0.5) - 1, gy + dy, cCyan);
            forcePixel(cx + Math.round(dy * 0.5) + 1, gy + dy, cPink);
        }
        forcePixel(cx - 1, gy, cWhite);
        forcePixel(cx + 1, gy + 1, cWhite);

        // 4. Obsidian Shank
        const shankEnd = 45;
        for (let y = 31; y <= shankEnd; y++) {
            setPixel(cx, y, cGeodeShad);
            setPixel(cx + 1, y, cGeodeDark);
            setPixel(cx - 1, y, cGeode); // Highlight edge
        }

        // 5. The Prismatic Crystal Hook (Pixel-Perfect Curve & Gradient)
        const drawHookSegment = (hx, hy, cColor, cHigh, cShad) => {
            forcePixel(hx, hy, cColor);
            forcePixel(hx - 1, hy, cHigh);
            forcePixel(hx + 1, hy, cShad);
        };

        // Smoothly map the curve coordinates to prevent loose pixels
        const curvePoints = [
            { x: 32, y: 46 }, { x: 32, y: 47 }, { x: 31, y: 48 }, { x: 30, y: 49 },
            { x: 29, y: 50 }, { x: 28, y: 51 }, { x: 26, y: 52 }, { x: 24, y: 52 },
            { x: 22, y: 51 }, { x: 21, y: 50 }, { x: 20, y: 48 }, { x: 20, y: 46 },
            { x: 19, y: 44 }, { x: 19, y: 42 }, { x: 18, y: 40 }, { x: 18, y: 38 }
        ];
        
        curvePoints.forEach((pt, i) => {
            const pct = i / (curvePoints.length - 1);
            let c = cBlue;
            let h = cWhite;
            let s = cGeodeDark;
            
            // Clean spectral transition
            if (pct < 0.25) {
                c = cBlue;
                h = cCyan;
            } else if (pct < 0.6) {
                c = cPurple;
                h = cPink;
            } else if (pct < 0.85) {
                c = cPink;
                h = cWhite;
            } else {
                c = cCyan;
                h = cWhite;
            }
            
            drawHookSegment(pt.x, pt.y, c, h, s);
            
            // Build the crystal barb extending from the curve
            if (i === 11) {
                drawHookSegment(pt.x + 1, pt.y - 1, cPink, cWhite, cGeodeDark);
                drawHookSegment(pt.x + 2, pt.y - 2, cCyan, cWhite, cGeodeDark);
            }
        });

        // 6. Prismatic Star Flares
        const drawStarFlare = (fx, fy, color) => {
            setPixel(fx, fy, cWhite); // Sparkle core
            setPixel(fx - 1, fy, color);
            setPixel(fx + 1, fy, color);
            setPixel(fx, fy - 1, color);
            setPixel(fx, fy + 1, color);
            
            // Soft shadow edge to make it pop
            setPixel(fx - 1, fy - 1, cGeodeDark);
            setPixel(fx + 1, fy - 1, cGeodeDark);
            setPixel(fx - 1, fy + 1, cGeodeDark);
            setPixel(fx + 1, fy + 1, cGeodeDark);
        };
        
        // Structured positioning to frame the hook
        const flares = [
            { x: cx - 14, y: gy - 3,  c: cCyan },
            { x: cx + 12, y: gy + 4,  c: cPink },
            { x: cx - 12, y: gy + 15, c: cPurple },
            { x: cx + 10, y: gy + 22, c: cCyan },
            { x: cx - 8,  y: gy - 12, c: cPink }
        ];
        flares.forEach(f => drawStarFlare(f.x, f.y, f.c));
    }

    // ==========================================
    // MYTHIC LURE 3: THE BRIMSTONE HOOK
    // ==========================================
    else if (lureId === 'brimstone_hook') {
        const cx = 32;
        let cy = 16;
        
        const cWire = '#D97706';      // Copper wire
        const cBasalt = '#1C1917';    // Black basalt
        const cBasaltHigh = '#44403C';
        const cObsidian = '#020617';  // Glossy black
        const cMagma = '#EF4444';     // Red magma
        const cMagmaCore = '#FBBF24'; // Yellow hot center
        
        // 1. Braided Copper Wire
        for (let y = 0; y < 14; y++) {
            setPixel(cx + Math.round(Math.sin(y * 0.8)), y, cWire);
        }

        // 2. Heavy Basalt Weight
        const wY = 18;
        for (let y = -4; y <= 4; y++) {
            const w = 6 - Math.abs(y); // Diamond/chunk shape
            for (let x = -w; x <= w; x++) {
                let c = cBasalt;
                if (x === -w + 1) c = cBasaltHigh; // Edge highlight
                
                // Magma cracks seeping through the rock
                if (rng.chance(0.25)) c = cMagma;
                if (c === cMagma && rng.chance(0.3)) c = cMagmaCore;
                
                setPixel(cx + x, wY + y, c);
            }
        }
        
        // 3. Smoking Obsidian Shank
        const shankEnd = 48;
        for (let y = 23; y <= shankEnd; y++) {
            setPixel(cx, y, cObsidian);
            setPixel(cx - 1, y, cBasaltHigh); // Glint
            setPixel(cx + 1, y, cBasalt);
            
            // Smoke particles rising off the hot shank
            if (rng.chance(0.15)) {
                setPixel(cx + rng.pick([-3, -2, 2, 3]), y - rng.int(1, 4), '#44403C');
            }
        }

        // 4. The Heated Magma Barb
        // Curves left and up
        for (let i = 0; i <= 8; i++) {
            const hx = cx - i;
            const hy = shankEnd + Math.round(Math.sin(i * 0.4) * 4);
            
            let c = cMagma;
            if (i > 4) c = cMagmaCore; // Gets hotter near the tip
            
            forcePixel(hx, hy, c);
            forcePixel(hx, hy - 1, cMagma);
            forcePixel(hx + 1, hy, cBasalt); // Obsidian backing
        }
        
        // Glowing hot tip & Inner barb
        forcePixel(cx - 8, shankEnd + 1, '#FFFFFF'); // White hot tip
        forcePixel(cx - 6, shankEnd + 1, cMagmaCore);
        forcePixel(cx - 5, shankEnd, cMagma);

        // 5. Bubbling ambient heat in the water
        for (let i = 0; i < 20; i++) {
            const bx = cx + rng.int(-15, 15);
            const by = wY + rng.int(-5, 35);
            if (!grid[by][bx]) {
                setPixel(bx, by, rng.chance(0.5) ? cMagma : cMagmaCore);
            }
        }
    }

    // ==========================================
    // OUTLINE & RENDER
    // ==========================================
    const outlineGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === null) {
                const n = y > 0 ? grid[y - 1][x] : null;
                const s = y < GRID_SIZE - 1 ? grid[y + 1][x] : null;
                const w = x > 0 ? grid[y][x - 1] : null;
                const e = x < GRID_SIZE - 1 ? grid[y][x + 1] : null;
                
                const isSolid = (val) => val !== null && val !== '#4ADE80' && val !== '#BEF264'; // Don't outline glows
                
                if (isSolid(n) || isSolid(s) || isSolid(w) || isSolid(e)) outlineGrid[y][x] = '#020617'; 
            }
        }
    }

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            let colorCode = grid[y][x];
            if (!colorCode && outlineGrid[y][x]) colorCode = outlineGrid[y][x];
            
            // Glows punch through
            if (grid[y][x] === '#4ADE80' || grid[y][x] === '#BEF264') colorCode = grid[y][x];
            
            if (colorCode) drawScaledRect(ctx, x, y, 1, 1, colorCode, DISPLAY_SCALE);
        }
    }

    return { imageDataUrl: offscreenCanvas.toDataURL() };
}