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