/**
 * js/data/achievement_engine.js
 * Evaluates player lifetime stats to unlock Anglers Club achievements and calculate Club Rank.
 */

const CLUB_RANKS = [
    { id: 'Rank S', minPts: 1001 },
    { id: 'Rank A', minPts: 701 },
    { id: 'Rank B', minPts: 401 },
    { id: 'Rank C', minPts: 151 },
    { id: 'Rank D', minPts: 0 }
];

export const ACHIEVEMENTS = [
    // --- CATEGORY A: Volume & Rarity ---
    { id: 'ach_volume_1', category: 'Volume & Rarity', title: 'First Blood', desc: 'Catch 10 fish of any type.', pts: 10, check: (s) => s.totalFishCaught >= 10 },
    { id: 'ach_volume_2', category: 'Volume & Rarity', title: 'Master of the Net', desc: 'Catch 250 fish of any type.', pts: 25, check: (s) => s.totalFishCaught >= 250 },
    { id: 'ach_volume_3', category: 'Volume & Rarity', title: 'Lord of the Deeplake', desc: 'Catch 1,000 fish of any type.', pts: 50, check: (s) => s.totalFishCaught >= 1000 },
    { id: 'ach_rarity_1', category: 'Volume & Rarity', title: 'Glint Finder', desc: 'Catch 10 Rare-tier fish.', pts: 25, check: (s) => s.rareFishCaught >= 10 },
    { id: 'ach_rarity_2', category: 'Volume & Rarity', title: 'Legendary Haul', desc: 'Catch 5 Legendary-tier fish.', pts: 55, check: (s) => s.legendaryFishCaught >= 5 },
    { id: 'ach_boss_1', category: 'Volume & Rarity', title: 'Monster of the Mists', desc: 'Catch any Boss-tier fish.', pts: 100, check: (s) => s.bossFishCaught >= 1 },
    { id: 'ach_deep_1', category: 'Volume & Rarity', title: 'Void-Touched Angler', desc: 'Catch 10 Deep Sea Horrors.', pts: 35, check: (s) => s.deepseaCaught >= 10 },
    { id: 'ach_jelly_1', category: 'Volume & Rarity', title: 'Jelly Harvester', desc: 'Catch 30 Jellyfish.', pts: 25, check: (s) => s.jellyfishCaught >= 30 },

    // --- CATEGORY B: Physical Feats & Weight ---
    { id: 'ach_weight_1', category: 'Physical Feats', title: 'Heavy Lift', desc: 'Catch any fish weighing over 100 kg.', pts: 25, check: (s) => s.heaviestCatch >= 100 },
    { id: 'ach_weight_2', category: 'Physical Feats', title: 'The Colossus', desc: 'Catch any fish weighing over 500 kg.', pts: 50, check: (s) => s.heaviestCatch >= 500 },
    { id: 'ach_weight_3', category: 'Physical Feats', title: 'Unbelievable Bulk', desc: 'Catch any fish weighing over 1,200 kg.', pts: 100, check: (s) => s.heaviestCatch >= 1200 },
    { id: 'ach_pred_1', category: 'Physical Feats', title: 'Apex Predator', desc: 'Catch 10 predatory fish (Sharks/Predators).', pts: 25, check: (s) => s.predatorCaught >= 10 },
    { id: 'ach_eel_1', category: 'Physical Feats', title: 'Serpentine Tamer', desc: 'Catch 15 Eels.', pts: 30, check: (s) => s.eelCaught >= 15 },
    { id: 'ach_ray_1', category: 'Physical Feats', title: 'Tidal Giant', desc: 'Catch any Flatfish/Ray weighing over 300 kg.', pts: 50, check: (s) => s.heaviestRay >= 300 },

    // --- CATEGORY C: Crafting, Alchemy & Knowledge ---
    { id: 'ach_craft_1', category: 'Crafting & Knowledge', title: 'Tackle Assembler', desc: 'Craft 10 custom Lures at the Crafting Bench.', pts: 25, check: (s) => s.luresCrafted >= 10 },
    { id: 'ach_craft_2', category: 'Crafting & Knowledge', title: 'Spore Alchemist', desc: 'Brew 25 Potions at the Crafting Bench.', pts: 25, check: (s) => s.potionsBrewed >= 25 },
    { id: 'ach_craft_3', category: 'Crafting & Knowledge', title: 'Chum Master', desc: 'Mash 15 Target Baits.', pts: 25, check: (s) => s.baitsMashed >= 15 },
    { id: 'ach_craft_4', category: 'Crafting & Knowledge', title: 'Flesh Carver', desc: 'Dissect 100 fish.', pts: 25, check: (s) => s.fishDissected >= 100 },
    { id: 'ach_best_1', category: 'Crafting & Knowledge', title: 'Scholar of the Deeps', desc: 'Unlock 10 complete (Level 3) Bestiary profiles.', pts: 50, check: (s, p) => {
        let count = 0;
        for (const key in p.bestiary) if (p.bestiary[key].xp >= 250) count++;
        return count >= 10;
    }},
    { id: 'ach_cross_1', category: 'Crafting & Knowledge', title: 'Compost Master', desc: 'Donate 1,000kg to the Myconid Colony.', pts: 30, check: (s, p) => p.endgameProgress.fungal.totalCompostKg >= 1000 },
    { id: 'ach_cross_2', category: 'Crafting & Knowledge', title: 'Curator\'s Ally', desc: 'Fill 20 slots in the Crystal Museum.', pts: 35, check: (s, p) => Object.keys(p.endgameProgress.crystal.filledSlots).length >= 20 },

    // --- CATEGORY D: Financial & Economic Mastery ---
    { id: 'ach_econ_1', category: 'Economy', title: 'First Profit', desc: 'Accumulate 1,000g in total fish sales.', pts: 10, check: (s) => s.goldEarned >= 1000 },
    { id: 'ach_econ_2', category: 'Economy', title: 'The Merchant King', desc: 'Accumulate 20,000g in total fish sales.', pts: 50, check: (s) => s.goldEarned >= 20000 },
    { id: 'ach_econ_3', category: 'Economy', title: 'Barter Expert', desc: 'Purchase 15 items from General Merchants.', pts: 25, check: (s) => s.itemsBought >= 15 },
    { id: 'ach_house_1', category: 'Economy', title: 'Landlord', desc: 'Buy your first Safehouse.', pts: 50, check: (s, p) => Object.keys(p.safehouses).length >= 1 },
    { id: 'ach_val_1', category: 'Economy', title: 'The Gilded Hook', desc: 'Sell a single fish worth over 500g.', pts: 40, check: (s) => s.mostExpensiveFishSold >= 500 },
    { id: 'ach_hangar_1', category: 'Economy', title: 'Hangar Hoarder', desc: 'Store 3 boat hulls in your Safehouse Dry Dock.', pts: 35, check: (s, p) => {
        for (const key in p.safehouses) if (p.safehouses[key].hangar.length >= 3) return true;
        return false;
    }},

    // --- CATEGORY E: Sailing & Hazard Survival ---
    { id: 'ach_sail_1', category: 'Sailing & Hazards', title: 'Wanderer', desc: 'Discover 50 global nodes.', pts: 25, check: (s, p, nodesCount) => nodesCount >= 50 },
    { id: 'ach_surv_1', category: 'Sailing & Hazards', title: 'Vortex Survivor', desc: 'Escape 3 Abyssal whirlpools without sinking.', pts: 50, check: (s) => s.whirlpoolsEscaped >= 3 },
    { id: 'ach_ice_1', category: 'Sailing & Hazards', title: 'Pack Ice Breaker', desc: 'Break 50 blocks of Frozen pack ice using an Icebreaker Prow.', pts: 30, check: (s) => s.packIceBroken >= 50 },
    { id: 'ach_lava_1', category: 'Sailing & Hazards', title: 'Thermal Shield', desc: 'Survive 10 minutes in Volcanic waters without hull damage.', pts: 30, check: (s) => s.lavaTimeSurvived >= 600 },
    { id: 'ach_tourn_1', category: 'Sailing & Hazards', title: 'Tournament Champion', desc: 'Win 1st Place in 3 global Fishing Tournaments.', pts: 50, check: (s) => s.tournamentsWon >= 3 }
];

export const AchievementEngine = {
    /**
     * Evaluates all locked achievements.
     * Returns an array of newly unlocked achievements so the UI can flash notifications.
     */
    evaluate(player, discoveredNodesCount) {
        if (!player || !player.endgameProgress || !player.endgameProgress.ice) return [];

        const ice = player.endgameProgress.ice;
        const stats = ice.stats;
        const newlyUnlocked = [];

        ACHIEVEMENTS.forEach(ach => {
            if (!ice.unlockedAchievements.includes(ach.id)) {
                // Check if requirements are met
                if (ach.check(stats, player, discoveredNodesCount)) {
                    ice.unlockedAchievements.push(ach.id);
                    ice.clubPoints += ach.pts;
                    newlyUnlocked.push(ach);
                }
            }
        });

        // Update Rank based on total points
        for (const rank of CLUB_RANKS) {
            if (ice.clubPoints >= rank.minPts) {
                ice.clubRank = rank.id;
                break;
            }
        }

        return newlyUnlocked;
    }
};