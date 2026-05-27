/**
 * js/ui/hub_ui.js
 * Manages the Settlement Hub UI: Panoramic backgrounds, NPCs, Shops, and Dialogue.
 * V6 - Buy/Sell Modes, Shipyard Split, and Tooltip Integration.
 */

import { SFX } from '../audio/sfx_generator.js';
import { createRng } from '../util/rng.js';
import { getRarityColor, getItemColor, buildStatSlider } from '../util/utils.js';
import { generateSettlementArt } from '../art/settlement_generator.js';
import { generateNPCData } from '../data/npc_data_generator.js';
import { generateFishData } from '../data/fish_data_generator.js';
import { MerchantGenerator } from '../economy/merchant_generator.js';
import { DialogueGenerator } from '../economy/dialogue_generator.js';
import { QuestGenerator } from '../economy/quest_generator.js';
import { BIOMES } from '../exploration/biomes.js';
import { PlayerEngine } from '../data/player_data.js';
import { TooltipUI } from './tooltip_ui.js';
import { generateLurePart } from '../art/lure_generator.js';
import { generatePotion } from '../art/potion_generator.js'; // <-- ADD THIS IMPORT
import { HUD } from './hud_ui.js'; // <-- ADD THIS IMPORT
import { generatePoiArt } from '../art/poi_generator.js'; // <-- ADD THIS
import { generateMythicLure } from '../art/mythic_lure_generator.js'; // <-- ADD THIS TOO for the reward function
// --- NEW ARENA IMPORTS ---
import { ArenaCampaign } from '../fishing/arena_campaign.js';
import { ArenaEngine } from '../fishing/arena_engine.js';
import { ArenaRenderer } from '../fishing/arena_renderer.js';
import { MusicEngine } from '../audio/music_engine.js'; 

