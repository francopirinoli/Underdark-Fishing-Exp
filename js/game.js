/**
 * js/game.js
 * The Master Shell & Core Game Loop.
 * V9 - Death Mechanics, Pause Menu, and Dual Audio Buses.
 */

import { createRng } from './util/rng.js';
import { SaveManager } from './util/save_manager.js';

// Audio
import { AudioEngine } from './audio/audio_engine.js';
import { MusicEngine } from './audio/music_engine.js';
import { SFX } from './audio/sfx_generator.js';

// Data & Generation
import { PlayerEngine } from './data/player_data.js';
import { generateNPCData } from './data/npc_data_generator.js';
import { generateGlobalMap, generateAstralSeaGlobalMap } from './exploration/global_map.js'; // Updated
import { generateLocalMap, TILE, LOCAL_MAP_SIZE } from './exploration/local_map.js';
import { BIOMES } from './exploration/biomes.js';
import { generateFishData, generateFishInstance, getFishPoolForNode } from './data/fish_data_generator.js';
import { generateBoatData } from './data/boat_data_generator.js'; // <-- NEW
import { MerchantGenerator } from './economy/merchant_generator.js'; // <-- NEW

// Engines & Renderers
import { ExplorationEngine } from './exploration/exploration_engine.js';
import { ExplorationRenderer } from './exploration/exploration_renderer.js';
import { renderGlobalMap } from './exploration/map_renderer.js'; 
import { FishingEngine } from './fishing/fishing_engine.js';
import { FishingRenderer } from './fishing/fishing_renderer.js';

// UI Modules
import { HUD } from './ui/hud_ui.js';
import { GrimoireUI } from './ui/grimoire_ui.js';
import { MenuUI } from './ui/menu_ui.js';
import { HubUI } from './ui/hub_ui.js';
import { PauseUI } from './ui/pause_ui.js';
import { EncounterUI } from './ui/encounter_ui.js';
import { TournamentUI } from './ui/tournament_ui.js'; 

// Events
import { EventManager } from './events/event_manager.js';
import { generateChest } from './art/chest_generator.js';
import { AchievementEngine } from './data/achievement_engine.js';

// --- GAME STATE ---
let currentSaveSlot = 1; // <-- ADD THIS LINE
const STATE = { MENU: 0, EXPLORATION: 1, FISHING: 2, GRIMOIRE: 3, HUB: 4, PAUSE: 5, ENCOUNTER: 6, TOURNAMENT: 7 }; // <-- UPDATED
let currentState = STATE.MENU;
let stateBeforePause = STATE.EXPLORATION;

let player;
let world;
let globalX, globalY;
let currentLocalMap, currentBiome;
let currentLocalFishPool =[];
let lastTime = 0;
let currentLocalChest = null; 
let currentLocalNPCBoats =[]; 
let currentLocalFisherman = null; 

// World State
let discoveredNodes = [];
let gameDay = 1;
let gameTimeMinutes = 8 * 60; 
let fungalRotTimer = 0; 
let rationConsumeTimer = 0; // <-- ADD THIS LINE

// Inputs
const keys = { forward: false, backward: false, left: false, right: false, action: false, actionJustPressed: false };
const mouse = { mouseX: 0, mouseY: 0, isCharging: false, chargePct: 0, maxDist: 100 };
let isReeling = false;

// --- INITIALIZATION ---

function initGameSystems() {
    // 1. Initialize Renderers immediately (No Audio required)
    ExplorationRenderer.init(document.getElementById('z0-world'), 1280, 720);
    FishingRenderer.init(document.getElementById('z50-action'));

    const interactPrompt = document.createElement('div');
    interactPrompt.id = 'interact-prompt';
    interactPrompt.style.cssText = "position:absolute; bottom: 80px; left: 512px; transform: translateX(-50%); font-size: 1.6rem; color: var(--gold-warn); background: rgba(15, 23, 42, 0.9); padding: 0.5rem 1.5rem; border: 2px solid var(--panel-border); border-radius: 6px; display: none; z-index: 40; text-shadow: 0 0 10px rgba(251, 191, 36, 0.4); pointer-events: none;";
    document.getElementById('game-container').appendChild(interactPrompt);

    // 2. Initialize UIs, injecting the new Audio trigger into the Menu
    MenuUI.init({
        onStartClick: async () => {
            await AudioEngine.init();
            const savedMusicVol = localStorage.getItem('uf_vol_music') || 50;
            const savedSfxVol = localStorage.getItem('uf_vol_sfx') || 50;
            AudioEngine.setMusicVolume(savedMusicVol / 100);
            AudioEngine.setSfxVolume(savedSfxVol / 100);
            SFX.init();
        },
        // --- FIX: Add starterBoat to the callback ---
        onNewGame: (slot, playerData, stats, points, starterBoat) => startNewDescent(slot, playerData, stats, points, starterBoat),
        onLoadGame: (slot) => loadExistingDescent(slot)
    });

    GrimoireUI.init({
        onSave: () => saveCurrentState(),
        onDeath: () => handleDeath(),
        checkAchievements: () => evaluateAchievements() // <-- ADD THIS LINE
    });

    HubUI.init({
        onSave: () => saveCurrentState(),
        onDepart: () => resumeFromHub(),
        checkAchievements: () => evaluateAchievements() // <-- NEW: Connects the shop hooks to the evaluator
    });

    EncounterUI.init({
        onSave: () => saveCurrentState(),
        onLeave: () => {
            currentState = STATE.EXPLORATION;
            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        }
    });

    PauseUI.init({
        onResume: () => togglePause(),
        onQuit: () => {
            saveCurrentState();
            location.reload(); 
        }
    });

    TournamentUI.init({
        onSave: () => saveCurrentState(),
        onLeave: () => {
            currentState = STATE.EXPLORATION;
            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        }
    });

    setupInputListeners();
    MenuUI.showMainMenu();
}

function evaluateAchievements() {
    if (!player) return;
    // Pass the number of discovered nodes to the engine
    const newUnlocks = AchievementEngine.evaluate(player, discoveredNodes.length);
    if (newUnlocks && newUnlocks.length > 0) {
        newUnlocks.forEach(ach => {
            SFX.playLevelUp(); // Triumphant sound
            HUD.logAction(`🏆 Achievement Unlocked: ${ach.title}!`, "safe");
        });
        saveCurrentState(); // Save immediately when an achievement pops
    }
}

// Automatically start the boot sequence when the script loads!
initGameSystems();

// NEW: Init Tournament UI
    TournamentUI.init({
        onSave: () => saveCurrentState(),
        onLeave: () => {
            currentState = STATE.EXPLORATION;
            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        }
    });

// --- STATE MANAGEMENT (NEW/LOAD) ---

// --- FIX: Add starterBoat to the parameters ---
    function startNewDescent(slot, identityData, stats, points, starterBoat) {
    currentSaveSlot = slot;
    
    player = PlayerEngine.createPlayer({ ...identityData, starterBoat });
    
    player.stats = stats;
    player.availablePoints = points;
    player.inventory = [];
    player.activeQuests = [];
    player.completedQuests = []; 
    player.activeBuffs = []; 
    player.bestiary = {}; 
    player.vitals.hp = player.gear.boat.stats.maxHp;

    // 1. GENERATE THE WORLD
    world = generateGlobalMap(Date.now(), []);
    
    // --- FIX: Map spawn coordinates directly to the generated starter settlement ---
    globalX = world.startX;
    globalY = world.startY;
    gameDay = 1;
    gameTimeMinutes = 8 * 60; // Start at 08:00 AM

    discoveredNodes = [`${globalX},${globalY}`];
    world.nodes[globalY][globalX].isDiscovered = true;

    // Initialize daily world events
    EventManager.onNewDay(1, world);

    saveCurrentState();
    enterWorld();
}

function loadExistingDescent(slot) {
    currentSaveSlot = slot;
    const data = SaveManager.loadGame(slot);
    if (!data) return;

    player = data.player;
    
    // --- FIX: Safely initialize new arrays for older save files ---
    player.inventory = player.inventory || []; 
    player.reagents = player.reagents || [];       
    player.activeBuffs = player.activeBuffs || []; 
    player.activeQuests = player.activeQuests || [];
    player.completedQuests = player.completedQuests || []; 
    player.bestiary = player.bestiary || {};

    player.endgameProgress = player.endgameProgress || {};
    if (!player.endgameProgress.fungal) player.endgameProgress.fungal = { totalCompostKg: 0, currentGoalIdx: 0 };
    if (!player.endgameProgress.crystal || Array.isArray(player.endgameProgress.crystal.filledSlots)) {
        player.endgameProgress.crystal = { filledSlots: {}, curatorRating: 0, currentGoalIdx: 0 };
    }
    // --- NEW: Safe initialization for older saves ---
    if (!player.endgameProgress.lava) {
        player.endgameProgress.lava = { currentTier: 1, endlessScore: 0, roster: [null, null, null] };
    }
    // --- NEW: Abyssal Fallback for Older Saves ---
    if (!player.endgameProgress.abyssal) {
        player.endgameProgress.abyssal = { whirlpoolsEntered: 0, abolethFreed: false, hasSingularityRegulator: false, activeAstralMap: null };
    }
    // --- NEW: Anglers Club fallback for older saves ---
    if (!player.endgameProgress.ice) {
        player.endgameProgress.ice = {
            clubPoints: 0, clubRank: 'Rank D', unlockedAchievements: [],
            stats: {
                totalFishCaught: 0, rareFishCaught: 0, legendaryFishCaught: 0, bossFishCaught: 0,
                deepseaCaught: 0, jellyfishCaught: 0, predatorCaught: 0, eelCaught: 0,
                heaviestCatch: 0, heaviestRay: 0, luresCrafted: 0, potionsBrewed: 0, baitsMashed: 0, fishDissected: 0,
                goldEarned: 0, mostExpensiveFishSold: 0, itemsBought: 0, whirlpoolsEscaped: 0,
                packIceBroken: 0, lavaTimeSurvived: 0, tournamentsWon: 0
            }
        };
    }

    discoveredNodes = data.discoveredNodes || [`${data.globalX},${data.globalY}`];
    
    // --- NEW: Load Game Map Safeguard ---
    const inAstralSea = player.endgameProgress?.abyssal?.activeAstralMap;
    if (inAstralSea) {
        world = generateAstralSeaGlobalMap(data.worldSeed, discoveredNodes);
        
        // --- NEW: OLD SAVE FILE UPGRADE MIGRATOR ---
        // Inspects if the active 4x4 nodes are missing our new hazard classifications
        const hasHazards = world.nodes.flat().some(n => ['cosmic_storm', 'siren_trap', 'phantom_room'].includes(n.poi));
        if (!hasHazards) {
            console.log("♻️ Upgrading old Astral Sea save to include hazards...");
            // Force-regenerate a fresh 4x4 world with hazards, spawning the player at the entrance
            world = generateAstralSeaGlobalMap(Date.now(), ['0,0']);
            globalX = 0;
            globalY = 0;
            discoveredNodes = ['0,0'];
            player.vitals.hp = player.gear.boat.stats.maxHp; // Fully heal hull
            player.endgameProgress.abyssal.whirlpoolsEntered = 5; // Preserve active quest state
        }
    } else {
        world = generateGlobalMap(data.worldSeed, discoveredNodes);
    }
    
    globalX = data.globalX;
    globalY = data.globalY;
    gameDay = data.gameDay;
    gameTimeMinutes = data.gameTimeMinutes;

    const nodeEcology = data.nodeEcology || {};
    for (const key in nodeEcology) {
        const [x, y] = key.split(',');
        if (world.nodes[y] && world.nodes[y][x]) {
            world.nodes[y][x].discoveredSpecies = nodeEcology[key];
        }
    }

    EventManager.loadSaveData(data.eventData);
    enterWorld();
}

