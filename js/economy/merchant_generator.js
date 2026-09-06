/**
 * js/economy/merchant_generator.js
 * Generates dynamic shop inventories for settlements.
 * V4 - Split into Vendor Specializations and implemented Barter Luck Rarity Scaling.
 */

import { createRng } from '../util/rng.js';
import { generateRodData } from '../data/rod_data_generator.js';
import { generateBoatData } from '../data/boat_data_generator.js';
import { generateLurePart } from '../art/lure_generator.js';
import { generateConsumable } from '../art/consumable_generator.js';
import { AlchemyCrafter } from '../fishing/alchemy_crafter.js';
import { LureCrafter } from '../fishing/lure_crafter.js';
import { generateUpgrade } from '../art/upgrade_generator.js'; 
import { generateMythicLure } from '../art/mythic_lure_generator.js';

// --- INVENTORY DATABASES ---
const CONSUMABLES = [
    { id: 'cons_ration', name: 'Cave Rations', type: 'consumable', basePrice: 5, desc: 'Restores food. Prevents starvation while traveling.' },
    { id: 'cons_fuel_oil', name: 'Flask of Oil', type: 'consumable', basePrice: 8, desc: 'Refuels standard lanterns.' },
    { id: 'cons_repair_kit', name: 'Hull Repair Kit', type: 'consumable', basePrice: 50, desc: 'Restores 25 HP to your boat in the field.' }
];

const BOAT_UPGRADES = [
    { id: 'upg_lantern_kero', name: 'Kerosene Lantern', slot: 'lantern', type: 'upgrade', basePrice: 500, desc: 'Increases light radius to 350px.', lightRadius: 350, fuelDrainRate: 0.8 },
    { id: 'upg_lantern_magic', name: 'Magic Orb Lantern', slot: 'lantern', type: 'upgrade', basePrice: 1500, desc: 'Increases light radius to 500px.', lightRadius: 500, fuelDrainRate: 0.1 },
    { id: 'upg_cargo_net', name: 'Cargo Netting', slot: 'storage', type: 'upgrade', basePrice: 300, desc: 'Increases boat storage by +10 slots.' },
    { id: 'upg_iron_plating', name: 'Iron Plating', slot: 'plating', type: 'upgrade', basePrice: 800, desc: '+50 Hull HP. Grants immunity to Volcanic boiling waters.' },
    { id: 'upg_acoustic_dampening', name: 'Acoustic Dampening', slot: 'plating', type: 'upgrade', basePrice: 900, desc: '+30% Stealth. Grants immunity to Crystal shatter-storms.' },
    { id: 'upg_overclocked_motor', name: 'Overclocked Motor', slot: 'engine', type: 'upgrade', basePrice: 1200, desc: '+20% Top Speed. Grants immunity to Abyssal whirlpools.' },
    { id: 'upg_alchemical_filter', name: 'Alchemical Filter', slot: 'engine', type: 'upgrade', basePrice: 1100, desc: '+15% Acceleration. Grants immunity to Fungal spore storms.' },
    { id: 'upg_icebreaker_prow', name: 'Icebreaker Prow', slot: 'prow', type: 'upgrade', basePrice: 1000, desc: '-50% Collision Damage. Grants immunity to Frozen ice floes.' }
];

