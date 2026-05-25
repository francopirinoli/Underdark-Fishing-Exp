/**
 * js/art/boss_generator.js
 * Generates bespoke, highly detailed pixel art for Mythic Biome Bosses.
 * V4 - Flawless Anatomy for the Geode Monarch (Crystal Crab).
 */

import { drawScaledRect } from '../util/utils.js';

const GRID_SIZE = 64;
const DISPLAY_SCALE = 4;
const CANVAS_SIZE = GRID_SIZE * DISPLAY_SCALE;

export function generateBossArt(options = {}) {
    const bossId = options.bossId;
    const rng = options.rng; 
    const phase = options.phase || 1; // Tracks combat state for palettes
    
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = CANVAS_SIZE;
    offscreenCanvas.height = CANVAS_SIZE;
    const ctx = offscreenCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

    function setPixel(x, y, colorCode) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
            if (!grid[y][x] || grid[y][x] === 'AMBIENT') grid[y][x] = colorCode;
        }
    }

    function forcePixel(x, y, colorCode) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) grid[y][x] = colorCode;
    }

    // ==========================================
    // BOSS 1: VESPER-BLOOM LEVIATHAN (Fungal)
    // ==========================================
    if (bossId === 'vesper_bloom_leviathan') {
        const cx = 32, cy = 34;
        
        let pal;
        if (phase === 1) { 
            pal = { base: '#64748B', shad: '#334155', dark: '#0F172A', pale: '#CBD5E1', bone: '#E2E8F0', glow: '#2DD4BF', glowDark: '#0F766E', stalk: '#E5E7EB', cap: '#166534', spore: '#BEF264', tooth: '#FEF08A', mouth: '#000000' };
        } else if (phase === 2) { 
            pal = { base: '#475569', shad: '#1E293B', dark: '#020617', pale: '#94A3B8', bone: '#FDE68A', glow: '#FBBF24', glowDark: '#B45309', stalk: '#D4D4D8', cap: '#7C2D12', spore: '#F97316', tooth: '#FEF08A', mouth: '#000000' };
        } else { 
            pal = { base: '#94A3B8', shad: '#475569', dark: '#1E293B', pale: '#F1F5F9', bone: '#F3E8FF', glow: '#F472B6', glowDark: '#BE185D', stalk: '#F5F3FF', cap: '#4C1D95', spore: '#E879F9', tooth: '#FFFFFF', mouth: '#000000' };
        }
        
        const { base: cBase, shad: cShad, dark: cDark, pale: cPale, bone: cBone, glow: cGlow, glowDark: cGlowDark, stalk: cStalk, cap: cCap, spore: cSpore, tooth: cTooth, mouth: cMouth } = pal;

        const frontLen = 28;
        const backLen = 26;

        // Tail
        const tailStartX = -18;
        for (let x = -32; x <= tailStartX; x++) {
            const spread = Math.floor((tailStartX - x) * 1.3) + 3;
            for (let y = -spread; y <= spread; y++) {
                if (x < -28 && rng.chance(0.4)) continue; 
                let c = cShad;
                if (y % 4 === 0) c = cDark;
                if (Math.abs(y) >= spread - 1) c = cGlow;
                setPixel(cx + x, cy + y, c);
            }
        }

        // Body & Jaw
        for (let x = -backLen; x <= frontLen; x++) {
            const t = (x + backLen) / (frontLen + backLen);
            let topY = Math.sin(t * Math.PI) * 16;
            let botY = Math.sin(t * Math.PI) * 16;
            
            if (x > 6) {
                topY += (x - 6) * 0.15; 
                botY += (x - 6) * 0.45; 
            }
            topY = Math.round(topY);
            botY = Math.round(botY);
            
            let mouthOpenY = null;
            let mouthCloseY = null;
            
            if (x > 12) {
                const gap = (x - 12) * 0.65;
                mouthOpenY = Math.round(3 - gap);     
                mouthCloseY = Math.round(3 + gap * 0.5);
                if (mouthOpenY < -topY + 5) mouthOpenY = -topY + 5;
                if (mouthCloseY > botY - 5) mouthCloseY = botY - 5;
            }
            
            let isUpperJaw = x <= 20; 

            for (let y = -topY; y <= botY; y++) {
                if (!isUpperJaw && y < mouthCloseY) {
                    if (y === mouthCloseY - 1 && x % 4 === 0) forcePixel(cx + x, cy + y, cTooth);
                    if (y === mouthCloseY - 2 && x % 4 === 0) forcePixel(cx + x, cy + y, cTooth);
                    continue; 
                }
                
                let c = cBase;
                let isMouth = (x > 12 && y >= mouthOpenY && y <= mouthCloseY && isUpperJaw);
                
                if (isMouth) {
                    c = cMouth; 
                    if (y <= mouthOpenY + 2 && x % 4 === 2) c = cTooth;
                    if (y >= mouthCloseY - 1 && x % 4 === 0) c = cTooth;
                } else {
                    if (y > botY - 3) c = cShad;
                    if (y > botY - 1) c = cDark;
                    if (y > 0 && y < botY - 3 && t > 0.2 && t < 0.7 && x < 12) c = cPale;
                    if (!isUpperJaw && y === mouthCloseY) c = cBone; 
                    if (isUpperJaw && y === mouthOpenY) c = cShad;   
                    if (rng.chance(0.08) && y > -topY + 2 && y < botY - 2 && !isMouth) c = cShad;
                    
                    const veinY = Math.sin(x * 0.3) * 5;
                    if (Math.abs(y - veinY) < 1.5 && x < 8) {
                        c = rng.chance(0.7) ? cGlow : cGlowDark;
                    }
                }
                setPixel(cx + x, cy + y, c);
            }

            if (x > -4 && x <= 20) {
                for (let y = -topY; y <= -topY + 3; y++) {
                    forcePixel(cx + x, cy + y, cBone);
                    if ((x + y) % 5 === 0 && rng.chance(0.5)) forcePixel(cx + x, cy + y, cShad);
                }
            }
        }

        // Eyes
        const eyeX = cx + 11;
        const eyeY = cy - 4; 
        forcePixel(eyeX, eyeY, cSpore); forcePixel(eyeX + 1, eyeY, '#FFFFFF');
        forcePixel(eyeX + 3, eyeY + 2, cSpore); forcePixel(eyeX + 4, eyeY + 2, '#FFFFFF');
        forcePixel(eyeX - 2, eyeY + 2, cSpore);

        // Mushroom Forest
        const shrooms = [-10, -2, 6]; 
        for (let sx of shrooms) {
            const t = (sx + backLen) / (frontLen + backLen);
            let rootY = cy - Math.round(Math.sin(t * Math.PI) * 16);
            if (sx > 6) rootY -= Math.round((sx - 6) * 0.15);
            
            const h = rng.int(10, 16); 
            const capW = rng.int(5, 8); 
            const sway = rng.int(-2, 2);
            
            for (let sy = 0; sy < h; sy++) {
                const bend = Math.round(sy * 0.15) * Math.sign(sway || 1); 
                forcePixel(cx + sx + bend - 1, rootY - sy, cBone);  
                forcePixel(cx + sx + bend, rootY - sy, cBase);      
                forcePixel(cx + sx + bend + 1, rootY - sy, cShad);  
            }
            
            const capX = cx + sx + Math.round(h * 0.15) * Math.sign(sway || 1);
            const capY = rootY - h;
            for (let cy_off = -4; cy_off <= 1; cy_off++) {
                const cw = capW - Math.abs(cy_off + 1); 
                for (let cx_off = -cw; cx_off <= cw; cx_off++) {
                    if (cy_off === 1) forcePixel(capX + cx_off, capY + cy_off, cDark); 
                    else {
                        let c = cCap; 
                        if (cx_off < -cw/2 || cy_off < -2) c = cSpore; 
                        if (rng.chance(0.15)) c = cGlow; 
                        forcePixel(capX + cx_off, capY + cy_off, c);
                    }
                }
            }
        }

        // Pectoral Fin
        const pecX = cx + 2; 
        const pecY = cy + 12;
        for (let l = 0; l < 16; l++) {
            const fw = 3 + Math.floor(l/3); 
            for (let fx = -fw; fx <= fw; fx++) {
                if (rng.chance(0.2)) continue; 
                let c = cShad;
                if (fx % 4 === 0) c = cBase;
                if (l > 12) c = cGlow;
                
                const sweep = Math.floor(l * 1.3); 
                forcePixel(pecX + fx - sweep, pecY + l, c);
            }
        }

        // Ambient Spores
        for (let i = 0; i < 40; i++) {
            const px = rng.int(2, GRID_SIZE - 2);
            const py = rng.int(2, cy + 5); 
            if (!grid[py][px]) {
                grid[py][px] = 'AMBIENT';
                forcePixel(px, py, rng.chance(0.6) ? cSpore : cGlow);
            }
        }
    }

