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