const LURE_PARTS_POOL = [
    { id: 'part_fish_gut', name: 'Fresh Fish Gut', visualId: 'fish_gut', rarity: 'Common', basePrice: 15 },
    { id: 'part_bone_dust', name: 'Bone Dust', visualId: 'bone_dust', rarity: 'Common', basePrice: 15 },
    { id: 'part_iron_sinker', name: 'Iron Sinker', visualId: 'iron_sinker', rarity: 'Common', basePrice: 20 },
    { id: 'part_rat_tail', name: 'Rat Tail', visualId: 'rat_tail', rarity: 'Common', basePrice: 20 },
    { id: 'part_mushroom_stalk', name: 'Mushroom Stalk', visualId: 'mushroom_stalk', rarity: 'Uncommon', basePrice: 35 },
    { id: 'part_cave_crawler', name: 'Cave-Crawler Leg', visualId: 'cave_crawler_leg', rarity: 'Uncommon', basePrice: 45 },
    { id: 'part_lead_sinker', name: 'Lead Sinker', visualId: 'lead_sinker', rarity: 'Uncommon', basePrice: 50 },
    { id: 'part_spinner', name: 'Tin Spinner', visualId: 'spinner', rarity: 'Uncommon', basePrice: 60 },
    { id: 'part_glow_bulb', name: 'Glow Bulb', visualId: 'glow_bulb', rarity: 'Uncommon', basePrice: 55 },
    { id: 'part_rattler_bells', name: 'Rattler Bells', visualId: 'rattler_bells', rarity: 'Uncommon', basePrice: 65 },
    { id: 'part_phosphor_cap', name: 'Phosphorescent Cap', visualId: 'phosphor_cap', rarity: 'Rare', basePrice: 150 },
    { id: 'part_wraith_silk', name: 'Wraith Silk', visualId: 'wraith_silk', rarity: 'Rare', basePrice: 200 },
    { id: 'part_myconid_spore', name: 'Myconid Spore', visualId: 'myconid_spore', rarity: 'Rare', basePrice: 160 },
    { id: 'part_jelly_bell', name: 'Jelly Bell', visualId: 'jelly_bell', rarity: 'Rare', basePrice: 180 }
];