// ==========================================
    // BOSS 2: THE GEODE MONARCH (Crystal)
    // ==========================================
    else if (bossId === 'geode_monarch') {
        const cx = 32, cy = 30; // Shifted up slightly to accommodate huge claws and legs
        
        // 3-Phase Dynamic Palette
        let pal;
        if (phase === 1) { // Sapphire/Amethyst
            pal = { shell: '#1E3A8A', dark: '#0F172A', high: '#60A5FA', crys1: '#818CF8', crys2: '#C084FC', glow: '#38BDF8', eye: '#22D3EE' };
        } else if (phase === 2) { // Ruby/Topaz
            pal = { shell: '#7F1D1D', dark: '#450A0A', high: '#FCA5A5', crys1: '#F59E0B', crys2: '#EF4444', glow: '#FDE047', eye: '#FEF08A' };
        } else { // Diamond/Pink (Second Wind)
            pal = { shell: '#E2E8F0', dark: '#64748B', high: '#FFFFFF', crys1: '#F472B6', crys2: '#2DD4BF', glow: '#E879F9', eye: '#FFFFFF' };
        }
        
        const { shell, dark, high, crys1, crys2, glow, eye } = pal;

        // --- HELPER: Segmented, Thick Crab Legs ---
        const drawLeg = (baseX, baseY, angleOut, isBackLayer) => {
            const cBase = isBackLayer ? dark : shell;
            const cDark = dark;
            const cHigh = isBackLayer ? shell : high;
            
            let px = baseX, py = baseY;
            
            // Joint 1: Coxa/Thigh (Thick, 3px wide, angled outwards)
            for (let i = 0; i < 8; i++) {
                px += angleOut;
                py -= 0.8;
                const rx = Math.round(px);
                const ry = Math.round(py);
                forcePixel(rx - 1, ry, cHigh);
                forcePixel(rx, ry, cBase);
                forcePixel(rx + 1, ry, cDark);
            }
            
            // Joint Cap (Knee)
            const kx = Math.round(px);
            const ky = Math.round(py);
            forcePixel(kx, ky, isBackLayer ? dark : crys1);
            forcePixel(kx, ky - 1, isBackLayer ? dark : glow);
            forcePixel(kx - 1, ky, cDark);
            forcePixel(kx + 1, ky, cDark);
            
            // Joint 2: Tibia (Thick, plunging downwards to a point)
            px = kx;
            py = ky;
            for (let i = 0; i < 16; i++) {
                px += angleOut * 0.35;
                py += 1.25;
                const rx = Math.round(px);
                const ry = Math.round(py);
                let c = i > 12 ? cHigh : cBase;
                
                forcePixel(rx, ry, c);
                forcePixel(rx - 1, ry, cDark);
                // Thicken the upper half of the lower leg segment so it looks robust
                if (i < 11) {
                    forcePixel(rx + 1, ry, cBase);
                    forcePixel(rx + 2, ry, cDark);
                }
            }
        };

        // --- HELPER: Diamond-Shaped Crystal Spines ---
        const drawSpine = (px, py, h, w) => {
            for (let y = 0; y < h; y++) {
                const progress = y / h;
                const curW = Math.max(1, Math.round(w * Math.sin(progress * Math.PI)));
                for (let x = -curW; x <= curW; x++) {
                    let c = x < 0 ? crys1 : crys2;
                    if (x === 0) c = high;
                    if (y > h - 3) c = glow; // Glowing tip
                    forcePixel(px + x, py - y, c);
                }
                // Under-shadow for 3D depth against other spines
                forcePixel(px - curW - 1, py - y, dark);
                forcePixel(px + curW + 1, py - y, dark);
            }
        };

        // --- HELPER: Massive, Stylized Pincer Claws ---
        const drawPincer = (basex, basey, isFront) => {
            const cBase = isFront ? shell : dark;
            const cDark = dark;
            const cHigh = isFront ? high : shell;
            
            // 1. Arm segment (Thick, 3px wide and cleanly angled)
            let ax = basex, ay = basey;
            for (let i = 0; i < 10; i++) {
                ax += 1;
                ay -= 0.5;
                const ry = Math.round(ay);
                forcePixel(ax, ry - 1, cHigh);
                forcePixel(ax, ry, cBase);
                forcePixel(ax, ry + 1, cDark);
            }
            
            const clawX = Math.round(ax) + 2;
            const clawY = Math.round(ay) + 1;
            
            // 2. Bulbous Main Joint (Clean octagon/shield shape)
            const cw = 7;
            for (let y = -7; y <= 7; y++) {
                const w = cw - Math.floor(Math.abs(y) * 0.5);
                for (let x = -w; x <= w; x++) {
                    let c = isFront ? crys1 : dark;
                    if (isFront) {
                        if (x < -2) c = high;
                        if (x > 2) c = dark;
                        if ((x + y) % 3 === 0) c = glow;
                    }
                    forcePixel(clawX + x, clawY + y, c);
                }
            }
            // Outline the bulbous base for separation
            for (let y = -7; y <= 7; y++) {
                const w = cw - Math.floor(Math.abs(y) * 0.5);
                forcePixel(clawX - w - 1, clawY + y, cDark);
                forcePixel(clawX + w + 1, clawY + y, cDark);
            }
            
            // 3. Scissors (Upper & Lower Pincers)
            // Upper Pincer: Curves down elegantly
            for (let i = 0; i < 16; i++) {
                const px = clawX + 5 + i;
                const py = clawY - 3 - Math.floor(Math.sin((i / 15) * Math.PI) * 4);
                const w = Math.max(2, 4 - Math.floor(i / 3)); // tapered thickness
                for (let j = 0; j < w; j++) {
                    forcePixel(px, py + j, isFront ? high : dark);
                }
                // Under-edge shadow to define the claw closure
                forcePixel(px, py + w, cDark);
            }
            
            // Lower Pincer: Shorter, straight, separated by a distinct black shadow gap
            for (let i = 0; i < 12; i++) {
                const px = clawX + 5 + i;
                const py = clawY + 4 + Math.floor(i * 0.35);
                const w = Math.max(1, 3 - Math.floor(i / 3));
                for (let j = 0; j < w; j++) {
                    forcePixel(px, py + j, isFront ? crys2 : dark);
                }
                // Upper-edge shadow to define the gap
                forcePixel(px, py - 1, cDark);
            }
        };

        // --- 1. BACKGROUND LAYER (Left Legs & Left Claw) ---
        drawLeg(cx - 10, cy + 2, -1.2, true);
        drawLeg(cx + 2,  cy + 2,  0,    true);
        drawPincer(cx + 12, cy - 4, false); // Hidden behind face

        // --- 2. THE GEODE CARAPACE ---
        // A thick, craggy dome with a recessed cavity exposing internal crystals
        for (let x = -24; x <= 18; x++) {
            const t = (x + 24) / 42;
            const topY = Math.round(Math.sin(t * Math.PI) * 18);
            const botY = Math.round(Math.sin(t * Math.PI) * 6);
            
            for(let y = -topY; y <= botY; y++) {
                let c = shell;
                
                // Rocky exterior shading
                if (y > botY - 3 || x > 12) c = dark;
                if (y < -topY + 3 && x < 10) c = high;
                
                // Hand-crafted craggy lines instead of random noise
                if (x === -12 || x === 0 || x === 8) {
                    if (y > -topY + 3 && y < botY - 3) c = dark; 
                }
                
                // The Exposed Geode Core (A crater on the side)
                const distToCore = Math.hypot(x - (-4), y - (-4));
                if (distToCore < 10) {
                    if (distToCore > 8) {
                        c = dark; // The thick crust border
                    } else {
                        // The vibrant inner crystal facets
                        c = (x+y) % 2 === 0 ? crys1 : crys2;
                        if ((x*y) % 3 === 0) c = glow;
                        if (x === y) c = high;
                    }
                }
                
                setPixel(cx + x, cy + y, c);
            }
        }

        // --- 3. THE BACK SPINES ---
        for (let x = -18; x <= 12; x += 8) {
            const t = (x + 24) / 42;
            const basePy = cy - Math.round(Math.sin(t * Math.PI) * 18);
            drawSpine(cx + x, basePy, rng.int(10, 16), rng.int(3, 5));
        }

        // --- 4. THE FACE / EYES ---
        // Tucked under the heavy front brow
        const faceX = cx + 16;
        for(let y = cy - 2; y <= cy + 5; y++) {
            forcePixel(faceX, y, dark);
            forcePixel(faceX + 1, y, dark);
            forcePixel(faceX + 2, y, dark);
        }
        
        // 4 Glowing compound eyes nested in the dark
        forcePixel(faceX + 3, cy, eye); forcePixel(faceX + 4, cy, '#FFFFFF');
        forcePixel(faceX + 1, cy + 2, eye); forcePixel(faceX + 2, cy + 2, '#FFFFFF');
        forcePixel(faceX + 4, cy + 3, eye);
        forcePixel(faceX + 2, cy + 4, eye); 

        // --- 5. FOREGROUND LAYER (Right Legs & Right Claw) ---
        drawLeg(cx - 16, cy + 4, -1.5, false);
        drawLeg(cx - 4,  cy + 6, -0.5, false);
        drawLeg(cx + 8,  cy + 6,  0.5, false);

        drawPincer(cx + 6, cy + 2, true);

        // --- 6. PRISMATIC AMBIENT LASERS ---
        for (let i = 0; i < 25; i++) {
            const px = rng.int(5, GRID_SIZE - 5);
            const py = rng.int(5, cy + 10);
            if (!grid[py][px]) {
                grid[py][px] = 'AMBIENT';
                forcePixel(px, py, glow);
                
                // Draw a horizontal or vertical light streak resembling a lens flare
                if (rng.chance(0.5)) {
                    forcePixel(px - 1, py, crys1); 
                    forcePixel(px + 1, py, crys1);
                } else {
                    forcePixel(px, py - 1, crys2); 
                    forcePixel(px, py + 1, crys2);
                }
            }
        }
    }

    // ==========================================
    // UNIVERSAL OUTLINE PASS & RENDER
    // ==========================================
    const outlineGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const current = grid[y][x] === 'AMBIENT' ? null : grid[y][x];
            
            if (current === null) {
                const n = y > 0 ? grid[y - 1][x] : null;
                const s = y < GRID_SIZE - 1 ? grid[y + 1][x] : null;
                const w = x > 0 ? grid[y][x - 1] : null;
                const e = x < GRID_SIZE - 1 ? grid[y][x + 1] : null;
                
                const isSolid = (val) => val !== null && val !== 'AMBIENT' && val !== '#2DD4BF' && val !== '#BEF264' && val !== '#FBBF24' && val !== '#F97316' && val !== '#F472B6' && val !== '#E879F9' && val !== '#38BDF8' && val !== '#FFFFFF' && val !== '#22D3EE' && val !== '#FEF08A';
                
                if (isSolid(n) || isSolid(s) || isSolid(w) || isSolid(e)) outlineGrid[y][x] = '#020617'; 
            }
        }
    }

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            let colorCode = grid[y][x] === 'AMBIENT' ? null : grid[y][x];
            if (!colorCode && outlineGrid[y][x]) colorCode = outlineGrid[y][x];
            
            // Allow all glow colors from all bosses to punch through the black outlines
            const glowColors = ['#BEF264', '#2DD4BF', '#FBBF24', '#F97316', '#F472B6', '#E879F9', '#38BDF8', '#FFFFFF', '#22D3EE', '#FEF08A'];
            if (glowColors.includes(grid[y][x])) colorCode = grid[y][x];
            
            if (colorCode) drawScaledRect(ctx, x, y, 1, 1, colorCode, DISPLAY_SCALE);
        }
    }

    return { imageDataUrl: offscreenCanvas.toDataURL() };
}