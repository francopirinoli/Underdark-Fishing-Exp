/**
 * js/audio/biomes/astral_sea_music.js
 * The Astral Sea Dungeon Theme
 * Vibe: Cosmic dread, weightless, foreboding, spacey dungeon synth.
 * Instruments: Deep sub-drones, hollow choir chords, glittering star arps, mournful oboe.
 */

export function compose(engine, rng, theory) {
    const { getNoteInScale, SCALES, safeVel } = theory;

    // 1. Core Atmosphere Setup
    // Slow, floating, weightless tempo
    Tone.Transport.bpm.value = rng.int(50, 60); 
    const root = rng.int(0, 11); 
    
    // Locrian is highly unstable; Double Harmonic creates exotic, ancient dread
    const scale = rng.pick([SCALES.double_harmonic, SCALES.locrian]); 

    // Bring up the tape hiss to simulate a cold, vacuum-like cosmic wind
    engine.synths.noiseTape.volume.value = -20; 

    const padSynth = 'padChoir'; // Hollow, breathy choir
    const leadSynth = 'leadOboe'; // Ominous reed voice
    const arpSynth = 'chimesGlass'; // Twinkling crystal stars

    // --- 2. THE COSMIC DUST CHORDS (16 Measure Loop) ---
    // Deep, slowly swelling dissonant clusters (Root + Minor 2nd + Tritone)
    const chordProgressions = [
        [0, 1, 0, 1], // Tension between Root and flat 2nd
        [0, 4, 3, 1], // Wide, cold, alien transitions
        [0, 0, 1, 0]  // Very static, suspended in space
    ];
    const prog = rng.pick(chordProgressions);
    
    const padEvents = []; 
    const bassEvents = [];

    for (let i = 0; i < 4; i++) {
        const time = `${i * 4}:0:0`; // Chord changes every 4 measures
        const deg = prog[i];
        
        // Unsettling, wide choral voicing (Root + Tritone + Flat 2nd)
        const voicing = [deg, deg + 1, deg + 4];
        
        padEvents.push({ 
            time, 
            note: voicing.map(d => getNoteInScale(root, 4, scale, d)), 
            duration: "4m", 
            velocity: safeVel(rng.float(0.25, 0.45)) 
        });
        
        // Deep sub-drone that holds the root note of the chord
        bassEvents.push({ 
            time, 
            note: getNoteInScale(root, 1, scale, deg), 
            duration: "4m", 
            velocity: safeVel(0.75) 
        });
    }
    
    engine.scheduleTrack('pad', padSynth, padEvents, "16m");
    engine.scheduleTrack('bass', 'bassDrone', bassEvents, "16m");


    // --- 3. GLITTERING STAR SWEEPS (6 Measure Loop) ---
    // Simulates the cold twinkle of distant pulsars and starlight currents
    const arpEvents = [];
    
    for (let m = 0; m < 6; m++) {
        // 40% chance of a glittering star sweep in any given measure
        if (rng.chance(0.40)) {
            const beat = rng.int(0, 3);
            const startNote = rng.pick([0, 2, 4]);
            const dir = rng.pick([1, -1]); // Upward or downward sweep
            
            // Rapid burst of 4-6 crystal notes
            const burstLen = rng.int(4, 6);
            for(let i = 0; i < burstLen; i++) {
                arpEvents.push({ 
                    time: `${m}:${beat}:${i * 0.5}`, // Very fast spacing (32nd equivalent)
                    note: getNoteInScale(root, rng.pick([5, 6]), scale, startNote + (i * dir)), 
                    duration: "32n", 
                    velocity: safeVel(0.4 - (i * 0.04)) // Fades as it sweeps
                });
            }
        }
    }
    engine.scheduleTrack('arp', arpSynth, arpEvents, "6m");


    // --- 4. THE STAR-SIREN'S CRY (12 Measure Loop) ---
    // A lonely, mournful oboe melody with wide, expressive jumps
    const leadEvents = [];
    
    for (let m = 0; m < 12; m += rng.int(2, 4)) {
        if (rng.chance(0.85)) {
            const startBeat = rng.pick([1, 2]); // Tends to start off-beat
            const baseDeg = rng.pick([0, 1, 4, 5]);
            
            // A long, wailing tone that bends down a half-step
            leadEvents.push({ 
                time: `${m}:${startBeat}:0`, 
                note: getNoteInScale(root, 5, scale, baseDeg), 
                duration: "2n.", 
                velocity: safeVel(0.6) 
            });
            leadEvents.push({ 
                time: `${m}:${startBeat}:3`, 
                note: getNoteInScale(root, 5, scale, baseDeg - 1), 
                duration: "2n", 
                velocity: safeVel(0.4) 
            });
        }
    }
    engine.scheduleTrack('lead', leadSynth, leadEvents, "12m");


    // --- 5. PULSAR HEARTBEATS (4 Measure Loop) ---
    // Sparse, cavernous sub-bass impacts acting as a cosmic pulse
    const kickEvents = [];
    const tomEvents = [];

    for (let m = 0; m < 4; m++) {
        // Echoing low heartbeat on beat 1
        kickEvents.push({ time: `${m}:0:0`, note: "C1", duration: "4n", velocity: safeVel(0.8) });
        
        // Rare syncopated double-tap
        if (rng.chance(0.35)) {
            kickEvents.push({ time: `${m}:2:2`, note: "C1", duration: "8n", velocity: safeVel(0.5) });
        }

        // Hollow wood-drum roll (cosmic static) at the end of every 2nd measure
        if (m % 2 === 1 && rng.chance(0.5)) {
            tomEvents.push({ time: `${m}:3:0`, note: "D2", duration: "16n", velocity: safeVel(0.5) });
            tomEvents.push({ time: `${m}:3:1`, note: "C2", duration: "16n", velocity: safeVel(0.4) });
            tomEvents.push({ time: `${m}:3:2`, note: "G2", duration: "16n", velocity: safeVel(0.3) });
        }
    }
    
    engine.scheduleTrack('kick', 'kickCavern', kickEvents, "4m");
    engine.scheduleTrack('perc', 'percToms', tomEvents, "4m");
}