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
    // MYTHIC LURE 4: THE GLACIAL HOOK
    // ==========================================
    else if (lureId === 'glacial_hook') {
        const cx = 32;
        let cy = 16;
        
        const cSilk = '#F8FAFC';      // White silk line
        const cIceDark = '#0284C7';   // Deep blue ice shadow
        const cIceMid = '#38BDF8';    // Mid ice
        const cIceLight = '#BAE6FD';  // Bright frost
        const cIceCore = '#075985';   // Internal frozen shadow
        const cSnow = '#FFFFFF';      // Pure snow
        const cHook = '#94A3B8';      // Frozen steel
        const cHookShad = '#334155';
        
        // 1. Silk Line (Taut and frozen straight)
        for (let y = 0; y < 12; y++) {
            setPixel(cx, y, cSilk);
            if (rng.chance(0.3)) setPixel(cx - 1, y, cIceLight); // Frost building on the line
        }

        // 2. The Translucent Ice Cube (Weight)
        // We build a distinct isometric hexagon to simulate a 3D translucent cube
        const bY = 20;
        const cubeR = 9;
        for (let y = -cubeR; y <= cubeR; y++) {
            const w = cubeR - Math.floor(Math.abs(y) * 0.5); 
            for (let x = -w; x <= w; x++) {
                let c = cIceMid;
                
                // Isometric Faces
                if (y < -cubeR * 0.3) c = cIceLight; // Top face catching light
                else if (x < 0) c = cIceMid;         // Left face
                else c = cIceDark;                   // Right face in shadow
                
                // Translucency: Darker inner core visible through the ice
                if (Math.abs(x) <= 3 && y > -cubeR * 0.2 && y < cubeR * 0.6) {
                    c = cIceCore;
                    // Draw the faint shadow of the metal hook passing through the center
                    if (x === 0 || x === 1) c = cHookShad;
                }
                
                // Crystalline Edges & Fractures
                if (x === -w || x === w || y === cubeR || (x === 0 && y >= -cubeR * 0.3)) {
                    c = cIceLight; // Catching light on the sharp geometric corners
                }
                
                // Internal stress fractures
                if ((x * y) % 11 === 0 && y > 0) c = cSnow;

                // Snow accumulation heavily packed on the top surfaces
                if (y < -cubeR * 0.6 || (y < -cubeR * 0.2 && rng.chance(0.5)) || (y === -cubeR * 0.3 && x === 0)) {
                    c = cSnow;
                }

                setPixel(cx + x, bY + y, c);
            }
        }
        
        // 3. Frozen Metal Shank
        const shankEnd = 45;
        for (let y = Math.floor(bY + cubeR); y <= shankEnd; y++) {
            setPixel(cx, y, cHook);
            setPixel(cx + 1, y, cHookShad);
            
            // Thick rime ice clinging to the metal
            if (rng.chance(0.6)) setPixel(cx - 1, y, cIceLight);
            if (rng.chance(0.3)) setPixel(cx - 2, y, cSnow);
        }

        // 4. The Angular Crystalline Barb
        // Uses sharp, geometric lines instead of a smooth curve
        const drawIceShard = (x, y, c) => {
            forcePixel(x, y, c);
            forcePixel(x, y - 1, cIceLight);
            forcePixel(x + 1, y, cIceDark);
        };

        // Segment 1: Down and Left
        for (let i = 0; i <= 4; i++) {
            drawIceShard(cx - i, shankEnd + Math.floor(i * 0.5), cHook);
            forcePixel(cx - i, shankEnd + Math.floor(i * 0.5) + 1, cIceDark); // Thick ice encasement
        }
        // Segment 2: Flat Left
        for (let i = 5; i <= 8; i++) {
            drawIceShard(cx - i, shankEnd + 2, cHook);
            forcePixel(cx - i, shankEnd + 3, cIceDark);
        }
        // Segment 3: Sharp Upward Spike
        for (let i = 0; i <= 6; i++) {
            forcePixel(cx - 8, shankEnd + 2 - i, cIceMid);
            forcePixel(cx - 9, shankEnd + 2 - i, cIceLight);
            forcePixel(cx - 7, shankEnd + 2 - i, cIceDark);
            
            // The metal core stops early, the rest is pure sharp ice
            if (i < 3) forcePixel(cx - 8, shankEnd + 2 - i, cHook); 
        }
        
        // Piercing Tip
        forcePixel(cx - 9, shankEnd - 5, cSnow);
        forcePixel(cx - 8, shankEnd - 6, cSnow);

        // 5. Frost Aura (Vaporizing cold air)
        for (let i = 0; i < 40; i++) {
            const bx = cx + rng.int(-22, 22);
            const by = bY + rng.int(-15, 35);
            if (!grid[by][bx]) {
                const particleColor = rng.chance(0.4) ? cSnow : (rng.chance(0.5) ? cIceLight : cIceMid);
                setPixel(bx, by, particleColor);
            }
        }
    }
    
    // ==========================================
    // MYTHIC LURE 5: THE SINGULARITY HOOK
    // ==========================================
    else if (lureId === 'singularity_hook') {
        const cx = 32;
        let cy = 16;
        
        const cLine = '#A855F7';      // Violet energy thread
        const cShank = '#020617';     // Absolute black obsidian
        const cShankHigh = '#1E1B4B'; // Indigo glare
        const cGlow = '#C084FC';      // Lavender gravity ripples
        const cWhite = '#FFFFFF';     // White-hot core
        const cCyan = '#22D3EE';      // Cyan starlight

        // 1. BRAIDED CELESTIAL LINE
        const lineYEnd = 16;
        for (let y = 0; y < lineYEnd; y++) {
            const wave1 = Math.round(Math.sin(y * 0.8) * 1.5);
            const wave2 = Math.round(Math.cos(y * 0.8) * 1.5);
            setPixel(cx + wave1, y, cLine);
            setPixel(cx + wave2, y, '#FBBF24'); // Interwoven gold
            setPixel(cx + Math.round((wave1 + wave2)/2), y, cShank); // Core line
        }
        
        // Detailed Gold-Banded Stone Eyelet
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                if (Math.hypot(dx, dy) <= 3 && Math.hypot(dx, dy) >= 1.2) {
                    setPixel(cx + dx, lineYEnd + dy, cShankHigh);
                    if (dx === 0 || dy === 0) setPixel(cx + dx, lineYEnd + dy, '#FBBF24'); // Gold bands
                }
            }
        }

        // 2. CONCENTRIC ELLIPTICAL GRAVITY RIPPLES
        // These draw on the background layers before the core and shank are placed on top
        const rippleCount = 3;
        const ripplePals = ['rgba(34, 211, 238, 0.45)', 'rgba(168, 85, 247, 0.3)', 'rgba(192, 132, 252, 0.15)'];
        const coreY = 24;
        
        for (let rIdx = 0; rIdx < rippleCount; rIdx++) {
            const rX = 14 + rIdx * 6;
            const rY = 8 + rIdx * 3;
            const rColor = ripplePals[rIdx];
            
            for (let a = 0; a < 360; a += 8) {
                const rad = a * Math.PI / 180;
                // Add minor wave distortion to represent gravitational warps
                const warp = Math.sin(a * 6 * (Math.PI / 180)) * 1.5;
                const rx = Math.round(cx + Math.cos(rad) * (rX + warp));
                const ry = Math.round(coreY + Math.sin(rad) * (rY + warp));
                
                if (rx >= 0 && rx < GRID_SIZE && ry >= 0 && ry < GRID_SIZE) {
                    setPixel(rx, ry, rColor);
                }
            }
        }

        // 3. THE CLOCKWORK GYROSCOPE SINGULARITY (Weight)
        const coreR = 8;
        // Inner Swirling Black Hole
        for (let y = -coreR; y <= coreR; y++) {
            const w = Math.floor(coreR * Math.sqrt(1 - (y*y)/(coreR*coreR || 1)));
            for (let x = -w; x <= w; x++) {
                let c = cShankHigh;
                if (x === 0 && y === 0) c = cWhite; // Singularity spark
                else if (Math.abs(x) <= 2 && Math.abs(y) <= 2) c = cCyan; // Cyan accretion disk
                else if ((x + y) % 3 === 0) c = cLine; // Swirling gravity arms
                else if ((x - y) % 4 === 0) c = cShad_dummy(); // Void gaps
                setPixel(cx + x, coreY + y, c);
            }
        }
        function cShad_dummy() { return '#020617'; }

        // Outer Gyroscope Cage (Gold & Steel)
        for (let a = 0; a < 360; a += 15) {
            const rad = a * Math.PI / 180;
            const rx1 = Math.round(cx + Math.cos(rad) * (coreR + 1));
            const ry1 = Math.round(coreY + Math.sin(rad) * (coreR + 1));
            setPixel(rx1, ry1, '#FBBF24'); // Outer Gold Ring
            
            const rx2 = Math.round(cx + Math.cos(rad) * (coreR - 2));
            const ry2 = Math.round(coreY + Math.sin(rad) * (coreR - 2));
            setPixel(rx2, ry2, '#94A3B8'); // Inner Steel Ring
        }

        // 4. THE JAGGED ENERGY-INFUSED SHANK
        const shankStart = coreY + coreR + 1;
        const shankEnd = 46;
        for (let y = shankStart; y <= shankEnd; y++) {
            const jg = Math.round(Math.sin(y * 0.45) * 0.6); // Jagged shear offset
            
            // Obsidian shell
            setPixel(cx + jg - 1, y, cShank);
            setPixel(cx + jg, y, cShankHigh);
            setPixel(cx + jg + 1, y, cShank);
            
            // Glowing energy leaks
            if (y % 4 === 0) {
                forcePixel(cx + jg, y, cCyan); // Cyan light bleed
                forcePixel(cx + jg - 1, y, cLine);
            } else if (y % 4 === 2) {
                forcePixel(cx + jg, y, cGlow);  // Lavender light bleed
            }
        }

        // 5. THE CRYSTALLIZED VOID SICKLE (Hook Curve)
        const hookP0 = { x: cx, y: shankEnd };
        const hookP1 = { x: cx - 18, y: shankEnd + 8 }; // Far left curve
        const hookP2 = { x: cx - 12, y: shankEnd - 6 }; // Sweeping up to the tip

        const hSteps = 28;
        for (let i = 0; i <= hSteps; i++) {
            const t = i / hSteps;
            const hx = Math.round(Math.pow(1-t, 2)*hookP0.x + 2*(1-t)*t*hookP1.x + Math.pow(t, 2)*hookP2.x);
            const hy = Math.round(Math.pow(1-t, 2)*hookP0.y + 2*(1-t)*t*hookP1.y + Math.pow(t, 2)*hookP2.y);
            
            const r = Math.max(1.0, 3.5 * (1.0 - t * 0.7)); // Tapering hook blade thickness

            for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
                const hw = Math.floor(Math.sqrt(r*r - dy*dy));
                for (let dx = -hw; dx <= hw; dx++) {
                    let c = cShank;
                    if (dy < 0) c = cShankHigh; // Base shading
                    if (dx === -hw && dy === -Math.ceil(r) + 1) c = cCyan; // Glowing cutting edge
                    
                    forcePixel(hx + dx, hy + dy, c);
                }
            }

            // High-intensity star flash at the barb tip
            if (i === hSteps) {
                forcePixel(hx, hy, cWhite);
                forcePixel(hx - 1, hy, cCyan);
                forcePixel(hx + 1, hy, cCyan);
                forcePixel(hx, hy - 1, cCyan);
                forcePixel(hx, hy + 1, cCyan);
            }
        }

        // 6. THE EVENT HORIZON SINK (Localized Black Hole)
        // Positioned at the apex curve of the hook
        const voidX = Math.round(Math.pow(0.5, 2)*hookP0.x + 2*0.5*0.5*hookP1.x + Math.pow(0.5, 2)*hookP2.x);
        const voidY = Math.round(Math.pow(0.5, 2)*hookP0.y + 2*0.5*0.5*hookP1.y + Math.pow(0.5, 2)*hookP2.y);
        const voidR = 4;
        
        for (let dy = -voidR; dy <= voidR; dy++) {
            const vw = Math.floor(voidR * Math.sqrt(1 - (dy*dy)/(voidR*voidR || 1)));
            for (let dx = -vw; dx <= vw; dx++) {
                forcePixel(voidX + dx, voidY + dy, '#000000'); // Pure void core
                if (Math.abs(dx) === vw || Math.abs(dy) === voidR) {
                    forcePixel(voidX + dx, voidY + dy, 'rgba(168, 85, 247, 0.45)'); // Lavender distortion boundary
                }
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