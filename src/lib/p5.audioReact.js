import "p5/lib/addons/p5.sound";
import { Midi } from '@tonejs/midi';

/**
 * Load audio file and set up MIDI synchronization
 * @param {String} audioUrl - URL to the audio file
 * @param {String} midiUrl - URL to the MIDI file
 * @param {Function} callback - Callback function receiving the MIDI result
 */
p5.prototype.loadSong = function(audioUrl, midiUrl, callback) {
  this.song = this.loadSound(audioUrl, (sound) => {
    this.audioSampleRate = sound.sampleRate();
    this.totalAnimationFrames = Math.floor(sound.duration() * 60);
    this.loadMidi(midiUrl, callback);
  });
  this.song.onended(() => {
    this.songHasFinished = true;
    if (this.canvas) {
      this.canvas.classList.add('p5Canvas--cursor-play');
      this.canvas.classList.remove('p5Canvas--cursor-pause');
    }
    if (this.captureEnabled && this.captureInProgress) {
      this.captureInProgress = false;
      this.downloadFrames();
    }
  });
};

/**
 * Schedule MIDI cues to trigger animations
 * @param {Array} noteSet - Array of MIDI notes
 * @param {String} callbackName - Name of the callback function to execute
 * @param {Boolean} polyMode - Allow multiple notes at same time if true
 */
p5.prototype.scheduleCueSet = function(noteSet, callbackName, polyMode = false) {
  let lastTicks = -1,
    currentCue = 1;
  for (let i = 0; i < noteSet.length; i++) {
    const note = noteSet[i],
      { ticks, time } = note;
    if (ticks !== lastTicks || polyMode) {
      note.currentCue = currentCue;
      this.song.addCue(time, this[callbackName], note);
      lastTicks = ticks;
      currentCue++;
    }
  }
};

/**
 * Load MIDI file and execute a callback with the result
 * @param {String} midiUrl - URL to the MIDI file
 * @param {Function} callback - Callback function receiving the MIDI result
 */
p5.prototype.loadMidi = function(midiUrl, callback) {
  Midi.fromUrl(midiUrl).then((result) => {
    console.log('MIDI loaded:', result);
    callback(result);
    this.hideLoader();
  });
};

/**
 * Hide loader and show play icon
 */
p5.prototype.hideLoader = function() {
  document.getElementById("loader").classList.add("loading--complete");
  document.getElementById('play-icon').classList.add('fade-in');
  this.audioLoaded = true;
};

/**
 * Toggle audio playback (play/pause)
 */
p5.prototype.togglePlayback = function() {
  if (this.audioLoaded) {
    if (this.captureEnabled) {
      this.startCapture();
      return;
    } else if (this.song.isPlaying()) {
      this.song.pause();
      this.canvas.classList.add('p5Canvas--cursor-play');
      this.canvas.classList.remove('p5Canvas--cursor-pause');
    } else {
      if (parseInt(this.song.currentTime()) >= parseInt(this.song.buffer.duration)) {
        this.resetAnimation();
      }
      document.getElementById("play-icon").classList.remove("fade-in");
      this.song.play();
      this.showingStatic = false;
      this.canvas.classList.add('p5Canvas--cursor-pause');
      this.canvas.classList.remove('p5Canvas--cursor-play');
    }
  }
};

/**
 * Save sketch as PNG with timestamp on Ctrl+S
 */
p5.prototype.saveSketchImage = function() {
  if (this.keyIsDown(this.CONTROL) && this.key === 's') {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    this.save(`sketch_${timestamp}.png`);
    return false;
  }
};
