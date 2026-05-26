/**
 * js/exploration/global_map.js
 * Generates the 16x16 global node network.
 * Handles equal biome settlement distribution (10 total, 2 per biome),
 * anti-clustering spacing, and safe starter spawn points.
 */

import { createRng } from '../util/rng.js';
import { createNoise2D } from './noise.js';

export const MAP_W = 16;
export const MAP_H = 16;

export function generateGlobalMap(seed = Date.now(), discoveredNodes = []) {
    const rng = createRng(seed);
    const { fbm } = createNoise2D(seed);
    
    // 1. Initialize the grid
    const nodes = [];
    for (let y = 0; y < MAP_H; y++) {
        const row = [];
        for (let x = 0; x < MAP_W; x++) {
            const isDisc = discoveredNodes.includes(`${x},${y}`);
            row.push({
                x, y,
                id: `node_${x}_${y}`,
                biomeId: 'fungal', 
                name: '',
                exits: { n: false, s: false, e: false, w: false },
                hasSettlement: false,
                settlementName: '',
                isStarter: false, // Tracks if this is the player's spawn point
                isDiscovered: isDisc 
            });
        }
        nodes.push(row);
    }

    // 2. Connectivity: Randomized DFS Maze Generation
    const visited = Array(MAP_H).fill(null).map(() => Array(MAP_W).fill(false));
    
    function carvePassagesFrom(cx, cy) {
        visited[cy][cx] = true;
        
        const directions = [
            { dx: 0, dy: -1, dir: 'n', opp: 's' },
            { dx: 0, dy: 1, dir: 's', opp: 'n' },
            { dx: 1, dy: 0, dir: 'e', opp: 'w' },
            { dx: -1, dy: 0, dir: 'w', opp: 'e' }
        ];
        
        for (let i = directions.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        for (const { dx, dy, dir, opp } of directions) {
            const nx = cx + dx;
            const ny = cy + dy;
            
            if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && !visited[ny][nx]) {
                nodes[cy][cx].exits[dir] = true;
                nodes[ny][nx].exits[opp] = true;
                carvePassagesFrom(nx, ny);
            }
        }
    }
    
    carvePassagesFrom(Math.floor(MAP_W/2), Math.floor(MAP_H/2));

    // 3. Add Extra Edges to create loops
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            if (x < MAP_W - 1 && !nodes[y][x].exits.e && rng.chance(0.15)) {
                nodes[y][x].exits.e = true;
                nodes[y][x+1].exits.w = true;
            }
            if (y < MAP_H - 1 && !nodes[y][x].exits.s && rng.chance(0.15)) {
                nodes[y][x].exits.s = true;
                nodes[y+1][x].exits.n = true;
            }
        }
    }

    // 4. Biome Assignment (Quantile Thresholds to Guarantee All Biomes)
    const rawNoise = [];
    for (let y = 0; y < MAP_H; y++) {
        const row = [];
        for (let x = 0; x < MAP_W; x++) {
            row.push(fbm(x * 0.15, y * 0.15, 3)); 
        }
        rawNoise.push(row);
    }

    const flatNoise = rawNoise.flat().sort((a, b) => a - b);
    const tSize = flatNoise.length;
    const thresholds = [
        flatNoise[Math.floor(tSize * 0.2)], 
        flatNoise[Math.floor(tSize * 0.4)], 
        flatNoise[Math.floor(tSize * 0.6)], 
        flatNoise[Math.floor(tSize * 0.8)]  
    ];

    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            const node = nodes[y][x];
            const noiseVal = rawNoise[y][x];
            
            if (noiseVal <= thresholds[0]) node.biomeId = 'abyssal';
            else if (noiseVal <= thresholds[1]) node.biomeId = 'frozen';
            else if (noiseVal <= thresholds[2]) node.biomeId = 'fungal';
            else if (noiseVal <= thresholds[3]) node.biomeId = 'crystal';
            else node.biomeId = 'volcanic';

            node.name = generateLakeName(node.biomeId, rng);
        }
    }

    // 5. Place POIs (Endgame Expansion)
    const deadEnds = { fungal: [], crystal: [], frozen: [], volcanic: [], abyssal: [] };

    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            const node = nodes[y][x];
            let exits = 0;
            if (node.exits.n) exits++;
            if (node.exits.s) exits++;
            if (node.exits.e) exits++;
            if (node.exits.w) exits++;
            
            if (exits === 1 && deadEnds[node.biomeId]) {
                deadEnds[node.biomeId].push(node);
            }
        }
    }

    // Place Myconid Colony
    let fungalPoiNode = null;
    if (deadEnds.fungal.length > 0) {
        fungalPoiNode = rng.pick(deadEnds.fungal);
    } else {
        const allFungal = nodes.flat().filter(n => n.biomeId === 'fungal');
        if (allFungal.length > 0) fungalPoiNode = rng.pick(allFungal);
    }
    if (fungalPoiNode) {
        fungalPoiNode.poi = 'myconid_colony';
        fungalPoiNode.name = "Spore-Grown Colony";
    }

    // Place Crystal Museum
    let crystalPoiNode = null;
    if (deadEnds.crystal.length > 0) {
        crystalPoiNode = rng.pick(deadEnds.crystal);
    } else {
        const allCrystal = nodes.flat().filter(n => n.biomeId === 'crystal');
        if (allCrystal.length > 0) crystalPoiNode = rng.pick(allCrystal);
    }
    if (crystalPoiNode) {
        crystalPoiNode.poi = 'crystal_museum';
        crystalPoiNode.name = "The Crystal Museum";
    }

    // --- NEW: Place Volcanic Arena ---
    let volcanicPoiNode = null;
    if (deadEnds.volcanic.length > 0) {
        volcanicPoiNode = rng.pick(deadEnds.volcanic);
    } else {
        const allVolcanic = nodes.flat().filter(n => n.biomeId === 'volcanic');
        if (allVolcanic.length > 0) volcanicPoiNode = rng.pick(allVolcanic);
    }
    if (volcanicPoiNode) {
        volcanicPoiNode.poi = 'volcanic_arena';
        volcanicPoiNode.name = "The Aquatic Arena";
    }

    // 6. SYSTEMATIC SETTLEMENT PLACEMENT (10 total, 2 per biome)
    const targets = { fungal: 2, crystal: 2, frozen: 2, volcanic: 2, abyssal: 2 };
    
    // --- STEP A: Place Safe Starter Settlement First ---
    // Candidate pools are only low-risk biomes, excluding active POI coordinates
    const safeBiomes = ['fungal', 'crystal', 'frozen'];
    const starterCandidates = nodes.flat().filter(n => safeBiomes.includes(n.biomeId) && !n.poi);
    
    const startNode = rng.pick(starterCandidates);
    startNode.hasSettlement = true;
    startNode.isStarter = true;
    startNode.settlementName = generateSettlementName(startNode.biomeId, rng);
    
    // Lock start variables
    const startX = startNode.x;
    const startY = startNode.y;
    
    // Decrement the target count of the selected starting biome
    targets[startNode.biomeId]--;

    // Helper: 8-Directional Adjacency Spacing Gutter Check
    function isAdjacentToSettlement(cx, cy) {
        const offsets = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0],           [1, 0],
            [-1, 1],  [0, 1],  [1, 1]
        ];
        for (const [dx, dy] of offsets) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
                if (nodes[ny][nx].hasSettlement) return true;
            }
        }
        return false;
    }

    // Shuffle all remaining nodes deterministically using the seed
    const allRemainingNodes = nodes.flat().filter(n => !n.poi && !n.hasSettlement);
    for (let i = allRemainingNodes.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [allRemainingNodes[i], allRemainingNodes[j]] = [allRemainingNodes[j], allRemainingNodes[i]];
    }

    // --- STEP B: First Pass (Strict Spacing) ---
    for (const node of allRemainingNodes) {
        const needed = targets[node.biomeId];
        if (needed > 0) {
            if (!isAdjacentToSettlement(node.x, node.y)) {
                node.hasSettlement = true;
                node.settlementName = generateSettlementName(node.biomeId, rng);
                targets[node.biomeId]--;
            }
        }
    }

    // --- STEP C: Second Pass (Fail-Safe Relaxation) ---
    // If some targets remained unplaced due to tight dead-ends, place them ignoring spacing
    const totalRemaining = Object.values(targets).reduce((sum, val) => sum + val, 0);
    if (totalRemaining > 0) {
        for (const node of allRemainingNodes) {
            const needed = targets[node.biomeId];
            if (needed > 0 && !node.hasSettlement) {
                node.hasSettlement = true;
                node.settlementName = generateSettlementName(node.biomeId, rng);
                targets[node.biomeId]--;
            }
        }
    }

    // 7. Generate Crystal Museum Slots
    const museumSlots = generateMuseumSlots(createRng(seed + 404));

    return { seed, width: MAP_W, height: MAP_H, nodes, startX, startY, museumSlots };
}

