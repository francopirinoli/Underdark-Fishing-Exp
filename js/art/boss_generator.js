/**
 * js/art/boss_generator.js
 * Generates bespoke, highly detailed pixel art for Mythic Biome Bosses.
 * V3 - Completely Overhauled Organic Anatomy, Armored Underbite, and 3-Phase Palettes.
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
        
        // 3-Phase Dynamic Palette
        let pal;
        if (phase === 1) { // Normal
            pal = { base: '#64748B', shad: '#334155', dark: '#0F172A', pale: '#CBD5E1', bone: '#E2E8F0', glow: '#2DD4BF', glowDark: '#0F766E', stalk: '#E5E7EB', cap: '#166534', spore: '#BEF264', tooth: '#FEF08A', mouth: '#000000' };
        } else if (phase === 2) { // Enraged (Toxic Yellow/Orange)
            pal = { base: '#475569', shad: '#1E293B', dark: '#020617', pale: '#94A3B8', bone: '#FDE68A', glow: '#FBBF24', glowDark: '#B45309', stalk: '#D4D4D8', cap: '#7C2D12', spore: '#F97316', tooth: '#FEF08A', mouth: '#000000' };
        } else { // Second Wind (Hyper-glowing Purple/Pink)
            pal = { base: '#94A3B8', shad: '#475569', dark: '#1E293B', pale: '#F1F5F9', bone: '#F3E8FF', glow: '#F472B6', glowDark: '#BE185D', stalk: '#F5F3FF', cap: '#4C1D95', spore: '#E879F9', tooth: '#FFFFFF', mouth: '#000000' };
        }
        
        const { base: cBase, shad: cShad, dark: cDark, pale: cPale, bone: cBone, glow: cGlow, glowDark: cGlowDark, stalk: cStalk, cap: cCap, spore: cSpore, tooth: cTooth, mouth: cMouth } = pal;

        const frontLen = 28;
        const backLen = 26;

        // --- 1. RAGGED FAN TAIL ---
        const tailStartX = -18;
        for (let x = -32; x <= tailStartX; x++) {
            const spread = Math.floor((tailStartX - x) * 1.3) + 3;
            for (let y = -spread; y <= spread; y++) {
                if (x < -28 && rng.chance(0.4)) continue; // Tattered edge
                let c = cShad;
                if (y % 4 === 0) c = cDark;
                if (Math.abs(y) >= spread - 1) c = cGlow;
                setPixel(cx + x, cy + y, c);
            }
        }

        // --- 2. MAIN BODY & STRUCTURED JAW ---
        for (let x = -backLen; x <= frontLen; x++) {
            const t = (x + backLen) / (frontLen + backLen);
            
            // Heavy Torpedo Base
            let topY = Math.sin(t * Math.PI) * 16;
            let botY = Math.sin(t * Math.PI) * 16;
            
            // Deform into a massive, blunt head
            if (x > 6) {
                topY += (x - 6) * 0.15; // Forehead stays high and thick
                botY += (x - 6) * 0.45; // Heavy sagging throat
            }
            
            topY = Math.round(topY);
            botY = Math.round(botY);
            
            // Define the Mouth Cavity Wedge
            let mouthOpenY = null;
            let mouthCloseY = null;
            
            // The mouth hinge starts at x = 12
            if (x > 12) {
                const gap = (x - 12) * 0.65; // How fast the mouth opens
                mouthOpenY = Math.round(3 - gap);     // Upper lip curves up
                mouthCloseY = Math.round(3 + gap * 0.5); // Lower jaw drops slightly
                
                // Clamp it so lips don't break through the top/bottom of the head
                if (mouthOpenY < -topY + 5) mouthOpenY = -topY + 5;
                if (mouthCloseY > botY - 5) mouthCloseY = botY - 5;
            }
            
            // The upper skull ends at x = 20, but the lower jaw extends to x = 28 (Massive Underbite)
            let isUpperJaw = x <= 20; 

            for (let y = -topY; y <= botY; y++) {
                
                // If we are past the upper jaw, skip rendering the top half of the column
                if (!isUpperJaw && y < mouthCloseY) {
                    // Draw exposed bottom teeth sticking UP into the empty water space!
                    if (y === mouthCloseY - 1 && x % 4 === 0) forcePixel(cx + x, cy + y, cTooth);
                    if (y === mouthCloseY - 2 && x % 4 === 0) forcePixel(cx + x, cy + y, cTooth);
                    continue; 
                }
                
                let c = cBase;
                let isMouth = (x > 12 && y >= mouthOpenY && y <= mouthCloseY && isUpperJaw);
                
                if (isMouth) {
                    c = cMouth; // The black void of the throat
                    
                    // Top Teeth hanging down
                    if (y <= mouthOpenY + 2 && x % 4 === 2) c = cTooth;
                    // Bottom Teeth inside the mouth
                    if (y >= mouthCloseY - 1 && x % 4 === 0) c = cTooth;
                } else {
                    // Standard Body Shading
                    if (y > botY - 3) c = cShad;
                    if (y > botY - 1) c = cDark;
                    
                    // Pale Belly
                    if (y > 0 && y < botY - 3 && t > 0.2 && t < 0.7 && x < 12) c = cPale;
                    
                    // Lip Highlight / Armored Chin edge
                    if (!isUpperJaw && y === mouthCloseY) c = cBone; // Hard bone jaw edge
                    if (isUpperJaw && y === mouthOpenY) c = cShad;   // Upper lip shadow
                    
                    // Rot & Pockmarks
                    if (rng.chance(0.08) && y > -topY + 2 && y < botY - 2 && !isMouth) c = cShad;
                    
                    // Glowing Veins (Stop at the neck, x < 8)
                    const veinY = Math.sin(x * 0.3) * 5;
                    if (Math.abs(y - veinY) < 1.5 && x < 8) {
                        c = rng.chance(0.7) ? cGlow : cGlowDark;
                    }
                }
                
                setPixel(cx + x, cy + y, c);
            }
            
            // Skull Bone Plating (Armor)
            if (x > -4 && x <= 20) {
                for (let y = -topY; y <= -topY + 3; y++) {
                    forcePixel(cx + x, cy + y, cBone);
                    // Jagged cracks in the bone
                    if ((x + y) % 5 === 0 && rng.chance(0.5)) forcePixel(cx + x, cy + y, cShad);
                }
            }
        }

        // --- 3. EYES ---
        // Clustered right above the jaw hinge
        const eyeX = cx + 11;
        const eyeY = cy - 4; 
        forcePixel(eyeX, eyeY, cSpore); forcePixel(eyeX + 1, eyeY, '#FFFFFF');
        forcePixel(eyeX + 3, eyeY + 2, cSpore); forcePixel(eyeX + 4, eyeY + 2, '#FFFFFF');
        forcePixel(eyeX - 2, eyeY + 2, cSpore);

        // --- 4. THE MUSHROOM FOREST ---
        const shrooms = [-10, -2, 6]; 
        for (let sx of shrooms) {
            const t = (sx + backLen) / (frontLen + backLen);
            let rootY = cy - Math.round(Math.sin(t * Math.PI) * 16);
            if (sx > 6) rootY -= Math.round((sx - 6) * 0.15); // Match the skull slope
            
            const h = rng.int(10, 16); 
            const capW = rng.int(5, 8); 
            const sway = rng.int(-2, 2);
            
            // Stalk
            for (let sy = 0; sy < h; sy++) {
                const bend = Math.round(sy * 0.15) * Math.sign(sway || 1); 
                forcePixel(cx + sx + bend - 1, rootY - sy, cBone);  
                forcePixel(cx + sx + bend, rootY - sy, cBase);      
                forcePixel(cx + sx + bend + 1, rootY - sy, cShad);  
            }
            
            // Cap
            const capX = cx + sx + Math.round(h * 0.15) * Math.sign(sway || 1);
            const capY = rootY - h;
            for (let cy_off = -4; cy_off <= 1; cy_off++) {
                const cw = capW - Math.abs(cy_off + 1); 
                for (let cx_off = -cw; cx_off <= cw; cx_off++) {
                    if (cy_off === 1) forcePixel(capX + cx_off, capY + cy_off, cDark); // Gills
                    else {
                        let c = cCap; 
                        if (cx_off < -cw/2 || cy_off < -2) c = cSpore; 
                        if (rng.chance(0.15)) c = cGlow; 
                        forcePixel(capX + cx_off, capY + cy_off, c);
                    }
                }
            }
        }

        // --- 5. ROTTING PECTORAL FIN ---
        const pecX = cx + 2; 
        const pecY = cy + 12;
        for (let l = 0; l < 16; l++) {
            const fw = 3 + Math.floor(l/3); 
            for (let fx = -fw; fx <= fw; fx++) {
                if (rng.chance(0.2)) continue; // Rotting holes
                let c = cShad;
                if (fx % 4 === 0) c = cBase;
                if (l > 12) c = cGlow;
                
                const sweep = Math.floor(l * 1.3); // Aggressive sweep backward
                forcePixel(pecX + fx - sweep, pecY + l, c);
            }
        }

        // --- 6. AMBIENT SPORE CLOUDS ---
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
                
                const isSolid = (val) => val !== null && val !== 'AMBIENT' && val !== '#2DD4BF' && val !== '#BEF264' && val !== '#FBBF24' && val !== '#F97316' && val !== '#F472B6' && val !== '#E879F9';
                
                if (isSolid(n) || isSolid(s) || isSolid(w) || isSolid(e)) outlineGrid[y][x] = '#020617'; 
            }
        }
    }

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            let colorCode = grid[y][x] === 'AMBIENT' ? null : grid[y][x];
            if (!colorCode && outlineGrid[y][x]) colorCode = outlineGrid[y][x];
            
            const glowColors = ['#BEF264', '#2DD4BF', '#FBBF24', '#F97316', '#F472B6', '#E879F9'];
            if (glowColors.includes(grid[y][x])) colorCode = grid[y][x];
            
            if (colorCode) drawScaledRect(ctx, x, y, 1, 1, colorCode, DISPLAY_SCALE);
        }
    }

    return { imageDataUrl: offscreenCanvas.toDataURL() };
}