export const HubUI = {
    gameState: null,
    currentNode: null,
    callbacks: null,
    
    currentNPCs: {},
    merchantInv: [],      // <-- NEW
    fishmongerInv: [],    // <-- NEW
    boatwrightInv: [],    // <-- NEW
    currentQuests: [],
    localFishPool: [],
    
    activeTab: 'market',
    marketMode: 'buy', 
    fishmongerMode: 'buy', // <-- NEW: Tracks Fishmonger buy/sell tab
    
    typewriterTimer: null, 
    
    // --- NEW: Safehouse State ---
    safehouseSubTab: 'drydock',
    aquariumAnimFrame: null,
    aquariumEntities:[],
    // --- NEW: Arena State ---
    arenaEngine: null,
    arenaSimFrame: null,
    arenaLastTime: 0,

    init(callbacks) {
        this.callbacks = callbacks;

        document.getElementById('btn-hub-depart').addEventListener('click', () => {
            SFX.playUISelect();
            if (this.typewriterTimer) clearInterval(this.typewriterTimer);
            if (this.callbacks.onSave) this.callbacks.onSave(); 
            TooltipUI.hide(); // <-- UPDATED
            this.close();
        });

        // --- Full Screen Safehouse Buttons ---
        document.getElementById('btn-exit-safehouse').addEventListener('click', () => {
            SFX.playUISelect();
            this.closeSafehouse();
        });

        // --- Full Screen Arena Buttons ---
        document.getElementById('btn-exit-arena').addEventListener('click', () => {
            SFX.playUISelect();
            this.closeArena();
        });

        document.querySelectorAll('.sh-main-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.sh-main-tab').forEach(t => t.classList.remove('active'));
                
                // FIX: Use currentTarget
                e.currentTarget.classList.add('active');
                SFX.playUISelect();
                
                this.safehouseSubTab = e.currentTarget.getAttribute('data-shtab');
                this.renderSafehouseFullScreen();
            });
        });

        // --- Settlement Tabs ---
        const tabs = document.querySelectorAll('.hub-tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // FIX: Use currentTarget to guarantee we click the button, not the text
                const targetTab = e.currentTarget.getAttribute('data-tab');

                // Intercept Safehouse Click
                if (targetTab === 'safehouse') {
                    SFX.playUISelect();
                    const coords = `${this.gameState.globalX},${this.gameState.globalY}`;
                    if (this.gameState.player.safehouses && this.gameState.player.safehouses[coords]) {
                        this.openSafehouse();
                        return; // Stop here, keep the Hub unchanged behind it
                    }
                }

                // Intercept Arena Click
                if (targetTab === 'arena') {
                    SFX.playUISelect();
                    this.openArena();
                    return; 
                }

                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                SFX.playUISelect();
                
                this.activeTab = targetTab;
                this.marketMode = 'buy'; 
                TooltipUI.hide(); // <-- UPDATED
                
                this.renderActiveTab();
                this.triggerTabDialogue();
            });
        });
    },

    // --- NEW: Full Screen Controllers ---
    openSafehouse() {
        document.getElementById('z80-safehouse').style.display = 'flex';
        this.safehouseSubTab = 'drydock';
        
        // Reset Visual Tabs
        document.querySelectorAll('.sh-main-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.sh-main-tab[data-shtab="drydock"]').classList.add('active');
        
        this.renderSafehouseFullScreen();
    },

    closeSafehouse() {
        document.getElementById('z80-safehouse').style.display = 'none';
        this.stopAquariumLoop();
        // Return active hub tab focus visually back to whatever it was behind the safehouse
        this.renderActiveTab(); 
    },

    openArena() {
        document.getElementById('z85-arena').style.display = 'flex';
        // Reset view states
        document.getElementById('arena-draft-view').style.display = 'flex';
        document.getElementById('arena-combat-view').style.display = 'none';
        this.renderArenaDrafting();
    },

    closeArena() {
        document.getElementById('z85-arena').style.display = 'none';
        if (this.arenaSimFrame) {
            cancelAnimationFrame(this.arenaSimFrame);
            this.arenaSimFrame = null;
        }
        if (this.arenaEngine) ArenaRenderer.stop();
        this.arenaEngine = null;
        
        // --- FIX: Guarantee we revert to Hub Music if we were in Battle ---
        if (MusicEngine.currentBiome === 'battle') {
            MusicEngine.playBiome('hub', createRng(Date.now()));
        }

        // Return active hub tab focus visually back to whatever it was behind the arena
        this.renderActiveTab(); 
    },

    open(state, node) {
        this.gameState = state;
        this.currentNode = node;
        const player = state.player;
        
        // --- FIX: Safely initialize ALL endgame progress objects ---
        if (!player.endgameProgress) player.endgameProgress = {};
        if (!player.endgameProgress.fungal) player.endgameProgress.fungal = { totalCompostKg: 0, currentGoalIdx: 0 };
        
        if (!player.endgameProgress.crystal || Array.isArray(player.endgameProgress.crystal.filledSlots)) {
            player.endgameProgress.crystal = { filledSlots: {}, curatorRating: 0, currentGoalIdx: 0 };
        }
        
        // --- NEW: Safe initialization for older saves ---
        if (!player.endgameProgress.lava) {
            player.endgameProgress.lava = { currentTier: 1, endlessScore: 0, roster: [null, null, null] };
        }
        
        if (!player.activeQuests) player.activeQuests = [];

        const hubEl = document.getElementById('z75-hub');
        hubEl.style.display = 'flex';

        const townSeed = state.world.seed + node.x + node.y;
        const rng = createRng(townSeed);
        
        let art;
        if (node.poi) {
            art = generatePoiArt({ poiId: node.poi, rng });
        } else {
            art = generateSettlementArt({ rng, biomeId: node.biomeId });
        }
        
        document.getElementById('hub-title').innerText = node.poi ? node.name : node.settlementName;
        document.getElementById('hub-biome').innerText = node.poi ? "Endgame Sanctuary" : BIOMES[node.biomeId].name;
        document.getElementById('hub-img').src = art.imageDataUrl;

        // Populate NPCs
        if (node.poi === 'myconid_colony') {
            this.currentNPCs = { elders: generateNPCData({ seed: rng.next() * 10000, biomeId: 'fungal', race: 'Myconid', archetype: 'Spore Tender' }) };
            this.activeTab = 'compost';
}       else if (node.poi === 'crystal_museum') {
            this.currentNPCs = { curator: generateNPCData({ seed: rng.next() * 10000, biomeId: 'crystal', race: 'Elf', gender: 'Male', archetype: 'Cave Scholar' }) };
            this.activeTab = 'exhibition';
        } else if (node.poi === 'volcanic_arena') {
            this.currentNPCs = { master: generateNPCData({ seed: rng.next() * 10000, biomeId: 'volcanic', race: 'Orc', gender: 'Male', archetype: 'Mercenary' }) };
            this.currentNPCs.master.name = "Gladiator-Master Ignis"; 
            this.activeTab = 'master'; // <-- FIX: Set default tab to 'master', not 'arena'
        } else {
            this.currentNPCs = {
                market: generateNPCData({ seed: rng.next() * 10000, biomeId: node.biomeId }),
                fishmonger: generateNPCData({ seed: rng.next() * 10000, biomeId: node.biomeId }),
                boatwright: generateNPCData({ seed: rng.next() * 10000, biomeId: node.biomeId }),
                tavern: generateNPCData({ seed: rng.next() * 10000, biomeId: node.biomeId })
            };
            const dailySeed = townSeed + state.gameDay;
            this.merchantInv = MerchantGenerator.getMerchantStock(dailySeed, node.biomeId, player.stats.bartering);
            this.fishmongerInv = MerchantGenerator.getFishmongerStock(dailySeed + 1, node.biomeId, player.stats.bartering);
            this.boatwrightInv = MerchantGenerator.getBoatwrightStock(dailySeed + 2, node.biomeId, player.stats.bartering);
            const allQuests = QuestGenerator.generateQuestBoard(dailySeed, player.vitals.level, state.world, node);
            this.currentQuests = allQuests.filter(q => !player.completedQuests.includes(q.id));
            
            this.activeTab = 'market';
            this.marketMode = 'buy';
        }

        // Setup Tabs Visibility
        document.querySelectorAll('.hub-tab-btn').forEach(btn => {
            const tab = btn.getAttribute('data-tab');
            btn.classList.remove('active');
            
            if (node.poi === 'myconid_colony') {
                btn.style.display = ['compost', 'elders'].includes(tab) ? 'block' : 'none';
            } else if (node.poi === 'crystal_museum') {
                btn.style.display = ['exhibition', 'curator'].includes(tab) ? 'block' : 'none'; 
            } else if (node.poi === 'volcanic_arena') {
                btn.style.display = ['arena', 'master'].includes(tab) ? 'block' : 'none'; // <-- NEW
            } else {
                btn.style.display = ['market', 'fishmonger', 'boatwright', 'tavern', 'safehouse'].includes(tab) ? 'block' : 'none';
            }
        });
        
        document.querySelector(`.hub-tab-btn[data-tab="${this.activeTab}"]`).classList.add('active');
        
        this.renderActiveTab();
        this.triggerTabDialogue();
    },

    close() {
        document.getElementById('z75-hub').style.display = 'none';
        this.stopAquariumLoop(); 
        
        // --- NEW: Stop Arena Loop ---
        if (this.arenaSimFrame) {
            cancelAnimationFrame(this.arenaSimFrame);
            this.arenaSimFrame = null;
        }
        if (this.arenaEngine) ArenaRenderer.stop();
        
        this.gameState = null;
        if (this.callbacks.onDepart) this.callbacks.onDepart();
    },

    triggerTabDialogue() {
        // Intercept the Safehouse tab so it doesn't look for an NPC!
        if (this.activeTab === 'safehouse') {
            const player = this.gameState.player;
            document.getElementById('hub-dialogue-portrait').src = player.identity.portraitData;
            document.getElementById('hub-speaker').innerText = player.identity.name + ":";
            
            const msg = "My own private corner of the darklake. Time to get organized.";
            
            const textContainer = document.getElementById('hub-text');
            textContainer.innerText = '""'; 

            if (this.typewriterTimer) clearInterval(this.typewriterTimer);

            let index = 0;
            this.typewriterTimer = setInterval(() => {
                if (index < msg.length) {
                    textContainer.innerText = `"${msg.substring(0, index + 1)}"`;
                    index++;
                } else {
                    clearInterval(this.typewriterTimer);
                }
            }, 40); 
            return; // Exit early so it doesn't run the normal NPC logic!
        }

        // --- FIX: Safely route special POI tabs to their specific NPCs ---
        let npcKey = this.activeTab;
        if (this.activeTab === 'compost') npcKey = 'elders';
        if (this.activeTab === 'exhibition') npcKey = 'curator'; 
        if (this.activeTab === 'arena') npcKey = 'master'; // <-- NEW
        
        const npc = this.currentNPCs[npcKey];
        if (!npc) return; 

        let msg = "";
        const rng = createRng(Date.now());
        
        if (this.activeTab === 'tavern') {
            if (rng.chance(0.5) && this.localFishPool.length > 0) msg = DialogueGenerator.generateRumor(rng.pick(this.localFishPool), rng, npc);
            else msg = DialogueGenerator.getLore(npc, rng);
        } else if (this.activeTab === 'elders' || this.activeTab === 'compost') {
            // --- NEW: PROGRESSIVE MYCONID DIALOGUE ---
            const player = this.gameState.player;
            const progressLevel = player.endgameProgress?.fungal?.currentGoalIdx || 0;
            
            if (progressLevel === 0) {
                msg = "The mycelium hungers. Bring us the flesh of the darklake, and we shall share our spores.";
            } else if (progressLevel === 1) {
                msg = "The network expands. Your offerings are adequate. Deeper roots require greater mass.";
            } else if (progressLevel === 2) {
                msg = "We pulse with newfound strength. Feed the loam further, and we will grant you our deepest secrets.";
            } else if (progressLevel === 3) {
                msg = "The Vesper-Bloom stirs below. Feed the pile until it overflows, and the ancient hook shall be yours.";
            } else {
                msg = "The pile is complete. The Leviathan awaits your line. Our pact is fulfilled.";
            }
            } else if (this.activeTab === 'curator' || this.activeTab === 'exhibition') {
            // --- FIX: Progressive Dialogue with Absolute Completion Tracking ---
            const player = this.gameState.player;
            const progress = player.endgameProgress?.crystal;
            const progressLevel = progress ? progress.currentGoalIdx : 0;
            const filledCount = progress ? Object.keys(progress.filledSlots).length : 0;
            
            const isMuseumComplete = filledCount === 40;
            const isRatingMaxed = progress ? progress.curatorRating >= 10000 : false;

            if (isMuseumComplete) {
                // The ultimate reward line, locked strictly behind 40/40 tanks filled
                msg = "The archive is absolutely complete. A flawless masterpiece of preservation, every single tank illuminated. You have immortalized the ecology of the Darklake, angler.";
            } else if (isRatingMaxed) {
                // Milestone reached, but empty tanks still remain
                msg = "You have unlocked my final relic, angler! The Geode Monarch stirs below. Yet, there are still empty tanks remaining if you seek true academic perfection.";
            } else {
                if (progressLevel === 0) {
                    msg = "Welcome to the Eternal Archive. Our collection is woefully incomplete. Bring me pristine specimens, and I shall reward you handsomely.";
                } else if (progressLevel === 1) {
                    msg = "Excellent progress. The geode tanks are beginning to shine with life. But we need rarer catches still.";
                } else if (progressLevel === 2) {
                    msg = "Fascinating! The archive is expanding beautifully. Continue your hunt, angler.";
                } else if (progressLevel === 3) {
                    msg = "We are so close to the final milestone. Only a few more elite exhibits remain before our funding cap is met.";
                }
            }
            } else if (this.activeTab === 'master' || this.activeTab === 'arena') {
            // --- NEW: PROGRESSIVE ARENA DIALOGUE ---
            const progressLevel = this.gameState.player.endgameProgress?.lava?.currentTier || 1;
            
            if (progressLevel <= 9) {
                const tierData = ArenaCampaign.getTier(progressLevel);
                msg = `Welcome to the boiling ring. Your next opponent is ${tierData.name}. ${tierData.dialogue}`;
            } else if (progressLevel === 10) {
                msg = "You have survived the gauntlet. Now face the heat of the core. Defeat my champions, and the Brimstone Hook is yours.";
            } else {
                msg = "You are the undisputed champion of the springs. But the arena never sleeps. Defend your title in Challenger's Deep.";
            }
        } else {
            const roleName = this.activeTab === 'market' ? 'Merchant' : this.activeTab.charAt(0).toUpperCase() + this.activeTab.slice(1);
            msg = DialogueGenerator.getGreeting(npc, roleName, rng);
        }
        
        this.triggerDialogue(npc, msg);
    },

    triggerDialogue(npc, text) {
        document.getElementById('hub-dialogue-portrait').src = npc.imageDataUrl;
        document.getElementById('hub-speaker').innerText = npc.name + ":";
        
        const textContainer = document.getElementById('hub-text');
        textContainer.innerText = '""'; 

        if (this.typewriterTimer) clearInterval(this.typewriterTimer);

        let index = 0;
        this.typewriterTimer = setInterval(() => {
            if (index < text.length) {
                textContainer.innerText = `"${text.substring(0, index + 1)}"`;
                index++;
            } else {
                clearInterval(this.typewriterTimer);
            }
        }, 40); 

        SFX.speakText(text, npc.race, npc.gender, 40);
    },

    renderActiveTab() {
        const content = document.getElementById('hub-content-area');
        content.innerHTML = ''; 
        
        if (this.activeTab !== 'safehouse' || this.safehouseSubTab !== 'aquarium') {
            this.stopAquariumLoop();
        }
        
        // Stop Arena Loop if navigating away
        if (this.activeTab !== 'arena') {
            if (this.arenaSimFrame) {
                cancelAnimationFrame(this.arenaSimFrame);
                this.arenaSimFrame = null;
            }
            if (this.arenaEngine) ArenaRenderer.stop();
        }
        
        if (this.activeTab === 'market') this.renderMarket(content);
        else if (this.activeTab === 'fishmonger') this.renderFishmonger(content);
        else if (this.activeTab === 'boatwright') this.renderBoatwright(content);
        else if (this.activeTab === 'tavern') this.renderTavern(content);
        else if (this.activeTab === 'safehouse') this.renderSafehouse(content); 
        else if (this.activeTab === 'compost') this.renderCompost(content); 
        else if (this.activeTab === 'elders') this.renderElders(content);   
        else if (this.activeTab === 'exhibition') this.renderExhibition(content); 
        else if (this.activeTab === 'curator') this.renderCurator(content);       
        else if (this.activeTab === 'master') this.renderMaster(content); // <-- FIX: 'arena' call removed!
    },

    // --- MARKET: BUY & SELL TOGGLE ---

    renderMarket(container) {
        const player = this.gameState.player;
        const effStats = PlayerEngine.getEffectiveStats(player);
        const maxCargo = effStats.exploration.cargoSpace;
        const currentInvCount = player.inventory.length;
        
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid var(--panel-border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <div style="display: flex; gap: 1rem; align-items: baseline;">
                    <h2 style="margin:0; color:var(--cyan-glow); font-size: 1.8rem;">General Market</h2>
                    <div style="display:flex; gap:0.5rem; margin-left: 1rem;">
                        <button class="menu-btn" id="btn-market-buy" style="padding: 0.2rem 0.8rem; font-size: 1.1rem; width: auto; margin: 0; border-color: ${this.marketMode === 'buy' ? 'var(--cyan-glow)' : 'var(--panel-border)'}; color: ${this.marketMode === 'buy' ? 'var(--cyan-glow)' : 'var(--text-muted)'};">Buy</button>
                        <button class="menu-btn" id="btn-market-sell" style="padding: 0.2rem 0.8rem; font-size: 1.1rem; width: auto; margin: 0; border-color: ${this.marketMode === 'sell' ? 'var(--cyan-glow)' : 'var(--panel-border)'}; color: ${this.marketMode === 'sell' ? 'var(--cyan-glow)' : 'var(--text-muted)'};">Sell</button>
                    </div>
                </div>
                <div style="font-size: 1.4rem; color:var(--gold-warn);">💰 ${player.vitals.gold}g</div>
            </div>
            <div id="hub-market-list"></div>
        `;
        
        document.getElementById('btn-market-buy').onclick = () => { SFX.playUISelect(); this.marketMode = 'buy'; TooltipUI.hide(); this.renderActiveTab(); };
        document.getElementById('btn-market-sell').onclick = () => { SFX.playUISelect(); this.marketMode = 'sell'; TooltipUI.hide(); this.renderActiveTab(); };

        const list = document.getElementById('hub-market-list');
        
        if (this.marketMode === 'buy') {
            const marketItems = this.merchantInv.filter(i => i.type !== 'boat' && i.type !== 'upgrade');
            
            marketItems.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'shop-item-row';
                
                let disableReason = null;
                const isCargoItem = (item.type === 'part' || item.visualId || item.type === 'rod' || item.type === 'lure');
                
                if (isCargoItem && currentInvCount >= maxCargo) disableReason = "Cargo Full";
                if (item.id === 'cons_ration' && player.vitals.rations >= 20) disableReason = "Rations Full";
                
                const canAfford = player.vitals.gold >= item.price;
                const hasStock = item.stock > 0;
                
                let btnText = "Buy";
                if (disableReason) btnText = disableReason;
                else if (!hasStock) btnText = "Sold Out";
                else if (!canAfford) btnText = "Too Expensive";

                const isDisabled = disableReason || !canAfford || !hasStock;
                
                const targetItem = (item.itemData && ['rod', 'boat', 'lure', 'potion', 'bait'].includes(item.type)) ? item.itemData : item;
                
                let imgSrc = targetItem.imageDataUrl || (targetItem.art ? (targetItem.art.profileDataUrl || targetItem.art.imageDataUrl) : '');
                
                let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width:48px; height:48px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated; object-fit:contain;" />` : '';

                const itemName = item.name || (item.identity ? item.identity.name : 'Item');
                const nameColor = getItemColor(targetItem);

                row.innerHTML = `
                    <div style="display:flex; gap: 1rem; align-items:center;">
                        ${imgHtml}
                        <div class="shop-item-info">
                            <b style="color: ${nameColor};">${itemName}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${item.type || item.rarity}]</span>
                            <p>${item.desc || `Stock: ${item.stock === 99 ? 'Infinite' : item.stock}`}</p>
                        </div>
                    </div>
                    <div class="shop-buy">
                        <span class="shop-price">${item.price}g</span>
                        <button class="menu-btn btn-buy" style="width: auto; padding: 0.4rem 1rem; margin:0; font-size:1.2rem; ${isDisabled ? 'opacity:0.4; cursor:not-allowed; border-color:var(--panel-border); color:var(--text-muted);' : ''}" ${isDisabled ? 'disabled' : ''}>${btnText}</button>
                    </div>
                `;
                
                // --- NEW UNIFIED TOOLTIP BINDER ---
                TooltipUI.bind(row, item, player);

                if (!isDisabled) {
                    row.querySelector('.btn-buy').onclick = () => {
                        SFX.playGold();
                        player.vitals.gold -= item.price;
                        if (item.stock !== 99) item.stock--;
                        
                        if (item.id === 'cons_ration') {
                            player.vitals.rations = Math.min(20, player.vitals.rations + 1);
                        } else if (item.id === 'cons_fuel_oil') {
                            player.vitals.fuel = 100;
                        } else {
                            if (['rod', 'lure', 'bait', 'potion', 'consumable'].includes(item.type || item.invType)) {
                                const itemToPush = item.itemData ? { ...item.itemData } : { ...item };
                                itemToPush.invType = item.type || item.invType;
                                player.inventory.push(itemToPush);
                            } else {
                                player.reagents.push({ ...item, invType: 'part' }); 
                            }
                        }

                        const rng = createRng(Date.now());
                        // Pass the market NPC down to get their species-specific haggling response
                        if (rng.chance(0.3)) this.triggerDialogue(this.currentNPCs.market, DialogueGenerator.getHaggleResponse(this.currentNPCs.market, true, rng));                        
                        TooltipUI.hide(); // <-- UPDATED
                        this.renderActiveTab(); 
                    };
                }
                list.appendChild(row);
            });
        } 
        else {
            const sellableItems = player.inventory.filter(i => ['rod', 'lure', 'potion', 'bait'].includes(i.invType));
            
            if (sellableItems.length === 0) {
                list.innerHTML = `<p style="color:var(--text-muted); font-size:1.2rem; text-align:center;">You have no gear or crafted items to sell.</p>`;
            }

            sellableItems.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'shop-item-row';
                
                const baseVal = item.economy ? item.economy.value : (item.basePrice || 10);
                const sellValue = Math.max(1, Math.round(baseVal * effStats.economy.sellMultiplier));
                const realIndex = player.inventory.indexOf(item);
                
                let imgSrc = item.imageDataUrl || (item.art ? item.art.imageDataUrl : '');
                let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width:40px; height:40px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated;" />` : '';

                const itemName = item.name || (item.identity ? item.identity.name : 'Item');
                const nameColor = getItemColor(item);

                row.innerHTML = `
                    <div style="display:flex; gap: 1rem; align-items:center;">
                        ${imgHtml}
                        <div class="shop-item-info">
                            <b style="color: ${nameColor};">${itemName}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${item.invType || 'item'}]</span>
                        </div>
                    </div>
                    <div class="shop-buy">
                        <span class="shop-price" style="color:var(--green-safe);">+${sellValue}g</span>
                        <button class="menu-btn btn-sell" style="width: auto; padding: 0.4rem 1rem; margin:0; font-size:1.2rem;">Sell</button>
                    </div>
                `;

                // --- NEW UNIFIED TOOLTIP BINDER ---
                TooltipUI.bind(row, item, player);

                row.querySelector('.btn-sell').onclick = () => {
                    SFX.playGold();
                    player.vitals.gold += sellValue;
                    player.inventory.splice(realIndex, 1);
                    TooltipUI.hide(); // <-- UPDATED
                    this.renderActiveTab();
                };

                list.appendChild(row);
            });
        }
    },

    // --- FISHMONGER ---

    renderFishmonger(container) {
        const player = this.gameState.player;
        const effStats = PlayerEngine.getEffectiveStats(player);
        
        if (!this.fishmongerMode) this.fishmongerMode = 'buy';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid var(--panel-border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <div style="display: flex; gap: 1rem; align-items: baseline;">
                    <h2 style="margin:0; color:var(--cyan-glow); font-size: 1.8rem;">The Fishmonger</h2>
                    <div style="display:flex; gap:0.5rem; margin-left: 1rem;">
                        <button class="menu-btn" id="btn-fm-buy" style="padding: 0.2rem 0.8rem; font-size: 1.1rem; width: auto; margin: 0; border-color: ${this.fishmongerMode === 'buy' ? 'var(--cyan-glow)' : 'var(--panel-border)'}; color: ${this.fishmongerMode === 'buy' ? 'var(--cyan-glow)' : 'var(--text-muted)'};">Buy Parts</button>
                        <button class="menu-btn" id="btn-fm-sell" style="padding: 0.2rem 0.8rem; font-size: 1.1rem; width: auto; margin: 0; border-color: ${this.fishmongerMode === 'sell' ? 'var(--cyan-glow)' : 'var(--panel-border)'}; color: ${this.fishmongerMode === 'sell' ? 'var(--cyan-glow)' : 'var(--text-muted)'};">Sell Catch</button>
                    </div>
                </div>
                <div style="font-size: 1.4rem; color:var(--gold-warn);">💰 ${player.vitals.gold}g</div>
            </div>
            <div id="hub-fish-list"></div>
        `;
        
        document.getElementById('btn-fm-buy').onclick = () => { SFX.playUISelect(); this.fishmongerMode = 'buy'; TooltipUI.hide(); this.renderActiveTab(); };
        document.getElementById('btn-fm-sell').onclick = () => { SFX.playUISelect(); this.fishmongerMode = 'sell'; TooltipUI.hide(); this.renderActiveTab(); };

        const list = document.getElementById('hub-fish-list');

        if (this.fishmongerMode === 'buy') {
            const fmItems = this.fishmongerInv;
            if (fmItems.length === 0) {
                list.innerHTML = `<p style="color:var(--text-muted); font-size:1.2rem; text-align:center;">Fresh out of stock.</p>`;
            }

            fmItems.forEach(item => {
                const row = document.createElement('div');
                row.className = 'shop-item-row';
                
                const canAfford = player.vitals.gold >= item.price;
                const hasStock = item.stock > 0;
                const btnText = (!hasStock) ? "Sold Out" : (!canAfford) ? "Too Expensive" : "Buy";
                const isDisabled = !canAfford || !hasStock;
                
                const imgSrc = item.imageDataUrl || '';
                const imgHtml = imgSrc ? `<img src="${imgSrc}" style="width:48px; height:48px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated;" />` : '';

                row.innerHTML = `
                    <div style="display:flex; gap: 1rem; align-items:center;">
                        ${imgHtml}
                        <div class="shop-item-info">
                            <b style="color: ${getItemColor(item)};">${item.name}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${item.rarity}]</span>
                            <p>Stock: ${item.stock}</p>
                        </div>
                    </div>
                    <div class="shop-buy">
                        <span class="shop-price">${item.price}g</span>
                        <button class="menu-btn btn-buy" style="width: auto; padding: 0.4rem 1rem; margin:0; font-size:1.2rem; ${isDisabled ? 'opacity:0.4; cursor:not-allowed; border-color:var(--panel-border); color:var(--text-muted);' : ''}" ${isDisabled ? 'disabled' : ''}>${btnText}</button>
                    </div>
                `;
                
                // --- NEW UNIFIED TOOLTIP BINDER ---
                TooltipUI.bind(row, item, player);

                if (!isDisabled) {
                    row.querySelector('.btn-buy').onclick = () => {
                        SFX.playGold();
                        player.vitals.gold -= item.price;
                        item.stock--;
                        player.reagents.push({ ...item, invType: 'part' }); 
                        
                        const rng = createRng(Date.now());
                        // Pass the fishmonger NPC down to get their species-specific haggling response
                        if (rng.chance(0.3)) this.triggerDialogue(this.currentNPCs.fishmonger, DialogueGenerator.getHaggleResponse(this.currentNPCs.fishmonger, true, rng));                        
                        TooltipUI.hide(); // <-- UPDATED
                        this.renderActiveTab(); 
                    };
                }
                list.appendChild(row);
            });
        } else {
            const sellableItems = [
                ...player.inventory.filter(i => i.invType === 'fish'),
                ...player.reagents
            ];
            
            if (sellableItems.length === 0) {
                list.innerHTML = `<p style="color:var(--text-muted); font-size:1.2rem; margin-top:1rem; text-align:center;">You have no fish or parts to sell.</p>`;
            } else {
                sellableItems.forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'shop-item-row';
                    
                    const baseVal = item.economy ? (item.economy.baseValue || item.economy.value) : (item.basePrice || 10);
                    const sellValue = Math.max(1, Math.round(baseVal * effStats.economy.sellMultiplier));
                    
                    const isReagent = player.reagents.includes(item);
                    const realIndex = isReagent ? player.reagents.indexOf(item) : player.inventory.indexOf(item);
                    
                    let imgSrc = item.invType === 'fish' ? item.art.imageDataUrl : item.imageDataUrl;
                    let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width:48px; height:48px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated;" />` : '';

                    row.innerHTML = `
                        <div style="display:flex; gap: 1rem; align-items:center;">
                            ${imgHtml}
                            <div class="shop-item-info">
                                <b style="color: ${getItemColor(item)};">${item.name || item.identity.name}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${item.invType === 'fish' ? item.physical.sizeTier : 'PART'}]</span>
                                ${item.invType === 'fish' ? `<p>${item.actualWeight}kg</p>` : ''}
                            </div>
                        </div>
                        <div class="shop-buy">
                            <span class="shop-price" style="color:var(--green-safe);">+${sellValue}g</span>
                            <button class="menu-btn btn-sell" style="width: auto; padding: 0.4rem 1rem; margin:0; font-size:1.2rem;">Sell</button>
                        </div>
                    `;
                    
                    // --- NEW UNIFIED TOOLTIP BINDER ---
                    TooltipUI.bind(row, item, player);

                    row.querySelector('.btn-sell').onclick = () => {
                        SFX.playGold();
                        player.vitals.gold += sellValue;
                        if (isReagent) player.reagents.splice(realIndex, 1);
                        else player.inventory.splice(realIndex, 1);
                        TooltipUI.hide(); // <-- UPDATED
                        this.renderActiveTab();
                    };
                    list.appendChild(row);
                });
            }
        }
    },

    // --- BOATWRIGHT & SHIPYARD ---

    renderBoatwright(container) {
        const player = this.gameState.player;
        const effStats = PlayerEngine.getEffectiveStats(player);
        const maxCargo = effStats.exploration.cargoSpace;
        const currentInvCount = player.inventory.length;

        const maxHp = effStats.exploration.maxHp; // <-- UPDATED to Effective HP
        const missingHp = maxHp - player.vitals.hp;
        const repairCost = Math.ceil(missingHp * 2); 
        const canAfford = player.vitals.gold >= repairCost;
        const isDamaged = missingHp > 0;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid var(--panel-border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <h2 style="margin:0; color:var(--cyan-glow); font-size: 1.8rem;">The Boatwright</h2>
                <div style="font-size: 1.4rem; color:var(--gold-warn);">💰 ${player.vitals.gold}g</div>
            </div>
            
            <div style="background: var(--bg-void); border: 1px solid var(--panel-border); padding: 1.5rem; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem;">
                <div>
                    <h3 style="margin:0 0 0.5rem 0; color:var(--text-main); font-size: 1.4rem;">Hull Integrity</h3>
                    <div style="font-size:1.2rem; color: ${isDamaged ? 'var(--red-danger)' : 'var(--green-safe)'}; margin-bottom: 0.5rem;">
                        ${Math.floor(player.vitals.hp)} / ${maxHp} HP <!-- UPDATED -->
                    </div>
                    <p style="margin:0; color:var(--text-muted); font-size: 1rem;">
                        ${isDamaged ? `It will cost 2g per point of damage to patch her up.` : `She's ship-shape and ready to sail.`}
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="color:var(--gold-warn); font-size:1.2rem; margin-bottom:0.5rem; font-weight:bold;">Cost: ${repairCost}g</div>
                    <button class="menu-btn" id="btn-repair" style="width: auto; padding: 0.5rem 1rem; margin:0; font-size: 1.2rem;" ${!isDamaged || !canAfford ? 'disabled' : ''}>Repair Hull</button>
                </div>
            </div>
            
            <h3 style="margin:0 0 0.5rem 0; color:var(--cyan-glow); font-size: 1.4rem; border-bottom: 1px solid var(--panel-border); padding-bottom:0.5rem;">Shipyard (Boats & Upgrades)</h3>
            <div id="hub-shipyard-list"></div>
            
            <div id="hub-old-boats" style="margin-top: 2rem;"></div>
        `;

        const btnRepair = document.getElementById('btn-repair');
        if (btnRepair) {
            btnRepair.onclick = () => {
                if (isDamaged && canAfford) {
                    SFX.playUIHover(); 
                    player.vitals.gold -= repairCost;
                    player.vitals.hp = maxHp; // <-- UPDATED to fill up the effective HP!
                    this.triggerDialogue(this.currentNPCs.boatwright, "She'll hold water now. Try not to hit any more rocks.");
                    this.renderActiveTab();
                }
            };
        }

        const shipyardList = document.getElementById('hub-shipyard-list');
        const shipyardItems = this.boatwrightInv.filter(item => item.type === 'boat' || item.type === 'upgrade');

        if (shipyardItems.length === 0) {
            shipyardList.innerHTML = `<p style="color:var(--text-muted); font-size:1.1rem; text-align:center;">No new hulls or parts in stock today.</p>`;
        }

        shipyardItems.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'shop-item-row';
            
            let disableReason = null;
            if (item.type === 'boat') {
                let newCargoLimit = item.itemData.stats.cargoSpace;
                if (player.gear.boat.upgrades.storage) newCargoLimit += 10;
                if (currentInvCount > newCargoLimit) disableReason = "Cargo Too Full To Swap";
            } 
            else if (item.type === 'upgrade') {
                if (currentInvCount >= maxCargo) disableReason = "Cargo Full";
                else if (player.gear.boat.upgrades[item.slot] && player.gear.boat.upgrades[item.slot].id === item.id) disableReason = "Equipped";
            }

            const canAfford = player.vitals.gold >= item.price;
            const hasStock = item.stock > 0;
            
            let btnText = "Buy";
            if (disableReason) btnText = disableReason;
            else if (!hasStock) btnText = "Sold Out";
            else if (!canAfford) btnText = "Too Expensive";

            const isDisabled = disableReason || !canAfford || !hasStock;

            const targetItem = (item.itemData && item.type === 'boat') ? item.itemData : item;
            
            let imgSrc = targetItem.imageDataUrl || (targetItem.art ? (targetItem.art.profileDataUrl || targetItem.art.imageDataUrl) : '');
            let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width:64px; height:64px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated; object-fit:contain;" />` : '';

            const itemName = item.name || (item.identity ? item.identity.name : 'Item');
            const nameColor = getItemColor(targetItem);

            row.innerHTML = `
                <div style="display:flex; gap: 1rem; align-items:center;">
                    ${imgHtml}
                    <div class="shop-item-info">
                        <b style="color: ${nameColor};">${itemName}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${item.type || item.rarity}]</span>
                        <p>${item.desc || `Stock: ${item.stock === 99 ? 'Infinite' : item.stock}`}</p>
                    </div>
                </div>
                <div class="shop-buy">
                    <span class="shop-price">${item.price}g</span>
                    <button class="menu-btn btn-buy" style="width: auto; padding: 0.4rem 1rem; margin:0; font-size:1.2rem; ${isDisabled ? 'opacity:0.4; cursor:not-allowed; border-color:var(--panel-border); color:var(--text-muted);' : ''}" ${isDisabled ? 'disabled' : ''}>${btnText}</button>
                </div>
            `;
            
            // --- NEW UNIFIED TOOLTIP BINDER ---
            TooltipUI.bind(row, item, player);

            if (!isDisabled) {
                row.querySelector('.btn-buy').onclick = () => {
                    SFX.playGold();
                    player.vitals.gold -= item.price;
                    if (item.stock !== 99) item.stock--;
                    
                    // --- FIX: Force standard type and invType properties upon purchase ---
                    if (item.type === 'upgrade' || (item.id && item.id.startsWith('upg_'))) {
                        player.inventory.push({ ...item, type: 'upgrade', invType: 'upgrade' });
                    } else if (item.type === 'boat') {
                        // Transfer active upgrades from your old boat to your brand new hull
                        newBoat.upgrades = oldUpgrades; 
                        
                        const oldBoatCopy = JSON.parse(JSON.stringify(player.gear.boat));
                        // Strip upgrades from the old boat copy since they were transferred
                        oldBoatCopy.upgrades = { 
                            lantern: { id: 'upg_lantern_basic', name: 'Basic Lantern', slot: 'lantern', type: 'upgrade', basePrice: 0, desc: 'Faint candlelight. Light radius 100px.', lightRadius: 100, fuelDrainRate: 1.0 }, 
                            plating: null, engine: null, prow: null, storage: null 
                        };

                        const coords = `${this.gameState.globalX},${this.gameState.globalY}`;
                        const safehouse = player.safehouses[coords];

                        // --- FIX: Store Old Vessel or Process Trade-In ---
                        if (safehouse && safehouse.hangar.length < safehouse.hangarCapacity) {
                            // Safehouse is owned in this harbor and has empty space
                            safehouse.hangar.push(oldBoatCopy);
                            HUD.logAction(`Your old vessel "${oldBoatCopy.identity.name}" was transferred to your Dry Dock.`, "safe");
                        } else {
                            // No safehouse or Hangar is full: Boatwright processes a Trade-In rebate
                            const sellValue = Math.max(1, Math.round(oldBoatCopy.economy.value * effStats.economy.sellMultiplier));
                            player.vitals.gold += sellValue;
                            HUD.logAction(`Traded in "${oldBoatCopy.identity.name}" for a scrap rebate of +${sellValue}g.`, "safe");
                        }

                        player.gear.boat = newBoat;
                        player.vitals.hp = Math.min(player.vitals.hp, newBoat.stats.maxHp); 
                    }

                    TooltipUI.hide(); // <-- UPDATED
                    this.renderActiveTab(); 
                };
            }
            shipyardList.appendChild(row);
        });

        // SELL OLD BOATS & UPGRADES
        const ownedBoats = player.inventory.filter(i => i.invType === 'boat');
        const ownedUpgrades = player.inventory.filter(i => i.invType === 'upgrade');
        const scrappableItems = [...ownedBoats, ...ownedUpgrades];
        
        if (scrappableItems.length > 0) {
            const oldBoatContainer = document.getElementById('hub-old-boats');
            oldBoatContainer.innerHTML = `<h3 style="margin:0 0 0.5rem 0; color:var(--text-muted); font-size: 1.4rem; border-bottom: 1px solid var(--panel-border); padding-bottom:0.5rem;">Scrap Old Hulls & Upgrades</h3>`;
            
            scrappableItems.forEach(oldItem => {
                const row = document.createElement('div');
                row.className = 'shop-item-row';
                
                const baseVal = oldItem.economy ? oldItem.economy.value : (oldItem.basePrice || 50);
                const sellValue = Math.max(1, Math.round(baseVal * effStats.economy.sellMultiplier));
                const realIndex = player.inventory.findIndex(i => i === oldItem);

                let imgSrc = oldItem.invType === 'boat' ? oldItem.art.profileDataUrl : ''; 
                let imgHtml = imgSrc ? `<img src="${imgSrc}" style="width:40px; height:40px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated;" />` : '';

                row.innerHTML = `
                    <div style="display:flex; gap: 1rem; align-items:center;">
                        ${imgHtml}
                        <div class="shop-item-info">
                            <b style="color: ${getItemColor(oldItem)};">${oldItem.identity ? oldItem.identity.name : oldItem.name}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${oldItem.invType.toUpperCase()}]</span>
                        </div>
                    </div>
                    <div class="shop-buy">
                        <span class="shop-price" style="color:var(--green-safe);">+${sellValue}g</span>
                        <button class="menu-btn btn-sell" style="width: auto; padding: 0.4rem 1rem; margin:0; font-size:1.2rem;">Scrap</button>
                    </div>
                `;

                // --- NEW UNIFIED TOOLTIP BINDER ---
                TooltipUI.bind(row, oldItem, player);

                row.querySelector('.btn-sell').onclick = () => {
                    SFX.playGold();
                    player.vitals.gold += sellValue;
                    player.inventory.splice(realIndex, 1);
                    TooltipUI.hide(); // <-- UPDATED
                    this.renderActiveTab();
                };
                oldBoatContainer.appendChild(row);
            });
        }
    },

    // --- TAVERN / QUESTS ---

    renderTavern(container) {
        const player = this.gameState.player;
        
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid var(--panel-border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <h2 style="margin:0; color:var(--cyan-glow); font-size: 1.8rem;">The Notice Board</h2>
                <div style="font-size: 1.1rem; color:var(--text-muted);">Speak to the Patron for hints.</div>
            </div>
            
            <div id="hub-turnin-section" style="margin-bottom: 2rem; display: none;">
                <h3 style="color:var(--green-safe); font-size: 1.4rem; margin-bottom: 0.5rem;">Completed Quests (Ready to Turn In)</h3>
                <div id="hub-turnin-list" style="display: flex; flex-direction: column; gap: 0.5rem;"></div>
            </div>
            
            <h3 style="color:var(--text-main); font-size: 1.4rem; margin-bottom: 0.5rem;">Available Jobs</h3>
            <div id="hub-quest-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;"></div>
        `;

        const turnInSection = document.getElementById('hub-turnin-section');
        const turnInList = document.getElementById('hub-turnin-list');
        const list = document.getElementById('hub-quest-list');
        
        let hasTurnIns = false;
        
// --- 1. TURN IN COMPLETED QUESTS ---
        player.activeQuests.forEach((q, index) => {
            let isComplete = false;
            
            if (q.type === 'hunt') {
                const count = player.inventory.filter(i => i.invType === 'fish' && i.id === q.targetSpeciesId).length;
                isComplete = count >= q.requiredAmount;
            } else if (q.type === 'trophy') {
                const maxW = player.inventory.filter(i => i.invType === 'fish' && i.id === q.targetSpeciesId).reduce((max, f) => Math.max(max, f.actualWeight), 0);
                isComplete = maxW >= q.requiredWeight;
            } else if (q.type === 'research') {
                let curLvl = 0;
                const bestiaryEntry = player.bestiary[q.targetSpeciesId];
                if (bestiaryEntry) {
                    if (bestiaryEntry.xp >= 250) curLvl = 3;
                    else if (bestiaryEntry.xp >= 100) curLvl = 2;
                    else curLvl = 1;
                }
                isComplete = curLvl >= q.requiredKnowledgeLevel;
            } else if (q.type === 'bounty') {
                isComplete = q.isComplete;
            } else if (q.type === 'courier') {
                isComplete = !q.isFailed; // Being at the node is checked below
            } else if (q.type === 'crafting') {
                isComplete = player.inventory.some(item => {
                    if (item.invType !== 'lure') return false;
                    return q.requirements.every(req => item.stats[req.stat] >= req.min && item.stats[req.stat] <= req.max);
                });
            }

            // ENFORCE TURN-IN LOCATION (If the quest has a turnInNode assigned)
            if (isComplete && q.turnInNode) {
                if (this.gameState.globalX !== q.turnInNode.x || this.gameState.globalY !== q.turnInNode.y) {
                    isComplete = false;
                }
            } else if (isComplete && (q.type === 'courier' || q.type === 'crafting')) {
                // Fallback for older saves that didn't have turnInNode
                if (this.gameState.globalX !== q.targetNode.x || this.gameState.globalY !== q.targetNode.y) {
                    isComplete = false;
                }
            }

            if (isComplete) {
                hasTurnIns = true;
                const card = document.createElement('div');
                card.style.cssText = "background: var(--panel-base); border: 1px solid var(--green-safe); padding: 1rem; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;";
                
                card.innerHTML = `
                    <div>
                        <h3 style="margin:0 0 0.2rem 0; color:var(--cyan-glow); font-size:1.4rem;">${q.title}</h3>
                        <div style="color:var(--green-safe); font-weight:bold;">Objective Complete</div>
                    </div>
                    <button class="menu-btn" style="width:auto; margin:0; padding:0.5rem 1.5rem; border-color:var(--green-safe); color:var(--green-safe);">Complete</button>
                `;
                
                card.querySelector('button').onclick = () => {
                    SFX.playCatchSuccess();
                    
                    let fishValueBonus = 0;
                    const effStats = PlayerEngine.getEffectiveStats(player);

                    // --- Consume Fish/Items & Calculate Fair-Trade Payout ---
                    if (q.type === 'hunt') {
                        let removed = 0;
                        for (let i = player.inventory.length - 1; i >= 0; i--) {
                            if (player.inventory[i].invType === 'fish' && player.inventory[i].id === q.targetSpeciesId) {
                                const f = player.inventory.splice(i, 1)[0];
                                fishValueBonus += Math.max(1, Math.round(f.economy.baseValue * effStats.economy.sellMultiplier));
                                removed++;
                                if (removed >= q.requiredAmount) break;
                            }
                        }
                    } else if (q.type === 'trophy') {
                        let heaviestIdx = -1;
                        let heaviestW = 0;
                        for (let i = 0; i < player.inventory.length; i++) {
                            const f = player.inventory[i];
                            if (f.invType === 'fish' && f.id === q.targetSpeciesId && f.actualWeight >= q.requiredWeight) {
                                if (f.actualWeight > heaviestW) { heaviestW = f.actualWeight; heaviestIdx = i; }
                            }
                        }
                        if (heaviestIdx > -1) {
                            const f = player.inventory.splice(heaviestIdx, 1)[0];
                            fishValueBonus += Math.max(1, Math.round(f.economy.baseValue * effStats.economy.sellMultiplier));
                        }
                    } else if (q.type === 'crafting') {
                        // Find the matching custom lure and hand it to the NPC
                        const matchIdx = player.inventory.findIndex(item => {
                            if (item.invType !== 'lure') return false;
                            return q.requirements.every(req => item.stats[req.stat] >= req.min && item.stats[req.stat] <= req.max);
                        });
                        if (matchIdx > -1) {
                            player.inventory.splice(matchIdx, 1);
                        }
                    }
                    
                    // Add the base reward + the market value of the fish consumed
                    player.vitals.gold += q.rewards.gold + fishValueBonus;
                    
                    const leveledUp = PlayerEngine.addXp(player, q.rewards.xp);
                    if (leveledUp) SFX.playLevelUp();
                    
                    // --- NEW: HUD Logging ---
                    HUD.logAction(`Quest Complete: ${q.title}`, "safe");
                    HUD.logAction(`+${q.rewards.gold}g (Reward)`, "safe");
                    if (fishValueBonus > 0) HUD.logAction(`+${fishValueBonus}g (Fish Market Value)`, "safe");
                    HUD.logAction(`+${q.rewards.xp} XP`, "safe");

                    if (q.rewards.item) {
                        const pId = q.rewards.item.id.replace('part_', '');
                        const pName = pId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        const rng = createRng(Date.now());
                        
                        HUD.logAction(`+${q.rewards.item.qty}x ${pName}`, "safe"); // <-- Item log
                        
                        // Loop to give the exact quantity promised
                        for (let k = 0; k < q.rewards.item.qty; k++) {
                            player.reagents.push({ 
                                id: `part_${rng.int(10000, 99999)}`, 
                                invType: 'part',
                                name: pName, 
                                visualId: pId, 
                                rarity: 'Rare',
                                stats: { color: 10, sound: 10, light: 10, weight: 10 },
                                imageDataUrl: generateLurePart({ visualId: pId, rng: createRng(Date.now() + k) })
                            });
                        }
                    }

                    const activeIdx = player.activeQuests.findIndex(aq => aq.id === q.id);
                    if (activeIdx > -1) player.activeQuests.splice(activeIdx, 1);

                    const boardIdx = this.currentQuests.findIndex(bq => bq.id === q.id);
                    if (boardIdx > -1) this.currentQuests.splice(boardIdx, 1);

                    if (!player.completedQuests) player.completedQuests = [];
                    player.completedQuests.push(q.id);

                    const dialogMsg = fishValueBonus > 0 
                        ? `Well done! The guild sends their regards, plus ${fishValueBonus}g market value for the fish.` 
                        : "Well done! The guild sends their regards.";
                    this.triggerDialogue(this.currentNPCs.tavern, dialogMsg);
                    
                    if (this.callbacks.onSave) this.callbacks.onSave();
                    this.renderActiveTab();
                };
                turnInList.appendChild(card);
            }
        });

        if (hasTurnIns) turnInSection.style.display = 'block';

        // --- 2. RENDER AVAILABLE QUESTS ---
        if (this.currentQuests.length === 0) {
            list.innerHTML = `<p style="color:var(--text-muted); font-size:1.2rem; grid-column: span 2; text-align: center;">No jobs posted today.</p>`;
            return;
        }

        const activeCount = player.activeQuests.length;

        this.currentQuests.forEach(q => {
            const rng = createRng(Date.now() + q.difficulty);
            const flavor = DialogueGenerator.getQuestFlavor(q, rng, this.currentNPCs.tavern);
                
            const isAccepted = player.activeQuests.some(aq => aq.id === q.id);
            const isFull = !isAccepted && activeCount >= 8;

            const card = document.createElement('div');
            card.style.cssText = "background: var(--bg-void); border: 1px solid var(--panel-border); padding: 1rem; border-radius: 4px; display: flex; flex-direction: column;";
            
            let rewardItemText = '';
            if (q.rewards.item) {
                const itemName = q.rewards.item.id.replace('part_', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                rewardItemText = `<br/><span style="color:var(--cyan-glow); font-weight:bold;">+ ${q.rewards.item.qty}x ${itemName}</span>`;
            }

            let btnText = 'Accept Quest';
            let btnStyle = '';
            let btnDisabled = '';

            if (isAccepted) {
                btnText = 'Accepted';
                btnStyle = 'border-color:var(--green-safe); color:var(--green-safe);';
                btnDisabled = 'disabled';
            } else if (isFull) {
                btnText = 'Log Full (8/8)';
                btnStyle = 'opacity:0.5; cursor:not-allowed; border-color:var(--panel-border); color:var(--text-muted);';
                btnDisabled = 'disabled';
            }

            card.innerHTML = `
                <h3 style="margin:0 0 0.5rem 0; color:var(--cyan-glow); font-size:1.2rem;">${q.title}</h3>
                <p style="color:var(--text-muted); font-style:italic; font-size:0.9rem; margin-top:0;">"${flavor}"</p>
                <p style="color:var(--text-main); font-size:1rem; margin-bottom:1rem; flex: 1;">${q.desc}</p>
                
                <div style="border-top: 1px dashed var(--panel-border); padding-top: 0.5rem; font-size: 1rem; margin-bottom: 0.5rem;">
                    <span style="color:var(--gold-warn); font-weight:bold;">Reward: ${q.rewards.gold}g</span> | 
                    <span style="color:#A78BFA; font-weight:bold;">${q.rewards.xp} XP</span>
                    ${rewardItemText}
                </div>
                
                <button class="menu-btn btn-accept" style="width:100%; padding:0.4rem; margin:0; font-size:1.1rem; ${btnStyle}" ${btnDisabled}>
                    ${btnText}
                </button>
            `;
            
            if (!isAccepted && !isFull) {
                card.querySelector('.btn-accept').onclick = () => {
                    SFX.playUISelect();
                    player.activeQuests.push(q);
                    if (this.callbacks.onSave) this.callbacks.onSave();
                    this.renderActiveTab(); 
                };
            }
            
            list.appendChild(card);
        });
    },

    // ==========================================
    // SAFEHOUSE & REAL ESTATE
    // ==========================================

    renderSafehouse(container) {
        // This is only called when clicking the Hub Tab and the safehouse is NOT owned yet.
        const player = this.gameState.player;
        const coords = `${this.gameState.globalX},${this.gameState.globalY}`;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid var(--panel-border); padding-bottom: 0.4rem; margin-bottom: 1rem;">
                <h2 style="margin:0; color:var(--gold-warn); font-size: 1.6rem;">Abandoned Warehouse</h2>
                <div style="font-size: 1.2rem; color:var(--gold-warn);">💰 ${player.vitals.gold}g</div>
            </div>
            <div style="text-align:center; padding: 1.25rem; background: var(--bg-void); border: 1px dashed var(--panel-border); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <h3 style="font-size: 1.6rem; color: var(--text-main); margin: 0 0 0.5rem 0;">Prime Real Estate</h3>
                <p style="font-size: 1.1rem; color: var(--text-muted); max-width: 520px; margin: 0 auto 1.25rem auto; line-height: 1.4;">
                    A sturdy, if dusty, property located right on the docks. Includes a dry dock crane, a storage basement, and a cracked glass viewing tank.<br><br>
                    Purchasing this property unlocks permanent storage and boat customization in this settlement.
                </p>
                <button class="menu-btn" id="btn-buy-safehouse" style="font-size: 1.2rem; color: var(--gold-warn); border-color: var(--gold-warn); padding: 0.5rem 2rem; width: auto; margin: 0;" ${player.vitals.gold < 1000 ? 'disabled' : ''}>
                    Purchase Deed (1,000g)
                </button>
            </div>
        `;
        
        const btn = document.getElementById('btn-buy-safehouse');
        if (btn && !btn.disabled) {
            btn.onclick = () => {
                SFX.playGold();
                player.vitals.gold -= 1000; // Restored original 1000g cost
                player.safehouses[coords] = {
                    stash: [], hangar: [], aquarium:[],
                    stashTier: 1, hangarTier: 1, aquariumTier: 1,
                    stashCapacity: 10, hangarCapacity: 1, aquariumCapacity: 3,
                    aquariumTheme: this.currentNode.biomeId,
                    unlockedThemes:[this.currentNode.biomeId] // Array of unlocked themes
                };
                if (this.callbacks.onSave) this.callbacks.onSave();
                
                // Immediately open the full screen and reset the Hub tab behind it
                document.querySelectorAll('.hub-tab-btn').forEach(t => t.classList.remove('active'));
                document.querySelector('.hub-tab-btn[data-tab="market"]').classList.add('active');
                this.activeTab = 'market';
                this.openSafehouse();
            };
        }
    },

    renderSafehouseFullScreen() {
        const player = this.gameState.player;
        const coords = `${this.gameState.globalX},${this.gameState.globalY}`;
        const safehouse = player.safehouses[coords];
        
        if (!safehouse) return;

        // Stop aquarium animation if we navigate away from it
        if (this.safehouseSubTab !== 'aquarium') this.stopAquariumLoop();

        document.getElementById('sh-gold-display').innerText = player.vitals.gold;
        const shContent = document.getElementById('safehouse-full-content');
        shContent.innerHTML = ''; // Clear it

        if (this.safehouseSubTab === 'drydock') this.renderSHDryDock(shContent, safehouse, player);
        else if (this.safehouseSubTab === 'stash') this.renderSHStash(shContent, safehouse, player);
        else if (this.safehouseSubTab === 'aquarium') this.renderSHAquarium(shContent, safehouse, player);
        else if (this.safehouseSubTab === 'realestate') this.renderSHRealEstate(shContent, safehouse, player);
    },

    // --- SUB-VIEW: DRY DOCK ---
    renderSHDryDock(container, safehouse, player) {
        const boat = player.gear.boat;
        const upg = boat.upgrades;

        const renderSlot = (slotKey, item, icon) => {
            if (!item) {
                return `<div class="upgrade-slot empty">
                            <div style="font-size:2rem; opacity:0.5;">${icon}</div>
                            <div><b style="color:var(--text-muted); font-size:1.2rem; text-transform:capitalize;">${slotKey}</b><br><span style="color:var(--text-muted); font-size:0.9rem;">Empty Slot</span></div>
                        </div>`;
            }
            return `<div class="upgrade-slot" style="border-color:var(--cyan-glow);">
                        <div style="font-size:2rem;">${icon}</div>
                        <div style="flex:1;">
                            <b style="color:var(--cyan-glow); font-size:1.2rem;">${item.name}</b><br>
                            <span style="color:var(--text-main); font-size:0.85rem;">${item.desc || 'Installed'}</span>
                        </div>
                        <button class="menu-btn btn-unequip" data-slot="${slotKey}" style="width:auto; padding:0.3rem 0.6rem; margin:0; font-size:1rem; border-color:var(--red-danger); color:var(--red-danger);">Remove</button>
                    </div>`;
        };

        container.innerHTML = `
            <div class="drydock-container" style="flex-shrink: 0; margin-bottom: 1.5rem;">
                <div class="drydock-boat-view">
                    <img src="${boat.art.profileDataUrl}" style="width: 200px; image-rendering: pixelated; margin-bottom: 1rem;" />
                    <h3 style="color:var(--cyan-glow); margin:0; font-size:1.6rem;">${boat.identity.name}</h3>
                    <p style="color:var(--text-muted); font-size:1rem; margin-top:0.2rem;">Active Vessel</p>
                </div>
                <div class="drydock-upgrades">
                    ${renderSlot('engine', upg.engine, '⚙️')}
                    ${renderSlot('plating', upg.plating, '🛡️')}
                    ${renderSlot('prow', upg.prow, '⛏️')}
                    ${renderSlot('storage', upg.storage, '📦')}
                    <div style="grid-column: span 2;">${renderSlot('lantern', upg.lantern, '🏮')}</div>
                </div>
            </div>
            
            <div style="display:flex; gap: 2rem; flex: 1; min-height: 0;">
                <div style="flex: 1; display:flex; flex-direction:column; overflow:hidden;">
                    <h3 style="color:var(--text-main); font-size: 1.3rem; border-bottom:1px solid var(--panel-border); padding-bottom:0.5rem; margin-top:0;">Available Upgrades (Stash & Cargo)</h3>
                    <div id="sh-upgrade-list" style="display:flex; flex-direction:column; gap:0.5rem; overflow-y:auto; padding-right:0.5rem;"></div>
                </div>
                <div style="flex: 1; display:flex; flex-direction:column; overflow:hidden;">
                    <h3 style="color:var(--text-main); font-size: 1.3rem; border-bottom:1px solid var(--panel-border); padding-bottom:0.5rem; margin-top:0;">Parked Hulls (Hangar: ${safehouse.hangar.length}/${safehouse.hangarCapacity})</h3>
                    <div id="sh-hangar-list" style="display:flex; flex-direction:column; gap:0.5rem; overflow-y:auto; padding-right:0.5rem;"></div>
                </div>
            </div>
        `;

        container.querySelectorAll('.btn-unequip').forEach(btn => {
            btn.onclick = (e) => {
                const slot = e.target.getAttribute('data-slot');
                const item = player.gear.boat.upgrades[slot];
                
                // Only send uninstalled lanterns back to inventory if they are not the free Basic Candle
                if (item && item.id !== 'upg_lantern_basic') {
                    if (safehouse.stash.length < safehouse.stashCapacity) safehouse.stash.push(item);
                    else player.inventory.push(item);
                }

                // Fully format the Basic Candle fallback to prevent null pointer crashes in the engine
                if (slot === 'lantern') {
                    player.gear.boat.upgrades.lantern = { 
                        id: 'upg_lantern_basic', 
                        name: 'Basic Candle', 
                        slot: 'lantern', 
                        type: 'upgrade', 
                        basePrice: 0, 
                        desc: 'Faint candlelight. Light radius 100px.', 
                        lightRadius: 100, 
                        fuelDrainRate: 1.0 
                    };
                } else {
                    player.gear.boat.upgrades[slot] = null;
                }

                // Ensure HP clamps to the newly calculated Effective HP
                const newEff = PlayerEngine.getEffectiveStats(player);
                player.vitals.hp = Math.min(player.vitals.hp, newEff.exploration.maxHp);

                SFX.playLineSnap();
                if (this.callbacks.onSave) this.callbacks.onSave();
                this.renderSafehouseFullScreen();
            };
        });

        const upgradeList = document.getElementById('sh-upgrade-list');
        
        // --- FIX: Robust list filtering with ID-Prefix fallback and Null-safety ---
        const stashList = Array.isArray(safehouse.stash) ? safehouse.stash : [];
        const cargoList = Array.isArray(player.inventory) ? player.inventory : [];
        
        const allAvailableUpgrades = [
            ...stashList.filter(i => i && (i.type === 'upgrade' || i.invType === 'upgrade' || (i.id && i.id.startsWith('upg_')))),
            ...cargoList.filter(i => i && (i.type === 'upgrade' || i.invType === 'upgrade' || (i.id && i.id.startsWith('upg_'))))
        ];
        
        if (allAvailableUpgrades.length === 0) {
            upgradeList.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">No upgrades found in Stash or Cargo.</span>`;
        }

        allAvailableUpgrades.forEach(u => {
            const row = document.createElement('div');
            row.style.cssText = "background:var(--panel-base); border:1px solid var(--panel-border); padding:0.8rem; border-radius:4px; display:flex; justify-content:space-between; align-items:center; flex-shrink: 0;";
            row.innerHTML = `
                <div><b style="color:var(--text-main); font-size:1.1rem;">${u.name}</b><br><span style="color:var(--text-muted); font-size:0.85rem;">Slot: ${u.slot}</span></div>
                <button class="menu-btn btn-install" style="width:auto; padding:0.3rem 0.8rem; margin:0; font-size:1rem; border-color:var(--green-safe); color:var(--green-safe);">Install</button>
            `;
            row.querySelector('.btn-install').onclick = () => {
                const oldItem = player.gear.boat.upgrades[u.slot];
                // Do not clutter the player's stash with uninstalled starting candle stubs
                if (oldItem && oldItem.id !== 'upg_lantern_basic' && oldItem.id !== 'lantern_basic') {
                    if (safehouse.stash.length < safehouse.stashCapacity) safehouse.stash.push(oldItem);
                    else player.inventory.push(oldItem);
                }
                
                player.gear.boat.upgrades[u.slot] = u;
                
                // Ensure HP climbs to the newly calculated Effective HP
                const newEff = PlayerEngine.getEffectiveStats(player);
                player.vitals.hp = Math.min(player.vitals.hp, newEff.exploration.maxHp);
                
                const sIdx = safehouse.stash.findIndex(i => i.id === u.id);
                if (sIdx > -1) safehouse.stash.splice(sIdx, 1);
                else {
                    const cIdx = player.inventory.findIndex(i => i.id === u.id);
                    if (cIdx > -1) player.inventory.splice(cIdx, 1);
                }

                SFX.playCatchSuccess();
                if (this.callbacks.onSave) this.callbacks.onSave();
                this.renderSafehouseFullScreen();
            };
            upgradeList.appendChild(row);
        });

        const hangarList = document.getElementById('sh-hangar-list');
        if (safehouse.hangar.length === 0) {
            hangarList.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">Hangar is empty.</span>`;
        }
        safehouse.hangar.forEach((h, index) => {
            const row = document.createElement('div');
            row.style.cssText = "background:var(--panel-base); border:1px solid var(--panel-border); padding:0.5rem; border-radius:4px; display:flex; gap: 1rem; align-items:center; flex-shrink: 0;";
            row.innerHTML = `
                <img src="${h.art.profileDataUrl}" style="width:40px; image-rendering:pixelated;" />
                <div style="flex:1;"><b style="color:var(--cyan-glow); font-size:1.1rem;">${h.identity.name}</b></div>
                <button class="menu-btn btn-swap" style="width:auto; padding:0.3rem 0.8rem; margin:0; font-size:1rem;">Swap</button>
            `;
            row.querySelector('.btn-swap').onclick = () => {
                SFX.playUISelect();
                const active = player.gear.boat;
                h.upgrades = active.upgrades;
                active.upgrades = { plating: null, engine: null, prow: null, storage: null, lantern: { id: 'lantern_basic', name: 'Basic Lantern', lightRadius: 100, fuelDrainRate: 1.0 } };
                
                player.gear.boat = h;
                player.vitals.hp = Math.min(player.vitals.hp, h.stats.maxHp);
                
                safehouse.hangar.splice(index, 1);
                safehouse.hangar.push(active);
                
                if (this.callbacks.onSave) this.callbacks.onSave();
                this.renderSafehouseFullScreen();
            };
            hangarList.appendChild(row);
        });
    },

    // --- SUB-VIEW: STASH ---
    renderSHStash(container, safehouse, player) {
        const effStats = PlayerEngine.getEffectiveStats(player);
        const maxCargo = effStats.exploration.cargoSpace;
        
        container.innerHTML = `
            <div style="display:flex; gap: 1rem; height: 100%;">
                <div class="stash-container">
                    <div style="background:var(--panel-base); padding: 1rem; border-bottom: 2px solid var(--panel-border);">
                        <h3 style="margin:0; color:var(--text-main); font-size: 1.4rem;">Boat Cargo (${player.inventory.length}/${maxCargo})</h3>
                        <span style="color:var(--text-muted); font-size:0.9rem;">Click item to send to Stash</span>
                    </div>
                    <div class="stash-grid" id="sh-cargo-grid"></div>
                </div>
                
                <div style="display:flex; align-items:center; justify-content:center; color:var(--cyan-glow); font-size: 2rem;">⮂</div>
                
                <div class="stash-container">
                    <div style="background:var(--panel-base); padding: 1rem; border-bottom: 2px solid var(--panel-border);">
                        <h3 style="margin:0; color:var(--text-main); font-size: 1.4rem;">Warehouse Stash (${safehouse.stash.length}/${safehouse.stashCapacity})</h3>
                        <span style="color:var(--text-muted); font-size:0.9rem;">Click item to send to Cargo</span>
                    </div>
                    <div class="stash-grid" id="sh-stash-grid"></div>
                </div>
            </div>
        `;

        const renderItem = (item, isCargo, index) => {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            
            // --- FIX: Robust Image Extraction (Boats use profileDataUrl, others use imageDataUrl) ---
            let imgSrc = item.imageDataUrl || (item.art ? (item.art.profileDataUrl || item.art.imageDataUrl) : '');
            
            // --- FIX: Robust Name Extraction (Boats use identity.name, others use name) ---
            const safeName = item.name || (item.identity ? item.identity.name : 'Unknown');

            if (imgSrc) {
                slot.innerHTML = `<img src="${imgSrc}" />`;
            } else {
                slot.innerHTML = `<span style="font-size: 0.6rem; color: #555; text-align: center;">${safeName.substring(0, 6)}</span>`;
            }

            // --- NEW UNIFIED TOOLTIP BINDER ---
            TooltipUI.bind(slot, item, player);

            slot.onclick = () => {
                TooltipUI.hide(); 
                if (isCargo) {
                    if (item.invType === 'fish' || item.invType === 'boat' || item.invType === 'chest') {
                        SFX.playError(); return; 
                    }
                    if (safehouse.stash.length < safehouse.stashCapacity) {
                        SFX.playUIHover();
                        safehouse.stash.push(player.inventory.splice(index, 1)[0]);
                        if (this.callbacks.onSave) this.callbacks.onSave();
                        this.renderSafehouseFullScreen();
                    } else SFX.playError();
                } else {
                    if (player.inventory.length < maxCargo) {
                        SFX.playUIHover();
                        player.inventory.push(safehouse.stash.splice(index, 1)[0]);
                        if (this.callbacks.onSave) this.callbacks.onSave();
                        this.renderSafehouseFullScreen();
                    } else SFX.playError();
                }
            };
            return slot;
        };

        const cargoGrid = document.getElementById('sh-cargo-grid');
        player.inventory.forEach((item, idx) => {
            const slot = renderItem(item, true, idx);
            if (item.invType === 'fish' || item.invType === 'boat' || item.invType === 'chest') slot.style.opacity = '0.3'; 
            cargoGrid.appendChild(slot);
        });

        const stashGrid = document.getElementById('sh-stash-grid');
        safehouse.stash.forEach((item, idx) => stashGrid.appendChild(renderItem(item, false, idx)));
    },

    // --- SUB-VIEW: REAL ESTATE UPGRADES ---
    renderSHRealEstate(container, safehouse, player) {
        const createUpgCard = (title, currentTier, maxTier, cost, desc, onBuy) => {
            const isMax = currentTier >= maxTier;
            const canAfford = player.vitals.gold >= cost;
            const btnHtml = isMax 
                ? `<button class="menu-btn" disabled style="width:100%; margin:0; padding:0.6rem; opacity:0.5;">Maximum Tier Reached</button>`
                : `<button class="menu-btn btn-buy-re" style="width:100%; margin:0; padding:0.6rem; border-color:var(--gold-warn); color:var(--gold-warn);" ${!canAfford ? 'disabled' : ''}>Upgrade (${cost}g)</button>`;
            
            const card = document.createElement('div');
            card.style.cssText = "background:var(--bg-void); border:1px solid var(--panel-border); padding:1.5rem; border-radius:6px; display:flex; flex-direction:column; gap:1rem;";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:baseline;">
                    <h3 style="margin:0; color:var(--cyan-glow); font-size:1.6rem;">${title}</h3>
                    <span style="color:var(--text-muted); font-weight:bold;">Tier ${currentTier} / ${maxTier}</span>
                </div>
                <p style="margin:0; color:var(--text-main); font-size:1.1rem; flex:1;">${isMax ? 'Fully upgraded.' : desc}</p>
                ${btnHtml}
            `;
            if (!isMax && canAfford) {
                card.querySelector('.btn-buy-re').onclick = () => {
                    SFX.playGold();
                    player.vitals.gold -= cost;
                    onBuy();
                    if (this.callbacks.onSave) this.callbacks.onSave();
                    this.renderSafehouseFullScreen();
                };
            }
            return card;
        };

        // RESTORED ORIGINAL PRICING
        const costStash = safehouse.stashTier === 1 ? 750 : 2000; 
        const descStash = safehouse.stashTier === 1 ? "Expands Stash capacity to 25 slots." : "Expands Stash capacity to 50 slots.";
        const stashCard = createUpgCard("The Stash", safehouse.stashTier, 3, costStash, descStash, () => {
            safehouse.stashTier++;
            safehouse.stashCapacity = safehouse.stashTier === 2 ? 25 : 50;
        });

        const costHangar = safehouse.hangarTier === 1 ? 1200 : 3000; 
        const descHangar = safehouse.hangarTier === 1 ? "Expands Dry Dock to hold 2 parked hulls." : "Expands Dry Dock to hold 4 parked hulls.";
        const hangarCard = createUpgCard("The Dry Dock", safehouse.hangarTier, 3, costHangar, descHangar, () => {
            safehouse.hangarTier++;
            safehouse.hangarCapacity = safehouse.hangarTier === 2 ? 2 : 4;
        });

        const costAqua = safehouse.aquariumTier === 1 ? 1500 : 4000;
        const descAqua = safehouse.aquariumTier === 1 ? "A medium tank. Holds 6 swimming fish." : "A massive wall-to-wall tank. Holds 12 swimming fish.";
        const aquaCard = createUpgCard("The Aquarium", safehouse.aquariumTier, 3, costAqua, descAqua, () => {
            safehouse.aquariumTier++;
            safehouse.aquariumCapacity = safehouse.aquariumTier === 2 ? 6 : 12;
        });

        // --- NEW: THEME SELECTION CARD ---
        if (!safehouse.aquariumTheme) safehouse.aquariumTheme = this.currentNode.biomeId;
        if (!safehouse.unlockedThemes) safehouse.unlockedThemes = [this.currentNode.biomeId]; // Fallback for existing saves
        
        const themeCard = document.createElement('div');
        themeCard.style.cssText = "background:var(--bg-void); border:1px solid var(--panel-border); padding:1.5rem; border-radius:6px; display:flex; flex-direction:column; gap:1rem;";
        
        let themeListHtml = '<div style="display:flex; flex-direction:column; gap:0.5rem; overflow-y:auto; padding-right:0.5rem; flex: 1;">';
        
        Object.keys(BIOMES).forEach(themeId => {
            if (themeId === 'hub') return; // Skip hub theme for the tank
            
            const isUnlocked = safehouse.unlockedThemes.includes(themeId);
            const isActive = safehouse.aquariumTheme === themeId;
            const themeName = BIOMES[themeId].name;
            const themeColor = BIOMES[themeId].textColor || BIOMES[themeId].globalColor;
            
            let btnHtml = "";
            if (isActive) {
                btnHtml = `<span style="color:var(--cyan-glow); font-size:1rem; font-weight:bold; margin-right:0.5rem;">Active</span>`;
            } else if (isUnlocked) {
                btnHtml = `<button class="menu-btn btn-select-theme" data-theme="${themeId}" style="width:auto; padding:0.3rem 0.8rem; margin:0; font-size:1rem; border-color:var(--cyan-glow); color:var(--cyan-glow);">Select</button>`;
            } else {
                const canAfford = player.vitals.gold >= 100;
                btnHtml = `<button class="menu-btn btn-buy-theme" data-theme="${themeId}" style="width:auto; padding:0.3rem 0.8rem; margin:0; font-size:1rem; border-color:var(--gold-warn); color:var(--gold-warn);" ${!canAfford ? 'disabled' : ''}>Buy 100g</button>`;
            }

            themeListHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--panel-base); padding:0.8rem; border-radius:4px; border:1px solid ${isActive ? 'var(--cyan-glow)' : 'var(--panel-border)'};">
                    <span style="color:${themeColor}; font-weight:bold; font-size:1.1rem;">${themeName}</span>
                    ${btnHtml}
                </div>
            `;
        });
        themeListHtml += '</div>';

        themeCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
                <h3 style="margin:0; color:var(--cyan-glow); font-size:1.6rem;">Tank Decor</h3>
            </div>
            <p style="margin:0 0 0.5rem 0; color:var(--text-main); font-size:1.1rem;">Unlock and select background environments.</p>
            ${themeListHtml}
        `;

        // Attach Button Logic for Themes
        themeCard.querySelectorAll('.btn-select-theme').forEach(btn => {
            btn.onclick = (e) => {
                SFX.playUISelect();
                safehouse.aquariumTheme = e.target.getAttribute('data-theme');
                if (this.callbacks.onSave) this.callbacks.onSave();
                this.renderSafehouseFullScreen();
            };
        });

        themeCard.querySelectorAll('.btn-buy-theme').forEach(btn => {
            btn.onclick = (e) => {
                SFX.playGold();
                player.vitals.gold -= 100;
                const newTheme = e.target.getAttribute('data-theme');
                safehouse.unlockedThemes.push(newTheme);
                safehouse.aquariumTheme = newTheme; // Auto-equip on purchase
                if (this.callbacks.onSave) this.callbacks.onSave();
                this.renderSafehouseFullScreen();
            };
        });

        // 2x2 Grid for the 4 Real Estate blocks
        container.innerHTML = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.5rem; flex: 1; min-height: 0;" id="sh-re-grid"></div>`;
        const grid = container.querySelector('#sh-re-grid');
        grid.appendChild(stashCard);
        grid.appendChild(hangarCard);
        grid.appendChild(aquaCard);
        grid.appendChild(themeCard);
    },

    // --- SUB-VIEW: THE AQUARIUM ---
    renderSHAquarium(container, safehouse, player) {
        container.innerHTML = `
            <div class="aquarium-wrapper" style="height: 380px;">
                <canvas id="aquarium-canvas"></canvas>
                <div class="aquarium-glass-overlay"></div>
            </div>
            <div style="display:flex; gap: 1rem; flex: 1; min-height: 0; margin-top: 1rem;">
                <div class="stash-container" style="flex: 1;">
                    <div style="background:var(--panel-base); padding: 0.8rem; border-bottom: 2px solid var(--panel-border);">
                        <h3 style="margin:0; color:var(--text-main); font-size: 1.2rem;">Live Cargo</h3>
                    </div>
                    <div class="stash-grid" id="sh-aqua-cargo"></div>
                </div>
                <div class="stash-container" style="flex: 1;">
                    <div style="background:var(--panel-base); padding: 0.8rem; border-bottom: 2px solid var(--panel-border);">
                        <h3 style="margin:0; color:var(--text-main); font-size: 1.2rem;">Aquarium (${safehouse.aquarium.length}/${safehouse.aquariumCapacity})</h3>
                    </div>
                    <div class="stash-grid" id="sh-aqua-tank"></div>
                </div>
            </div>
        `;

        const renderFishBtn = (fish, isCargo, index) => {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.innerHTML = `<img src="${fish.art.imageDataUrl}" />`;

            // --- NEW UNIFIED TOOLTIP BINDER ---
            TooltipUI.bind(slot, fish, player);

            slot.onclick = () => {
                TooltipUI.hide(); // <-- UPDATED
                if (isCargo) {
                    if (safehouse.aquarium.length < safehouse.aquariumCapacity) {
                        SFX.playSplash();
                        safehouse.aquarium.push(player.inventory.splice(index, 1)[0]);
                        if (this.callbacks.onSave) this.callbacks.onSave();
                        this.renderSafehouseFullScreen(); 
                    } else SFX.playError();
                } else {
                    const effStats = PlayerEngine.getEffectiveStats(player);
                    if (player.inventory.length < effStats.exploration.cargoSpace) {
                        SFX.playSplash();
                        player.inventory.push(safehouse.aquarium.splice(index, 1)[0]);
                        if (this.callbacks.onSave) this.callbacks.onSave();
                        this.renderSafehouseFullScreen();
                    } else SFX.playError();
                }
            };
            return slot;
        };

        const cargoGrid = document.getElementById('sh-aqua-cargo');
        player.inventory.forEach((item, idx) => {
            if (item.invType === 'fish') cargoGrid.appendChild(renderFishBtn(item, true, idx));
        });

        const tankGrid = document.getElementById('sh-aqua-tank');
        safehouse.aquarium.forEach((fish, idx) => tankGrid.appendChild(renderFishBtn(fish, false, idx)));

        // Kick off the animation loop
        this.startAquariumLoop(safehouse.aquarium);
    },

    startAquariumLoop(aquariumFish) {
        this.stopAquariumLoop(); 
        
        const canvas = document.getElementById('aquarium-canvas');
        if (!canvas) return;
        
        const player = this.gameState.player;
        const coords = `${this.gameState.globalX},${this.gameState.globalY}`;
        const safehouse = player.safehouses[coords];
        const themeId = safehouse.aquariumTheme || this.currentNode.biomeId;
        const pal = BIOMES[themeId].palette;
        
        let pColors =['#FFFFFF', '#94A3B8']; 
        if (pal.water === '#162e1a') pColors =['#86EFAC', '#4ADE80']; 
        if (pal.water === '#5e1313') pColors = ['#F59E0B', '#EF4444']; 
        if (pal.water === '#050510') pColors =['#a855f7', '#c084fc'];

        const particles =[];
        for (let i = 0; i < 40; i++) {
            particles.push({
                x: Math.random() * 1000, 
                y: Math.random() * 500,
                speed: Math.random() * 0.5 + 0.1,
                size: Math.random() * 2 + 1,
                wobble: Math.random() * Math.PI * 2,
                color: pColors[Math.floor(Math.random() * pColors.length)]
            });
        }

        setTimeout(() => {
            if (!canvas.offsetParent) return; 
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            // --- 1. INITIALIZE ENTITY STATE MACHINES ---
            this.aquariumEntities = aquariumFish.map(fish => {
                const img = new Image();
                img.src = fish.art.imageDataUrl;
                
                // NEW: Shrunk all fish by ~35% so the tank feels larger and less cluttered
                const sMap = { 'Tiny': 0.15, 'Small': 0.25, 'Medium': 0.4, 'Large': 0.65, 'Massive': 1 };
                const scale = sMap[fish.physical.sizeTier] || 0.6;
                const initialVx = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.5);

                return {
                    fish: fish,
                    family: fish.identity.family, // e.g., 'crustacean', 'shark'
                    img: img,
                    x: Math.random() * canvas.width,
                    y: Math.random() * (canvas.height - 100) + 50,
                    baseY: Math.random() * (canvas.height - 150) + 50,
                    vx: initialVx,
                    vy: (Math.random() - 0.5) * 0.2,
                    facing: Math.sign(initialVx),
                    scale: scale,
                    bobPhase: Math.random() * Math.PI * 2,
                    timer: Math.random() * 2,
                    state: 'roam'
                };
            });

            let lastTime = performance.now();

            const loop = (time) => {
                const dt = Math.min((time - lastTime) / 1000, 0.1); 
                lastTime = time;

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // --- 2. DRAW WATER & PARTICLES ---
                const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                grad.addColorStop(0, pal.water);
                grad.addColorStop(1, pal.deepWater);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = '#FFFFFF';
                particles.forEach(p => {
                    p.y -= p.speed * dt * 40; 
                    p.wobble += 0.02;
                    if (p.y < 0) {
                        p.y = canvas.height;
                        p.x = Math.random() * canvas.width;
                    }
                    const drawX = p.x + Math.sin(p.wobble) * 2;
                    ctx.fillStyle = p.color;
                    ctx.fillRect(drawX, p.y, p.size, p.size);
                });

                // --- 3. DRAW SEA FLOOR ---
                const floorY = canvas.height - 40;
                ctx.fillStyle = pal.land;
                ctx.fillRect(0, floorY, canvas.width, 40);
                
                ctx.fillStyle = pal.rock;
                for(let i = 0; i < canvas.width / 60 + 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * 60, floorY);
                    ctx.lineTo(i * 60 + 30, floorY - 30 + (i % 2 * 10));
                    ctx.lineTo(i * 60 + 60, floorY);
                    ctx.fill();
                }

                if (themeId !== 'abyssal') {
                    ctx.fillStyle = pal.flora;
                    const baseSway = Math.sin(time / 1000) * 3;
                    
                    for(let i = 0; i < canvas.width / 40 + 1; i++) {
                        const baseX = 10 + i * 40;
                        // Draw 3 overlapping stalks per cluster to create a dense forest
                        for (let s = 0; s < 3; s++) {
                            const height = 15 + ((i * 7 + s * 13) % 30); // Random organic heights
                            const stalkX = baseX + s * 6;
                            
                            for (let seg = 0; seg < height; seg += 4) {
                                // The top segments of the kelp sway further than the roots
                                const sway = (seg / height) * baseSway * (s + 1.5);
                                ctx.fillRect(stalkX + sway, floorY - seg - 4, 3, 4);
                                
                                // Draw alternating leaves/fronds
                                if (seg > 4 && (seg + s) % 3 !== 0) {
                                    const leafDir = (seg % 8 === 0) ? -3 : 3;
                                    ctx.fillRect(stalkX + sway + leafDir, floorY - seg - 2, 3, 2);
                                }
                            }
                        }
                    }
                }

                // --- 4. FISH BEHAVIOR AI (FIXED STRING MATCHES) ---
                this.aquariumEntities.forEach(ent => {
                    const w = ent.img.complete ? ent.img.width * ent.scale : 20;
                    const h = ent.img.complete ? ent.img.height * ent.scale : 20;
                    let bobY = 0;

                    // AI: CRUSTACEANS
                    if (ent.family === 'crustacean') {
                        // FIX: Hugs the sea floor
                        const targetY = floorY - (h * 0.2);
                        ent.y += (targetY - ent.y) * 2 * dt; 
                        ent.timer -= dt;
                        if (ent.timer <= 0) {
                            if (ent.state === 'scuttle') {
                                ent.state = 'rest';
                                ent.vx = 0;
                                ent.timer = Math.random() * 2 + 1;
                            } else {
                                ent.state = 'scuttle';
                                ent.vx = (Math.random() > 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.3);
                                ent.timer = Math.random() * 3 + 1;
                            }
                        }
                        ent.x += ent.vx * 60 * dt;
                    } 
                    // AI: JELLYFISH
                    else if (ent.family === 'jellyfish') {
                        ent.timer -= dt;
                        if (ent.timer <= 0) {
                            ent.vy = -0.6 - Math.random() * 0.4; 
                            ent.vx = (Math.random() - 0.5) * 0.3; 
                            ent.timer = Math.random() * 1.5 + 1.0;
                        }
                        ent.vy += 0.4 * dt; 
                        ent.x += ent.vx * 60 * dt;
                        ent.y += ent.vy * 60 * dt;
                        bobY = Math.sin(ent.bobPhase) * 8; 
                        ent.bobPhase += dt * 3;
                    }
                    // AI: CEPHALOPOD
                    else if (ent.family === 'cephalopod') {
                        ent.timer -= dt;
                        if (ent.timer <= 0) {
                            if (ent.state === 'jet') {
                                ent.state = 'rest';
                                ent.timer = Math.random() * 2 + 1;
                            } else {
                                ent.state = 'jet';
                                ent.vx = (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.0); 
                                ent.vy = (Math.random() - 0.5) * 0.6;
                                ent.timer = 0.4 + Math.random() * 0.4; 
                            }
                        }
                        if (ent.state === 'rest') {
                            ent.vx *= 1 - (2 * dt); 
                            ent.vy *= 1 - (2 * dt);
                        }
                        ent.x += ent.vx * 60 * dt;
                        ent.y += ent.vy * 60 * dt;
                        bobY = Math.sin(ent.bobPhase) * 3;
                        ent.bobPhase += dt * 4;
                    }
                    // AI: SHARKS
                    else if (ent.family === 'shark') {
                        if (Math.random() < 0.005) ent.vx = -ent.vx; 
                        ent.y += (ent.baseY - ent.y) * 0.5 * dt; 
                        const speedX = Math.sign(ent.vx) * (0.8 + Math.abs(ent.vx)*0.2); 
                        ent.x += speedX * 60 * dt;
                    }
                    // AI: RAYS
                    else if (ent.family === 'ray') {
                        // FIX: Skim just above the rocks
                        const targetY = floorY - (h * 0.3);
                        ent.y += (targetY - ent.y) * 0.8 * dt; 
                        if (Math.random() < 0.01) ent.vx = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.3);
                        ent.x += ent.vx * 60 * dt;
                        bobY = Math.sin(ent.bobPhase) * 6; 
                        ent.bobPhase += dt * 1.5;
                    }
                    // AI: EELS
                    else if (ent.family === 'eel') {
                        if (Math.random() < 0.01) ent.vx = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.4);
                        if (Math.random() < 0.02) ent.vy = (Math.random() - 0.5) * 0.5;
                        ent.x += ent.vx * 60 * dt;
                        ent.y += ent.vy * 60 * dt;
                        bobY = Math.sin(ent.bobPhase) * 12; 
                        ent.bobPhase += dt * 5;
                    }
                    // AI: DEFAULT WANDERER 
                    else {
                        if (Math.random() < 0.01) ent.vx = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.5);
                        if (Math.random() < 0.02) ent.vy = (Math.random() - 0.5) * 0.4;
                        ent.x += ent.vx * 60 * dt;
                        ent.y += ent.vy * 60 * dt;
                        bobY = Math.sin(ent.bobPhase) * 4;
                        ent.bobPhase += dt * 2;
                    }

                    // --- PHYSICS CONSTRAINTS & FACING ---
                    if (Math.abs(ent.vx) > 0.05) ent.facing = Math.sign(ent.vx);

                    if (ent.x < 50) { ent.x = 50; ent.vx = Math.abs(ent.vx) || 0.5; }
                    if (ent.x > canvas.width - 50) { ent.x = canvas.width - 50; ent.vx = -Math.abs(ent.vx) || -0.5; }
                    
                    if (ent.y < 50) { ent.y = 50; ent.vy = Math.abs(ent.vy); }
                    
                    // FIX: Relaxed the bottom boundary to allow fish to visually overlap the floor
                    if (ent.y > floorY - (h * 0.2)) { ent.y = floorY - (h * 0.2); ent.vy = -Math.abs(ent.vy); }

                    // --- RENDER ---
                    if (ent.img.complete) {
                        ctx.save();
                        ctx.translate(ent.x, ent.y + bobY);
                        if (ent.facing < 0) ctx.scale(-1, 1);
                        ctx.drawImage(ent.img, -w/2, -h/2, w, h);
                        ctx.restore();
                    }
                });

                this.aquariumAnimFrame = requestAnimationFrame(loop);
            };

            this.aquariumAnimFrame = requestAnimationFrame(loop);
        }, 50); 
    },

    stopAquariumLoop() {
        if (this.aquariumAnimFrame) {
            cancelAnimationFrame(this.aquariumAnimFrame);
            this.aquariumAnimFrame = null;
        }
    },

    // ==========================================
    // MYCONID COLONY (ENDGAME POI)
    // ==========================================

    renderElders(container) {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid #4ADE80; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <h2 style="margin:0; color:#4ADE80; font-size: 1.8rem;">Colony Elders</h2>
            </div>
            <p style="color:var(--text-main); font-size: 1.2rem; line-height:1.5;">The Myconid elders commune with the vast root network of the Darklake. They do not trade in gold, but in organic mass. Feed the compost pit, and they will share the ancient secrets of the deep loam with you.</p>
        `;
    },

    renderCompost(container) {
        const player = this.gameState.player;
        const progress = player.endgameProgress.fungal;
        
        const MILESTONES = [
            { kg: 500,  reward: "1,000g & Rare Spores" },
            { kg: 1500, reward: "3,000g & Spores of the Deep (+50 Light/Weight)" },
            { kg: 3000, reward: "6,000g & Elixir of the Spore Lord (+4 Crafting)" },
            { kg: 5000, reward: "12,000g & The Mycelial Hook (Mythic Lure)" }
        ];

        let targetIdx = progress.currentGoalIdx;
        let isMaxed = targetIdx >= MILESTONES.length;
        let targetKg = isMaxed ? 5000 : MILESTONES[targetIdx].kg;
        let rewardDesc = isMaxed ? "All Milestones Complete! The Vesper-Bloom awaits." : MILESTONES[targetIdx].reward;

        let pct = Math.min(100, (progress.totalCompostKg / targetKg) * 100);

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid #4ADE80; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <h2 style="margin:0; color:#4ADE80; font-size: 1.8rem;">The Loam Compost</h2>
                <div style="font-size: 1.2rem; color:var(--text-muted);">Next Milestone: <b style="color:var(--cyan-glow);">${targetKg} kg</b></div>
            </div>

            <div style="background: var(--bg-void); border: 1px solid var(--panel-border); padding: 1.5rem; border-radius: 6px; margin-bottom: 1.5rem;">
                <div style="display:flex; justify-content:space-between; font-size: 1.2rem; margin-bottom: 0.5rem;">
                    <span style="color:var(--text-main);">Total Donated Biomass:</span>
                    <span style="color:#4ADE80; font-weight:bold;">${Math.round(progress.totalCompostKg)} kg</span>
                </div>
                <div style="width:100%; height:12px; background:#000; border:1px solid var(--panel-border); border-radius:6px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:#4ADE80; transition: width 0.4s;"></div>
                </div>
                <div style="margin-top: 1rem; color:var(--text-muted); font-size: 1.1rem; text-align: center;">
                    Upcoming Reward: <span style="color:var(--gold-warn); font-weight:bold;">${rewardDesc}</span>
                </div>
            </div>
            
            <h3 style="margin:0 0 0.5rem 0; color:#4ADE80; font-size: 1.4rem;">Select Fish to Donate</h3>
            <div id="hub-compost-list" style="display:flex; flex-direction:column; gap:0.5rem; overflow-y:auto; max-height: 250px; padding-right:0.5rem;"></div>
        `;

        const list = document.getElementById('hub-compost-list');
        const fishItems = player.inventory.filter(i => i.invType === 'fish');

        if (fishItems.length === 0) {
            list.innerHTML = `<p style="color:var(--text-muted); font-size:1.1rem; text-align:center;">You have no fish in your cargo to donate.</p>`;
        } else {
            fishItems.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'shop-item-row';
                const realIndex = player.inventory.indexOf(item);
                
                row.innerHTML = `
                    <div style="display:flex; gap: 1rem; align-items:center;">
                        <img src="${item.art.imageDataUrl}" style="width:40px; height:40px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated;" />
                        <div class="shop-item-info">
                            <b style="color: ${getItemColor(item)};">${item.identity.name}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${item.physical.sizeTier}]</span>
                            <p>${item.actualWeight} kg</p>
                        </div>
                    </div>
                    <button class="menu-btn btn-donate" style="width: auto; padding: 0.4rem 1rem; margin:0; font-size:1.2rem; border-color:#4ADE80; color:#4ADE80;">Donate</button>
                `;

                TooltipUI.bind(row, item, player);

                row.querySelector('.btn-donate').onclick = () => {
                    SFX.playSplash();
                    TooltipUI.hide();
                    
                    // Add weight
                    progress.totalCompostKg += item.actualWeight;
                    player.inventory.splice(realIndex, 1);
                    
                    // Check Milestones
                    if (!isMaxed && progress.totalCompostKg >= targetKg) {
                        SFX.playLevelUp();
                        this._grantCompostReward(progress.currentGoalIdx, player);
                        progress.currentGoalIdx++;
                        HUD.logAction(`Colony Milestone Reached!`, "safe");
                        
                        // --- NEW: Force the Elders to speak the new milestone dialogue instantly! ---
                        this.triggerTabDialogue();
                    }
                    
                    if (this.callbacks.onSave) this.callbacks.onSave();
                    this.renderActiveTab();
                };
                list.appendChild(row);
            });
        }
    },

    _grantCompostReward(tier, player) {
        const rng = createRng(Date.now());
        if (tier === 0) {
            player.vitals.gold += 1000;
            for(let i=0; i<3; i++) player.reagents.push({ id: `part_${rng.int(10000,99999)}`, invType: 'part', name: 'Phosphor Cap', visualId: 'phosphor_cap', rarity: 'Rare', stats: { color: 0, sound: 0, light: 40, weight: 0 }, imageDataUrl: generateLurePart({ visualId: 'phosphor_cap', rng: createRng(Date.now()+i) }) });
            for(let i=0; i<3; i++) player.reagents.push({ id: `part_${rng.int(10000,99999)}`, invType: 'part', name: 'Myconid Spore', visualId: 'myconid_spore', rarity: 'Rare', stats: { color: 30, sound: 0, light: 10, weight: 0 }, imageDataUrl: generateLurePart({ visualId: 'myconid_spore', rng: createRng(Date.now()+i+3) }) });
        } else if (tier === 1) {
            player.vitals.gold += 3000;
            for(let i=0; i<2; i++) player.reagents.push({ id: `part_${rng.int(10000,99999)}`, invType: 'part', name: 'Spores of the Deep', visualId: 'myconid_spore', rarity: 'Legendary', stats: { color: 0, sound: 0, light: 50, weight: 50 }, imageDataUrl: generateLurePart({ visualId: 'myconid_spore', rng: createRng(Date.now()+i) }) });
        } else if (tier === 2) {
            player.vitals.gold += 6000;
            for(let i=0; i<2; i++) {
                // --- FIX: Generate a proper Potion Sprite ---
                const pSeed = Date.now() + i;
                // 'insight' effectType forces the generator to use the green gemstone palette
                const pArt = generatePotion({ rng: createRng(pSeed), seed: pSeed, effectType: 'insight' }); 
                
                player.inventory.push({
                    id: `potion_${rng.int(10000,99999)}`, invType: 'potion', name: 'Elixir of the Spore Lord',
                    buff: { stat: 'crafting', statName: 'Crafting', amount: 4, durationMins: 1440, maxDurationMins: 1440 },
                    imageDataUrl: pArt.imageDataUrl 
                });
            }
        } else if (tier === 3) {
            player.vitals.gold += 12000;
            // The Mycelial Hook (Mythic Lure)
            player.inventory.push({
                id: `lure_mycelial_hook`, 
                invType: 'lure', 
                name: 'The Mycelial Hook',
                stats: { color: -60, sound: -80, light: 90, weight: -40 },
                durability: -1, 
                maxDurability: -1, 
                componentsUsed: 5, 
                basePrice: 0,
                // --- FIX: Add Seed and Components for structural consistency ---
                seed: rng.int(10000, 99999),
                components: ['lead_sinker', 'phosphor_cap', 'jelly_bell'], 
                imageDataUrl: generateMythicLure({ lureId: 'mycelial_hook', rng }).imageDataUrl 
            });
        }
    },

    // ==========================================
    // CRYSTAL MUSEUM (ENDGAME POI)
    // ==========================================

    renderCurator(container) {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid #38BDF8; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <h2 style="margin:0; color:#38BDF8; font-size: 1.8rem;">Curator Zephyr</h2>
            </div>
            <p style="color:var(--text-main); font-size: 1.2rem; line-height:1.5;">Zephyr oversees the Eternal Archive, a network of suspended geode tanks preserving the delicate ecosystems of the Darklake. He requires highly specific, living specimens to complete his research. Fulfill his exhibition requests, and he will grant you access to his private alchemical reserves and ancient tackle.</p>
            <p style="color:var(--text-muted); font-size: 1.1rem; line-height:1.5;"><i>"A common minnow is worth little to history. But a massive, legendary deep-sea horror? That is a specimen that commands respect... and high Curator Ratings."</i></p>
        `;
    },

    renderExhibition(container) {
        const player = this.gameState.player;
        const progress = player.endgameProgress.crystal;
        const slots = this.gameState.world.museumSlots; 
        
        const MILESTONES = [
            { pts: 1000,  reward: "Curator's Purse (2,500g & 5x Glow Bulbs)" },
            { pts: 3000,  reward: "Luminescent Oil Cache (+40 Light Potion)" },
            { pts: 6000,  reward: "Exotic Tackle Box (6,000g & Silk/Bells)" },
            { pts: 10000, reward: "The Prismatic Geode Hook (Mythic Lure)" }
        ];

        const filledCount = Object.keys(progress.filledSlots).length;
        const isMuseumComplete = filledCount === 40;
        const isRatingMaxed = progress.curatorRating >= 10000;

        let targetIdx = progress.currentGoalIdx;
        let isMaxed = targetIdx >= MILESTONES.length;
        let targetPts = isMaxed ? 10000 : MILESTONES[targetIdx].pts;
        
        // --- FIX: Dynamic state descriptions separating Points from Slots ---
        let rewardDesc = isMaxed ? "Rating Maxed! Geode Hook Unlocked." : MILESTONES[targetIdx].reward;

        if (isMuseumComplete) {
            rewardDesc = "✨ Flawless Museum Completion Achieved! ✨";
        } else if (isRatingMaxed) {
            rewardDesc = `Rating Maxed! Hook Unlocked. (Tanks Remaining: ${40 - filledCount})`;
        }

        let pct = Math.min(100, (progress.curatorRating / targetPts) * 100);

        // --- 1. COMPACT DASHBOARD HEADER ---
        let html = `
            <div style="display:flex; flex-direction:column; height:100%; min-height:0;">
                
                <div style="flex-shrink: 0; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #38BDF8; padding-bottom: 0.3rem;">
                        <h2 style="margin: 0; color: #38BDF8; font-size: 1.6rem; line-height: 1;">The Eternal Archive</h2>
                        <div style="font-size: 1.1rem; color: var(--text-muted);">Rating: <b style="color:var(--cyan-glow);">${progress.curatorRating}</b> / ${targetPts}</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.5); border: 1px solid var(--panel-border); padding: 0.5rem 1rem; border-radius: 4px;">
                        <div style="flex: 1; margin-right: 1rem;">
                            <div style="width:100%; height:8px; background:#000; border-radius:4px; overflow:hidden;">
                                <div style="height:100%; width:${pct}%; background:#38BDF8; transition: width 0.4s;"></div>
                            </div>
                        </div>
                        <div style="font-size: 0.95rem; color: var(--text-muted); white-space: nowrap;">
                            Next Milestone: <span style="color:var(--gold-warn); font-weight:bold;">${rewardDesc}</span>
                        </div>
                    </div>
                </div>
        `;

        // --- 2. GRID VIEW ---
        if (this.selectedMuseumSlot === undefined || this.selectedMuseumSlot === null) {
            const filledCount = Object.keys(progress.filledSlots).length;
            html += `<h3 style="flex-shrink: 0; margin:0 0 0.5rem 0; color:#38BDF8; font-size: 1.3rem;">Exhibition Tanks (${filledCount} / 40)</h3>`;
            
            html += `<div style="flex: 1; min-height: 0; overflow-y: auto; padding-right: 0.5rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.6rem; align-content: flex-start;" id="museum-grid"></div>`;
            
            html += `</div>`; 
            container.innerHTML = html;

            const grid = document.getElementById('museum-grid');
            
            // Dynamic Keyframes for the Highlight Pulse
            if (!document.getElementById('anim-pulse')) {
                const style = document.createElement('style');
                style.id = 'anim-pulse';
                style.innerHTML = `@keyframes tankPulse { 0% { box-shadow: 0 0 5px rgba(34, 211, 238, 0.3); border-color: rgba(34,211,238,0.5); } 50% { box-shadow: 0 0 15px rgba(34, 211, 238, 0.8); border-color: rgba(34,211,238,1); } 100% { box-shadow: 0 0 5px rgba(34, 211, 238, 0.3); border-color: rgba(34,211,238,0.5); } }`;
                document.head.appendChild(style);
            }

            slots.forEach(slot => {
                const donatedFish = progress.filledSlots[slot.id];
                const isFilled = !!donatedFish;
                let canFill = false;

                // Smart Highlighting Check
                if (!isFilled) {
                    canFill = player.inventory.some(item => {
                        if (item.invType !== 'fish') return false;
                        const r = slot.reqs;
                        if (r.family && item.identity.family !== r.family) return false;
                        if (r.sizeTier && item.physical.sizeTier !== r.sizeTier) return false;
                        if (r.rarity && item.identity.rarity !== r.rarity) return false;
                        return true;
                    });
                }

                const el = document.createElement('div');
                
                if (isFilled) {
                    el.style.cssText = "border: 2px solid #38BDF8; border-radius: 6px; display: flex; align-items: center; justify-content: center; height: 75px; background: rgba(2, 132, 199, 0.2); cursor: pointer; box-shadow: inset 0 0 15px rgba(56, 189, 248, 0.4); position: relative; overflow: hidden;";
                    el.innerHTML = `
                        <img src="${donatedFish.art.imageDataUrl}" style="width: 80%; height: 80%; object-fit: contain; image-rendering: pixelated; position: relative; z-index: 2;" />
                        <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(56,189,248,0.3) 100%); z-index: 3; pointer-events: none;"></div>
                    `;
                } else {
                    const rColor = getRarityColor(slot.reqs.rarity || 'Common');
                    const rarText = slot.reqs.rarity ? `<span style="color:${rColor}; font-size: 0.75rem; text-shadow: 1px 1px 1px #000;">${slot.reqs.rarity}</span>` : `<span style="color:var(--text-muted); font-size: 0.75rem;">Any Rarity</span>`;
                    const famText = slot.reqs.family ? `<b style="color:var(--text-main); font-size: 0.9rem; display:block; margin: 2px 0; text-shadow: 1px 1px 1px #000;">${slot.reqs.family.toUpperCase()}</b>` : `<b style="color:var(--text-main); font-size: 0.9rem; display:block; margin: 2px 0; text-shadow: 1px 1px 1px #000;">ANY FISH</b>`;
                    const sizeText = slot.reqs.sizeTier ? `<span style="color:var(--muted); font-size: 0.75rem; text-shadow: 1px 1px 1px #000;">${slot.reqs.sizeTier}</span>` : `<span style="color:var(--muted); font-size: 0.75rem;">Any Size</span>`;

                    // --- FIX: Strong Visual Indication for Can-Fill Slots ---
                    if (canFill) {
                        el.style.cssText = "border: 2px solid #22D3EE; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 75px; background: rgba(34, 211, 238, 0.2); cursor: pointer; padding: 0.3rem; animation: tankPulse 1.5s infinite; position: relative;";
                        el.innerHTML = `
                            ${rarText}${famText}${sizeText}
                            <div style="position:absolute; top:-6px; right:-6px; background:#22D3EE; color:#000; font-weight:bold; border-radius:50%; width:20px; height:20px; font-size:0.85rem; display:flex; align-items:center; justify-content:center; box-shadow:0 0 8px #22D3EE; z-index: 10;">!</div>
                        `;
                    } else {
                        el.style.cssText = "border: 1px dashed var(--muted); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 75px; background: rgba(0, 0, 0, 0.3); cursor: pointer; padding: 0.3rem; transition: background 0.15s;";
                        el.innerHTML = `${rarText}${famText}${sizeText}`;
                    }

                    el.onmouseenter = () => { el.style.background = canFill ? 'rgba(34, 211, 238, 0.3)' : 'rgba(56, 189, 248, 0.2)'; };
                    el.onmouseleave = () => { el.style.background = canFill ? 'rgba(34, 211, 238, 0.2)' : 'rgba(0, 0, 0, 0.3)'; };
                }

                el.onclick = () => {
                    SFX.playUISelect();
                    this.selectedMuseumSlot = slot.id;
                    this.renderExhibition(container);
                };
                grid.appendChild(el);
            });
        } 
        // --- 3. DETAILED DONATION VIEW ---
        else {
            const slot = slots[this.selectedMuseumSlot];
            const donatedFish = progress.filledSlots[slot.id];
            const isFilled = !!donatedFish;

            html += `
                <div style="flex-shrink: 0; display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
                    <h3 style="margin:0; color:#38BDF8; font-size: 1.4rem;">Tank Requirements: ${slot.title}</h3>
                    <button class="menu-btn" id="btn-museum-back" style="width:auto; padding: 0.3rem 0.8rem; margin:0; font-size:1rem;">Back to Grid</button>
                </div>
            `;

            if (isFilled) {
                // --- FIX: Left Panel (The Containment Tank with absolute safety margins) ---
                const leftTank = `
                    <div style="flex: 1.3; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--bg-void); border: 2px solid #38BDF8; border-radius: 6px; position: relative; overflow: hidden; box-shadow: inset 0 0 40px rgba(56, 189, 248, 0.15); padding: 1rem; box-sizing: border-box;">
                        <img src="${donatedFish.art.imageDataUrl}" style="max-height: 140px; max-width: 100%; object-fit: contain; flex-shrink: 0; image-rendering: pixelated; position: relative; z-index: 2; padding: 10px; box-sizing: border-box;" />
                        <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(56,189,248,0.2) 100%); z-index: 3; pointer-events: none;"></div>
                        
                        <div style="color:var(--cyan-glow); font-size:1.6rem; font-weight:bold; margin-top: 0.5rem; position: relative; z-index: 2; text-align: center; text-shadow: 1px 1px 2px #000; text-transform: capitalize;">${donatedFish.identity.name}</div>
                        <div style="color:var(--text-muted); font-size:1rem; text-transform: uppercase; margin-top: 0.2rem; position: relative; z-index: 2; text-align: center; text-shadow: 1px 1px 1px #000;">[${donatedFish.physical.sizeTier} ${donatedFish.identity.rarity}]</div>
                    </div>
                `;

                // --- NEW: Right Panel (The Detailed Archival Plaque) ---
                const rarityColors = { 'Common': '#94A3B8', 'Uncommon': '#22C55E', 'Rare': '#3B82F6', 'Legendary': '#F59E0B', 'Boss': '#EF4444' };
                const rColor = rarityColors[donatedFish.identity.rarity] || 'var(--text-main)';

                const rightPlaque = `
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--panel-border); border-radius: 6px; padding: 1rem; box-sizing: border-box; overflow-y: auto;">
                        <h4 style="margin: 0; color: #38BDF8; font-size: 1.1rem; border-bottom: 1px solid var(--panel-border); padding-bottom: 0.4rem; letter-spacing: 0.05em; text-align: center;">ARCHIVAL SPECIMEN REPORT</h4>
                        
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem;">
                            <span style="color:var(--text-muted);">Species Family:</span> 
                            <span style="font-weight:bold; text-transform:capitalize; color: var(--text-main);">${donatedFish.identity.family}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem;">
                            <span style="color:var(--text-muted);">Specimen Rarity:</span> 
                            <span style="font-weight:bold; color:${rColor}">${donatedFish.identity.rarity}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem;">
                            <span style="color:var(--text-muted);">Exhibition Weight:</span> 
                            <span style="font-weight:bold; color:var(--gold-warn);">${donatedFish.actualWeight} kg</span>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem; border-top: 1px dashed var(--panel-border); padding-top: 0.4rem; margin-top: 0.2rem;">
                            <span style="color:var(--text-muted);">Stamina Metric:</span> 
                            <span style="font-weight:bold; color: var(--text-main);">${donatedFish.combat.stamina} HP</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem;">
                            <span style="color:var(--text-muted);">Speed Coefficient:</span> 
                            <span style="font-weight:bold; color: var(--text-main);">${donatedFish.combat.speed}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem;">
                            <span style="color:var(--text-muted);">Optimal Drag Spot:</span> 
                            <span style="font-weight:bold; color:var(--cyan-glow);">${donatedFish.combat.optimalReel}% Power</span>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem; border-top: 1px dashed var(--panel-border); padding-top: 0.4rem; margin-top: 0.2rem;">
                            <span style="color:var(--text-muted);">Native Strata:</span> 
                            <span style="font-weight:bold; color: var(--text-main);">${donatedFish.environment.depthPref}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size: 0.95rem;">
                            <span style="color:var(--text-muted);">Active Period:</span> 
                            <span style="font-weight:bold; color: var(--text-main);">${donatedFish.environment.activeHours}</span>
                        </div>
                        
                        <div style="margin-top: auto; color: var(--green-safe); font-weight: bold; text-align: center; font-size: 0.9rem; letter-spacing: 0.05em; border-top: 1px solid var(--panel-border); padding-top: 0.5rem; text-shadow: 0 0 5px rgba(34, 197, 94, 0.2);">
                            ✓ CHRONO-PRESERVED
                        </div>
                    </div>
                `;

                html += `
                    <div style="flex: 1; min-height: 0; display: flex; gap: 1.5rem; align-items: stretch; width: 100%;">
                        ${leftTank}
                        ${rightPlaque}
                    </div>
                `;
                
                html += `</div>`; // Close Flex Wrapper
                container.innerHTML = html;
                document.getElementById('btn-museum-back').onclick = () => { SFX.playUISelect(); this.selectedMuseumSlot = null; this.renderExhibition(container); };
            } else {
                html += `<div id="museum-fish-list" style="flex: 1; min-height: 0; display:flex; flex-direction:column; gap:0.5rem; overflow-y:auto; padding-right:0.5rem;"></div>`;
                html += `</div>`; 
                container.innerHTML = html;
                
                document.getElementById('btn-museum-back').onclick = () => { SFX.playUISelect(); this.selectedMuseumSlot = null; this.renderExhibition(container); };

                const list = document.getElementById('museum-fish-list');
                
                const matches = player.inventory.filter(item => {
                    if (item.invType !== 'fish') return false;
                    const r = slot.reqs;
                    if (r.family && item.identity.family !== r.family) return false;
                    if (r.sizeTier && item.physical.sizeTier !== r.sizeTier) return false;
                    if (r.rarity && item.identity.rarity !== r.rarity) return false;
                    return true;
                });

                if (matches.length === 0) {
                    list.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center;"><p style="color:var(--text-muted); font-size:1.2rem; text-align:center;">You have no fish in your cargo that meet these requirements.</p></div>`;
                } else {
                    matches.forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'shop-item-row';
                        const realIndex = player.inventory.indexOf(item);
                        
                        const rarityScores = {'Common': 50, 'Uncommon': 120, 'Rare': 300, 'Legendary': 800, 'Boss': 2000};
                        const sizeMults = {'Tiny': 0.8, 'Small': 1.0, 'Medium': 1.3, 'Large': 1.8, 'Massive': 2.5};
                        const score = Math.round((rarityScores[item.identity.rarity] || 50) * (sizeMults[item.physical.sizeTier] || 1.0));

                        row.innerHTML = `
                            <div style="display:flex; gap: 1rem; align-items:center;">
                                <img src="${item.art.imageDataUrl}" style="width:48px; height:48px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated; object-fit:contain;" />
                                <div class="shop-item-info">
                                    <b style="color: ${getItemColor(item)}; font-size:1.1rem;">${item.identity.name}</b> <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${item.physical.sizeTier}]</span>
                                    <p style="color:var(--cyan-glow); font-weight:bold; margin-top:0.3rem;">Yields +${score} Curator Rating</p>
                                </div>
                            </div>
                            <button class="menu-btn btn-donate" style="width: auto; padding: 0.5rem 1.5rem; margin:0; font-size:1.2rem; border-color:#38BDF8; color:#38BDF8;">Donate</button>
                        `;

                        TooltipUI.bind(row, item, player);

                        row.querySelector('.btn-donate').onclick = () => {
                            SFX.playSplash();
                            TooltipUI.hide();
                            
                            progress.curatorRating += score;
                            progress.filledSlots[slot.id] = item; 
                            player.inventory.splice(realIndex, 1);
                            
                            if (!isMaxed && progress.curatorRating >= targetPts) {
                                SFX.playLevelUp();
                                this._grantMuseumReward(progress.currentGoalIdx, player);
                                progress.currentGoalIdx++;
                                HUD.logAction(`Museum Milestone Reached!`, "safe");
                                this.triggerTabDialogue(); 
                            }
                            
                            this.selectedMuseumSlot = null; 
                            if (this.callbacks.onSave) this.callbacks.onSave();
                            this.renderActiveTab();
                        };
                        list.appendChild(row);
                    });
                }
            }
        }
    },

    _grantMuseumReward(tier, player) {
        const rng = createRng(Date.now());
        if (tier === 0) {
            player.vitals.gold += 2500;
            for(let i=0; i<5; i++) player.reagents.push({ id: `part_${rng.int(10000,99999)}`, invType: 'part', name: 'Glow Bulb', visualId: 'glow_bulb', rarity: 'Uncommon', stats: { color: 0, sound: 0, light: 30, weight: 0 }, imageDataUrl: generateLurePart({ visualId: 'glow_bulb', rng: createRng(Date.now()+i) }) });
        } else if (tier === 1) {
            // Luminescent Oil (Custom Potion)
            for(let i=0; i<5; i++) {
                player.inventory.push({
                    id: `potion_${rng.int(10000,99999)}`, invType: 'potion', name: 'Luminescent Oil',
                    buff: { stat: 'fishing', statName: 'Fishing', amount: 3, durationMins: 1440, maxDurationMins: 1440 },
                    imageDataUrl: generateLurePart({ visualId: 'glow_bulb', rng: createRng(Date.now()+i) }) 
                });
            }
        } else if (tier === 2) {
            player.vitals.gold += 6000;
            for(let i=0; i<3; i++) player.reagents.push({ id: `part_${rng.int(10000,99999)}`, invType: 'part', name: 'Wraith Silk', visualId: 'wraith_silk', rarity: 'Rare', stats: { color: 0, sound: 0, light: 10, weight: -30 }, imageDataUrl: generateLurePart({ visualId: 'wraith_silk', rng: createRng(Date.now()+i) }) });
            for(let i=0; i<3; i++) player.reagents.push({ id: `part_${rng.int(10000,99999)}`, invType: 'part', name: 'Jelly Bell', visualId: 'jelly_bell', rarity: 'Rare', stats: { color: 20, sound: 0, light: 20, weight: -20 }, imageDataUrl: generateLurePart({ visualId: 'jelly_bell', rng: createRng(Date.now()+i+3) }) });
        } else if (tier === 3) {
            // The Prismatic Geode Hook (Mythic Lure)
            player.inventory.push({
                id: `lure_prismatic_geode_hook`, 
                invType: 'lure', 
                name: 'The Prismatic Geode Hook',
                stats: { color: 80, sound: -50, light: 95, weight: 70 },
                durability: -1, 
                maxDurability: -1, 
                componentsUsed: 5, 
                basePrice: 0,
                // --- FIX: Add Seed and Components for structural consistency ---
                seed: rng.int(10000, 99999),
                components: ['lead_sinker', 'glow_bulb', 'spinner'], 
                imageDataUrl: generateMythicLure({ lureId: 'prismatic_geode_hook', rng }).imageDataUrl 
            });
        }
    },
