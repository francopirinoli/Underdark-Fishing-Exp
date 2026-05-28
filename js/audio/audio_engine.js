/**
 * js/audio/audio_engine.js
 * The core Tone.js wrapper. Manages initialization and separated Audio Buses
 * for Music and SFX routing.
 * V4 - Parallel Wet/Dry Routing for Pristine Highs and Subtle Cavernous Reverb.
 */

export const AudioEngine = {
    isInitialized: false,
    masterVolume: null,
    musicNode: null, // Master Music Bus
    sfxNode: null,   // Master SFX Bus
    
    // This serves as the master input for music_engine.js to connect to
    musicReverb: null, 
    
    // Internal Parallel FX Nodes
    reverbEffect: null,
    reverbFilter: null,
    reverbVolume: null,
    
    sfxReverb: null,

    async init() {
        if (this.isInitialized) return;
        
        // Ensure Tone is ready (no longer needs to download assets)
        await Tone.start();

        this.masterVolume = new Tone.Volume(0).toDestination();

        // Separate Routing Nodes
        this.musicNode = new Tone.Volume(0).connect(this.masterVolume);
        this.sfxNode = new Tone.Volume(0).connect(this.masterVolume);

        // --- PARALLEL MUSIC ROUTING (PRO-AUDIO SEND/RETURN) ---
        // 1. Create the input node (named musicReverb to maintain compatibility with music_engine.js)
        this.musicReverb = new Tone.Volume(0); 

        // 2. Connect the dry signal directly to the master music bus (pristine high end!)
        this.musicReverb.connect(this.musicNode);

        // 3. Create the parallel wet send path
        // We use Freeverb set to 100% wet so it only outputs the reverb tail
        this.reverbEffect = new Tone.Freeverb({
            roomSize: 0.72,      // Reduced from 0.88 to make it tighter and less muddy
            dampening: 3500      // Raised from 2500 to keep high-frequency dampening clean
        });
        this.reverbEffect.wet.value = 1.0; // 100% wet, purely parallel

        // 4. Lowpass filter to warm up the wet tail (and eliminate metallic ringing)
        this.reverbFilter = new Tone.Filter(1500, "lowpass");

        // 5. Reverb return volume to mix the tail back subtler (at -15dB)
        this.reverbVolume = new Tone.Volume(-15); 

        // Connect: Input -> Reverb (100% wet) -> Filter (warm lowpass) -> Return Vol -> Master Music Bus
        this.musicReverb.connect(this.reverbEffect);
        this.reverbEffect.connect(this.reverbFilter);
        this.reverbFilter.connect(this.reverbVolume);
        this.reverbVolume.connect(this.musicNode);

        // --- CLEAN SFX REVERB (Subtler) ---
        this.sfxReverb = new Tone.Freeverb({
            roomSize: 0.45,      // Reduced from 0.60 for tighter, clearer clicks and clangs
            dampening: 4500
        });
        this.sfxReverb.wet.value = 0.12; // Reduced from 0.25 to prevent muddying the sfx transients
        this.sfxReverb.connect(this.sfxNode);

        this.isInitialized = true;
        console.log("🎵 Audio Engine V4 Initialized (High-Fidelity Parallel Routing)");
    },

    setMusicVolume(val) {
        if (!this.isInitialized) return;
        if (val <= 0.01) {
            this.musicNode.mute = true;
        } else {
            this.musicNode.mute = false;
            const db = 20 * Math.log10(val); 
            this.musicNode.volume.value = Math.max(-40, db);
        }
    },

    setSfxVolume(val) {
        if (!this.isInitialized) return;
        if (val <= 0.01) {
            this.sfxNode.mute = true;
        } else {
            this.sfxNode.mute = false;
            const db = 20 * Math.log10(val); 
            this.sfxNode.volume.value = Math.max(-40, db);
        }
    }
};