function enterWorld() {
    document.getElementById('z200-menus').style.display = 'none';
    ExplorationRenderer.loadBoat(player.gear.boat.art.topDownDataUrl);
    loadLocalNode(null);
    HUD.logAction("Descended into the Darklake.");
    
    HUD.toggleLocation(true); // <-- NEW

    currentState = STATE.EXPLORATION;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function saveCurrentState() {
    const nodeEcology = {};
    for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
            const node = world.nodes[y][x];
            if (node.discoveredSpecies && node.discoveredSpecies.length > 0) {
                nodeEcology[`${x},${y}`] = node.discoveredSpecies;
            }
        }
    }
    
    // Pass EventManager.getSaveData() into the save file!
    SaveManager.saveGame(
        currentSaveSlot, 
        player, 
        world.seed, 
        globalX, 
        globalY, 
        gameDay, 
        gameTimeMinutes, 
        discoveredNodes, 
        nodeEcology,
        EventManager.getSaveData() 
    );
}

// --- NODE LOADING ---

function loadLocalNode(entryDir) {
    const targetNode = world.nodes[globalY][globalX];
    
    // --- NEW: ASTRAL SEA BIOME OVERRIDE ---
    const inAstralSea = player.endgameProgress?.abyssal?.activeAstralMap;
    if (inAstralSea) {
        currentBiome = {
            id: 'astral_sea',
            name: 'The Astral Sea',
            description: 'A fathomless violet nebula running with starlight currents and cosmic reefs.',
            globalColor: '#090514',
            textColor: '#C084FC',
            palette: {
                water: '#040209',      // Near pitch black
                deepWater: '#000000',  // Absolute void
                land: '#94A3B8',       // Stardust silver
                rock: '#1E1B4B',       // Deep nebula purple
                flora: '#22D3EE',      // Neon cyan glowing moss
                waterGleam: '#E879F9'  // Pink/purple energy
            }
        };

        // --- SAFETY RESCUE FOR OLD SAVES (Auto-Patcher) ---
        // If your active node is missing a hazard, we patch it on-the-fly to prevent inactive rooms
        if (!targetNode.poi && !(globalX === 0 && globalY === 0) && !(globalX === 3 && globalY === 3)) {
            const tempRng = createRng(world.seed + globalX * 13 + globalY * 37);
            targetNode.poi = tempRng.pick(['cosmic_storm', 'siren_trap', 'phantom_room', 'reef_chamber']);
            console.log(`♻️ Auto-patched missing hazard for node [${globalX}, ${globalY}] to: ${targetNode.poi}`);
        }
    } else {
        currentBiome = BIOMES[targetNode.biomeId];
    }
    
    // Generate the standard local map for the active node in both worlds
    currentLocalMap = generateLocalMap(targetNode, world.seed);

    // Ensure the node tracks its discovered fish species
    if (!targetNode.discoveredSpecies) targetNode.discoveredSpecies =[];

    // Generate the Local Ecosystem using the global helper
    currentLocalFishPool = getFishPoolForNode(world.seed, globalX, globalY, currentBiome.id);

    // --- NEW: Update Top-Left Location HUD ---
    HUD.updateLocation(targetNode, currentBiome);

    let spawnX = LOCAL_MAP_SIZE / 2, spawnY = LOCAL_MAP_SIZE / 2;
    const EDGE_OFFSET = 15;
    
    if (entryDir === 'n') spawnY = LOCAL_MAP_SIZE - EDGE_OFFSET;
    else if (entryDir === 's') spawnY = EDGE_OFFSET;
    else if (entryDir === 'e') spawnX = EDGE_OFFSET;
    else if (entryDir === 'w') spawnX = LOCAL_MAP_SIZE - EDGE_OFFSET;
    else if (entryDir === 'warp') {
        // --- NEW: SAFE PORTAL/WARP SPAWNING PIPELINE ---
        // Instead of spawning at a static corner [30, 30] which may be solid rock,
        // we check the active exits of this node and spawn inside a guaranteed clear channel.
        const exits = targetNode.exits;
        if (exits.n) { 
            spawnY = EDGE_OFFSET; 
        } else if (exits.s) { 
            spawnY = LOCAL_MAP_SIZE - EDGE_OFFSET; 
        } else if (exits.w) { 
            spawnX = EDGE_OFFSET; 
        } else if (exits.e) { 
            spawnX = LOCAL_MAP_SIZE - EDGE_OFFSET; 
        } else {
            // Absolute safety fallback: spawn dead center
            spawnX = LOCAL_MAP_SIZE / 2;
            spawnY = LOCAL_MAP_SIZE / 2;
        }
    }

    const effStats = PlayerEngine.getEffectiveStats(player);
    // Route the entire upgraded effective exploration block directly to the physics engine,
    // which automatically registers all custom immunities, active speed buffs, and evasions.
    const engineStats = effStats.exploration;

    // --- 1. SPAWN TREASURE CHEST ---
    currentLocalChest = null;
    // Block standard chests in the Astral Sea
    if (!inAstralSea && EventManager.Treasure.hasChest(globalX, globalY)) {
        const rng = createRng(world.seed + globalX * 10 + globalY * 100 + gameDay);
        const waterTiles =[];
        for (let y = 10; y < LOCAL_MAP_SIZE - 10; y += 4) { 
            for (let x = 10; x < LOCAL_MAP_SIZE - 10; x += 4) {
                if (currentLocalMap.grid[y][x] === TILE.DEEP_WATER) waterTiles.push({x, y});
            }
        }
        if (waterTiles.length > 0) currentLocalChest = rng.pick(waterTiles);
    }

// --- 2. SPAWN NPC BOATS (Wanderers & Tournaments / Phantoms) ---
    currentLocalNPCBoats =[];
    
    // Helper to find safe deep water away from the map edges (exits)
    const findSafeSpots = (rng, count, margin = 100, minSpacing = 30) => {
        const spots = [];
        const validTiles =[];
        for (let y = margin; y < LOCAL_MAP_SIZE - margin; y += 4) { 
            for (let x = margin; x < LOCAL_MAP_SIZE - margin; x += 4) {
                if (currentLocalMap.grid[y][x] === TILE.DEEP_WATER || currentLocalMap.grid[y][x] === TILE.WATER) {
                    validTiles.push({x, y});
                }
            }
        }
        // Shuffle
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }
        for (const tile of validTiles) {
            let safe = true;
            for (const spot of spots) {
                if (Math.hypot(tile.x - spot.x, tile.y - spot.y) < minSpacing) { safe = false; break; }
            }
            if (safe) { spots.push(tile); if (spots.length === count) break; }
        }
        return spots;
    };

    if (inAstralSea) {
        // Spawn Ghostly Phantom Ships in the Astral Sea
        if (targetNode.poi === 'phantom_room') {
            const pRng = createRng(world.seed + globalX * 5 + globalY * 13);
            const numPhantoms = pRng.int(1, 2);
            const spots = findSafeSpots(pRng, numPhantoms, 100, 45);
            
            spots.forEach((spot, idx) => {
                const phantomNpc = { name: "Astral Phantom", race: "Human", gender: "Spore-Spawn" };
                const phantomImg = new Image();
                phantomImg.src = player.gear.boat.art.topDownDataUrl; // Copy of your hull

                currentLocalNPCBoats.push({
                    x: spot.x, y: spot.y, 
                    npc: phantomNpc, 
                    img: phantomImg, 
                    bobOffset: pRng.int(0, 1000),
                    isPhantom: true, // Ghostly rendering flag
                    isTournament: false,
                    state: 'IDLE',
                    targetX: spot.x, targetY: spot.y,
                    homeX: spot.x, homeY: spot.y,
                    stunTimer: 0 // Added
                });
            });
        }
    } else {
        // Standard Darklake Spawning
        // A. Wandering Fisherman
        if (EventManager.Fisherman.hasFisherman(globalX, globalY)) {
            const fRng = createRng(world.seed + globalX * 7 + globalY * 11 + gameDay);
            const spots = findSafeSpots(fRng, 1, 100, 30);
            
            if (spots.length > 0) {
                const npc = generateNPCData({ seed: fRng.next() * 10000, biomeId: currentBiome.id });
                const boat = generateBoatData({ seed: fRng.next() * 10000 });
                const boatImg = new Image(); boatImg.src = boat.art.topDownDataUrl;

                currentLocalNPCBoats.push({
                    x: spots[0].x, y: spots[0].y, npc: npc, img: boatImg, bobOffset: fRng.int(0, 1000),
                    isTournament: false,
                    inventory: MerchantGenerator.getWanderingStock(fRng.next() * 10000, currentBiome.id, player.stats.bartering).slice(0, fRng.int(2, 4))
                });
            }
        }

        // B. Fishing Tournament
        const activeTournament = EventManager.Tournament.getTournament(globalX, globalY);
        if (activeTournament) {
            const tRng = createRng(world.seed + globalX * 13 + globalY * 17 + gameDay);
            const spots = findSafeSpots(tRng, 4, 120, 25);
            
            if (spots.length >= 4) {
                const offNpc = generateNPCData({ seed: tRng.next() * 10000, biomeId: currentBiome.id });
                const offBoat = generateBoatData({ seed: tRng.next() * 10000 });
                const offImg = new Image(); offImg.src = offBoat.art.topDownDataUrl;
                
                currentLocalNPCBoats.push({
                    x: spots[0].x, y: spots[0].y, npc: offNpc, img: offImg, bobOffset: tRng.int(0, 1000),
                    isTournament: true, tournamentRole: 'organizer'
                });

                for (let i = 0; i < 3; i++) {
                    const compData = activeTournament.competitors[i];
                    const compNpc = generateNPCData({ seed: tRng.next() * 10000, race: compData.race, gender: compData.gender });
                    compNpc.name = compData.name;
                    
                    const compBoat = generateBoatData({ seed: tRng.next() * 10000 });
                    const compImg = new Image(); compImg.src = compBoat.art.topDownDataUrl;

                    currentLocalNPCBoats.push({
                        x: spots[i+1].x, y: spots[i+1].y, npc: compNpc, img: compImg, bobOffset: tRng.int(0, 1000),
                        isTournament: true, tournamentRole: 'competitor', compIndex: i
                    });
                }
            }
        }
    }

    // --- 3. INIT ENGINES & HAZARDS ---
    // --- FIX: Pass targetNode to the renderer so it knows if it's a POI ---
    ExplorationRenderer.buildMapCache(currentLocalMap, currentBiome, targetNode);
    
    // NEW: Get current weather for this node and init visuals!
    const activeWeather = EventManager.Weather.getWeather(globalX, globalY);
    ExplorationRenderer.initHazards(currentBiome.id, activeWeather);
    
    // Pass everything into the Engine
    ExplorationEngine.init(spawnX, spawnY, engineStats, currentLocalMap, ExplorationEngine.heading, ExplorationEngine.velocity, currentLocalNPCBoats, currentBiome.id, activeWeather, targetNode.poi); // <-- FIXED
    HUD.cacheMinimap(currentLocalMap);

    // --- NEW: HAZARD WARNING LOGS ---
    if (currentBiome.id === 'volcanic') {
        HUD.logAction("⚠ Warning: Extreme heat. Hull integrity compromised.", "danger");
        if (effStats.exploration.immunities.volcanic) setTimeout(() => HUD.logAction("Iron Plating holding. Heat negated.", "safe"), 1500);
    } else if (currentBiome.id === 'frozen') {
        HUD.logAction("⚠ Warning: Pack Ice slowing vessel.", "danger");
        if (effStats.exploration.immunities.frozen) setTimeout(() => HUD.logAction("Icebreaker Prow cutting through floes.", "safe"), 1500);
    }
    
    if (activeWeather === 'spores') {
        HUD.logAction("⚠ Warning: Toxic Spore Storm. Rations rotting.", "danger");
        if (effStats.exploration.immunities.fungal) setTimeout(() => HUD.logAction("Alchemical Filter purifying air.", "safe"), 1500);
    } else if (activeWeather === 'shatter') {
        HUD.logAction("⚠ Warning: Crystal Shatter-Storm. High Acoustic Disturbance.", "danger");
        if (effStats.exploration.immunities.crystal) setTimeout(() => HUD.logAction("Acoustic Dampening absorbing shockwaves.", "safe"), 1500);
    } else if (activeWeather === 'whirlpool') {
        HUD.logAction("⚠ Warning: Void Whirlpool detected. Gravitational pull active.", "danger");
        if (effStats.exploration.immunities.abyssal) setTimeout(() => HUD.logAction("Overclocked Motor engaging bypass thrust.", "safe"), 1500);
    }

