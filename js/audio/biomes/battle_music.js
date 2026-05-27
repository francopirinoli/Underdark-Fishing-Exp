/**
 * js/audio/biomes/battle_music.js
 * High-octane Darksynth / Metal Battle Music.
 * Vibe: Driving, distorted, polyrhythmic, epic boss fight.
 * Instruments: Chugging Guitars, Overdrive Bass, Sharp Snares, Double-kicks, Shred Leads.
 */

export function compose(engine, rng, theory) {
    const { getNoteInScale, SCALES, safeVel } = theory;

    // Fast, adrenaline-pumping metal tempo
    Tone.Transport.bpm.value = rng.int(145, 185); 
    const root = rng.int(0, 11); 
    
    // Tense, dramatic scales (Phrygian Dominant & Harmonic Minor are classic metal scales)
    const scale = rng.pick([SCALES.harmonic_minor, SCALES.phrygian_dominant, SCALES.minor, SCALES.locrian]); 

    engine.synths.noiseTape.volume.value = -25; // Hissing tape for grit

    // --- 1. DRUMS (8 Measure Loop) ---
    const kickEvents = [];
    const snareEvents = [];
    
    // Choose Drum Groove
    const drumGroove = rng.pick(['thrash', 'groove_metal', 'djent', 'blast_beat']);

    for (let m = 0; m < 8; m++) { 
        if (drumGroove === 'thrash') {
            // Skank beat (Kick on 1 & 3; Snare on 2 & 4) + Double Kick flourishes
            for(let b=0; b<4; b++) {
                kickEvents.push({ time: `${m}:${b}:0`, note: "C1", duration: "16n", velocity: safeVel(1.0) });
                if(rng.chance(0.6)) kickEvents.push({ time: `${m}:${b}:2`, note: "C1", duration: "16n", velocity: safeVel(0.8) }); // Double kick
                if (b === 1 || b === 3) snareEvents.push({ time: `${m}:${b}:0`, note: "C4", duration: "16n", velocity: safeVel(0.9) });
            }
        } 
        else if (drumGroove === 'djent') {
            // Snare on 3 (Half-time feel), complex syncopated kicks
            snareEvents.push({ time: `${m}:2:0`, note: "C4", duration: "16n", velocity: safeVel(0.9) });
            // The kick drum will match the syncopated guitar chugs later!
        } 
        else if (drumGroove === 'blast_beat') {
            // Relentless 16th note kicks, 8th note snares
            for(let b=0; b<4; b++) {
                snareEvents.push({ time: `${m}:${b}:0`, note: "C4", duration: "16n", velocity: safeVel(0.9) });
                snareEvents.push({ time: `${m}:${b}:2`, note: "C4", duration: "16n", velocity: safeVel(0.8) });
                for(let s=0; s<4; s++) {
                    kickEvents.push({ time: `${m}:${b}:${s}`, note: "C1", duration: "32n", velocity: safeVel(0.85) });
                }
            }
        } 
        else { 
            // Groove Metal (Heavy, bouncing 4/4)
            kickEvents.push({ time: `${m}:0:0`, note: "C1", duration: "16n", velocity: safeVel(1.0) });
            kickEvents.push({ time: `${m}:0:2`, note: "C1", duration: "16n", velocity: safeVel(0.7) });
            kickEvents.push({ time: `${m}:2:0`, note: "C1", duration: "16n", velocity: safeVel(1.0) });
            kickEvents.push({ time: `${m}:2:2`, note: "C1", duration: "16n", velocity: safeVel(0.8) });
            snareEvents.push({ time: `${m}:1:0`, note: "C4", duration: "16n", velocity: safeVel(0.9) });
            snareEvents.push({ time: `${m}:3:0`, note: "C4", duration: "16n", velocity: safeVel(0.9) });
        }

        // Drum Fills
        if (m === 3 || m === 7) {
            snareEvents.push({ time: `${m}:3:2`, note: "C4", duration: "32n", velocity: safeVel(0.8) });
            snareEvents.push({ time: `${m}:3:3`, note: "C4", duration: "32n", velocity: safeVel(0.9) });
        }
    }

    // --- 2. CHUGGING GUITARS & BASS (8 Measure Loop) ---
    const chugEvents = [];
    const bassEvents = [];
    
    const riffStyle = rng.pick(['pedal_point', 'syncopated_chug', 'tremolo_picking']);
    const chordProgressions = [
        [0, 5, 4, 5], // Minor descent climb
        [0, 1, 0, 4], // Phrygian evil
        [0, 3, 7, 4], // Epic progression
        [0, 2, 5, 4]  // Tense
    ];
    const prog = rng.pick(chordProgressions);

    for (let i = 0; i < 4; i++) {
        const deg = prog[i];
        
        // Power Chords (Root + 5th + Octave)
        const pChord = [getNoteInScale(root, 2, scale, deg), getNoteInScale(root, 2, scale, deg+4), getNoteInScale(root, 3, scale, deg)];
        // Palm mutes (Single low note)
        const pmNote = [getNoteInScale(root, 2, scale, deg)]; 
        
        // Solid Bass following the root note
        const bRoot = getNoteInScale(root, 1, scale, deg);

        for (let mOffset = 0; mOffset < 2; mOffset++) {
            const m = i * 2 + mOffset;
            
            // Baseline 8th note heavy bass guitar
            for(let b = 0; b < 4; b++) {
                bassEvents.push({ time: `${m}:${b}:0`, note: bRoot, duration: "8n", velocity: safeVel(1.0) });
                bassEvents.push({ time: `${m}:${b}:2`, note: bRoot, duration: "8n", velocity: safeVel(0.8) });
            }

            // Guitar Riffs
            if (riffStyle === 'pedal_point') {
                // Constant 16th note palm mutes with power chord accents
                for(let b=0; b<4; b++) {
                    for(let s=0; s<4; s++) {
                        const isAccent = (b===0 && s===0) || (b===2 && s===0) || (b===1 && s===2);
                        const n = isAccent ? pChord : pmNote;
                        const v = isAccent ? 1.0 : 0.6; // Mutes are quieter
                        const d = isAccent ? "8n" : "32n"; // Mutes are very short and tight
                        chugEvents.push({ time: `${m}:${b}:${s}`, note: n, duration: d, velocity: safeVel(v) });
                    }
                }
            } 
            else if (riffStyle === 'syncopated_chug') {
                // Complex, jagged rhythms (Djent style)
                const rhythm = [0, 0.75, 1.5, 2.25, 3.0, 3.5];
                rhythm.forEach(beatPos => {
                    const b = Math.floor(beatPos);
                    const s = (beatPos % 1) * 4;
                    chugEvents.push({ time: `${m}:${b}:${s}`, note: pChord, duration: "16n", velocity: safeVel(0.9) });
                    
                    // If Djent drum style is active, lock the kick drum to the guitar!
                    if (drumGroove === 'djent') {
                        kickEvents.push({ time: `${m}:${b}:${s}`, note: "C1", duration: "16n", velocity: safeVel(1.0) });
                    }
                });
            } 
            else if (riffStyle === 'tremolo_picking') {
                // Very fast, continuous 16th notes moving up the scale (Black Metal style)
                for(let b=0; b<4; b++) {
                    for(let s=0; s<4; s++) {
                        const noteDeg = deg + Math.floor(s/2); // Slowly climbs
                        chugEvents.push({ 
                            time: `${m}:${b}:${s}`, 
                            note: getNoteInScale(root, 3, scale, noteDeg), 
                            duration: "16n", 
                            velocity: safeVel(0.8) 
                        });
                    }
                }
            }
        }
    }

    engine.scheduleTrack('kick', 'metalKick', kickEvents, "8m");
    engine.scheduleTrack('snare', 'metalSnare', snareEvents, "8m");
    engine.scheduleTrack('chug', 'guitarChug', chugEvents, "8m");
    engine.scheduleTrack('bass', 'metalBass', bassEvents, "8m");

    // --- 3. EPIC SHRED LEAD (16 Measure Loop) ---
    // Enters on measure 8 for a massive solo
    const leadEvents = [];
    const shredStyle = rng.pick(['sweep_picking', 'sustained_bends']);

    for (let m = 8; m < 16; m++) {
        const chordDeg = prog[Math.floor((m % 8) / 2)];
        
        if (shredStyle === 'sweep_picking') {
            // Rapid, cascading arpeggios
            for (let b = 0; b < 4; b++) {
                if (rng.chance(0.8)) {
                    for (let s = 0; s < 4; s++) {
                        const arpOffset = [0, 2, 4, 7][s]; // Arpeggio pattern
                        leadEvents.push({ 
                            time: `${m}:${b}:${s}`, 
                            note: getNoteInScale(root, 5, scale, chordDeg + arpOffset), 
                            duration: "32n", 
                            velocity: safeVel(rng.float(0.7, 1.0)) 
                        });
                    }
                }
            }
        } else {
            // Sustained, singing electric guitar leads
            if (rng.chance(0.8)) {
                const startDeg = chordDeg + rng.pick([0, 2, 4, 7]);
                leadEvents.push({ time: `${m}:0:0`, note: getNoteInScale(root, 5, scale, startDeg), duration: "4n.", velocity: safeVel(1.0) });
                leadEvents.push({ time: `${m}:1:2`, note: getNoteInScale(root, 5, scale, startDeg + 1), duration: "8n", velocity: safeVel(0.8) });
                leadEvents.push({ time: `${m}:2:0`, note: getNoteInScale(root, 5, scale, startDeg), duration: "2n", velocity: safeVel(0.9) });
            }
        }
    }
    
    // Mount the shredder synth
    engine.scheduleTrack('lead', 'leadShred', leadEvents, "16m");
}