// --- HELPER: PROCEDURAL NAMING ---
function generateLakeName(biomeId, rng) {
    const biomePrefixes = {
        fungal: ['Spore', 'Rot', 'Myconid', 'Glow-Cap', 'Lichen', 'Moss', 'Muck'],
        crystal: ['Glimmer', 'Prism', 'Opal', 'Shard', 'Glass', 'Sapphire', 'Diamond'],
        abyssal: ['Shadow', 'Void', 'Hollow', 'Stygian', 'Sunken', 'Deep', 'Pitch'],
        volcanic: ['Sulphur', 'Magma', 'Ember', 'Scorch', 'Pyre', 'Ash', 'Smoke'],
        frozen: ['Frost', 'Rime', 'Glacier', 'Ice', 'Pale', 'Hoar', 'Chill']
    };
    
    const nouns = ['Basin', 'Grotto', 'Reach', 'Shoals', 'Cavern', 'Pool', 'Mere', 'Sink', 'Flow', 'Lagoon', 'Trough', 'Reef', 'Waters', 'Sound', 'Delve'];
    const suffixes = ['of the Deep', 'of Shadows', 'of Echoes', 'of the Lost', 'of Glowing Stones', 'of the Blind King', 'of Sorrow', 'of the Forgotten'];

    const prefix = rng.pick(biomePrefixes[biomeId]);
    const noun = rng.pick(nouns);

    const formatRoll = rng.next();
    if (formatRoll < 0.4) return `${prefix} ${noun}`;
    if (formatRoll < 0.7) return `The ${prefix} ${noun}`;
    return `${prefix} ${noun} ${rng.pick(suffixes)}`;
}