export const MerchantGenerator = {

    // --- 1. THE MERCHANT (GENERAL STORE) ---
    getMerchantStock(seed, biomeId, playerBarterLevel = 1) {
        const rng = createRng(seed);
        const inventory = [];
        
        // ECONOMY FIX: Level 1 = 1.4x markup. Level 5 = 1.0x (No markup!)
        const buyMult = Math.max(1.0, 1.5 - (playerBarterLevel * 0.1));

        // A. Consumables
        CONSUMABLES.forEach((c, idx) => {
            const formatted = this._formatStoreItem(c, 99, buyMult, rng);
            formatted.imageDataUrl = generateConsumable({ id: c.id, rng: createRng(seed + idx) }).imageDataUrl;
            formatted.invType = 'consumable';
            inventory.push(formatted);
        });

// B. Pre-Crafted Alchemy & Lures (Dynamically Generated)
        const craftLvl = Math.max(1, Math.floor(playerBarterLevel / 2) + 1);
        const types = ['lure', 'potion', 'bait'];
        types.forEach((t) => {
            const numToMake = rng.int(1, 2);
            for(let j = 0; j < numToMake; j++) {
                const item = this._createRandomCraftedItem(t, createRng(rng.next() * 1000000), craftLvl);
                if (item) {
                    // FIX: Manually wrap the item so `itemData` contains the full object, preventing collisions
                    const basePrice = item.basePrice || 10;
                    const fuzzed = basePrice * rng.float(0.9, 1.1);
                    
                    const storeItem = {
                        id: item.id,
                        name: item.name,
                        type: t,
                        itemData: item, // <-- Properly wrapping the full item!
                        price: Math.max(1, Math.round(fuzzed * buyMult)),
                        stock: 1,
                        desc: ''
                    };

                    // Add desc for the shop UI
                    if (t === 'potion') storeItem.desc = `Grants +${item.buff.amount} ${item.buff.statName}`;
                    else if (t === 'bait') storeItem.desc = `Attracts: ${item.targetFamily}`;
                    else if (t === 'lure') storeItem.desc = `Durability: ${item.durability} Casts`;
                    
                    inventory.push(storeItem);
                }
            }
        });

        // C. Fishing Rods
        const numRods = rng.int(1, 3) + (playerBarterLevel >= 4 ? 1 : 0);
        let attempts = 0;
        let spawnedRods = 0;
        while(spawnedRods < numRods && attempts < 20) {
            attempts++;
            const rod = generateRodData({ seed: rng.next() * 100000 });
            
            // Barter Luck: Filters out Legendaries if barter is too low, and filters out Commons if barter is high
            if (rod.identity.rarity === 'Legendary' && (playerBarterLevel < 4 || !rng.chance(0.15))) continue;
            if (rod.identity.rarity === 'Common' && playerBarterLevel >= 3 && rng.chance(0.6)) continue;
            
            inventory.push({
                id: rod.id,
                name: rod.identity.name,
                type: 'rod',
                itemData: rod,
                price: Math.max(1, Math.round(rod.economy.value * buyMult)),
                stock: 1,
                desc: `Power: ${rod.stats.power}x | Tension: ${rod.stats.maxTension}`
            });
            spawnedRods++;
        }

        return inventory;
    },

// --- 2. THE FISHMONGER (ORGANIC PARTS) ---
    getFishmongerStock(seed, biomeId, playerBarterLevel = 1) {
        const rng = createRng(seed);
        const inventory = [];
        
        // ECONOMY FIX: Level 1 = 1.4x markup. Level 5 = 1.0x (No markup!)
        const buyMult = Math.max(1.0, 1.5 - (playerBarterLevel * 0.1));

        const numParts = rng.int(4, 8) + Math.floor(playerBarterLevel / 2);
        for (let i = 0; i < numParts; i++) {
            
            let rareChance = 10 + (playerBarterLevel * 6); 
            let uncChance = 30 + (playerBarterLevel * 4);  
            
            const roll = rng.int(1, 100);
            let targetRarity = 'Common';
            if (roll <= rareChance) targetRarity = 'Rare';
            else if (roll <= rareChance + uncChance) targetRarity = 'Uncommon';

            const candidates = LURE_PARTS_POOL.filter(p => p.rarity === targetRarity);
            const part = rng.pick(candidates.length > 0 ? candidates : LURE_PARTS_POOL);
            
            const stock = part.rarity === 'Common' ? rng.int(3, 8) : 
                          part.rarity === 'Uncommon' ? rng.int(1, 4) : rng.int(1, 2);

            const formattedPart = this._formatStoreItem(part, stock, buyMult, rng);
            formattedPart.stats = { 
                color: rng.int(-20, 20), sound: rng.int(-20, 20), 
                light: rng.int(-20, 20), weight: rng.int(-20, 20) 
            };
            formattedPart.imageDataUrl = generateLurePart({ visualId: part.visualId, rng: createRng(rng.next()*10000) });
            formattedPart.type = 'part';
            formattedPart.invType = 'part';
            
            inventory.push(formattedPart);
        }
        return inventory;
    },

    // --- 3. THE BOATWRIGHT (SHIPYARD) ---
    getBoatwrightStock(seed, biomeId, playerBarterLevel = 1) {
        const rng = createRng(seed);
        const inventory = [];
        
        const buyMult = Math.max(1.0, 1.5 - (playerBarterLevel * 0.1));

        // A. Boats
        const numBoats = rng.chance(0.5 + playerBarterLevel * 0.1) ? rng.int(1, 2) : 0;
        let attempts = 0;
        let spawnedBoats = 0;
        while(spawnedBoats < numBoats && attempts < 20) {
            attempts++;
            const boat = generateBoatData({ seed: rng.next() * 100000 });
            if (boat.identity.rarity === 'Legendary' && (playerBarterLevel < 5 || !rng.chance(0.1))) continue;
            
            inventory.push({
                id: boat.id,
                name: boat.identity.name,
                type: 'boat',
                itemData: boat,
                price: Math.max(1, Math.round(boat.economy.value * buyMult)),
                stock: 1,
                desc: `Type: ${boat.art.boatType.toUpperCase()} | HP: ${boat.stats.hp}`
            });
            spawnedBoats++;
        }

// B. Upgrades
        const numUpgrades = rng.int(2, 4) + Math.floor(playerBarterLevel / 2);
        const shuffledUpgrades = [...BOAT_UPGRADES].sort(() => rng.float(-1, 1));
        for (let i = 0; i < Math.min(numUpgrades, shuffledUpgrades.length); i++) {
            const upg = this._formatStoreItem(shuffledUpgrades[i], 1, buyMult, rng);
            upg.invType = 'upgrade';
            
            // --- FIX: Generate the pixel art icon for the upgrade! ---
            upg.imageDataUrl = generateUpgrade({ id: upg.id, rng: createRng(seed + i) }).imageDataUrl;
            
            inventory.push(upg);
        }

        return inventory;
    },

// --- 4. THE WANDERING FISHERMAN (LOCAL MAP) ---
    getWanderingStock(seed, biomeId, playerBarterLevel = 1) {
        const merchantStock = this.getMerchantStock(seed, biomeId, playerBarterLevel);
        const partsStock = this.getFishmongerStock(seed + 1, biomeId, playerBarterLevel);
        
        const inv = [];
        
        // --- NEW: Guarantee emergency survival supplies ---
        const survivalGear = merchantStock.filter(i => i.id === 'cons_ration' || i.id === 'cons_fuel_oil');
        inv.push(...survivalGear);

        // Grab a curated mix of parts, a rod, and a potion/bait
        inv.push(...merchantStock.filter(i => i.type === 'rod').slice(0, 1));
        inv.push(...merchantStock.filter(i => i.type === 'potion' || i.type === 'bait').slice(0, 2));
        inv.push(...partsStock.slice(0, 3));
        
        return inv;
    },

    // --- TEMPORARY SHIM (Prevents crashing until Step 2 is complete) ---
    generateInventory(seed, biomeId, playerBarterLevel = 1) {
        return [
            ...this.getMerchantStock(seed, biomeId, playerBarterLevel),
            ...this.getFishmongerStock(seed + 1, biomeId, playerBarterLevel),
            ...this.getBoatwrightStock(seed + 2, biomeId, playerBarterLevel)
        ];
    },

    // --- 5. THE ANGLERS CLUB VAULT (ENDGAME POI) ---
    getClubShopStock(seed, clubRank, player = null) { // <-- FIX: Added player parameter
        const rng = createRng(seed);
        const inventory = [];
        
        // Convert rank string to a numeric tier for easy logic (D=1, C=2, B=3, A=4, S=5)
        const rankTier = { 'Rank D': 1, 'Rank C': 2, 'Rank B': 3, 'Rank A': 4, 'Rank S': 5 }[clubRank] || 1;
        
        // No markup in the club shop, prices are flat
        const buyMult = 1.0; 

        // Rank D+ (Tier 1) - Basic Consumables at a discount
        const ration = this._formatStoreItem(CONSUMABLES.find(c => c.id === 'cons_ration'), 99, 0.8, rng);
        ration.imageDataUrl = generateConsumable({ id: 'cons_ration', rng: createRng(seed) }).imageDataUrl;
        ration.invType = 'consumable';
        inventory.push(ration);

        // Rank C+ (Tier 2) - Advanced Repairs
        if (rankTier >= 2) {
            const hKit = this._formatStoreItem(CONSUMABLES.find(c => c.id === 'cons_repair_kit'), 99, 0.9, rng);
            hKit.name = "High-Grade Repair Kit";
            hKit.desc = "Restores 50 HP to your boat in the field.";
            hKit.basePrice = 80;
            hKit.price = 72; // 10% discount
            hKit.imageDataUrl = generateConsumable({ id: 'cons_repair_kit', rng: createRng(seed+1) }).imageDataUrl;
            hKit.invType = 'consumable';
            inventory.push(hKit);
        }

        // Rank B+ (Tier 3) - Raw Rare Materials
        if (rankTier >= 3) {
            const rareParts = LURE_PARTS_POOL.filter(p => p.rarity === 'Rare');
            rareParts.forEach((part, i) => {
                const formattedPart = this._formatStoreItem(part, rng.int(2, 5), buyMult, rng);
                formattedPart.stats = { color: rng.int(-20, 20), sound: rng.int(-20, 20), light: rng.int(-20, 20), weight: rng.int(-20, 20) };
                formattedPart.imageDataUrl = generateLurePart({ visualId: part.visualId, rng: createRng(seed+i) });
                formattedPart.type = 'part';
                formattedPart.invType = 'part';
                inventory.push(formattedPart);
            });
        }

        // Rank A+ (Tier 4) - Legendary Rods
        if (rankTier >= 4) {
            let attempts = 0;
            let rod;
            do {
                rod = generateRodData({ seed: rng.next() * 100000 });
                attempts++;
            } while (rod.identity.rarity !== 'Legendary' && attempts < 50);
            
            if (rod.identity.rarity === 'Legendary') {
                rod.invType = 'rod'; // <-- FIX: Explicitly tag the rod so it doesn't break in the UI
                inventory.push({
                    id: rod.id, name: rod.identity.name, type: 'rod', itemData: rod,
                    price: rod.economy.value, stock: 1, desc: `Power: ${rod.stats.power}x | Tension: ${rod.stats.maxTension}`
                });
            }
        }

        // Rank S (Tier 5) - The Mythic Lure & Masterwork Upgrades
        if (rankTier >= 5) {
            let bossCaught = false;
            let hasHook = false;

            if (player) {
                // Check if the boss is already defeated
                if (player.bestiary && player.bestiary['glacial_leviathan']) {
                    bossCaught = player.bestiary['glacial_leviathan'].caught > 0;
                }
                
                // Check active gear and cargo hold
                hasHook = player.inventory.some(i => i.id === 'lure_glacial_hook') || 
                          (player.gear.lure && player.gear.lure.id === 'lure_glacial_hook');
                
                // Deep-check all safehouse stashes just in case they hid it in a warehouse
                if (!hasHook && player.safehouses) {
                    for (const key in player.safehouses) {
                        if (player.safehouses[key].stash.some(i => i.id === 'lure_glacial_hook')) {
                            hasHook = true;
                            break;
                        }
                    }
                }
            }

            // Only spawn the Mythic Lure if they haven't caught the boss and don't already own it
            if (!bossCaught && !hasHook) {
                const mythicLure = {
                    id: `lure_glacial_hook`, invType: 'lure', name: 'The Glacial Hook',
                    stats: { color: -90, sound: -70, light: -80, weight: 90 },
                    durability: -1, maxDurability: -1, componentsUsed: 5, basePrice: 5000,
                    seed: rng.int(10000, 99999), components: ['iron_sinker', 'bone_dust', 'jelly_bell']
                };
                
                mythicLure.imageDataUrl = generateMythicLure({ lureId: 'glacial_hook', rng: createRng(mythicLure.seed) }).imageDataUrl; 
                
                inventory.push({
                    id: mythicLure.id, name: mythicLure.name, type: 'lure', itemData: mythicLure,
                    price: 5000, stock: 1, desc: "A hook encased in eternal ice. Breaks upon catching the Glacial Leviathan."
                });
            }
        }

        return inventory;
    },

    // --- INTERNAL HELPERS ---
    _formatStoreItem(itemObj, stock, buyMultiplier, rng) {
        const base = itemObj.basePrice || (itemObj.economy ? itemObj.economy.value : 10);
        const fuzzed = base * rng.float(0.9, 1.1);
        return {
            ...itemObj,
            price: Math.max(1, Math.round(fuzzed * buyMultiplier)),
            stock: stock
        };
    },

    _createRandomCraftedItem(type, rng, craftLvl) {
        const numParts = rng.int(3, 5);
        const parts = [];
        for(let p = 0; p < numParts; p++) {
            const poolPart = rng.pick(LURE_PARTS_POOL);
            parts.push({
                visualId: poolPart.visualId,
                rarity: poolPart.rarity,
                stats: { color: rng.int(-20,20), sound: rng.int(-20,20), light: rng.int(-20,20), weight: rng.int(-20,20) }
            });
        }
        let item;
        if (type === 'potion') item = AlchemyCrafter.craftPotion(parts, craftLvl, rng.next()*100000);
        else if (type === 'bait') item = AlchemyCrafter.craftBait(parts, craftLvl, rng.next()*100000);
        else item = LureCrafter.craft(parts, craftLvl, rng.next()*100000);
        
        if (item) item.invType = type;
        return item;
    }
};