// ==========================================
    // THE VOLCANIC ARENA (ENDGAME POI)
    // ==========================================

    renderMaster(container) {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 2px solid #EF4444; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                <h2 style="margin:0; color:#EF4444; font-size: 1.8rem;">Gladiator-Master Ignis</h2>
            </div>
            <p style="color:var(--text-main); font-size: 1.2rem; line-height:1.5;">The Volcanic Arena pits the most aggressive and highly adapted denizens of the deep lakes against one another. Form a 3-fish squad from your Cargo Hold to compete in automated, tactical battles.</p>
            <p style="color:var(--text-muted); font-size: 1.1rem; line-height:1.5;"><i>"Size is not everything. A tiny, evasive venom-spitter can humble a massive dreadnought. Understand the elements: <b>Predators</b> eat the <b>Slippery</b>, the <b>Slippery</b> evade the <b>Armored</b>, the <b>Armored</b> crush the <b>Amorphous</b>, and the <b>Amorphous</b> smother <b>Predators</b>."</i></p>
        `;
    },

    renderArenaDrafting() {
        const player = this.gameState.player;
        const progress = player.endgameProgress.lava;
        const currentTier = progress.currentTier;
        
        let opponentData;
        let isEndless = false;
        
        if (currentTier <= 10) {
            opponentData = ArenaCampaign.getTier(currentTier);
            document.getElementById('arena-tier-title').innerText = `Tournament: Tier ${currentTier}/10`;
        } else {
            isEndless = true;
            document.getElementById('arena-tier-title').innerText = `Challenger's Deep (Wins: ${progress.endlessScore})`;
            
            // Calculate average rating of top 3 fish in cargo to scale the enemy
            let topFish = [...player.inventory].filter(f => f.invType === 'fish').sort((a,b) => b.economy.baseValue - a.economy.baseValue);
            let avgValue = 100;
            if (topFish.length >= 3) {
                avgValue = (topFish[0].economy.baseValue + topFish[1].economy.baseValue + topFish[2].economy.baseValue) / 3;
            }
            opponentData = ArenaCampaign.generateEndlessTeam(avgValue, Date.now()); 
        }

        // Generate Opponent Portrait on the fly
        const oppSeed = currentTier <= 10 ? 8888 + currentTier : Date.now();
        const oppNpc = generateNPCData({ seed: oppSeed, race: opponentData.race, gender: opponentData.gender });

        // --- FIX: Safely retrieve and assign an ID to the container so it survives re-renders ---
        let oppContainer = document.getElementById('arena-opp-container');
        if (!oppContainer) {
            const nameEl = document.getElementById('arena-opp-name');
            if (nameEl) {
                oppContainer = nameEl.parentElement.parentElement;
                oppContainer.id = 'arena-opp-container';
            }
        }
        
        if (oppContainer) {
            oppContainer.style.display = 'flex';
            oppContainer.style.gap = '1rem';
            oppContainer.style.alignItems = 'center';
            
            const rewardText = `${opponentData.rewardGold}g` + (currentTier === 10 ? ` + The Brimstone Hook` : '');
            
            oppContainer.innerHTML = `
                <img src="${oppNpc.imageDataUrl}" style="width: 80px; height: 80px; background: #000; border: 2px solid #EF4444; border-radius: 4px; image-rendering: pixelated; flex-shrink: 0;" />
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 0.3rem 0; color: #EF4444; font-size: 1.4rem;">Opponent: <span style="color: var(--text-main);">${opponentData.name} - ${opponentData.title}</span></h3>
                    <p style="margin: 0 0 0.5rem 0; color: var(--text-muted); font-style: italic; font-size: 1.1rem; line-height: 1.4;">"${opponentData.dialogue}"</p>
                    <div style="font-weight: bold; color: var(--gold-warn); font-size: 1.3rem;">Reward: <span>${rewardText}</span></div>
                </div>
            `;
        }

        // Validate roster references to ensure fish weren't sold
        progress.roster = progress.roster.map(id => {
            if (!id) return null;
            const stillExists = player.inventory.some(i => i.instanceId === id);
            return stillExists ? id : null;
        });

        const playerTeam = progress.roster.map(id => player.inventory.find(i => i.instanceId === id) || null);
        const slotsFilled = playerTeam.filter(f => f !== null).length;

        // 1. Render Left Roster Slots
        const rosterContainer = document.getElementById('arena-roster-slots');
        rosterContainer.innerHTML = '';
        const labels = ['Front (Tank)', 'Middle (Vanguard)', 'Back (Support)'];

        playerTeam.forEach((f, i) => {
            if (f) {
                rosterContainer.innerHTML += `
                    <div class="arena-draft-slot filled" id="roster-slot-${i}" style="flex:1; display:flex; align-items:center; gap:1rem; background:rgba(239,68,68,0.1); border:2px solid #EF4444; border-radius:6px; padding:0.8rem;">
                        <img src="${f.art.imageDataUrl}" style="width:64px; height:64px; background:#000; border:1px solid #EF4444; border-radius:4px; image-rendering:pixelated; object-fit:contain;" />
                        <div style="flex:1; overflow: hidden;">
                            <b style="color: ${getItemColor(f)}; font-size:1.3rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${f.identity.name}</b>
                            <div style="color:var(--text-muted); font-size:0.9rem; text-transform:uppercase; margin-bottom:0.4rem;">${labels[i]} - ${f.physical.sizeTier} ${f.identity.family}</div>
                            <div class="arena-draft-stats" style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                                <span class="arena-badge">HP: ${Math.round(4 * f.combat.stamina * [0.6, 1.0, 1.5, 2.5, 4.0][['Tiny','Small','Medium','Large','Massive'].indexOf(f.physical.sizeTier)])}</span>
                                <span class="arena-badge">ATK: ${Math.round(25 * [0.6, 1.0, 1.5, 2.5, 4.0][['Tiny','Small','Medium','Large','Massive'].indexOf(f.physical.sizeTier)] * (1.0 + f.combat.aggression))}</span>
                                <span class="arena-badge">Class: ${['shark','deepsea'].includes(f.identity.family) ? 'Predator' : ['eel','cephalopod'].includes(f.identity.family) ? 'Slippery' : ['crustacean','ray'].includes(f.identity.family) ? 'Armored' : 'Amorphous'}</span>
                            </div>
                        </div>
                        <button class="menu-btn btn-unassign" data-idx="${i}" style="width:auto; padding:0.5rem 1rem; margin:0; font-size:1.1rem; border-color:var(--red-danger); color:var(--red-danger);">Remove</button>
                    </div>
                `;
            } else {
                rosterContainer.innerHTML += `
                    <div class="arena-draft-slot empty" style="flex:1; border:2px dashed var(--text-muted); background:rgba(0,0,0,0.3); border-radius:6px; padding:1.5rem; display:flex; flex-direction:column; justify-content:center; align-items:center; cursor:pointer;">
                        <div style="font-size:1.2rem; font-weight:bold; color:var(--text-main);">${labels[i]}</div>
                        <div style="color:var(--text-muted); margin-top:0.2rem;">Empty Slot</div>
                    </div>
                `;
            }
        });

        // Attach Unassign Listeners
        rosterContainer.querySelectorAll('.btn-unassign').forEach(btn => {
            btn.onclick = (e) => {
                SFX.playUISelect();
                TooltipUI.hide();
                const idx = parseInt(e.target.getAttribute('data-idx'));
                progress.roster[idx] = null;
                if (this.callbacks.onSave) this.callbacks.onSave();
                this.renderArenaDrafting();
            };
        });

        // 2. Render Right Cargo List
        const list = document.getElementById('arena-draft-cargo');
        list.innerHTML = '';
        const availableFish = player.inventory.filter(i => i.invType === 'fish');
        
        if (availableFish.length === 0) {
            list.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:2rem; font-size:1.2rem;">You have no fish in your cargo. Catch some first!</div>`;
        }

        availableFish.forEach(fish => {
            const isAssigned = progress.roster.includes(fish.instanceId);
            const row = document.createElement('div');
            row.className = 'shop-item-row';
            row.style.opacity = isAssigned ? '0.4' : '1.0';
            row.style.background = 'var(--bg-void)';
            row.style.padding = '0.8rem';
            row.style.border = `1px solid ${isAssigned ? '#EF4444' : 'var(--panel-border)'}`;
            
            row.innerHTML = `
                <div style="display:flex; gap: 1rem; align-items:center; flex:1; overflow:hidden;">
                    <img src="${fish.art.imageDataUrl}" style="width:48px; height:48px; background:#000; border:1px solid var(--panel-border); border-radius:4px; image-rendering:pixelated; object-fit:contain; flex-shrink:0;" />
                    <div style="flex:1; overflow:hidden;">
                        <b style="color: ${getItemColor(fish)}; font-size:1.2rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${fish.identity.name}</b> 
                        <span style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase;">[${fish.physical.sizeTier} ${fish.identity.family}]</span>
                        <div style="font-size:0.95rem; color:var(--text-main); margin-top:0.3rem;">Stamina: ${fish.combat.stamina} | Speed: ${fish.combat.speed} | Aggression: ${Math.round(fish.combat.aggression*100)}%</div>
                    </div>
                </div>
                <button class="menu-btn btn-assign" style="width:auto; padding:0.5rem 1.2rem; margin:0; font-size:1.1rem; border-color:var(--cyan-glow); color:var(--cyan-glow);" ${isAssigned ? 'disabled' : ''}>${isAssigned ? 'Assigned' : 'Assign'}</button>
            `;

            TooltipUI.bind(row, fish, player);

            if (!isAssigned) {
                row.querySelector('.btn-assign').onclick = () => {
                    SFX.playUISelect();
                    TooltipUI.hide();
                    const emptyIdx = progress.roster.indexOf(null);
                    if (emptyIdx !== -1) {
                        progress.roster[emptyIdx] = fish.instanceId;
                        if (this.callbacks.onSave) this.callbacks.onSave();
                        this.renderArenaDrafting();
                    } else {
                        SFX.playError();
                        HUD.logAction("Arena squad is already full!", "danger");
                    }
                };
            }
            list.appendChild(row);
        });

        // 3. Start Battle Button
        const btnStart = document.getElementById('btn-arena-start-fight');
        if (slotsFilled < 3) {
            btnStart.disabled = true;
            btnStart.innerText = `Assign ${3 - slotsFilled} more fish to enter`;
            btnStart.style.borderColor = 'var(--panel-border)';
            btnStart.style.color = 'var(--text-muted)';
            btnStart.onclick = null;
        } else {
            btnStart.disabled = false;
            btnStart.innerText = `Enter The Ring`;
            btnStart.style.borderColor = 'var(--green-safe)';
            btnStart.style.color = 'var(--green-safe)';
            
            btnStart.onclick = () => {
                SFX.playUISelect();
                TooltipUI.hide();
                const enemyTeam = opponentData.generateTeam();
                const isBoss = currentTier === 10;
                this.startArenaBattle(playerTeam, enemyTeam, opponentData.rewardGold, isBoss);
            };
        }
    },

    startArenaBattle(playerTeam, enemyTeam, rewardGold, isBoss) {
        document.getElementById('arena-draft-view').style.display = 'none';
        document.getElementById('arena-combat-view').style.display = 'flex';
        
        const canvas = document.getElementById('arena-main-canvas');
        canvas.width = 640; 
        canvas.height = 360;
        
        ArenaRenderer.init(canvas);
        ArenaRenderer.width = canvas.width;
        ArenaRenderer.height = canvas.height;
        
        const logBox = document.getElementById('arena-main-log');
        logBox.innerHTML = '';
        
        // --- NEW: START BATTLE MUSIC ---
        MusicEngine.playBiome('battle', createRng(Date.now()));
        
        const statusHeader = document.getElementById('arena-combat-status');
        statusHeader.innerText = 'FIGHTING';
        statusHeader.style.color = 'var(--cyan-glow)';
        
        const btnLeave = document.getElementById('btn-arena-leave-fight');
        btnLeave.style.display = 'none';

        // Pre-build Stat Boxes
        const pStats = document.getElementById('arena-combat-player-stats');
        const eStats = document.getElementById('arena-combat-enemy-stats');
        pStats.innerHTML = ''; eStats.innerHTML = '';

        const createStatBox = (fish, team, idx) => {
            if (!fish) return `<div class="arena-stat-box empty"></div>`;
            return `
                <div class="arena-stat-box" id="astat-${team}-${idx}">
                    <div class="arena-stat-header">
                        <img src="${fish.art.imageDataUrl}" />
                        <div class="arena-stat-header-info">
                            <b style="color:${getItemColor(fish)}">${fish.identity.name}</b>
                            <span>${fish.physical.sizeTier} ${fish.identity.family}</span>
                        </div>
                    </div>
                    <div class="arena-stat-bars">
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-muted);">
                            <span>HP: <span id="ahp-val-${team}-${idx}">--</span></span>
                            <span>ATK: <span id="aatk-val-${team}-${idx}">--</span></span>
                        </div>
                        <div class="arena-hp-bg">
                            <div class="arena-hp-fill" id="ahp-fill-${team}-${idx}"></div>
                            <div class="arena-shield-fill" id="ashield-fill-${team}-${idx}" style="width:0%;"></div>
                        </div>
                        <div class="arena-cd-bg"><div class="arena-cd-fill" id="acd-fill-${team}-${idx}"></div></div>
                    </div>
                    <div class="arena-status-icons" id="astatus-${team}-${idx}"></div>
                </div>
            `;
        };

        for(let i=0; i<3; i++) {
            pStats.innerHTML += createStatBox(playerTeam[i], 'player', i);
            eStats.innerHTML += createStatBox(enemyTeam[i], 'enemy', i);
        }

        const logMsg = (msg, color) => {
            logBox.innerHTML += `<div style="color:${color}; margin-bottom:2px;">${msg}</div>`;
            logBox.scrollTop = logBox.scrollHeight;
        };

        // Attach Image Data to objects to ensure Renderer works
        playerTeam.forEach(f => f.imageDataUrl = f.art.imageDataUrl);
        enemyTeam.forEach(f => f.imageDataUrl = f.art.imageDataUrl);

        this.arenaEngine = new ArenaEngine(playerTeam, enemyTeam, (e) => {
            ArenaRenderer.handleEvent(e);
            
            const timeStr = `[${e.time.toFixed(1)}s]`;
            if (e.type === 'DAMAGE') {
                const color = (e.isSuperEffective || e.isCrit) ? '#FBBF24' : '#E2E8F0';
                const srcName = e.source ? e.source.name : 'Unknown';
                
                let critText = e.isCrit ? ' critically' : '';
                let effectText = e.isSuperEffective ? ' (Super Effective!)' : '';
                
                logMsg(`${timeStr} 🗡️ ${srcName}${critText} hits ${e.target.name} for ${e.amount} damage.${effectText}`, color);
            } else if (e.type === 'SHIELD_BLOCK') {
                const srcName = e.source ? e.source.name : 'Unknown';
                logMsg(`${timeStr} 🛡️ ${e.target.name}'s shield absorbs ${e.blocked} damage from ${srcName}.`, '#38BDF8');
            } else if (e.type === 'ABILITY') {
                logMsg(`${timeStr} ✨ ${e.attacker.name} uses [${e.ability}]!`, '#A855F7');
            } else if (e.type === 'DEATH') {
                logMsg(`${timeStr} 💀 ${e.target.name} was defeated!`, '#EF4444');
            } else if (e.type === 'BATTLE_END') {
                if (e.winner === 'PLAYER') {
                    logMsg(`🏁 VICTORY! Earned ${rewardGold}g!`, '#22C55E');
                    if (isBoss) logMsg(`🎁 Acquired The Brimstone Hook!`, '#A855F7');
                    statusHeader.innerText = 'VICTORY';
                    statusHeader.style.color = '#22C55E';
                    this.handleArenaWin(rewardGold, isBoss);
                } else if (e.winner === 'ENEMY') {
                    logMsg(`🏁 DEFEAT. Your squad was wiped out.`, '#EF4444');
                    statusHeader.innerText = 'DEFEAT';
                    statusHeader.style.color = '#EF4444';
                } else {
                    logMsg(`🏁 TIMEOUT. Battle is a draw.`, '#94A3B8');
                    statusHeader.innerText = 'DRAW';
                    statusHeader.style.color = '#94A3B8';
                }
                btnLeave.style.display = 'block';
            }
        });

        ArenaRenderer.loadFighters(this.arenaEngine.playerTeam, this.arenaEngine.enemyTeam);
        ArenaRenderer.start();
        this.arenaEngine.start();
        
        this.arenaLastTime = performance.now();
        const loop = (t) => {
            if (!this.arenaEngine || this.arenaEngine.state !== 'FIGHTING') return;
            const speedEl = document.getElementById('arena-sim-speed');
            const speedMult = parseFloat(speedEl ? speedEl.value : 1);
            const dt = Math.min((t - this.arenaLastTime) / 1000, 0.1) * speedMult;
            this.arenaLastTime = t;
            
            this.arenaEngine.tick(dt); 
            this.syncArenaUiToEngine();
            
            this.arenaSimFrame = requestAnimationFrame(loop);
        };
        this.arenaSimFrame = requestAnimationFrame(loop);

        btnLeave.onclick = () => {
            SFX.playUISelect();
            this.closeArena();
            this.openArena(); // Re-open to go back to drafting mode
        };
    },

    syncArenaUiToEngine() {
        if (!this.arenaEngine) return;
        
        const updateFighterUI = (fighter) => {
            if (!fighter) return;
            const prefix = `${fighter.team}-${fighter.position}`;
            const box = document.getElementById(`astat-${prefix}`);
            if (!box) return;

            document.getElementById(`ahp-val-${prefix}`).innerText = `${Math.ceil(fighter.hp)}/${fighter.maxHp}`;
            document.getElementById(`aatk-val-${prefix}`).innerText = fighter.atk;

            const hpPct = Math.max(0, (fighter.hp / fighter.maxHp) * 100);
            document.getElementById(`ahp-fill-${prefix}`).style.width = `${hpPct}%`;
            
            const shieldPct = Math.min(100, (fighter.shield / fighter.maxHp) * 100);
            document.getElementById(`ashield-fill-${prefix}`).style.width = `${shieldPct}%`;
            
            const cdPct = Math.max(0, (1 - (fighter.cd / fighter.maxCd)) * 100);
            document.getElementById(`acd-fill-${prefix}`).style.width = `${cdPct}%`;

            if (fighter.isDead) {
                box.classList.add('dead');
                document.getElementById(`ahp-fill-${prefix}`).style.width = `0%`;
                document.getElementById(`ashield-fill-${prefix}`).style.width = `0%`;
            }

            const statusBox = document.getElementById(`astatus-${prefix}`);
            let statusHtml = '';
            if (fighter.shield > 0) statusHtml += '<div class="arena-status-icon arena-status-shield" title="Shielded"></div>';
            if (fighter.stunTimer > 0) statusHtml += '<div class="arena-status-icon arena-status-stun" title="Stunned"></div>';
            if (fighter.blindStacks > 0) statusHtml += '<div class="arena-status-icon arena-status-blind" title="Blinded"></div>';
            fighter.poisonStacks.forEach(() => { statusHtml += '<div class="arena-status-icon arena-status-poison"></div>'; });
            statusBox.innerHTML = statusHtml;
        };

        this.arenaEngine.playerTeam.forEach(updateFighterUI);
        this.arenaEngine.enemyTeam.forEach(updateFighterUI);
    },

    handleArenaWin(rewardGold, isBoss) {
        const player = this.gameState.player;
        const progress = player.endgameProgress.lava;
        
        player.vitals.gold += rewardGold;
        SFX.playCatchSuccess();
        
        if (isBoss) {
            const rng = createRng(Date.now());
            player.inventory.push({
                id: `lure_brimstone_hook`, 
                invType: 'lure', 
                name: 'The Brimstone Hook',
                stats: { color: 95, sound: 80, light: 70, weight: 90 },
                durability: -1, maxDurability: -1, componentsUsed: 5, basePrice: 0,
                seed: rng.int(10000, 99999), components: ['iron_sinker', 'rattler_bells', 'chilifish_oil'], 
                imageDataUrl: generateMythicLure({ lureId: 'brimstone_hook', rng }).imageDataUrl 
            });
            HUD.logAction(`Arena Conquered! Earned ${rewardGold}g and The Brimstone Hook!`, "safe");
            progress.currentTier++; 
        } else if (progress.currentTier <= 10) {
            HUD.logAction(`Arena Victory! Earned ${rewardGold}g.`, "safe");
            progress.currentTier++;
        } else {
            HUD.logAction(`Challenger Defeated! Earned ${rewardGold}g.`, "safe");
            progress.endlessScore++;
        }
        
        if (this.callbacks.onSave) this.callbacks.onSave();
    }
};