// --- UPDATED: Damage Callback with DR and Evasion ---
    ExplorationEngine.onDamage = (amount, reason) => {
        // Handle Evasion
        if (reason === "Dodge") {
            HUD.logAction("Nimble steering! Dodged collision.", 'safe');
            return;
        }
        
        // Handle 100% Armor Absorption
        if (amount <= 0 && reason === "Collision") {
            SFX.playError(); // Dull thud
            HUD.logAction("Armor absorbed the impact. No damage taken.", 'safe');
            return;
        }

        // Apply Real Damage
        player.vitals.hp -= amount;
        SFX.playLineSnap(); // Crunch sound
        
        if (reason === "Boiling Water") {
            HUD.logAction(`Hull melting! Took ${amount} damage.`, 'danger');
        } else if (reason === "Falling Crystal") {
            HUD.logAction(`Crystal shard struck the hull! Took ${amount} damage.`, 'danger');
        } else if (reason === "Cosmic Storm") { // Added
            HUD.logAction(`⚠ Cosmic Storm shearing hull! Reduce throttle! Took ${amount} damage.`, 'danger');
        } else if (reason === "Phantom Ram") { // Added
            HUD.logAction(`💥 Smashed by a Phantom! Took ${amount} damage.`, 'danger');
        } else {
            HUD.logAction(`Collision! Hull took ${amount} damage.`, 'danger');
        }
        
        if (player.vitals.hp <= 0) handleDeath();
    };

    // --- NEW: WHIRLPOOL TELEPORT CALLBACK ---
ExplorationEngine.onWhirlpoolWarp = () => {
        const abyssal = player.endgameProgress.abyssal || { whirlpoolsEntered: 0, abolethFreed: false, hasSingularityRegulator: false, activeAstralMap: null, questStarted: false };
        const hasRegulator = player.gear.boat.upgrades.engine && player.gear.boat.upgrades.engine.id === 'upg_singularity_regulator';
        const isFifthEntry = abyssal.whirlpoolsEntered === 4;

        // --- NEW: THE PLANAR SHIFT TRANSITION PIPELINE ---
        if (isFifthEntry || hasRegulator) {
            // 1. Back up 16x16 coordinates and discovered nodes list
            abyssal.savedNormalX = globalX;
            abyssal.savedNormalY = globalY;
            abyssal.savedNormalWorldSeed = world.seed;
            abyssal.savedNormalDiscovered = [...discoveredNodes];

            // 2. Flip state flags
            abyssal.activeAstralMap = true;
            if (isFifthEntry) {
                abyssal.whirlpoolsEntered = 5; // Telemetry sequence complete
            }
            player.endgameProgress.ice.stats.whirlpoolsEscaped++;
            evaluateAchievements();

            // 3. Rebuild global map container to the 4x4 Astral Sea grid
            discoveredNodes = ['0,0'];
            world = generateAstralSeaGlobalMap(world.seed, discoveredNodes);
            
            // 4. Set start coordinates [0,0]
            globalX = 0;
            globalY = 0;

            SFX.playLevelUp(); // Play epic dimensional tear sound
            HUD.logAction("🌀 PLANAR SHIFT! The gravitational shear tears your vessel out of the Darklake...", "safe");
            HUD.logAction("Entering The Astral Sea...", "safe");

            saveCurrentState();
            loadLocalNode('warp'); // Trigger local map reload
            return;
        }

        player.endgameProgress.ice.stats.whirlpoolsEscaped++; 
        evaluateAchievements();

        // Increment Telemetry Data towards the 5th breach if the quest is active, meeting Alistair has occurred, and the aboleth is not yet freed
        if (abyssal.questStarted && !abyssal.abolethFreed && abyssal.whirlpoolsEntered < 4) { // Updated
            abyssal.whirlpoolsEntered++;
            HUD.logAction(`Telemetry compiled! (${abyssal.whirlpoolsEntered}/4)`, "warn");
        } else if (!abyssal.questStarted) { // Added warning
            HUD.logAction("A powerful gravitational shear washes over your hull... Alistair's arrays must be active to record this.", "warn");
        }

        player.vitals.hp -= 30;
        SFX.playLineSnap();
        HUD.logAction(`Sucked into the Void! Took 30 damage and violently ejected.`, 'danger');
        
        if (player.vitals.hp <= 0) {
            handleDeath();
            return;
        }

        // Find an undiscovered node
        let possibleNodes = [];
        let allNodes =[];
        for (let y = 0; y < world.height; y++) {
            for (let x = 0; x < world.width; x++) {
                allNodes.push({x, y});
                if (!world.nodes[y][x].isDiscovered) {
                    possibleNodes.push({x, y});
                }
            }
        }

        const list = possibleNodes.length > 0 ? possibleNodes : allNodes;
        const target = list[Math.floor(Math.random() * list.length)];

        globalX = target.x;
        globalY = target.y;

        const nodeKey = `${globalX},${globalY}`;
        if (!discoveredNodes.includes(nodeKey)) {
            discoveredNodes.push(nodeKey);
            world.nodes[globalY][globalX].isDiscovered = true;
        }

        saveCurrentState();
        loadLocalNode('warp'); 
    };
    
    ExplorationEngine.onZoneTransition = (dir) => {
        let moved = false;
        if (dir === 'n' && targetNode.exits.n && globalY > 0) { globalY--; moved = true; }
        if (dir === 's' && targetNode.exits.s && globalY < world.height - 1) { globalY++; moved = true; }
        if (dir === 'e' && targetNode.exits.e && globalX < world.width - 1) { globalX++; moved = true; }
        if (dir === 'w' && targetNode.exits.w && globalX > 0) { globalX--; moved = true; }

        if (moved) {
            player.vitals.rations--;
            if (player.vitals.rations < 0) {
                player.vitals.rations = 0;
                player.vitals.hp -= 20;
                HUD.logAction("Starving! Hull took 20 damage.", 'danger');
                if (player.vitals.hp <= 0) handleDeath();
            } else {
                HUD.logAction(`Sailed ${dir.toUpperCase()} into new region.`);
            }

            const nodeKey = `${globalX},${globalY}`;
            if (!discoveredNodes.includes(nodeKey)) {
                discoveredNodes.push(nodeKey);
                world.nodes[globalY][globalX].isDiscovered = true;
            }

            saveCurrentState();
            loadLocalNode(dir);
        } else {
            ExplorationEngine.velocity = -ExplorationEngine.velocity * 0.5;
        }
    };

    MusicEngine.playBiome(currentBiome.id, createRng(world.seed + globalX + globalY));
}

// --- ENCOUNTER INTERACTION ---

function enterEncounter() {
    ExplorationEngine.velocity = 0; 
    keys.forward = keys.backward = keys.left = keys.right = false; 

    currentState = STATE.ENCOUNTER;
    document.getElementById('interact-prompt').style.display = 'none';
    
    // Open the UI, passing in the local fish pool so they can give a relevant hint
    EncounterUI.open({ player, world, globalX, globalY }, currentLocalFisherman, currentLocalFishPool);
    
    saveCurrentState();
}

function enterTournament(npcBoat) {
    ExplorationEngine.velocity = 0; 
    keys.forward = keys.backward = keys.left = keys.right = false; 

    currentState = STATE.TOURNAMENT;
    document.getElementById('interact-prompt').style.display = 'none';
    
    const activeTournament = EventManager.Tournament.getTournament(globalX, globalY);
    
    // --- FIX: Pass gameTimeMinutes into the UI state object so it can check the clock! ---
    TournamentUI.open({ player, world, globalX, globalY, gameTimeMinutes }, npcBoat, activeTournament);
    
    saveCurrentState();
}

// --- HUB INTERACTION ---