export function generateSettlementName(biomeId, rng) {
    const genericPrefixes = ['Stone', 'Iron', 'Mud', 'Deep', 'Hollow', 'Sable', 'Ebon', 'Pale', 'Grim', 'Dark', 'Omen', 'Shadow', 'Oar', 'Anchor'];
    
    const biomePrefixes = {
        'fungal': ['Moss', 'Spore', 'Rot', 'Damp', 'Green', 'Mycon', 'Slime', 'Mold', 'Fungal'],
        'crystal': ['Glimmer', 'Crystal', 'Prism', 'Glass', 'Gem', 'Opal', 'Shine', 'Glint', 'Quartz'],
        'abyssal': ['Void', 'Abyss', 'Blind', 'Null', 'Stygian', 'Black', 'Depth', 'Night', 'Gloom'],
        'volcanic': ['Ash', 'Cinder', 'Ember', 'Slag', 'Magma', 'Smoke', 'Sulphur', 'Burn', 'Char'],
        'frozen': ['Frost', 'Rime', 'Ice', 'Chill', 'Snow', 'Winter', 'Cold', 'Glacier', 'Bleak'],
        'hub': ['Oak', 'Pine', 'Wood', 'Trade', 'Safe', 'Haven', 'Light']
    };
    
    const compoundSuffixes = ['hold', 'port', 'gate', 'watch', 'quay', 'hearth', 'wharf', 'rest', 'haven', 'rock', 'stone', 'water', 'fall', 'deep', 'mouth', 'town', 'ville'];
    const standaloneNouns = ['Port', 'Landing', 'Quay', 'Wharf', 'Dock', 'Hold', 'Gate', 'Watch', 'Post', 'Bastion', 'Rest', 'Hearth', 'Camp', 'Haven', 'Hollow', 'Folly', 'End', 'Drop', 'Sanctuary'];

    const prefixes = rng.chance(0.5) ? genericPrefixes : (biomePrefixes[biomeId] || genericPrefixes);
    const prefix = rng.pick(prefixes);

    const formatRoll = rng.next();

    if (formatRoll < 0.4) {
        const suffix = rng.pick(compoundSuffixes);
        return `${prefix}${suffix}`;
    } else if (formatRoll < 0.8) {
        const noun = rng.pick(standaloneNouns);
        return `${prefix} ${noun}`;
    } else {
        const noun = rng.pick(standaloneNouns);
        if (rng.chance(0.5)) return `The ${prefix} ${noun}`;
        else return `${prefix}'s ${noun}`;
    }
}

export function generateMuseumSlots(rng) {
    const slots = [];
    const families = ['fish', 'ray', 'shark', 'cephalopod', 'crustacean', 'deepsea', 'eel', 'jellyfish'];
    const rarities = ['Common', 'Uncommon', 'Rare', 'Legendary'];
    
    const validSizes = {
        'fish': ['Tiny', 'Small', 'Medium', 'Large'], 'shark': ['Medium', 'Large', 'Massive'],
        'eel': ['Small', 'Medium', 'Large'], 'ray': ['Medium', 'Large', 'Massive'],
        'crustacean': ['Tiny', 'Small', 'Medium'], 'jellyfish': ['Tiny', 'Small', 'Medium'],
        'cephalopod': ['Small', 'Medium', 'Large'], 'deepsea': ['Medium', 'Large', 'Massive']
    };

    for (let i = 0; i < 40; i++) {
        const numReqs = rng.chance(0.4) ? 1 : (rng.chance(0.7) ? 2 : 3);
        const reqs = {};
        
        let f = rng.pick(families);
        let s = rng.pick(validSizes[f]);
        let r = rng.pick(rarities);

        const pool = ['family', 'sizeTier', 'rarity'];
        for (let k = pool.length - 1; k > 0; k--) {
            const j = rng.int(0, k);
            [pool[k], pool[j]] = [pool[j], pool[k]];
        }

        for(let j = 0; j < numReqs; j++) {
            if (pool[j] === 'family') reqs.family = f;
            if (pool[j] === 'sizeTier') reqs.sizeTier = s;
            if (pool[j] === 'rarity') reqs.rarity = r;
        }

        let titleParts = [];
        if (reqs.rarity) titleParts.push(reqs.rarity);
        if (reqs.sizeTier) titleParts.push(reqs.sizeTier);
        if (reqs.family) titleParts.push(reqs.family.charAt(0).toUpperCase() + reqs.family.slice(1));
        else titleParts.push("Specimen");

        slots.push({ id: i, reqs: reqs, title: titleParts.join(' ') });
    }
    return slots;
}