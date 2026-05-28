/**
 * js/audio/biomes/battle_music.js
 * Algorithmic Darksynth & Metal Battle Music.
 * V5 - 5 Distinct Combat Archetypes for massive variety (JRPG, Doom, Prog, Tribal, Neo-Classical).
 */

export function compose(engine, rng, theory) {
    const { getNoteInScale, SCALES, safeVel } = theory;

    // --- 1. PROCEDURAL THEME ROLL ---
    const THEMES = ['jrpg_epic', 'doom_sludge', 'prog_metal', 'tribal_fury', 'neo_classical'];
    const activeTheme = rng.pick(THEMES);
    
    let tempo = 135;
    let scale = SCALES.minor;
    const root = rng.int(0, 11); 

    engine.synths.noiseTape.volume.value = -25; // Hissing tape for grit

    // Event Queues
    const kickEvents = [];
    const snareEvents = [];
    const tomEvents = [];
    const chugEvents = [];
    const bassEvents = [];
    const leadEvents = [];
    const padEvents = [];
    const arpEvents = [];

    let leadInstrument = 'leadShred';
    let padInstrument = 'padStrings';

    // --- 2. ARCHETYPE CONFIGURATION ---
    if (activeTheme === 'jrpg_epic') {
        tempo = rng.int(150, 170);
        scale = rng.pick([SCALES.dorian, SCALES.minor]);
        leadInstrument = rng.pick(['leadFlute', 'leadOboe']);
        padInstrument = 'padStrings';
    } else if (activeTheme === 'doom_sludge') {
        tempo = rng.int(75, 90);
        scale = rng.pick([SCALES.phrygian, SCALES.locrian]);
        leadInstrument = 'leadShred';
        padInstrument = 'padChoir';
    } else if (activeTheme === 'prog_metal') {
        tempo = rng.int(125, 140);
        scale = SCALES.harmonic_minor;
        leadInstrument = 'leadShred';
        padInstrument = 'padChoir';
    } else if (activeTheme === 'tribal_fury') {
        tempo = rng.int(110, 130);
        scale = rng.pick([SCALES.double_harmonic, SCALES.phrygian_dominant]);
        leadInstrument = 'leadOboe';
        padInstrument = 'padChoir';
    } else if (activeTheme === 'neo_classical') {
        tempo = rng.int(140, 160);
        scale = SCALES.harmonic_minor;
        leadInstrument = 'leadShred';
        padInstrument = 'padStrings';
    }

    Tone.Transport.bpm.value = tempo;

    // --- 3. CHORD PROGRESSIONS (8 Measure Loop) ---
    const chordProgressions = [
        [0, 5, 4, 5], // Epic / Classic Boss
        [0, 2, 5, 4], // Tense & Heroic
        [0, 1, 0, 4], // Phrygian / Evil
        [0, 3, 7, 4], // Rising Action
        [0, 7, 6, 5]  // Descending Doom
    ];
    const prog = rng.pick(chordProgressions);

    // --- 4. RHYTHM & DRUM GENERATION ---
    for (let m = 0; m < 8; m++) {
        const chordDeg = prog[Math.floor(m / 2)];
        const bRoot = getNoteInScale(root, 1, scale, chordDeg);
        const bOct = getNoteInScale(root, 2, scale, chordDeg);
        const pChord = [getNoteInScale(root, 2, scale, chordDeg), getNoteInScale(root, 2, scale, chordDeg+4)];
        
        // Background Pads
        if (m % 2 === 0) {
            const padVoicing = [chordDeg, chordDeg + 2, chordDeg + 4];
            if (activeTheme === 'jrpg_epic' || activeTheme === 'neo_classical') padVoicing.push(chordDeg + 7);
            padEvents.push({ 
                time: `${m}:0:0`, 
                note: padVoicing.map(d => getNoteInScale(root, 3, scale, d)), 
                duration: activeTheme === 'doom_sludge' ? "2m" : "1m", 
                velocity: safeVel(rng.float(0.4, 0.6)) 
            });
        }

        // Archetype-Specific Grooves
        if (activeTheme === 'jrpg_epic') {
            // Driving 4/4 Drums
            for(let b=0; b<4; b++) {
                kickEvents.push({ time: `${m}:${b}:0`, note: "C1", duration: "16n", velocity: safeVel(0.9) });
                if (b === 1 || b === 3) snareEvents.push({ time: `${m}:${b}:0`, note: "C4", duration: "16n", velocity: safeVel(0.8) });
                
                // Galloping Bass (16ths: 1, e, a)
                bassEvents.push({ time: `${m}:${b}:0`, note: bRoot, duration: "16n", velocity: safeVel(1.0) });
                bassEvents.push({ time: `${m}:${b}:1`, note: bOct, duration: "16n", velocity: safeVel(0.7) });
                bassEvents.push({ time: `${m}:${b}:3`, note: bRoot, duration: "16n", velocity: safeVel(0.8) });
            }
            // Rhythm Guitar accents on 1 and 3
            chugEvents.push({ time: `${m}:0:0`, note: pChord, duration: "8n", velocity: safeVel(0.9) });
            chugEvents.push({ time: `${m}:2:0`, note: pChord, duration: "8n", velocity: safeVel(0.9) });
            
            // Fast Lute Arpeggios outlining the chord
            for (let b = 0; b < 4; b++) {
                [0, 2, 4, 2].forEach((offset, s) => {
                    arpEvents.push({ time: `${m}:${b}:${s}`, note: getNoteInScale(root, 5, scale, chordDeg + offset), duration: "32n", velocity: safeVel(0.5) });
                });
            }
        } 
        
        else if (activeTheme === 'doom_sludge') {
            // Half-time, massive impacts
            if (m % 2 === 0) {
                kickEvents.push({ time: `${m}:0:0`, note: "C1", duration: "8n", velocity: safeVel(1.0) });
                snareEvents.push({ time: `${m}:2:0`, note: "C4", duration: "8n", velocity: safeVel(1.0) });
                chugEvents.push({ time: `${m}:0:0`, note: pChord, duration: "2n", velocity: safeVel(1.0) });
                bassEvents.push({ time: `${m}:0:0`, note: bRoot, duration: "2n", velocity: safeVel(1.0) });
            } else {
                kickEvents.push({ time: `${m}:0:0`, note: "C1", duration: "8n", velocity: safeVel(0.8) });
                kickEvents.push({ time: `${m}:1:0`, note: "C1", duration: "8n", velocity: safeVel(0.9) });
                snareEvents.push({ time: `${m}:2:0`, note: "C4", duration: "8n", velocity: safeVel(1.0) });
                chugEvents.push({ time: `${m}:0:0`, note: pChord, duration: "4n", velocity: safeVel(0.9) });
                chugEvents.push({ time: `${m}:1:0`, note: pChord, duration: "4n", velocity: safeVel(1.0) });
                bassEvents.push({ time: `${m}:0:0`, note: bRoot, duration: "4n", velocity: safeVel(0.9) });
                bassEvents.push({ time: `${m}:1:0`, note: bRoot, duration: "4n", velocity: safeVel(1.0) });
            }
        }

        else if (activeTheme === 'prog_metal') {
            // Jagged Syncopation (Djent)
            snareEvents.push({ time: `${m}:2:0`, note: "C4", duration: "16n", velocity: safeVel(0.9) }); // Snare anchors the chaos on 3
            
            const syncRhythm = [0, 0.75, 1.5, 2.5, 3.25]; // Odd groupings
            syncRhythm.forEach(beatPos => {
                const b = Math.floor(beatPos);
                const s = (beatPos % 1) * 4;
                kickEvents.push({ time: `${m}:${b}:${s}`, note: "C1", duration: "16n", velocity: safeVel(1.0) });
                chugEvents.push({ time: `${m}:${b}:${s}`, note: pChord, duration: "16n", velocity: safeVel(0.9) });
                bassEvents.push({ time: `${m}:${b}:${s}`, note: bRoot, duration: "16n", velocity: safeVel(1.0) });
            });
            
            // Glitchy arps
            if (rng.chance(0.5)) {
                for (let s = 0; s < 4; s++) {
                    arpEvents.push({ time: `${m}:3:${s}`, note: getNoteInScale(root, 6, scale, chordDeg + s*2), duration: "32n", velocity: safeVel(0.6) });
                }
            }
        }

        else if (activeTheme === 'tribal_fury') {
            // Tom-heavy polyrhythms
            kickEvents.push({ time: `${m}:0:0`, note: "C1", duration: "8n", velocity: safeVel(1.0) });
            kickEvents.push({ time: `${m}:2:0`, note: "C1", duration: "8n", velocity: safeVel(0.9) });
            
            tomEvents.push({ time: `${m}:0:2`, note: "G2", duration: "16n", velocity: safeVel(0.8) });
            tomEvents.push({ time: `${m}:1:0`, note: "D3", duration: "16n", velocity: safeVel(0.7) });
            tomEvents.push({ time: `${m}:1:2`, note: "C3", duration: "16n", velocity: safeVel(0.6) });
            tomEvents.push({ time: `${m}:2:2`, note: "G2", duration: "16n", velocity: safeVel(0.8) });
            tomEvents.push({ time: `${m}:3:0`, note: "D2", duration: "16n", velocity: safeVel(0.9) });

            bassEvents.push({ time: `${m}:0:0`, note: bRoot, duration: "4n", velocity: safeVel(0.9) });
            bassEvents.push({ time: `${m}:2:0`, note: bRoot, duration: "4n", velocity: safeVel(0.8) });
            
            chugEvents.push({ time: `${m}:1:0`, note: pChord, duration: "16n", velocity: safeVel(0.7) });
            chugEvents.push({ time: `${m}:3:0`, note: pChord, duration: "16n", velocity: safeVel(0.7) });
        }

        else if (activeTheme === 'neo_classical') {
            // Marching snare & 16th note chugs
            for(let b=0; b<4; b++) {
                kickEvents.push({ time: `${m}:${b}:0`, note: "C1", duration: "16n", velocity: safeVel(0.9) });
                snareEvents.push({ time: `${m}:${b}:2`, note: "C4", duration: "16n", velocity: safeVel(0.6) }); // Marching offbeat
                if (b === 1 || b === 3) snareEvents.push({ time: `${m}:${b}:0`, note: "C4", duration: "16n", velocity: safeVel(0.9) }); // Hard crack
                
                for(let s=0; s<4; s++) {
                    chugEvents.push({ time: `${m}:${b}:${s}`, note: pChord[0], duration: "32n", velocity: safeVel(0.6) }); // Fast pedal point
                }
            }
            bassEvents.push({ time: `${m}:0:0`, note: bRoot, duration: "1m", velocity: safeVel(0.8) });
        }

        // End of loop Fills for all themes
        if (m === 7) {
            snareEvents.push({ time: `${m}:3:1`, note: "C4", duration: "32n", velocity: safeVel(0.8) });
            snareEvents.push({ time: `${m}:3:2`, note: "C4", duration: "32n", velocity: safeVel(0.9) });
            snareEvents.push({ time: `${m}:3:3`, note: "C4", duration: "32n", velocity: safeVel(1.0) });
            if (activeTheme !== 'tribal_fury') kickEvents.push({ time: `${m}:3:2`, note: "C1", duration: "16n", velocity: safeVel(1.0) });
        }
    }

    // --- 5. THEMATIC LEAD GENERATOR (16 Measure Loop) ---
    // We use a structured A-B-A-C motif system to make it sound like composed music
    
    function generateMotif(baseDeg, style) {
        const events = [];
        let beat = 0;
        let currentDeg = baseDeg + rng.pick([0, 2, 4, 7]); // Start on a chord tone

        while (beat < 8) { // 2 measure phrase
            if (style === 'jrpg') {
                // Melodic, jumpy, syncopated
                if (rng.chance(0.8)) {
                    currentDeg += rng.pick([1, -1, 2, -2, 0]);
                    events.push({ time: `0:${Math.floor(beat)}:${Math.floor((beat % 1) * 4)}`, note: getNoteInScale(root, 5, scale, currentDeg), duration: rng.pick(["8n", "4n"]), velocity: safeVel(0.9) });
                }
                beat += rng.pick([0.5, 1.0, 0.5]); 
            } 
            else if (style === 'doom') {
                // Slow, wailing bends
                if (rng.chance(0.6) && beat % 2 === 0) {
                    events.push({ time: `0:${beat}:0`, note: getNoteInScale(root, 5, scale, currentDeg), duration: "2n.", velocity: safeVel(1.0) });
                    currentDeg += rng.pick([1, -1]);
                }
                beat += 1.0;
            }
            else if (style === 'prog') {
                // Erratic shred bursts
                if (rng.chance(0.5)) {
                    for(let s=0; s<4; s++) {
                        events.push({ time: `0:${Math.floor(beat)}:${s}`, note: getNoteInScale(root, 5, scale, currentDeg + s), duration: "32n", velocity: safeVel(0.8) });
                    }
                    currentDeg += rng.pick([2, -2]);
                }
                beat += 1.0;
            }
            else if (style === 'tribal') {
                // Exotic trills
                if (rng.chance(0.7)) {
                    events.push({ time: `0:${Math.floor(beat)}:0`, note: getNoteInScale(root, 5, scale, currentDeg), duration: "16n", velocity: safeVel(0.9) });
                    events.push({ time: `0:${Math.floor(beat)}:1`, note: getNoteInScale(root, 5, scale, currentDeg + 1), duration: "16n", velocity: safeVel(0.8) });
                    events.push({ time: `0:${Math.floor(beat)}:2`, note: getNoteInScale(root, 5, scale, currentDeg), duration: "8n", velocity: safeVel(0.9) });
                }
                beat += 1.0;
            }
            else if (style === 'neoclassical') {
                // Sweeping arpeggios
                [0, 2, 4, 7].forEach((offset, idx) => {
                    events.push({ time: `0:${Math.floor(beat)}:${idx}`, note: getNoteInScale(root, 5, scale, currentDeg + offset), duration: "32n", velocity: safeVel(0.8) });
                });
                currentDeg += rng.pick([1, -1]);
                beat += 1.0;
            }
        }
        return events;
    }

    let motifStyle = 'jrpg';
    if (activeTheme === 'doom_sludge') motifStyle = 'doom';
    if (activeTheme === 'prog_metal') motifStyle = 'prog';
    if (activeTheme === 'tribal_fury') motifStyle = 'tribal';
    if (activeTheme === 'neo_classical') motifStyle = 'neoclassical';

    const motifA = generateMotif(prog[0], motifStyle);
    const motifB = generateMotif(prog[1], motifStyle);
    const motifC = generateMotif(prog[3], motifStyle);

    const shiftMotif = (motif, targetMeasure) => {
        return motif.map(e => {
            const parts = e.time.split(':');
            return { ...e, time: `${parseInt(parts[0]) + targetMeasure}:${parts[1]}:${parts[2]}` };
        });
    };

    // A - B - A - C Form 
    leadEvents.push(...shiftMotif(motifA, 0));
    leadEvents.push(...shiftMotif(motifB, 4));
    leadEvents.push(...shiftMotif(motifA, 8));
    leadEvents.push(...shiftMotif(motifC, 12));

    // --- 6. SCHEDULE TRACKS ---
    engine.scheduleTrack('kick', 'metalKick', kickEvents, "8m");
    engine.scheduleTrack('snare', 'metalSnare', snareEvents, "8m");
    engine.scheduleTrack('tom', 'percToms', tomEvents, "8m");
    engine.scheduleTrack('chug', 'guitarChug', chugEvents, "8m");
    engine.scheduleTrack('bass', 'metalBass', bassEvents, "8m");
    engine.scheduleTrack('pad', padInstrument, padEvents, "8m");
    engine.scheduleTrack('arp', 'arpLute', arpEvents, "8m");
    engine.scheduleTrack('lead', leadInstrument, leadEvents, "16m");
}