function enterHub() {
    currentState = STATE.HUB;
    document.getElementById('interact-prompt').style.display = 'none';
    HUD.toggleLocation(false); 
    ExplorationEngine.velocity = 0; 
    keys.forward = keys.backward = keys.left = keys.right = false; 
    
    const targetNode = world.nodes[globalY][globalX];
    HUD.logAction("Docked at Settlement.");
    
    // --- NEW: Switch to cozy Hub Music! ---
    MusicEngine.playBiome('hub', createRng(world.seed + globalX + globalY));

    HubUI.open({ player, world, globalX, globalY, gameDay }, targetNode);
    saveCurrentState(); 
}
function resumeFromHub() {
    currentState = STATE.EXPLORATION;
    HUD.toggleLocation(true);
    const effStats = PlayerEngine.getEffectiveStats(player); 
    if (player.vitals.hp <= 0) player.vitals.hp = effStats.exploration.maxHp; 
    
    // --- FIX: Refresh the active Exploration Engine stats reference upon departing ---
    // This ensures newly installed engines, platings, prows, and immunities take effect instantly!
    ExplorationEngine.boatStats = effStats.exploration;
    
    const targetNode = world.nodes[globalY][globalX];
    MusicEngine.playBiome(BIOMES[targetNode.biomeId].id, createRng(world.seed + globalX + globalY));

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// --- MASTER LOOP ---

function gameLoop(timestamp) {
    if (currentState === STATE.MENU || currentState === STATE.HUB || currentState === STATE.PAUSE || currentState === STATE.ENCOUNTER || currentState === STATE.TOURNAMENT) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1); 
    lastTime = timestamp;

    HUD.update(player, gameDay, gameTimeMinutes);

    // --- TOURNAMENT TICKER ---
    const activeTournament = EventManager.Tournament.getTournament(globalX, globalY);
    if (activeTournament && activeTournament.isPlayerParticipating && !activeTournament.hasClaimedReward) {
        if (activeTournament.timeRemaining > 0) {
            activeTournament.timeRemaining -= dt;
            if (activeTournament.timeRemaining <= 0) {
                activeTournament.timeRemaining = 0;
                activeTournament.isFinished = true;
                HUD.logAction("TOURNAMENT OVER! Return to an official boat.", "danger");
                SFX.playError(); // Buzzer
            }
        }
        TournamentUI.updateTracker(activeTournament);
    } else {
        TournamentUI.hideTracker();
    }

    // --- SHARED TIME & SURVIVAL BLOCK (Runs during Exploration AND Fishing) ---
    const effStats = PlayerEngine.getEffectiveStats(player);
    const activeWeather = EventManager.Weather.getWeather(globalX, globalY);

    if (player.vitals.fuel > 0) {
        const fuelMult = effStats.exploration.fuelEfficiencyMult;
        player.vitals.fuel -= (player.gear.boat.upgrades.lantern.fuelDrainRate || 1.0) * fuelMult * dt * 0.1;
    }

    // 1. Time & Day Rollover
    gameTimeMinutes += dt; 
    if (gameTimeMinutes >= 24 * 60) { 
        gameTimeMinutes -= 24 * 60; 
        gameDay++; 
        EventManager.onNewDay(gameDay, world); 
        player.completedQuests = []; 
        HUD.logAction("A new day begins. The Darklake shifts...", "safe");
    }

    // 2. Hunger (8-Hour Ration Consumption)
    rationConsumeTimer += dt;
    if (rationConsumeTimer >= 8 * 60) { // 8 hours = 480 in-game minutes
        rationConsumeTimer -= 8 * 60;
        player.vitals.rations--;
        if (player.vitals.rations < 0) {
            player.vitals.rations = 0;
            player.vitals.hp -= 20;
            HUD.logAction("Starving! Hull took 20 damage.", 'danger');
            if (player.vitals.hp <= 0) { handleDeath(); return; } // Abort loop if dead
        } else {
            HUD.logAction("You ate a meal. (-1 Ration)", "normal");
        }
    }

    // 3. Tick Down Active Buffs
    if (player.activeBuffs && player.activeBuffs.length > 0) {
        for (let i = player.activeBuffs.length - 1; i >= 0; i--) {
            player.activeBuffs[i].durationMins -= dt; 
            if (player.activeBuffs[i].durationMins <= 0) {
                HUD.logAction(`${player.activeBuffs[i].statName} potion effect has worn off.`, "warn");
                player.activeBuffs.splice(i, 1);
            }
        }
    }

    // 4. Hazard: Fungal Rot
    if (activeWeather === 'spores' && !effStats.exploration.immunities.fungal && player.vitals.rations > 0) {
        fungalRotTimer += dt;
        if (fungalRotTimer >= 45.0) { // Rot 1 ration every 45 in-game minutes
            fungalRotTimer = 0;
            player.vitals.rations--;
            HUD.logAction("Spores rotting food. Lost 1 Ration.", "danger");
            if (player.vitals.rations <= 0) {
                player.vitals.hp -= 20;
                HUD.logAction("Starving! Hull took 20 damage.", 'danger');
                if (player.vitals.hp <= 0) { handleDeath(); return; } // Abort loop if dead
            }
        }
    } else {
        fungalRotTimer = 0; // Reset if safe
    }

    // --- NEW: 5. Courier Quest Timers ---
    if (player.activeQuests && player.activeQuests.length > 0) {
        player.activeQuests.forEach(q => {
            if (q.type === 'courier' && !q.isFailed) {
                q.timeRemaining -= dt;
                if (q.timeRemaining <= 0) {
                    q.timeRemaining = 0;
                    q.isFailed = true;
                    SFX.playError();
                    HUD.logAction(`Delivery Failed: ${q.title}. The package expired.`, "danger");
                }
            }
        });
    }

    // ==========================================
    // EXPLORATION STATE
    // ==========================================
    
    if (currentState === STATE.EXPLORATION) {
        if (mouse.isCharging) {
            mouse.chargePct = Math.min(1.0, mouse.chargePct + dt * 1.5);
            keys.forward = keys.backward = keys.left = keys.right = false; 
        }

        ExplorationEngine.update(dt, keys);
        
        // --- INTERACTION CHECK ---
        let canInteract = false;
        let interactMsg = "";
        let interactAction = null; 
        const tx = Math.floor(ExplorationEngine.x);
        const ty = Math.floor(ExplorationEngine.y);
        
        // 1. Check for Settlement Docks / Planar Cages
        const searchRadius = 8; 
        for (let y = Math.max(0, ty - searchRadius); y <= Math.min(LOCAL_MAP_SIZE - 1, ty + searchRadius); y++) {
            for (let x = Math.max(0, tx - searchRadius); x <= Math.min(LOCAL_MAP_SIZE - 1, tx + searchRadius); x++) {
                if (currentLocalMap.grid[y][x] === TILE.DOCK) {
                    canInteract = true;
                    
                    // Intercept and load the Tethering Trial when at node [3, 3] in the Astral Sea
                    const inAstralSea = player.endgameProgress?.abyssal?.activeAstralMap;
                    if (inAstralSea && globalX === 3 && globalY === 3) {
                        interactMsg = "Press [E] to engage Tethering Trial";
                        interactAction = () => {
                            SFX.playUISelect();
                            window.startTetheringTrial(); // Scope corrected (Added window prefix)
                        };
                    } else {
                        interactMsg = "Press [E] to Dock";
                        interactAction = enterHub;
                    }
                    break;
                }
            }
            if (canInteract) break;
        }

        // 2. Check for NPC Boats
        if (!canInteract && currentLocalNPCBoats.length > 0) {
            for (const npcBoat of currentLocalNPCBoats) {
                if (npcBoat.isPhantom) continue; // Skip phantoms! They are pure combat hazards. (Added)
                const distToBoat = Math.hypot(tx - npcBoat.x, ty - npcBoat.y);
                if (distToBoat < 25) { 
                    canInteract = true;
                    if (npcBoat.isTournament) {
                        interactMsg = `Press [E] to hail ${npcBoat.npc.name} (Tournament)`;
                        interactAction = () => { enterTournament(npcBoat); }; 
                    } else {
                        interactMsg = `Press [E] to hail ${npcBoat.npc.name}`;
                        interactAction = () => { 
                            currentLocalFisherman = npcBoat; 
                            enterEncounter(); 
                        }; 
                    }
                    break;
                }
            }
        }

        const prompt = document.getElementById('interact-prompt');
        if (canInteract) {
            prompt.style.display = 'block';
            prompt.innerText = interactMsg;
            if (keys.actionJustPressed) {
                keys.actionJustPressed = false;
                if (interactAction) interactAction(); 
            }
        } else {
            prompt.style.display = 'none';
        }
        
        keys.actionJustPressed = false;

        const lightRad = player.vitals.fuel > 0 ? player.gear.boat.upgrades.lantern.lightRadius : 40;
        ExplorationRenderer.render(ExplorationEngine, lightRad, dt, mouse, false, [], currentLocalChest, currentLocalNPCBoats);
        HUD.drawMinimap(ExplorationEngine.x, ExplorationEngine.y);
    }

    // ==========================================
    // FISHING STATE
    // ==========================================
    else if (currentState === STATE.FISHING) {
        const lightRad = player.vitals.fuel > 0 ? player.gear.boat.upgrades.lantern.lightRadius : 40;
        
        ExplorationRenderer.render(ExplorationEngine, lightRad, dt, null, true, [], currentLocalChest, currentLocalNPCBoats);
        
        FishingEngine.update(dt, isReeling);
        FishingRenderer.update(FishingEngine, dt, isReeling);

        if (FishingEngine.phase === 'CAUGHT') {
            const caughtFish = FishingEngine.fishData; 

            // --- FIX: INTERCEPT CUSTOM ENCOUNTERS EARLY ---
            if (caughtFish && (caughtFish.id === 'cage_tether' || caughtFish.id === 'cosmic_salvage_chest')) {
                handleEndFishing("", "");
            } else {
                const effStats = PlayerEngine.getEffectiveStats(player);
                if (player.inventory.length < effStats.exploration.cargoSpace) {
                    
                    if (caughtFish.invType === 'chest_encounter') {
                        player.inventory.push({
                            id: `chest_${Date.now()}`,
                            instanceId: `inst_${Date.now()}`,
                            invType: 'chest',
                            name: 'Sunken Chest',
                            art: caughtFish.art, 
                            imageDataUrl: caughtFish.art.imageDataUrl,
                            chestSeed: caughtFish.chestSeed 
                        });
                        
                        if (caughtFish.isEventChest) {
                            EventManager.Treasure.clearChest(globalX, globalY); 
                            currentLocalChest = null;
                            handleEndFishing("You hauled up the Sunken Chest!", "safe");
                        } else {
                            handleEndFishing("You salvaged a Sunken Chest from the lakebed!", "safe");
                        }
                        saveCurrentState();
                    }
                    else {
                        player.inventory.push(caughtFish);
                        
                        const iceStats = player.endgameProgress.ice.stats;
                        iceStats.totalFishCaught++;
                        iceStats.heaviestCatch = Math.max(iceStats.heaviestCatch, caughtFish.actualWeight);
                        
                        if (caughtFish.identity.rarity === 'Rare') iceStats.rareFishCaught++;
                        else if (caughtFish.identity.rarity === 'Legendary') iceStats.legendaryFishCaught++;
                        else if (caughtFish.identity.rarity === 'Boss') iceStats.bossFishCaught++;

                        if (caughtFish.identity.family === 'deepsea') iceStats.deepseaCaught++;
                        else if (caughtFish.identity.family === 'jellyfish') iceStats.jellyfishCaught++;
                        else if (caughtFish.identity.family === 'shark') iceStats.predatorCaught++;
                        else if (caughtFish.identity.family === 'eel') iceStats.eelCaught++;
                        else if (['ray', 'flatfish'].includes(caughtFish.identity.family)) {
                            iceStats.heaviestRay = Math.max(iceStats.heaviestRay, caughtFish.actualWeight);
                        }

                        evaluateAchievements(); 
                        
                        if (!player.bestiary[caughtFish.id]) {
                            const template = currentLocalFishPool.find(f => f.id === caughtFish.id) || caughtFish;
                            player.bestiary[caughtFish.id] = { xp: 0, caught: 0, speciesData: JSON.parse(JSON.stringify(template)) };
                        }
                        
                        const prevKnowledge = player.bestiary[caughtFish.id].xp;
                        player.bestiary[caughtFish.id].caught++;

                        const baseKnowledge = { 'Common': 10, 'Uncommon': 20, 'Rare': 40, 'Legendary': 70, 'Boss': 100 }[caughtFish.identity.rarity] || 10;
                        let knowledgeXpGain = Math.round(baseKnowledge * effStats.economy.knowledgeXpMult);
                        
                        if (caughtFish.identity.rarity === 'Boss') knowledgeXpGain = 250; 
                        player.bestiary[caughtFish.id].xp += knowledgeXpGain;
                        
                        const newKnowledge = player.bestiary[caughtFish.id].xp;
                        const targetNode = world.nodes[globalY][globalX];
                        if (!targetNode.discoveredSpecies.includes(caughtFish.id)) {
                            targetNode.discoveredSpecies.push(caughtFish.id);
                        }

                        player.activeQuests.forEach(q => {
                            if (q.type === 'bounty' && !q.isComplete) {
                                if (caughtFish.id === q.targetSpeciesId && caughtFish.identity.rarity === q.targetRarity && globalX === q.targetNode.x && globalY === q.targetNode.y) {
                                    q.isComplete = true;
                                    HUD.logAction(`Bounty Complete: ${q.title}!`, "safe");
                                }
                            }
                        });

                        const finalXpGain = Math.round(caughtFish.economy.baseXp * effStats.economy.generalXpMult);
                        const leveledUp = PlayerEngine.addXp(player, finalXpGain);
                        
                        if (leveledUp) {
                            SFX.playLevelUp();
                            HUD.logAction("LEVEL UP! You have unspent stat points!", "safe");
                        }

                        handleEndFishing(`Caught a ${caughtFish.identity.name} (+${finalXpGain} XP)!`, "safe");
                        
                        if (prevKnowledge < 100 && newKnowledge >= 100) HUD.logAction(`Bestiary Updated: ${caughtFish.identity.name} (Lv.2)`, "warn");
                        if (prevKnowledge < 250 && newKnowledge >= 250) HUD.logAction(`Bestiary Updated: ${caughtFish.identity.name} (MAX)`, "warn");
                        
                        const activeTournament = EventManager.Tournament.getTournament(globalX, globalY);
                        if (activeTournament && activeTournament.isPlayerParticipating && !activeTournament.isFinished) {
                            let isRelevant = true;
                            if (activeTournament.objectiveType === 'specialist' && caughtFish.id !== activeTournament.targetSpeciesId) {
                                isRelevant = false;
                            }
                            if (isRelevant) HUD.logAction(`Tournament Catch! Deliver it quickly!`, "warn");
                        }
                        saveCurrentState();
                    }
                } else {
                    handleEndFishing(`Cargo full! Released ${caughtFish.identity.name}.`, "danger");
                }
            } // Close new interception block
        }
        else if (FishingEngine.phase === 'SNAPPED') handleEndFishing("Line snapped!", "danger");
        else if (FishingEngine.phase === 'ESCAPED') handleEndFishing("The fish escaped.", "danger");
    }

    requestAnimationFrame(gameLoop);
}

// --- ACTION HELPERS ---

