/**
 * js/fishing/arena_campaign.js
 * Contains the 10 hand-crafted opponent tiers for The Volcanic Arena.
 * Also includes the procedural generator for Endless Mode.
 */

import { generateFishData, generateFishInstance } from '../data/fish_data_generator.js';
import { createRng } from '../util/rng.js';

// Helper to force a specific fish generation
function createForcedFish(rng, family, rarity, sizeTier, statBias = 0) {
    const data = generateFishData({ seed: rng.next() * 100000, family });
    data.physical.sizeTier = sizeTier;
    
    // Rig the RNG so generateFishInstance outputs exactly the rarity we want
    const riggedRng = createRng(rng.next() * 100000);
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

    return generateFishInstance(data, riggedRng, statBias);
}

export const ArenaCampaign = {

    getTier(level) {
        const seed = 8888 + level;
        const rng = createRng(seed);

        const tiers = [
            // Tier 1 (Index 0)
            {
                name: "Challenger Brutus", race: "Orc", gender: "Male",
                title: "The Novice",
                dialogue: "You look soft. My fish are going to eat your fish.",
                rewardGold: 500,
                generateTeam: () => [
                    createForcedFish(rng, 'fish', 'Common', 'Medium'),
                    createForcedFish(rng, 'fish', 'Common', 'Small'),
                    createForcedFish(rng, 'fish', 'Common', 'Small')
                ]
            },
            // Tier 2 (Index 1)
            {
                name: "Skitterer Vax", race: "Tiefling", gender: "Female",
                title: "The Armored Wall",
                dialogue: "Small, slippery things break against the shell. Watch and learn.",
                rewardGold: 800,
                generateTeam: () => [
                    createForcedFish(rng, 'crustacean', 'Uncommon', 'Large'), // Heavy Tank
                    createForcedFish(rng, 'fish', 'Common', 'Small'),
                    createForcedFish(rng, 'fish', 'Common', 'Small')
                ]
            },
            // Tier 3 (Index 2)
            {
                name: "Lurker Kael", race: "Elf", gender: "Male",
                title: "The Paralyzer",
                dialogue: "Speed and shock. You won't even get to strike.",
                rewardGold: 1200,
                generateTeam: () => [
                    createForcedFish(rng, 'eel', 'Uncommon', 'Medium'),
                    createForcedFish(rng, 'eel', 'Uncommon', 'Small'), // Fast stunner
                    createForcedFish(rng, 'fish', 'Uncommon', 'Medium')
                ]
            },
            // Tier 4 (Index 3)
            {
                name: "Gladiator Grok", race: "Orc", gender: "Male",
                title: "The Bloodletter",
                dialogue: "Enough tricks! We fight with pure teeth!",
                rewardGold: 1800,
                generateTeam: () => [
                    createForcedFish(rng, 'shark', 'Uncommon', 'Large'),
                    createForcedFish(rng, 'shark', 'Uncommon', 'Medium'),
                    createForcedFish(rng, 'shark', 'Uncommon', 'Medium')
                ]
            },
            // Tier 5 (Index 4)
            {
                name: "Shaman Spore-Eld", race: "Myconid", gender: "Male",
                title: "The Toxic Cloud",
                dialogue: "Breathe the spores. Watch your vitality drain away.",
                rewardGold: 2500,
                generateTeam: () => [
                    createForcedFish(rng, 'crustacean', 'Rare', 'Large'), // Tank to stall
                    createForcedFish(rng, 'jellyfish', 'Rare', 'Small'),  // Fast poison
                    createForcedFish(rng, 'jellyfish', 'Rare', 'Small')   // Fast poison
                ]
            },
            // Tier 6 (Index 5)
            {
                name: "Commander Vesper", race: "Human", gender: "Female",
                title: "The Tactician",
                dialogue: "A balanced formation has no weaknesses. Let's test your squad.",
                rewardGold: 3500,
                generateTeam: () => [
                    createForcedFish(rng, 'crustacean', 'Rare', 'Large'), // Tank
                    createForcedFish(rng, 'shark', 'Rare', 'Medium'),     // DPS
                    createForcedFish(rng, 'fish', 'Rare', 'Small')        // Shield Support
                ]
            },
            // Tier 7 (Index 6)
            {
                name: "Elite Marina", race: "Elf", gender: "Female",
                title: "The Untouchable",
                dialogue: "You cannot kill what you cannot hit. My brood dances on the currents.",
                rewardGold: 5000,
                generateTeam: () => [
                    createForcedFish(rng, 'ray', 'Rare', 'Medium'),
                    createForcedFish(rng, 'cephalopod', 'Rare', 'Small'), // Fast blinding
                    createForcedFish(rng, 'cephalopod', 'Rare', 'Small')
                ]
            },
            // Tier 8 (Index 7)
            {
                name: "Warlord Thrak", race: "Orc", gender: "Male",
                title: "The Behemoth",
                dialogue: "Size is all that matters. I will crush your tiny pets.",
                rewardGold: 7000,
                generateTeam: () => [
                    createForcedFish(rng, 'crustacean', 'Legendary', 'Massive'),
                    createForcedFish(rng, 'shark', 'Legendary', 'Large'),
                    createForcedFish(rng, 'shark', 'Legendary', 'Large')
                ]
            },
            // Tier 9 (Index 8)
            {
                name: "Archmage Xil", race: "Tiefling", gender: "Male",
                title: "The Drainer",
                dialogue: "Every drop of blood you spill only feeds my horrors.",
                rewardGold: 10000,
                generateTeam: () => [
                    createForcedFish(rng, 'deepsea', 'Legendary', 'Large'), // Vampiric
                    createForcedFish(rng, 'deepsea', 'Legendary', 'Large'), // Vampiric
                    createForcedFish(rng, 'fish', 'Legendary', 'Small')     // Shield support to keep vampires alive
                ]
            },
            // Tier 10 (Index 9)
            {
                name: "Gladiator-Master Ignis", race: "Orc", gender: "Male",
                title: "The Magma Lord",
                dialogue: "You have survived the gauntlet. Now face the heat of the core. If you win, the Brimstone Hook is yours.",
                rewardGold: 20000, // Massive final payout
                generateTeam: () => [
                    createForcedFish(rng, 'ray', 'Boss', 'Massive'),       // Massive Boss Tank
                    createForcedFish(rng, 'shark', 'Legendary', 'Large'),  // Heavy DPS
                    createForcedFish(rng, 'jellyfish', 'Legendary', 'Tiny')// Max speed poison applier
                ]
            }
        ];

        return tiers[level - 1] || null;
    },

    /**
     * Generates a procedural team for the endless "Challenger's Deep" mode.
     * Scales the enemy team's rarity and size based on the player's strongest fish.
     */
    generateEndlessTeam(playerHighestRating, seed) {
        const rng = createRng(seed);
        const families = ['fish', 'shark', 'eel', 'ray', 'crustacean', 'jellyfish', 'cephalopod', 'deepsea'];
        const sizes = ['Tiny', 'Small', 'Medium', 'Large', 'Massive'];
        
        let targetRarity = 'Rare';
        if (playerHighestRating > 800) targetRarity = 'Legendary';
        else if (playerHighestRating < 200) targetRarity = 'Uncommon';

        const team = [];
        for (let i = 0; i < 3; i++) {
            team.push(createForcedFish(rng, rng.pick(families), targetRarity, rng.pick(sizes), rng.int(0, 20)));
        }

        return {
            name: `Challenger ${rng.int(1000, 9999)}`,
            race: rng.pick(['Human', 'Orc', 'Elf', 'Dwarf', 'Tiefling']),
            gender: rng.pick(['Male', 'Female']),
            title: "Endless Competitor",
            dialogue: "The arena never sleeps. Defend your rank!",
            rewardGold: rng.int(1500, 4000),
            team: team
        };
    }
};