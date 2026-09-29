/**
 * Audio Engine & Voice Synthesizer
 * Uses Web Audio API for harmonic chime and Web Speech API for natural voice callout.
 */

class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.speechSynth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.isMuted = false;
    this.volume = 0.9;
    this.selectedVoice = null;
    this.initSpeechVoices();
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  initSpeechVoices() {
    if (!this.speechSynth) return;
    const loadVoices = () => {
      const voices = this.speechSynth.getVoices();
      // Try to find a clear English or regional voice
      this.selectedVoice = voices.find(v => v.lang.includes('en-PH') || v.name.includes('Philippines')) ||
                           voices.find(v => v.lang.includes('en-US') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('Samantha'))) ||
                           voices.find(v => v.lang.startsWith('en')) ||
                           voices[0];
    };

    loadVoices();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Plays a pleasant multi-tone chime (F5 -> A5 -> C6 chime sequence)
   */
  async playChime() {
    if (this.isMuted) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const notes = [
        { freq: 659.25, time: 0, duration: 0.35 },    // E5
        { freq: 880.00, time: 0.22, duration: 0.55 }  // A5
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        // Gentle envelope
        gain.gain.setValueAtTime(0, now + note.time);
        gain.gain.linearRampToValueAtTime(0.25 * this.volume, now + note.time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.time);
        osc.stop(now + note.time + note.duration);
      });

      // Wait for chime to complete before resolving
      return new Promise(resolve => setTimeout(resolve, 600));
    } catch (e) {
      console.warn('Audio chime playback failed:', e);
    }
  }

  /**
   * Announce ticket calling
   */
  async announceTicket(ticket, counter) {
    if (this.isMuted) return;

    // First, play chime
    await this.playChime();

    if (!this.speechSynth) return;

    // Format ticket digits for clear, natural pronunciation (e.g., "1 0 1")
    const cleanNumber = String(ticket.ticketNumber || '').replace(/[^0-9A-Za-z]/g, ' ');
    const spokenTicket = cleanNumber.split('').join(' ');

    let destination = 'Window 1, Assessment Officer';
    const stageKey = ticket.currentStage || (counter ? counter.key : '');
    const counterId = counter ? counter.id : (ticket.counterId || 1);

    if (stageKey === 'releasing' || ticket.stageStatus === 'ready_for_release' || counterId === 6) {
      destination = 'Window 5 for Document Release';
    } else if (stageKey === 'recording' || counterId === 5) {
      destination = 'Recording Desk';
    } else if (stageKey === 'approval' || counterId === 4) {
      destination = 'Window 4, Approval';
    } else if (stageKey === 'appraisal' || counterId === 3) {
      destination = 'Window 3, Appraisal and Assessment';
    } else if (stageKey === 'tax_mapping' || counterId === 2) {
      destination = 'Window 2, Tax Mapping';
    } else {
      destination = 'Window 1, Assessment Officer';
    }

    const textToSpeak = `Attention please. Ticket number ${spokenTicket}. Please proceed to ${destination}.`;

    // Cancel any previous utterance to avoid queue buildup
    this.speechSynth.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = 0.95; // slightly deliberate for clarity
    utterance.pitch = 1.05;
    utterance.volume = this.volume;

    this.speechSynth.speak(utterance);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  setMuted(muted) {
    this.isMuted = muted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }
}

export const audioEngine = new AudioEngine();
export const audioAnnouncer = audioEngine;