function handleAttemptCast() {
    if (!player.gear.rod) {
        HUD.logAction("Cannot cast without a fishing rod equipped!", "danger");
        SFX.playError();
        mouse.isCharging = false;
        mouse.chargePct = 0;
        ExplorationEngine.velocity = 0;
        return;
    }
    
    const effStats = PlayerEngine.getEffectiveStats(player);
    
    // --- NEW: DECLARE INASTRALSEA REFERENCE ---
    const inAstralSea = player.endgameProgress?.abyssal?.activeAstralMap; // Added to fix ReferenceError
    
    // CRITICAL FIX: Get the true on-screen position of the boat
    const playerPxX = ExplorationEngine.x * ExplorationRenderer.TILE_SIZE;
    const playerPxY = ExplorationEngine.y * ExplorationRenderer.TILE_SIZE;
    const screenBoatX = playerPxX - ExplorationRenderer.camX;
    const screenBoatY = playerPxY - ExplorationRenderer.camY;

    const dx = mouse.mouseX - screenBoatX;
    const dy = mouse.mouseY - screenBoatY;
    const dist = Math.hypot(dx, dy);
    
    mouse.maxDist = 100 + (player.stats.fishing * 30);
    const finalDist = Math.min(dist, mouse.maxDist) * mouse.chargePct;
    
    const targetWorld = ExplorationRenderer.screenToWorld(
        screenBoatX + (dx / dist) * finalDist, 
        screenBoatY + (dy / dist) * finalDist
    );
    
    const tx = Math.floor(targetWorld.x), ty = Math.floor(targetWorld.y);

    if (tx >= 0 && tx < LOCAL_MAP_SIZE && ty >= 0 && ty < LOCAL_MAP_SIZE) {
        const tId = currentLocalMap.grid[ty][tx];
        if ([TILE.WATER, TILE.DEEP_WATER, TILE.FLORA].includes(tId)) {
            ExplorationEngine.velocity = 0;
            const tId = currentLocalMap.grid[ty][tx];
            
            // --- NEW: MYTHIC BOSS SUMMONING BYPASS ---
            const targetNode = world.nodes[globalY][globalX];
            const equippedLure = player.gear.lure;

            // Check if we are at the Myconid Colony AND using the Mycelial Hook
            if (targetNode.poi === 'myconid_colony' && equippedLure && equippedLure.id === 'lure_mycelial_hook') {
                HUD.logAction("The Mycelial Hook pulses. The deep loam begins to tremble...", "warn");
                
                // --- NEW: START BATTLE MUSIC ---
                MusicEngine.playBiome('battle', createRng(Date.now()));
                
                const bossData = generateFishData({ bossId: 'vesper_bloom_leviathan', seed: Date.now() });
                const bossInstance = generateFishInstance(bossData, createRng(Date.now()));
                
                const castPool = [bossInstance];
                
                currentState = STATE.FISHING;
                document.getElementById('z50-action').style.display = 'flex';
                document.getElementById('z50-action').style.background = 'transparent';

                FishingEngine.startCast(effStats, player.stats.stamina, castPool, 50, gameTimeMinutes);
                FishingRenderer.open({ lureDataUrl: equippedLure.imageDataUrl || '', biome: currentBiome, tileId: tId });
                
                setTimeout(() => {
                    if (currentState === STATE.FISHING && FishingEngine.phase === 'SINKING') {
                        if (!FishingEngine.evaluateBite()) handleEndFishing("The Leviathan ignored your offering.", "danger");
                    }
                }, 6000);
                
                return; 
            }
            // --- NEW: CRYSTAL MUSEUM SUMMONING BYPASS ---
            else if (targetNode.poi === 'crystal_museum' && equippedLure && equippedLure.id === 'lure_prismatic_geode_hook') {
                HUD.logAction("The Prismatic Geode Hook flares. A brilliant rainbow refracts through the cavern...", "warn");
                MusicEngine.playBiome('battle', createRng(Date.now()));
                const bossData = generateFishData({ bossId: 'geode_monarch', seed: Date.now() });
                const bossInstance = generateFishInstance(bossData, createRng(Date.now()));
                
                const castPool = [bossInstance];
                
                currentState = STATE.FISHING;
                document.getElementById('z50-action').style.display = 'flex';
                document.getElementById('z50-action').style.background = 'transparent';

                FishingEngine.startCast(effStats, player.stats.stamina, castPool, 50, gameTimeMinutes);
                FishingRenderer.open({ lureDataUrl: equippedLure.imageDataUrl || '', biome: currentBiome, tileId: tId });
                
                setTimeout(() => {
                    if (currentState === STATE.FISHING && FishingEngine.phase === 'SINKING') {
                        if (!FishingEngine.evaluateBite()) handleEndFishing("The Monarch refused to emerge from its cavern.", "danger");
                    }
                }, 6000);
                
                return; 
            }
            // --- NEW: VOLCANIC ARENA SUMMONING BYPASS ---
            else if (targetNode.poi === 'volcanic_arena' && equippedLure && equippedLure.id === 'lure_brimstone_hook') {
                HUD.logAction("The Brimstone Hook boils the water. A massive shadow rises from the caldera...", "warn");
                MusicEngine.playBiome('battle', createRng(Date.now()));
                const bossData = generateFishData({ bossId: 'ignis_gorged_serpentine', seed: Date.now() });
                const bossInstance = generateFishInstance(bossData, createRng(Date.now()));
                
                const castPool = [bossInstance];
                
                currentState = STATE.FISHING;
                document.getElementById('z50-action').style.display = 'flex';
                document.getElementById('z50-action').style.background = 'transparent';

                FishingEngine.startCast(effStats, player.stats.stamina, castPool, 50, gameTimeMinutes);
                
                // Attach the Hull Damage callback for the Boss's heat vents
                FishingEngine.onBossStrike = (amount, reason) => {
                    player.vitals.hp -= amount;
                    SFX.playError();
                    
                    if (reason === "Steam Vent") HUD.logAction(`Boiling steam vent! Hull took ${amount} damage.`, "danger");
                    else if (reason === "Thermal Overload") HUD.logAction(`Thermal overload! Hull took ${amount} damage.`, "danger");

                    if (player.vitals.hp <= 0) {
                        handleEndFishing("Your boat was melted by the Serpentine!", "danger");
                        handleDeath();
                    }
                };

                FishingRenderer.open({ lureDataUrl: equippedLure.imageDataUrl || '', biome: currentBiome, tileId: tId });
                
                setTimeout(() => {
                    if (currentState === STATE.FISHING && FishingEngine.phase === 'SINKING') {
                        if (!FishingEngine.evaluateBite()) handleEndFishing("The Serpentine refused to emerge.", "danger");
                    }
                }, 6000);
                
                return; 
            }

            // --- NEW: ANGLERS CLUB SUMMONING BYPASS ---
            else if (targetNode.poi === 'anglers_club' && equippedLure && equippedLure.id === 'lure_glacial_hook') {
                HUD.logAction("The Glacial Hook vaporizes the water. A freezing dread rises from the depths...", "warn");

                const bossData = generateFishData({ bossId: 'glacial_leviathan', seed: Date.now() });
                const bossInstance = generateFishInstance(bossData, createRng(Date.now()));

                const castPool = [bossInstance];

                currentState = STATE.FISHING;
                document.getElementById('z50-action').style.display = 'flex';
                document.getElementById('z50-action').style.background = 'transparent';

                FishingEngine.startCast(effStats, player.stats.stamina, castPool, 50, gameTimeMinutes);
                FishingRenderer.open({ lureDataUrl: equippedLure.imageDataUrl || '', biome: currentBiome, tileId: tId });

                setTimeout(() => {
                    if (currentState === STATE.FISHING && FishingEngine.phase === 'SINKING') {
                        if (!FishingEngine.evaluateBite()) handleEndFishing("The Leviathan remained frozen.", "danger");
                    }
                }, 6000);

                return;
            }
            // --- NEW: VOID-BOUND ABOLETH SUMMONING BYPASS ---
            else if (equippedLure && equippedLure.id === 'lure_singularity_hook' && (currentBiome.id === 'astral_sea' || currentBiome.id === 'abyssal')) {
                HUD.logAction("The Singularity Hook warps the water columns. A massive, three-eyed shadow ascends!", "warn");
                MusicEngine.playBiome('battle', createRng(Date.now()));
                
                const bossData = generateFishData({ bossId: 'void_bound_aboleth', seed: Date.now() });
                const bossInstance = generateFishInstance(bossData, createRng(Date.now()));
                
                const castPool = [bossInstance];
                
                currentState = STATE.FISHING;
                document.getElementById('z50-action').style.display = 'flex';
                document.getElementById('z50-action').style.background = 'transparent';

                FishingEngine.startCast(effStats, player.stats.stamina, castPool, 60, gameTimeMinutes);
                FishingRenderer.open({ lureDataUrl: equippedLure.imageDataUrl || '', biome: currentBiome, tileId: tId });
                
                setTimeout(() => {
                    if (currentState === STATE.FISHING && FishingEngine.phase === 'SINKING') {
                        if (!FishingEngine.evaluateBite()) handleEndFishing("The Aboleth slipped back into the void.", "danger");
                    }
                }, 6000);
                
                return; 
            }

            // --- END MYTHIC BYPASS ---
            
            // 1. Calculate Depth
            const castRng = createRng(Date.now());
            let maxDepth = 20;
            if (tId === TILE.DEEP_WATER) maxDepth = castRng.int(50, 85);
            else if (tId === TILE.FLORA) maxDepth = castRng.int(20, 35);
            else maxDepth = castRng.int(12, 22);

// 2. Setup Base Pool
            let pool = currentLocalFishPool; 

            if (tId === TILE.DEEP_WATER) {
                const ds = pool.filter(f => f.identity.family === 'deepsea');
                if (ds.length > 0) pool = ds;
            }
            
            // --- 3. APPLY TACTICAL STEALTH & NOISE FILTER ---
            const noiseLevel = ExplorationEngine.currentNoise || 0;
            let spookedCount = 0;
            let predatorAttracted = false;

            let modifiedPool = [];
            pool.forEach(fishTemplate => {
                const aggro = fishTemplate.combat.aggression;
                
                // High noise scares timid fish (aggression < 0.5)
                if (noiseLevel > 60 && aggro < 0.5) {
                    spookedCount++;
                    return; // Flee!
                }
                modifiedPool.push(fishTemplate);
                
                // Extremely high noise attracts predators (aggression >= 0.7)
                if (noiseLevel > 75 && aggro >= 0.7) {
                    modifiedPool.push(fishTemplate);
                    modifiedPool.push(fishTemplate); // Triple their spawn weight!
                    predatorAttracted = true;
                }
            });

            if (modifiedPool.length === 0) {
                HUD.logAction("Your boat was too noisy. All fish fled!", "danger");
                SFX.playError();
                ExplorationRenderer.spawnFleeSplashes(tx, ty, 6);
                mouse.isCharging = false;
                mouse.chargePct = 0;
                ExplorationEngine.velocity = 0;
                return; 
            }

            // Visual & Text Feedback
            if (spookedCount > 0) {
                HUD.logAction(`Loud engine noise spooked timid fish away.`, "warn");
                ExplorationRenderer.spawnFleeSplashes(tx, ty, 3);
            } else if (noiseLevel < 30 && pool.length > 0) {
                HUD.logAction(`A silent approach. The waters are undisturbed.`, "safe");
            }
            
            if (predatorAttracted) {
                HUD.logAction(`The commotion has attracted aggressive predators!`, "danger");
                ExplorationRenderer.spawnFleeSplashes(tx, ty, 2); // Predators swirling
            }

            pool = modifiedPool;

            // --- 4. APPLY BAIT MODIFIERS ---
            let baitBoost = 0;
            if (player.gear.bait) {
                const b = player.gear.bait;
                const targetIds = b.targetFamilyIds || (b.itemData ? b.itemData.targetFamilyIds : []);
                const targetedFish = pool.filter(f => targetIds.includes(f.identity.family));
                
                if (targetedFish.length > 0) {
                    pool = targetedFish;
                    baitBoost = b.rarityBoostPct;
                }
                
                // Roll for bait preservation based on Crafting stat (10% to 50% chance)
                const preservationChance = effStats.economy.baitPreservationChance || 0;
                if (Math.random() >= preservationChance) {
                    b.charges--;
                    if (b.charges <= 0) {
                        HUD.logAction(`Your ${b.name} was fully consumed!`, "warn");
                        player.gear.bait = null;
                    }
                } else {
                    HUD.logAction(`Bait stabilized! Conserved a charge of ${b.name}.`, "safe");
                }
            }

            // --- Lucky Strike Rarity Boost: Grants a passive +15% rarity boost to all casts ---
            const hasLuckyStrike = player.gear.rod && player.gear.rod.traits && player.gear.rod.traits.some(t => t.id === 'lucky_strike');
            if (hasLuckyStrike) {
                baitBoost += 15;
            }

            // --- 5. GENERATE INSTANCES ---
            let castPool = Array.from({length: 10}, (_, i) => {
                const template = castRng.pick(pool);
                let instanceRng = createRng(Date.now() + i);
                
                // If bait triggers, we use a rigged RNG that guarantees a high rarity roll
                if (baitBoost > 0 && Math.random() < (baitBoost / 100)) {
                    const originalInt = instanceRng.int;
                    instanceRng.int = (min, max) => {
                        if (max === 100) return originalInt(80, 100); 
                        return originalInt(min, max);
                    };
                }
                // Pass the intelligence-driven rarity bias to skew the roll
                return generateFishInstance(template, instanceRng, effStats.economy.rarityBias);
            });

            // --- 6. INJECT BOUNTY TARGETS ---
            player.activeQuests.forEach(q => {
                if (q.type === 'bounty' && !q.isComplete && q.targetNode.x === globalX && q.targetNode.y === globalY) {
                    const template = currentLocalFishPool.find(f => f.id === q.targetSpeciesId);
                    if (template) {
                        const riggedRng = createRng(Date.now() + 999);
                        const originalInt = riggedRng.int;
                        riggedRng.int = (min, max) => {
                            if (max === 100) {
                                if (q.targetRarity === 'Rare') return 81;
                                if (q.targetRarity === 'Legendary') return 95;
                                if (q.targetRarity === 'Boss') return 100;
                            }
                            return originalInt(min, max);
                        };
                        const bountyFish = generateFishInstance(template, riggedRng);
                        bountyFish.combat.aggression = Math.max(0.6, bountyFish.combat.aggression);
                        castPool.push(bountyFish);
                    }
                }
            });
            // 4. Add Chest if in generous radius
            let eventChestSpawned = false;
            
            // --- NEW: COSMIC SALVAGE CHEST SPAWNING ---
            if (inAstralSea && targetNode.poi === 'cosmic_salvage') {
                const chestSeed = Date.now();
                const chestArt = generateChest({ rng: createRng(chestSeed), isMimic: false });
                currentLocalChest = { x: 256, y: 256 }; // Centered
                
                castPool.push({
                    id: 'cosmic_salvage_chest',
                    invType: 'cosmic_chest', 
                    identity: { name: 'Cosmic Salvage Chest', family: 'Treasure', rarity: 'Legendary' },
                    art: chestArt,
                    chestSeed: chestSeed,
                    combat: { stamina: 120, speed: 40, aggression: 0, hookWindowMs: 2500 },
                    physical: { sizeTier: 'Medium', weightRange: { min: 80, max: 120 } },
                    lurePrefs: { color: effStats.activeLure.color, sound: effStats.activeLure.sound, light: effStats.activeLure.light, weight: effStats.activeLure.weight, tolerance: 1.0 },
                    environment: { depthPref: 'Bottom-feeder' },
                    actualWeight: 100.0,
                    instanceId: `inst_${Date.now()}`
                });
                eventChestSpawned = true;
            }

            if (!eventChestSpawned && currentLocalChest) {
                const distToChest = Math.hypot(tx - currentLocalChest.x, ty - currentLocalChest.y);
                if (distToChest < 60) {
                    const chestSeed = Date.now();
                    const chestArt = generateChest({ rng: createRng(chestSeed), isMimic: false });
                    
                    castPool.push({
                        id: 'treasure_chest',
                        isEventChest: true, // Marked as the map event chest
                        identity: { name: 'Sunken Chest', family: 'Treasure', rarity: 'Rare' },
                        art: chestArt, 
                        chestSeed: chestSeed,
                        combat: { stamina: 120, speed: 60, aggression: 0, hookWindowMs: 2500 }, // 0 Aggression = INANIMATE behavior
                        physical: { sizeTier: 'Medium', weightRange: {min: 50, max: 100} },
                        // Set lure prefs to perfectly match the player's lure, guaranteeing a 100% bite match score
                        lurePrefs: { color: effStats.activeLure.color, sound: effStats.activeLure.sound, light: effStats.activeLure.light, weight: effStats.activeLure.weight, tolerance: 1.0 }, 
                        environment: { depthPref: 'Bottom-feeder' }, // MUST SCROLL TO BOTTOM
                        actualWeight: 75.0,
                        instanceId: `inst_${Date.now()}`,
                        invType: 'chest_encounter'
                    });
                    eventChestSpawned = true;
                }
            }

            // --- Random Lakebed Salvage (1% base, 10% if rod has Lucky Strike) ---
            if (!eventChestSpawned) {
                const hasLuckyStrike = player.gear.rod && player.gear.rod.traits && player.gear.rod.traits.some(t => t.id === 'lucky_strike');
                const chestChance = hasLuckyStrike ? 0.05 : 0.01;

                if (castRng.chance(chestChance)) {
                    const chestSeed = Date.now();
                    const chestArt = generateChest({ rng: createRng(chestSeed), isMimic: false });

                    castPool.push({
                        id: 'treasure_chest_random',
                        isEventChest: false, // Marked as a random salvage chest
                        identity: { name: 'Sunken Chest', family: 'Treasure', rarity: 'Rare' },
                        art: chestArt,
                        chestSeed: chestSeed,
                        combat: { stamina: 120, speed: 60, aggression: 0, hookWindowMs: 2500 },
                        physical: { sizeTier: 'Medium', weightRange: { min: 50, max: 100 } },
                        lurePrefs: { color: effStats.activeLure.color, sound: effStats.activeLure.sound, light: effStats.activeLure.light, weight: effStats.activeLure.weight, tolerance: 1.0 },
                        environment: { depthPref: 'Bottom-feeder' },
                        actualWeight: 75.0,
                        instanceId: `inst_${Date.now()}`,
                        invType: 'chest_encounter'
                    });
                }
            }

            // 5. Check if we spooked everything
            if (castPool.length === 0) {
                HUD.logAction("Your boat was too noisy. All fish fled!", "danger");
                SFX.playError();
                mouse.isCharging = false;
                mouse.chargePct = 0;
                ExplorationEngine.velocity = 0;
                return; 
            }

            // 6. Proceed to Fishing Minigame
            currentState = STATE.FISHING;
            document.getElementById('z50-action').style.display = 'flex';
            document.getElementById('z50-action').style.background = 'transparent';

            FishingEngine.startCast(effStats, player.stats.stamina, castPool, maxDepth, gameTimeMinutes);
            
            // --- NEW: BOSS HAZARD CALLBACK ---
            FishingEngine.onBossStrike = (amount, reason) => {
                player.vitals.hp -= amount;
                SFX.playError();
                
                if (reason === "Steam Vent") HUD.logAction(`Boiling steam vent! Hull took ${amount} damage.`, "danger");
                else if (reason === "Thermal Overload") HUD.logAction(`Thermal overload! Hull took ${amount} damage.`, "danger");

                if (player.vitals.hp <= 0) {
                    handleEndFishing("Your boat was destroyed by the Leviathan!", "danger");
                    handleDeath();
                }
            };
            
            FishingRenderer.open({ lureDataUrl: player.gear.lure.imageDataUrl || '', biome: currentBiome, tileId: tId });
            HUD.logAction(`Line cast to ${maxDepth}m. Scroll to sink.`);

            setTimeout(() => {
                if (currentState === STATE.FISHING && FishingEngine.phase === 'SINKING') {
                    if (!FishingEngine.evaluateBite()) handleEndFishing("Nothing bit.", "danger");
                }
            }, 6000);
        } else {
            HUD.logAction("You hit land.");
        }
    }
}

