/**
 * js/audio/biomes/volcanic_music.js
 * Sulphur Springs (Volcanic) - REMAKE
 * Vibe: Oppressive heat, tribal, offbeat, exotic desert dungeon synth.
 * Instruments: Deep resonating toms, exotic lute trills, bending pads.
 */

export function compose(engine, rng, theory) {
    const { getNoteInScale, SCALES, safeVel } = theory;

    // Slow, oppressive tempo
    Tone.Transport.bpm.value = rng.int(65, 80); 
    const root = rng.int(0, 11); 
    
    // Exotic, "desert" sounding scales
    const scale = rng.pick([SCALES.double_harmonic, SCALES.phrygian_dominant, SCALES.locrian]); 

    // Heavy, bubbling heat noise
    engine.synths.noiseTape.volume.value = -20; 
    const padSynth = rng.pick(['padChoir', 'padStrings']);
    const leadSynth = rng.pick(['leadOboe', 'leadFlute']); 

    // --- 1. SLUDGY, DISSONANT CHORDS (8 Measure Loop) ---
    const chordProgressions = [
        [0, 1, 0, 1], // Wavering half-steps (mirage heat effect)
        [0, 4, 3, 0], // Exotic minor shift
        [0, 0, 2, 1], // Crawling tension
        [0, 7, 0, 7]  // Deep fifths, very sparse
    ];
    const prog = rng.pick(chordProgressions);
    
    const padEvents = []; 
    const bassEvents = [];

    for (let i = 0; i < 4; i++) {
        const time = `${i * 2}:0:0`; 
        const deg = prog[i];
        
        // Sweeping, dissonant chords
        const voicing = [deg, deg + 3, deg + 4]; 
        
        padEvents.push({ 
            time, 
            note: voicing.map(d => getNoteInScale(root, 3, scale, d)), 
            duration: "2m", 
            velocity: safeVel(rng.float(0.4, 0.6)) 
        });
        
        // Bass hits hard on the 1, then rings out
        bassEvents.push({ time, note: getNoteInScale(root, 2, scale, deg), duration: "1m", velocity: safeVel(0.9) });
        // Occasional off-beat bass drop
        if (rng.chance(0.4)) {
            bassEvents.push({ time: `${i * 2}:3:2`, note: getNoteInScale(root, 1, scale, deg), duration: "4n", velocity: safeVel(0.8) });
        }
    }
    
    engine.scheduleTrack('pad', padSynth, padEvents, "8m");
    engine.scheduleTrack('bass', 'bassDrone', bassEvents, "8m");

    // --- 2. TRIBAL SYNCOPATED PERCUSSION (2 Measure Loop) ---
    // We use a 3-3-2 (Tresillo) rhythm to give it an offbeat, limping tribal feel
    const kickEvents = [];
    const percEvents = [];
    
    for (let m = 0; m < 2; m++) {
        // Kick on the 1, the "and" of 2, and the 4
        kickEvents.push({ time: `${m}:0:0`, note: "C1", duration: "8n", velocity: safeVel(0.9) });
        kickEvents.push({ time: `${m}:1:2`, note: "C1", duration: "8n", velocity: safeVel(0.7) });
        kickEvents.push({ time: `${m}:3:0`, note: "C1", duration: "8n", velocity: safeVel(0.8) });
        
        // Toms fill in the tribal polyrhythms
        percEvents.push({ time: `${m}:0:2`, note: "G2", duration: "16n", velocity: safeVel(0.5) });
        percEvents.push({ time: `${m}:2:0`, note: "D2", duration: "16n", velocity: safeVel(0.7) });
        percEvents.push({ time: `${m}:2:2`, note: "C3", duration: "16n", velocity: safeVel(0.4) });
        percEvents.push({ time: `${m}:3:2`, note: "G2", duration: "16n", velocity: safeVel(0.6) });
    }
    engine.scheduleTrack('kick', 'kickCavern', kickEvents, "2m");
    engine.scheduleTrack('perc', 'percToms', percEvents, "2m");

    // --- 3. EXOTIC LUTE TRILLS (Oud-style playing) (6 Measure Loop) ---
    const arpEvents = [];
    for (let m = 0; m < 6; m++) {
        if (rng.chance(0.6)) {
            const beat = rng.pick([0, 2]);
            const startDeg = rng.pick([0, 1, 4, 5]);
            
            // Rapid 32nd note trills simulating a plucked desert instrument
            const trillLen = rng.pick([3, 5]);
            for (let i = 0; i < trillLen; i++) {
                const trillDeg = i % 2 === 0 ? startDeg : startDeg + 1;
                arpEvents.push({ 
                    time: `${m}:${beat}:${i * 0.5}`, 
                    note: getNoteInScale(root, 4, scale, trillDeg), 
                    duration: "32n", 
                    velocity: safeVel(0.7 - (i * 0.1)) 
                });
            }
            // End on a sustained note
            arpEvents.push({ 
                time: `${m}:${beat}:${trillLen * 0.5}`, 
                note: getNoteInScale(root, 4, scale, startDeg), 
                duration: "8n", 
                velocity: safeVel(0.8) 
            });
        }
    }
    engine.scheduleTrack('arp', 'arpLute', arpEvents, "6m");

    // --- 4. MYSTERIOUS WANDERING LEAD (12 Measure Loop) ---
    const leadEvents = [];
    for (let m = 0; m < 12; m += rng.int(2, 4)) {
        if (rng.chance(0.8)) {
            const startBeat = rng.pick([1, 3]); // Starts on off-beats
            const baseDeg = rng.pick([0, 1, 4, 7]);
            
            // Slides and slurs
            leadEvents.push({ 
                time: `${m}:${startBeat}:0`, 
                note: getNoteInScale(root, 5, scale, baseDeg), 
                duration: "8n", 
                velocity: safeVel(0.7) 
            });
            leadEvents.push({ 
                time: `${m}:${startBeat}:2`, 
                note: getNoteInScale(root, 5, scale, baseDeg + rng.pick([1, -1])), 
                duration: "2n", 
                velocity: safeVel(0.9) 
            });
        }
    }
    engine.scheduleTrack('lead', leadSynth, leadEvents, "12m");
}