function handleEndFishing(msg, type) {
    const isTether = FishingEngine.fishData && FishingEngine.fishData.id === 'cage_tether';
    const isCosmic = FishingEngine.fishData && FishingEngine.fishData.id === 'cosmic_salvage_chest';

    // A. TETHERING TRIAL COMPLETED SUCCESSFULLY
    if (isTether && FishingEngine.phase === 'CAUGHT') {
        FishingRenderer.close();
        document.getElementById('z50-action').style.display = 'none';
        currentState = STATE.EXPLORATION;
        
        exitAstralSea(true); // Ejects to normal map and flags abolethFreed = true
        return;
    }

    // B. TETHERING TRIAL FAILED (Line Snapped / Timer Expired)
    if (isTether && (FishingEngine.phase === 'SNAPPED' || FishingEngine.phase === 'ESCAPED')) {
        player.vitals.hp -= 30; // 30 Hull Damage
        SFX.playLineSnap();
        
        FishingRenderer.close();
        document.getElementById('z50-action').style.display = 'none';
        currentState = STATE.EXPLORATION;

        HUD.logAction("The Cage discharged kinetic energy! Took 30 damage.", "danger");
        HUD.logAction(FishingEngine.phase === 'SNAPPED' ? "Line snapped! The grid destabilized." : "Time expired! You failed to hold the tether.", "danger");
        
        if (player.vitals.hp <= 0) {
            handleDeath();
        }
        return;
    }

    // C. COSMIC SALVAGE CHEST CAUGHT
    if (isCosmic && FishingEngine.phase === 'CAUGHT') {
        const rng = createRng(Date.now());
        const goldFound = rng.int(500, 1500);
        player.vitals.gold += goldFound;
        
        // --- NEW: TRACKING HOOK (Gold Earned) ---
        player.endgameProgress.ice.stats.goldEarned += goldFound;
        if (this.callbacks.checkAchievements) this.callbacks.checkAchievements();

        HUD.logAction(`Opened Cosmic Salvage Chest! Found +${goldFound}g!`, "safe");
        
        // 1. Give Astral Infusion
        const infusionImg = generateConsumable({ id: 'cons_fuel_oil', rng: createRng(Date.now()) }).imageDataUrl;
        player.inventory.push({
            id: 'cons_astral_infusion',
            invType: 'consumable',
            name: 'Astral Infusion',
            desc: 'A glowing, celestial draught that instantly repairs 50 HP and completely refuels the lantern.',
            basePrice: 500,
            imageDataUrl: infusionImg
        });
        HUD.logAction("+1x Astral Infusion added to Cargo.", "safe");

        // 2. Rare chance for "The Event Horizon" Rod (15%)
        if (rng.chance(0.15)) {
            // Import generators to build the visual
            import('./data/rod_data_generator.js').then(mod => {
                const rod = {
                    id: 'rod_event_horizon',
                    invType: 'rod',
                    identity: { name: 'The Event Horizon', rarity: 'Legendary' },
                    art: { imageDataUrl: '' }, // Rehydrated below
                    stats: { power: 3.0, maxTension: 220, flexibility: 1.8, sensitivity: 500 },
                    traits: [{
                        id: 'event_horizon_power',
                        name: 'Singularity Force',
                        desc: '+30% Reeling Power in Abyssal biomes, and holds a permanent glowing line.',
                        valueMult: 2.0
                    }, {
                        id: 'glowing_line',
                        name: 'Luminescent Thread',
                        desc: 'Grants a passive +20 Light to any attached lure.',
                        valueMult: 1.15
                    }],
                    economy: { value: 6500 }
                };
                player.inventory.push(rod);
                
                // Rehydrate the visual
                import('./util/art_rehydrator.js').then(rehydrator => {
                    rehydrator.ArtRehydrator.rehydrateItem(rod);
                    HUD.logAction(`+ ${rod.identity.name} added to Cargo!`, "safe");
                });
            });
        }
        
        FishingRenderer.close();
        document.getElementById('z50-action').style.display = 'none';
        currentState = STATE.EXPLORATION;
        return;
    }

    HUD.logAction(msg, type);
    FishingRenderer.close();
    document.getElementById('z50-action').style.display = 'none';
    currentState = STATE.EXPLORATION;

    // --- LURE DURABILITY DEGRADATION & MYTHIC CONSUMPTION ---
    const lure = player.gear.lure;
    if (lure && (lure.maxDurability > 0 || lure.maxDurability === -1 || lure.maxDurability === null)) {
        
        let isMythicConsumed = false;
        const isMythic = (lure.maxDurability === -1 || lure.maxDurability === null);

        // Check if we successfully caught a Boss with its respective Mythic Lure
        if (FishingEngine.phase === 'CAUGHT' && FishingEngine.fishData && FishingEngine.fishData.identity.rarity === 'Boss') {
            const caughtId = FishingEngine.fishData.id;
            if (lure.id === 'lure_mycelial_hook' && caughtId === 'vesper_bloom_leviathan') {
                isMythicConsumed = true;
                HUD.logAction(`The ${lure.name} shatters after fulfilling its purpose!`, "warn");
            }
            else if (lure.id === 'lure_prismatic_geode_hook' && caughtId === 'geode_monarch') {
                isMythicConsumed = true;
                HUD.logAction(`The ${lure.name} shatters into beautiful crystal dust!`, "warn");
            }
            else if (lure.id === 'lure_brimstone_hook' && caughtId === 'ignis_gorged_serpentine') {
                isMythicConsumed = true;
                HUD.logAction(`The ${lure.name} melts into useless slag!`, "warn");
            }
            // --- NEW: Glacial Hook Shatter ---
            else if (lure.id === 'lure_glacial_hook' && caughtId === 'glacial_leviathan') {
                isMythicConsumed = true;
                HUD.logAction(`The ${lure.name} shatters into a million frozen shards!`, "warn");
            }
        }

        let shouldBreak = false;

        // --- FIX: Safely protect Mythic Lures from standard degradation ---
        if (isMythic) {
            if (isMythicConsumed) shouldBreak = true;
        } else {
            // Standard degradation
            if (FishingEngine.phase === 'SNAPPED') {
                lure.durability -= 3;
            } else if (FishingEngine.phase === 'CAUGHT') {
                lure.durability -= 1;
            }
            
            if (lure.durability <= 0) {
                shouldBreak = true;
                HUD.logAction(`Your ${lure.name} broke!`, "danger");
            }
        }
        
        if (shouldBreak) {
            SFX.playLineSnap();
            player.gear.lure = {
                name: 'Bare Hook',
                stats: { color: 0, sound: 0, light: 0, weight: 0 },
                durability: 0, maxDurability: 0,
                imageDataUrl: ''
            };
        }
    }
    
    // --- NEW: Restore standard Biome Music if we were in a Boss Fight ---
    if (MusicEngine.currentBiome === 'battle') {
        const targetNode = world.nodes[globalY][globalX];
        MusicEngine.playBiome(BIOMES[targetNode.biomeId].id, createRng(world.seed + globalX + globalY));
    }
}

function handleDeath() {
    // Prevent multiple triggers
    if (currentState === STATE.HUB || currentState === STATE.MENU) return;
    
    // Stop updates and movement immediately
    currentState = STATE.MENU; 
    HUD.toggleLocation(false); 
    ExplorationEngine.velocity = 0;
    keys.forward = keys.backward = keys.left = keys.right = false;
    mouse.isCharging = false;
    mouse.chargePct = 0;
    
    // Silence the music for dramatic effect
    MusicEngine.stop();

    // 1. Create Blackout Overlay
    const deathOverlay = document.createElement('div');
    deathOverlay.style.cssText = "position:absolute; inset:0; z-index:4000; background:#020617; display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0; transition: opacity 2s ease-in-out;";
    deathOverlay.innerHTML = `
        <h1 style="font-size:5rem; color:#EF4444; margin-bottom:1rem; text-shadow: 0 0 20px #EF4444;">HULL BREACHED</h1>
        <p style="color:#94A3B8; font-size:1.5rem; max-width:600px; text-align:center;">You black out as the freezing, dark waters rush in...</p>
    `;
    document.getElementById('game-container').appendChild(deathOverlay);
    
    // Trigger fade in
    setTimeout(() => { deathOverlay.style.opacity = '1'; }, 100);

    // 2. Process Penalties & Rescue Logic
    setTimeout(() => {
        // --- NEW: ASTRAL SEA COLLAPSE SYSTEM ---
        const abyssal = player.endgameProgress?.abyssal;
        if (abyssal && abyssal.activeAstralMap) {
            abyssal.activeAstralMap = false;
            
            // If they died before freeing the Aboleth, force them to retry from whirlpool 4
            if (!abyssal.abolethFreed) {
                abyssal.whirlpoolsEntered = 4; 
            }
            
            // Restore normal world so nearest settlement search works on the 16x16 map!
            globalX = abyssal.savedNormalX !== undefined ? abyssal.savedNormalX : world.startX;
            globalY = abyssal.savedNormalY !== undefined ? abyssal.savedNormalY : world.startY;
            const savedSeed = abyssal.savedNormalWorldSeed || world.seed;
            discoveredNodes = abyssal.savedNormalDiscovered || [`${globalX},${globalY}`];
            world = generateGlobalMap(savedSeed, discoveredNodes);
        }

        // Cut gold in half
        const lostGold = Math.ceil(player.vitals.gold / 2);
        player.vitals.gold -= lostGold;
        
        // Discard ~50% of raw cargo (fish and parts), keep equipped gear/rods safe
        let lostItemsCount = 0;
        player.inventory = player.inventory.filter(item => {
            if (item.invType === 'fish' || item.invType === 'part') {
                if (Math.random() < 0.5) {
                    lostItemsCount++;
                    return false; // Discard it
                }
            }
            return true; // Keep it
        });

        // Restore HP to full
        const effStats = PlayerEngine.getEffectiveStats(player); // <-- NEW
        player.vitals.hp = effStats.exploration.maxHp; // <-- UPDATED


        // Find Nearest Discovered Settlement
        let bestNode = world.nodes[world.startY][world.startX]; // Fallback to start node
        let minDistance = Infinity;

        for (let y = 0; y < world.height; y++) {
            for (let x = 0; x < world.width; x++) {
                const node = world.nodes[y][x];
                // Check if we have been there and it has a settlement
                if (node.isDiscovered && node.hasSettlement) {
                    // Calculate Manhattan distance grid-wise
                    const dist = Math.abs(x - globalX) + Math.abs(y - globalY);
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestNode = node;
                    }
                }
            }
        }

        // Move player to the rescue settlement
        globalX = bestNode.x;
        globalY = bestNode.y;

        // 3. Update Overlay Message
        deathOverlay.innerHTML = `
            <h1 style="font-size:4rem; color:#FBBF24; margin-bottom:1rem; text-shadow: 0 0 20px rgba(251,191,36,0.5);">RESCUED</h1>
            <p style="color:#E2E8F0; font-size:1.5rem; max-width:600px; text-align:center; line-height: 1.5;">
                Scavengers dragged you to the docks of <b>${bestNode.settlementName}</b>.<br><br>
                <span style="color:#EF4444;">Lost <b>${lostGold}g</b> in rescue fees.</span><br>
                <span style="color:#EF4444;">Lost <b>${lostItemsCount}</b> cargo items to the depths.</span>
            </p>
        `;

        // Silently rebuild the background map for the new location
        loadLocalNode(null);
        
    }, 3000);

    // 4. Fade out and open Hub
    setTimeout(() => {
        deathOverlay.style.opacity = '0';
        setTimeout(() => {
            deathOverlay.remove();
            enterHub(); // Force opens the settlement UI
            saveCurrentState(); // Commit the penalties
        }, 2000);
    }, 9000);
}

function toggleGrimoire() {
    if (currentState === STATE.MENU || currentState === STATE.HUB) return;
    
    if (currentState === STATE.EXPLORATION) {
        currentState = STATE.GRIMOIRE;
        GrimoireUI.open({ player, world, globalX, globalY });
    } else if (currentState === STATE.GRIMOIRE) {
        currentState = STATE.EXPLORATION;
        GrimoireUI.close();
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }
}

function togglePause() {
    if (currentState === STATE.MENU || currentState === STATE.HUB) return;

    if (currentState === STATE.PAUSE) {
        currentState = stateBeforePause;
        PauseUI.close();
        Tone.Transport.start(); // Resumes generative music tracks
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    } else {
        stateBeforePause = currentState;
        currentState = STATE.PAUSE;
        PauseUI.open();
        Tone.Transport.pause(); // Freezes music tracks dynamically
    }
}

// --- INPUT SETUP ---

function setupInputListeners() {
    window.onkeydown = (e) => {
        if (e.key === 'Tab') { e.preventDefault(); toggleGrimoire(); }
        if (e.key === 'Escape') { 
            e.preventDefault(); 
            if (currentState === STATE.GRIMOIRE) toggleGrimoire(); // Close grimoire first if open
            else togglePause(); 
        }
        if (currentState === STATE.EXPLORATION) {
            if (['w','ArrowUp'].includes(e.key)) keys.forward = true;
            if (['s','ArrowDown'].includes(e.key)) keys.backward = true;
            if (['a','ArrowLeft'].includes(e.key)) keys.left = true;
            if (['d','ArrowRight'].includes(e.key)) keys.right = true;
            if (['e','E'].includes(e.key)) {
                if (!keys.action) keys.actionJustPressed = true;
                keys.action = true;
            }
        } else if (currentState === STATE.FISHING && e.code === 'Space') {
            isReeling = true;
            if (FishingEngine.phase === 'BITE') attemptHookAndMusic(); // <-- FIXED
        }
    };

    window.onkeyup = (e) => {
        if (['w','ArrowUp'].includes(e.key)) keys.forward = false;
        if (['s','ArrowDown'].includes(e.key)) keys.backward = false;
        if (['a','ArrowLeft'].includes(e.key)) keys.left = false;
        if (['d','ArrowRight'].includes(e.key)) keys.right = false;
        if (['e','E'].includes(e.key)) {
            keys.action = false;
            keys.actionJustPressed = false;
        }
        if (e.code === 'Space') isReeling = false;
    };

    const container = document.getElementById('game-container');
    container.onmousemove = (e) => {
        const rect = container.getBoundingClientRect();
        mouse.mouseX = (e.clientX - rect.left) * (1280 / rect.width);
        mouse.mouseY = (e.clientY - rect.top) * (720 / rect.height);
    };

    container.onmousedown = () => {
        if (currentState === STATE.EXPLORATION) { mouse.isCharging = true; mouse.chargePct = 0; }
        else if (currentState === STATE.FISHING) {
            if (FishingEngine.phase === 'SINKING') handleEndFishing("Cast cancelled.", "normal");
            else { 
                isReeling = true; 
                if (FishingEngine.phase === 'BITE') attemptHookAndMusic(); // <-- FIXED
            }
        }
    };

    container.onmouseup = () => {
        if (currentState === STATE.EXPLORATION && mouse.isCharging) {
            mouse.isCharging = false;
            handleAttemptCast();
            mouse.chargePct = 0;
        }
        isReeling = false;
    };

    container.onwheel = (e) => {
        if (currentState === STATE.FISHING) {
            if (FishingEngine.phase === 'SINKING') {
                FishingEngine.scrollDepth(e.deltaY / 15);
            } else if (FishingEngine.phase === 'FIGHT') {
                // NEW: Route scroll to the Reel Power slider during the fight!
                FishingEngine.scrollReelPower(e.deltaY);
            }
        }
    };

// ==========================================
// DEBUG & CHEAT COMMANDS (Accessible via Browser Console)
// ==========================================

window.HelpCheats = function() {
    console.log(`
    🛠️ UNDERDARK FISHING - CHEAT MENU 🛠️
    --------------------------------------------------
    TeleportToPOI('poi_name')         - 'myconid_colony', 'crystal_museum', 'volcanic_arena', 'anglers_club'
    ListSettlements()                 - Lists all towns and their coordinates.
    TeleportToSettlement(id)          - Warps to a specific town.
    GiveCheatFish(amount, 'Size')     - Fills cargo.
    GiveSpecificFish('family', 'Rarity', 'Size')
    AddGold(amount)                   - Adds gold.
    SetStat('statName', value)        - E.g., SetStat('fishing', 10)
    ClearCargo()                      - Empties inventory.
    RefillVitals()                    - Maxes HP, Fuel, and Rations.
    MaxIceAchievements()              - Instantly unlocks Rank S in the Anglers Club!
    --------------------------------------------------
    `);
    return "Cheat menu loaded.";
};

// --- NEW CHEAT: Instantly Complete The Anglers Club ---
window.MaxIceAchievements = function() {
    if (!player || !player.endgameProgress || !player.endgameProgress.ice) return "❌ You must start a game first!";
    
    const s = player.endgameProgress.ice.stats;
    
    // Category A: Volume & Rarity
    s.totalFishCaught = 1000;
    s.rareFishCaught = 10;
    s.legendaryFishCaught = 5;
    s.bossFishCaught = 1;
    s.deepseaCaught = 10;
    s.jellyfishCaught = 30;
    
    // Category B: Physical Feats
    s.heaviestCatch = 1250;
    s.predatorCaught = 10;
    s.eelCaught = 15;
    s.heaviestRay = 350;
    
    // Category C: Crafting & Knowledge
    s.luresCrafted = 10;
    s.potionsBrewed = 25;
    s.baitsMashed = 15;
    s.fishDissected = 100;
    
    // Cross-Quest dependencies
    player.endgameProgress.fungal.totalCompostKg = 1000;
    for (let i = 0; i < 20; i++) player.endgameProgress.crystal.filledSlots[`dummy_${i}`] = true;
    
    // Bestiary dependencies
    let bestiaryCount = 0;
    for (let key in player.bestiary) {
        player.bestiary[key].xp = 250;
        bestiaryCount++;
    }
    while (bestiaryCount < 10) {
        player.bestiary[`dummy_fish_${bestiaryCount}`] = { xp: 250 };
        bestiaryCount++;
    }
    
    // Category D: Economy
    s.goldEarned = 20000;
    s.mostExpensiveFishSold = 550;
    s.itemsBought = 15;
    
    player.safehouses["0,0"] = { hangar: [{}, {}, {}] }; // Fake hangar hoarder
    
    // Category E: Sailing
    s.whirlpoolsEscaped = 3;
    s.packIceBroken = 50;
    s.lavaTimeSurvived = 600;
    s.tournamentsWon = 3;
    
    // Trigger Evaluation
    evaluateAchievements();
    
    // Force UI Refresh if currently in the Lodge
    if (currentState === STATE.HUB && window.HubUI && window.HubUI.activeTab === 'lodge') {
        window.HubUI.renderActiveTab();
    }
    
    return "🏆 All Anglers Club stats maxed! Check The Lodge—you should now be Rank S.";
};

window.TeleportToPOI = function(poiId = 'myconid_colony') {
    if (!world) return "❌ You must start a game first!";
    for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
            if (world.nodes[y][x].poi === poiId) {
                globalX = x; globalY = y;
                const nodeKey = `${x},${y}`;
                if (!discoveredNodes.includes(nodeKey)) discoveredNodes.push(nodeKey);
                world.nodes[y][x].isDiscovered = true;
                saveCurrentState();
                loadLocalNode('warp');
                return `✨ Teleported to ${poiId} at coordinates [${x}, ${y}].`;
            }
        }
    }
    return `❌ POI '${poiId}' not found on this map!`;
};

window.GiveCheatFish = function(amount = 10, forcedSize = 'Massive') {
    if (!player) return "❌ You must start a game first!";
    const effStats = PlayerEngine.getEffectiveStats(player);
    const spaceLeft = effStats.exploration.cargoSpace - player.inventory.length;
    const actualAmount = Math.min(amount, spaceLeft);
    if (actualAmount <= 0) return "❌ Cargo Hold is full!";
    
    for(let i = 0; i < actualAmount; i++) {
        const fishData = generateFishData({ seed: Date.now() + i });
        fishData.physical.sizeTier = forcedSize;
        if (forcedSize === 'Massive') fishData.physical.weightRange = {min: 500, max: 1000};
        const instance = generateFishInstance(fishData, createRng(Date.now() + i));
        player.inventory.push(instance);
    }
    if (currentState === STATE.HUB && HubUI.activeTab === 'compost') HubUI.renderActiveTab();
    return `🐟 Added ${actualAmount} ${forcedSize} fish to your Cargo Hold.`;
};

window.GiveSpecificFish = function(family = 'shark', rarity = 'Legendary', sizeTier = 'Massive') {
    if (!player) return "❌ You must start a game first!";
    
    // 1. Generate the base species
    const fishData = generateFishData({ seed: Date.now(), family: family });
    fishData.physical.sizeTier = sizeTier;
    
    // Set appropriate weight ranges for the forced size
    const wMap = { 'Tiny': [0.1, 2.5], 'Small': [2, 8], 'Medium': [7, 25], 'Large': [20, 150], 'Massive': [120, 800] };
    fishData.physical.weightRange = { min: wMap[sizeTier][0], max: wMap[sizeTier][1] };

    // 2. Rig the RNG to force the specific rarity
    const riggedRng = createRng(Date.now());
    const originalInt = riggedRng.int;
    riggedRng.int = (min, max) => {
        if (max === 100) {
            if (rarity === 'Common') return 1;
            if (rarity === 'Uncommon') return 60;
            if (rarity === 'Rare') return 85;
            if (rarity === 'Legendary') return 96;
            if (rarity === 'Boss') return 100;
        }
        return originalInt(min, max);
    };

    const instance = generateFishInstance(fishData, riggedRng);
    player.inventory.push(instance);
    return `✨ Spawned a ${rarity} ${sizeTier} ${family} and placed it in your Cargo Hold!`;
};

window.AddGold = function(amount = 10000) {
    if (!player) return "❌ You must start a game first!";
    player.vitals.gold += amount;
    if (currentState === STATE.HUB) HubUI.renderActiveTab();
    return `💰 Added ${amount}g. You now have ${player.vitals.gold}g.`;
};

window.SetStat = function(statName, value) {
    if (!player) return "❌ You must start a game first!";
    if (player.stats[statName] !== undefined) {
        player.stats[statName] = value;
        return `📈 Set ${statName} to ${value}.`;
    }
    return `❌ Stat '${statName}' does not exist. Try: fishing, stamina, driving, crafting, bartering, intelligence.`;
};

window.ClearCargo = function() {
    if (!player) return "❌ You must start a game first!";
    player.inventory = player.inventory.filter(i => i.invType !== 'fish' && i.invType !== 'part');
    if (currentState === STATE.HUB) HubUI.renderActiveTab();
    return `🗑️ Cargo Hold cleared of all fish and parts.`;
};

window.RefillVitals = function() {
    if (!player) return "❌ You must start a game first!";
    const effStats = PlayerEngine.getEffectiveStats(player);
    player.vitals.hp = effStats.exploration.maxHp;
    player.vitals.fuel = 100;
    player.vitals.rations = 20;
    return `🍲 Vitals (HP, Fuel, Rations) restored to maximum.`;
};

// --- NEW: Settlement Teleportation & Discovery Tools ---

window.ListSettlements = function() {
    if (!world) return "❌ You must start a game first!";
    
    let list = "⚓ Active Settlements in this World:\n--------------------------------------------------\n";
    let index = 1;
    
    for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
            const node = world.nodes[y][x];
            if (node.hasSettlement) {
                list += `${index}. "${node.settlementName}" [${x}, ${y}] — Biome: ${node.biomeId.toUpperCase()}\n`;
                index++;
            }
        }
    }
    list += "--------------------------------------------------\nType TeleportToSettlement(number) or TeleportToSettlement('Name') to warp.";
    return list;
};

window.TeleportToSettlement = function(nameOrIndex) {
    if (!world) return "❌ You must start a game first!";
    
    const settlements = [];
    for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
            const node = world.nodes[y][x];
            if (node.hasSettlement) {
                settlements.push(node);
            }
        }
    }
    
    if (settlements.length === 0) return "❌ No settlements found in this world!";
    
    let targetNode = null;
    
    // Resolve target by index number (1-based)
    if (typeof nameOrIndex === 'number') {
        const idx = nameOrIndex - 1;
        if (idx >= 0 && idx < settlements.length) {
            targetNode = settlements[idx];
        }
    } 
    // Resolve target by partial string name matching
    else if (typeof nameOrIndex === 'string') {
        targetNode = settlements.find(s => s.settlementName.toLowerCase().includes(nameOrIndex.toLowerCase()));
    } 
    // Default: Teleport to the first settlement on the list
    else {
        targetNode = settlements[0];
    }
    
    if (targetNode) {
        globalX = targetNode.x;
        globalY = targetNode.y;
        
        const nodeKey = `${globalX},${globalY}`;
        if (!discoveredNodes.includes(nodeKey)) discoveredNodes.push(nodeKey);
        world.nodes[globalY][globalX].isDiscovered = true;
        
        saveCurrentState();
        loadLocalNode('warp');
        return `⚓ Warp successful! Welcome to the docks of ${targetNode.settlementName} [${targetNode.x}, ${targetNode.y}].`;
    }
    
    return `❌ Settlement not found! Type ListSettlements() to see valid names and numbers.`;
};

// --- NEW: Unified Hook and Battle Music Trigger ---
function attemptHookAndMusic() {
    if (FishingEngine.attemptHook()) {
        if (FishingEngine.fishData.identity.rarity === 'Boss') {
            MusicEngine.playBiome('battle', createRng(Date.now()));
        }
    }
}
/**
 * --- GLOBAL EXIT PIPELINE ---
 */
window.exitAstralSea = function(freedAboleth = false) {
    const abyssal = player.endgameProgress?.abyssal;
    if (!abyssal || !abyssal.activeAstralMap) return;

    abyssal.activeAstralMap = false;
    if (freedAboleth) {
        abyssal.abolethFreed = true;
    }

    globalX = abyssal.savedNormalX !== undefined ? abyssal.savedNormalX : world.startX;
    globalY = abyssal.savedNormalY !== undefined ? abyssal.savedNormalY : world.startY;
    const savedSeed = abyssal.savedNormalWorldSeed || world.seed;
    discoveredNodes = abyssal.savedNormalDiscovered || [`${globalX},${globalY}`];

    world = generateGlobalMap(savedSeed, discoveredNodes);

    SFX.playLevelUp(); 
    HUD.logAction("🌀 PORTAL COLLAPSED! You are violently expelled back into the Darklake...", "warn");
    if (freedAboleth) {
        HUD.logAction("The Aboleth has escaped into the deep waters.", "safe");
    } else {
        HUD.logAction("Ejected back near the Mage Tower.", "normal");
    }

    saveCurrentState();
    loadLocalNode('warp'); 
};

/**
 * --- GLOBAL TETHERING TRIAL ---
 */
window.startTetheringTrial = function() {
    ExplorationEngine.velocity = 0;
    keys.forward = keys.backward = keys.left = keys.right = false;

    const effStats = PlayerEngine.getEffectiveStats(player);
    
    currentState = STATE.FISHING;
    document.getElementById('z50-action').style.display = 'flex';
    document.getElementById('z50-action').style.background = 'transparent';

    const cageTether = {
        id: 'cage_tether',
        identity: { name: 'Energy Cage', family: 'Treasure', rarity: 'Boss' },
        combat: {
            stamina: [99999, 99999, 99999], 
            speed: [15, 15, 15], 
            aggression: [0.0, 0.0, 0.0], // <-- CHANGED to 0 to disable random jumping
            hookWindowMs: 2500,
            optimalReel: [50, 50, 50]
        },
        physical: { sizeTier: 'Massive', weightRange: { min: 1000, max: 1000 } },
        lurePrefs: { color: effStats.activeLure.color, sound: effStats.activeLure.sound, light: effStats.activeLure.light, weight: effStats.activeLure.weight, tolerance: 1.0 },
        environment: { depthPref: 'Bottom-feeder' },
        actualWeight: 1000.0,
        instanceId: `inst_${Date.now()}`,
        invType: 'cage_tether'
    };

    FishingEngine.startCast(effStats, player.stats.stamina, [cageTether], 50, gameTimeMinutes);
    
    FishingEngine.phase = 'FIGHT';
    FishingEngine.fishData = cageTether;
    FishingEngine.maxFishStamina = 99999;
    FishingEngine.fishStamina = 99999;
    
    FishingEngine.tension = effStats.minigame.maxTension * 0.15; 
    FishingEngine.maxFightTimer = 60.0; 
    FishingEngine.fightTimer = 60.0;    
    FishingEngine.catchProgress = 0; 
    
    FishingEngine.ai.state = 'INANIMATE'; // <-- CHANGED
    FishingEngine.ai.timer = 999.0;

    FishingRenderer.open({ lureDataUrl: player.gear.lure.imageDataUrl || '', biome: currentBiome, tileId: TILE.DOCK });
    
    FishingRenderer.elements.title.innerText = "Tethering Trial: Stabilize Energy Grid!";
    FishingRenderer.elements.title.style.color = '#C084FC';
    
    HUD.logAction("🌀 TETHERED! Survive 60s in the ±8% sweet spot. Keep the line steady!", "warn"); // Text updated
};

}