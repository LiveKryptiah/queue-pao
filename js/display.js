/**
 * Public TV Display / Digital Signage Controller
 * Handles digital signage telemetry, hero spotlight, LIVE COUNTER DECISIONS FEED, 3-window matrix with LIVE SERVICE DURATION STOPWATCH, live clock, and audio.
 * Configuration:
 * - Counter 1: All Assessment Services
 * - Counter 2: Priority Lane & All Services
 * - Counter 3: All Assessment Services
 */

import { queueState, DEFAULT_COUNTERS, STAGE_DEFINITIONS, isTransferSubdivisionReclass } from './state.js';
import { audioEngine } from './audio.js';

export const YOUTUBE_PRESETS = [
  { id: 'LXb3EKWsInQ', name: 'Scenic Nature 4K' },
  { id: '5qap5aO4i9A', name: 'Lofi Relaxing' },
  { id: '21X5lGlDOfg', name: 'NASA Earth Live' },
  { id: '4xDzrJKXOOY', name: 'Synthwave Radio' }
];

class DisplayController {
  constructor() {
    this.isFullscreen = false;
    this.clockInterval = null;
    this.stopwatchInterval = null;
    this.youtubeVideoId = this.getStoredYouTubeId();
    this.currentHeroStartTime = null;
    this.currentHeroTicket = null;
    if (typeof window !== 'undefined') {
      window.displayApp = this;
    }
  }

  getStoredYouTubeId() {
    try {
      const stored = localStorage.getItem('assessor_tv_youtube_id');
      if (!stored || stored === 'jfKfPfyJRdk') {
        localStorage.setItem('assessor_tv_youtube_id', 'LXb3EKWsInQ');
        return 'LXb3EKWsInQ';
      }
      return stored;
    } catch (e) {
      return 'LXb3EKWsInQ';
    }
  }

  extractYouTubeId(input) {
    if (!input) return 'LXb3EKWsInQ';
    const clean = input.trim();
    const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/|shorts\/|watch\?.+&v=))([\w-]{11})/i);
    if (match && match[1]) return match[1];
    if (/^[\w-]{11}$/.test(clean)) return clean;
    return 'LXb3EKWsInQ';
  }

  setYouTubeVideo(videoIdOrUrl) {
    const cleanId = this.extractYouTubeId(videoIdOrUrl);
    this.youtubeVideoId = cleanId;
    try {
      localStorage.setItem('assessor_tv_youtube_id', cleanId);
    } catch (e) {}

    try {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_video_id: cleanId })
      });
    } catch (e) {}

    this.updateYouTubeIframes(true);
  }

  promptChangeYouTubeVideo() {
    const current = this.youtubeVideoId;
    const input = prompt('Enter YouTube Video URL or Live Stream Link (e.g. https://www.youtube.com/watch?v=... or YouTube Video ID):', `https://www.youtube.com/watch?v=${current}`);
    if (input !== null && input.trim() !== '') {
      this.setYouTubeVideo(input);
      alert('YouTube live stream video updated successfully!');
    }
  }

  updateYouTubeIframes(force = false) {
    const iframes = document.querySelectorAll('.tv-youtube-iframe, #tv-main-youtube-iframe');
    const embedUrl = `https://www.youtube.com/embed/${this.youtubeVideoId}?autoplay=1&mute=1&controls=1&loop=1&playlist=${this.youtubeVideoId}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`;
    
    iframes.forEach(iframe => {
      if (!iframe) return;
      if (force || iframe.getAttribute('data-loaded-video-id') !== this.youtubeVideoId) {
        iframe.setAttribute('data-loaded-video-id', this.youtubeVideoId);
        iframe.src = embedUrl;
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      }
    });

    const badgeElem = document.getElementById('tv-video-id-badge');
    if (badgeElem) badgeElem.innerText = this.youtubeVideoId;
  }

  async init() {
    if (typeof window !== 'undefined') {
      window.displayApp = this;
    }
    this.startLiveClock();
    this.startStopwatchTicker();
    this.updateYouTubeIframes();
    this.bindEvents();

    this.render();

    try {
      const freshState = await queueState.fetchServerState();
      if (freshState) {
        if (freshState.youtubeVideoId && freshState.youtubeVideoId !== 'jfKfPfyJRdk' && freshState.youtubeVideoId !== this.youtubeVideoId) {
          this.youtubeVideoId = freshState.youtubeVideoId;
          this.updateYouTubeIframes(true);
        }
        this.render(freshState);
      }
    } catch (e) {}

    queueState.subscribe((state) => {
      if (state && state.youtubeVideoId && state.youtubeVideoId !== 'jfKfPfyJRdk' && state.youtubeVideoId !== this.youtubeVideoId) {
        this.youtubeVideoId = state.youtubeVideoId;
        this.updateYouTubeIframes(true);
      }
      this.render(state);
    });

    queueState.subscribeCall((payload) => {
      this.onTicketCallEvent(payload);
    });
  }

  startLiveClock() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    const updateClock = () => {
      const now = new Date();
      const timeElem = document.getElementById('tv-live-clock') || document.getElementById('tv-time-now');
      const dateElem = document.getElementById('tv-live-date') || document.getElementById('tv-date-now');

      if (timeElem) {
        timeElem.innerText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      }

      if (dateElem) {
        dateElem.innerText = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
      }
    };

    updateClock();
    this.clockInterval = setInterval(updateClock, 1000);
  }

  /**
   * Dedicated 1-Second Stopwatch Ticker
   * Automatically ticks all active station stopwatches and station duration breakdown chips
   */
  startStopwatchTicker() {
    if (this.stopwatchInterval) clearInterval(this.stopwatchInterval);
    
    this.stopwatchInterval = setInterval(() => {
      const now = Date.now();

      // 1. Tick Section 3 Station Duration Stopwatches (Replacing static PENDING)
      const stationPills = document.querySelectorAll('.tv-duration-pill[data-started]');
      stationPills.forEach(pill => {
        const startMs = Number(pill.getAttribute('data-started'));
        if (startMs > 0) {
          const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
          const durationStr = this.formatDuration(elapsedSec);
          const stnOrder = pill.getAttribute('data-station-order');
          const isServing = pill.getAttribute('data-is-serving') === '1' || pill.classList.contains('serving');

          if (stnOrder) {
            pill.innerText = isServing
              ? `${durationStr} • Stn ${stnOrder}`
              : `${durationStr} • Stn ${stnOrder}`;
          } else {
            pill.innerText = durationStr;
          }
        }
      });

      // 2. Tick Section 2 Live Station Time Chips (Every Station Stay Strip)
      const liveChips = document.querySelectorAll('.tv-live-station-time[data-station-started]');
      liveChips.forEach(chip => {
        const startMs = Number(chip.getAttribute('data-station-started'));
        if (startMs > 0) {
          const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
          chip.innerText = this.formatDuration(elapsedSec);
        }
      });

      // 3. Tick Hero Card Stopwatch if currently serving
      if (this.currentHeroTicket && this.currentHeroTicket.status === 'serving' && this.currentHeroStartTime) {
        const elapsedSec = Math.max(0, Math.floor((now - this.currentHeroStartTime) / 1000));
        const durationStr = this.formatDuration(elapsedSec);

        const taxpayerElem = document.getElementById('display-hero-taxpayer');
        if (taxpayerElem) {
          const priStr = this.currentHeroTicket.isPriority ? `PRIORITY ${(this.currentHeroTicket.priorityType || '').toUpperCase()} • ` : '';
          taxpayerElem.innerText = `Duration: ${durationStr} • ${priStr}Target ~10-15 mins`;
        }

        const statusPillElem = document.getElementById('display-hero-status-pill');
        if (statusPillElem) {
          statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>NOW PROCESSING (${durationStr})</span>`;
        }
      }
    }, 1000);
  }

  bindEvents() {
    const fsBtn = document.getElementById('tv-fullscreen-btn');
    if (fsBtn) {
      fsBtn.onclick = () => this.toggleFullscreen();
    }

    const popoutBtn = document.getElementById('tv-popout-window-btn');
    if (popoutBtn) {
      popoutBtn.onclick = () => {
        window.open('tv.html', 'ProvincialAssessorTV', 'width=1366,height=768,menubar=no,toolbar=no,location=no');
      };
    }

    const soundToggleBtn = document.getElementById('tv-sound-toggle-btn') || document.getElementById('tv-standalone-audio-btn');
    const audioLbl = document.getElementById('tv-standalone-audio-label');
    if (soundToggleBtn) {
      soundToggleBtn.onclick = () => {
        audioEngine.getAudioContext();
        audioEngine.isMuted = !audioEngine.isMuted;
        if (audioLbl) {
          audioLbl.innerText = audioEngine.isMuted ? 'Audio: Muted' : 'Audio: Live';
        }
        soundToggleBtn.className = audioEngine.isMuted ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm';
      };
    }

    const testSoundBtn = document.getElementById('tv-test-chime-btn');
    if (testSoundBtn) {
      testSoundBtn.onclick = () => {
        audioEngine.announceTicket(
          { ticketNumber: '1', serviceName: 'Certified True Copy of Tax Declaration' },
          { name: 'Counter 1', label: 'All Assessment Services' }
        );
      };
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        document.body.classList.add('tv-fullscreen-active');
        const fsBtn = document.getElementById('tv-fullscreen-btn');
        if (fsBtn) fsBtn.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg> <span>Exit Fullscreen</span>`;
      }).catch(err => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        document.body.classList.remove('tv-fullscreen-active');
        const fsBtn = document.getElementById('tv-fullscreen-btn');
        if (fsBtn) fsBtn.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg> <span>Fullscreen</span>`;
      });
    }
  }

  onTicketCallEvent(payload) {
    const { ticket, counter, isRecall } = payload;
    audioEngine.announceTicket(ticket, counter);

    const isRecallAction = Boolean(isRecall || payload.action === 'recall');
    const transitionClass = isRecallAction ? 'recall-transition' : 'call-next-transition';

    const heroNum = document.getElementById('display-hero-number');
    const statusPill = document.getElementById('display-hero-status-pill');

    if (heroNum) {
      heroNum.classList.remove('call-next-transition', 'recall-transition', 'pass-number-transition');
      void heroNum.offsetWidth;
      heroNum.classList.add(transitionClass);
    }

    if (statusPill && isRecallAction) {
      statusPill.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24" style="stroke: var(--colors-ink, #000000);"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span style="color:var(--colors-ink, #000000); font-weight:800;">NOW PROCESSING</span>`;
    }

    // Flash the corresponding client section card or counter card in dark mode for 1 second
    if (ticket && ticket.id) {
      this.triggerTicketCardTransition(ticket.id);
    }

    if (counter && counter.id) {
      this.triggerCounterDarkTransition(counter.id);
    }
  }

  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  formatCompactDuration(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    if (mins > 0) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    return `${secs}s`;
  }

  /**
   * Computes the station timeline and stay durations for all 5 stations
   * from the docket's stageHistory, createdAt, startedAt, and completedAt.
   */
  getStationTimeline(ticket) {
    const isSpecialWorkflow = isTransferSubdivisionReclass(ticket);

    let stages;
    if (isSpecialWorkflow) {
      stages = [
        { id: 1, key: 'review', shortName: '1. Intake', name: 'Window 1: Assessment Officer', chipLabel: 'W1', stepNum: '1' },
        { id: 3, key: 'appraisal', shortName: '3. Appraisal', name: 'Window 3: Appraisal/Assessment', chipLabel: 'W3', stepNum: '3' },
        { id: 4, key: 'approval', shortName: '4. Approval', name: 'Window 4: Provincial Assessor Approval', chipLabel: 'W4', stepNum: '4' },
        { id: 5, key: 'recording', shortName: 'Recording', name: 'Recording Desk (Assessment Roll)', chipLabel: 'Rec', stepNum: 'Rec' },
        { id: 6, key: 'releasing', shortName: '5. Release', name: 'Window 5: Document Releasing', chipLabel: 'W5', stepNum: '5' }
      ];
    } else {
      stages = [
        { id: 1, key: 'review', shortName: '1. Intake', name: 'Window 1: Assessment Officer', chipLabel: 'W1', stepNum: '1' },
        { id: 2, key: 'tax_mapping', shortName: '2. Tax Map', name: 'Window 2: Tax Mapping', chipLabel: 'W2', stepNum: '2' },
        { id: 3, key: 'appraisal', shortName: '3. Appraisal', name: 'Window 3: Appraisal/Assessment', chipLabel: 'W3', stepNum: '3' },
        { id: 4, key: 'approval', shortName: '4. Approval', name: 'Window 4: Provincial Assessor Approval', chipLabel: 'W4', stepNum: '4' },
        { id: 5, key: 'recording', shortName: 'Recording', name: 'Recording Desk (Assessment Roll)', chipLabel: 'Rec', stepNum: 'Rec' },
        { id: 6, key: 'releasing', shortName: '5. Release', name: 'Window 5: Document Releasing', chipLabel: 'W5', stepNum: '5' }
      ];
    }

    const history = (ticket.stageHistory && Array.isArray(ticket.stageHistory)) ? ticket.stageHistory : [];
    const currentStageKey = ticket.currentStage || 'review';
    const activeStageIndex = stages.findIndex(s => s.key === currentStageKey);
    const effectiveIndex = activeStageIndex >= 0 ? activeStageIndex : 0;
    const now = Date.now();

    // Map each stage key to earliest entry timestamp
    const stageEntries = {};
    const initialTime = ticket.createdAt || (history[0] && history[0].timestamp) || now;
    stageEntries['review'] = initialTime;
    stageEntries[1] = initialTime;

    history.forEach(h => {
      const stageKey = h.stage;
      if (stageKey && h.timestamp) {
        if (!stageEntries[stageKey] || h.timestamp < stageEntries[stageKey]) {
          stageEntries[stageKey] = h.timestamp;
        }
      }
    });

    return stages.map((st, idx) => {
      const order = idx + 1;
      const enteredAt = stageEntries[st.key] || null;
      const isCurrent = idx === effectiveIndex;
      const isPast = idx < effectiveIndex;

      let leftAt = null;
      let state = 'pending';
      let durationSec = 0;

      if (isPast) {
        state = 'completed';
        const nextStage = stages[idx + 1];
        if (nextStage && stageEntries[nextStage.key]) {
          leftAt = stageEntries[nextStage.key];
        } else if (enteredAt) {
          leftAt = enteredAt;
        }
        if (enteredAt && leftAt) {
          durationSec = Math.max(0, Math.floor((leftAt - enteredAt) / 1000));
        }
      } else if (isCurrent) {
        state = ticket.status === 'serving' ? 'serving' : 'active';
        const start = enteredAt || initialTime;
        if (ticket.status === 'completed' && ticket.completedAt) {
          leftAt = ticket.completedAt;
          durationSec = Math.max(0, Math.floor((leftAt - start) / 1000));
          state = 'completed';
        } else {
          leftAt = null;
          durationSec = Math.max(0, Math.floor((now - start) / 1000));
        }
      } else {
        state = 'pending';
        durationSec = 0;
      }

      return {
        id: st.id,
        order,
        stepNum: st.stepNum || `${order}`,
        chipLabel: st.chipLabel || `W${st.id || order}`,
        key: st.key,
        name: st.name,
        shortName: st.shortName || st.name,
        state,
        enteredAt: enteredAt || (isCurrent ? initialTime : null),
        leftAt,
        durationSec,
        formattedDuration: durationSec > 0 ? this.formatCompactDuration(durationSec) : '--'
      };
    });
  }

  render(stateData = null) {
    const state = stateData || queueState.getRawState() || {};
    const tickets = state.tickets || [];
    const counters = (state.counters && state.counters.length > 0) ? state.counters : DEFAULT_COUNTERS;
    const decisions = state.recentDecisions || [];

    const callingTicket = tickets.filter(t => t.status === 'calling').sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))[0];
    const servingTicket = tickets.filter(t => t.status === 'serving').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
    const activeHeroTicket = callingTicket || servingTicket || state.lastCalledTicket;

    this.renderHeroSpotlight(activeHeroTicket, callingTicket, tickets);
    this.renderDecisionsFeed(decisions, tickets);
    this.renderCountersMatrix(counters, tickets);
  }

  renderHeroSpotlight(ticket, callingTicket, allTickets = []) {
    const numElem = document.getElementById('display-hero-number');
    const serviceElem = document.getElementById('display-hero-service');
    const counterBoxElem = document.getElementById('display-hero-counter');
    const taxpayerElem = document.getElementById('display-hero-taxpayer');
    const statusPillElem = document.getElementById('display-hero-status-pill');
    const heroCard = document.getElementById('display-hero-card');

    // 1. ACTIVE CALLING TICKET
    if (callingTicket) {
      const isNewHero = callingTicket.id !== this.prevHeroTicketId;
      this.prevHeroTicketId = callingTicket.id;
      this.currentHeroTicket = callingTicket;
      this.currentHeroStartTime = null;

      const clientName = callingTicket.clientName || 'Juan Dela Cruz';
      const stageName = callingTicket.currentStageName || 'Document Review & Receiving';
      const stageStatusStr = (callingTicket.stageStatus || 'Summoned').replace(/_/g, ' ').toUpperCase();
      const pinStr = callingTicket.taxDecPin ? `PIN: ${callingTicket.taxDecPin} • ` : '';
      const timeStr = callingTicket.createdAt ? new Date(callingTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      if (heroCard) heroCard.style.display = 'flex';
      if (numElem) {
        numElem.innerText = '#' + callingTicket.ticketNumber;
        if (isNewHero) {
          numElem.classList.remove('pass-number-transition', 'call-next-transition', 'recall-transition');
          void numElem.offsetWidth;
          numElem.classList.add('call-next-transition');
        }
      }
      if (serviceElem) {
        serviceElem.innerHTML = `
          <div class="tv-hero-client-name">${clientName}</div>
          <div class="tv-hero-service-name">${callingTicket.serviceName}</div>
        `;
      }
      if (taxpayerElem) {
        const priStr = callingTicket.isPriority ? `PRIORITY ${(callingTicket.priorityType || '').toUpperCase()} • ` : '';
        const arriveStr = timeStr ? ` • Arrived: ${timeStr}` : '';
        taxpayerElem.innerText = `${priStr}${pinStr}Stage: ${stageName}${arriveStr}`;
      }

      if (counterBoxElem) {
        const isReleasing = callingTicket.currentStage === 'releasing' || callingTicket.stageStatus === 'ready_for_release';
        const isRecording = callingTicket.currentStage === 'recording';
        let displayStn = (callingTicket.counterName || '').toUpperCase();
        let displayOfficer = callingTicket.officer || '';
        if (isReleasing) {
          displayStn = 'WINDOW 5 (DOCUMENT RELEASING)';
          displayOfficer = displayOfficer || 'Mark Anthony Ramos (Releasing Officer)';
        } else if (isRecording) {
          displayStn = 'RECORDING DESK (ASSESSMENT ROLL)';
          displayOfficer = displayOfficer || 'Carla Reyes (Records Officer)';
        } else {
          displayStn = displayStn || 'WINDOW 1 (INTAKE)';
          displayOfficer = displayOfficer || 'Maria Santos (Assessment Officer)';
        }
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">CURRENT STATION</div>
          <div class="tv-hero-counter-name">${displayStn}</div>
          <div class="tv-hero-counter-officer">${displayOfficer}</div>
        `;
      }

      if (statusPillElem) {
        const isReleasing = callingTicket.currentStage === 'releasing' || callingTicket.stageStatus === 'ready_for_release';
        const isRecording = callingTicket.currentStage === 'recording';
        statusPillElem.style.display = 'inline-flex';
        let pillText = `NOW AT ${(callingTicket.counterName || 'WINDOW 1').toUpperCase()}`;
        if (isReleasing) {
          pillText = 'READY FOR RELEASE AT WINDOW 5';
        } else if (isRecording) {
          pillText = 'NOW AT RECORDING DESK';
        }
        statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>${pillText}</span>`;
      }
      return;
    }

    // 2. ACTIVE SERVING / LAST CALLED TICKET
    if (ticket && (ticket.status === 'serving' || ticket.status === 'calling')) {
      const isNewHero = ticket.id !== this.prevHeroTicketId;
      this.prevHeroTicketId = ticket.id;
      this.currentHeroTicket = ticket;
      this.currentHeroStartTime = ticket.startedAt || ticket.calledAt || ticket.createdAt || Date.now();

      const clientName = ticket.clientName || 'Juan Dela Cruz';
      const stageName = ticket.currentStageName || 'Document Review & Receiving';
      const stageStatusStr = (ticket.stageStatus || 'In Progress').replace(/_/g, ' ').toUpperCase();
      const pinStr = ticket.taxDecPin ? `PIN: ${ticket.taxDecPin} • ` : '';
      const timeStr = ticket.createdAt ? new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      if (heroCard) heroCard.style.display = 'flex';
      if (numElem) {
        numElem.innerText = '#' + ticket.ticketNumber;
        if (isNewHero) {
          numElem.classList.remove('pass-number-transition', 'call-next-transition', 'recall-transition');
          void numElem.offsetWidth;
          numElem.classList.add('pass-number-transition');
        }
      }

      const elapsedSec = Math.max(0, Math.floor((Date.now() - this.currentHeroStartTime) / 1000));
      const durationStr = this.formatDuration(elapsedSec);

      if (serviceElem) {
        serviceElem.innerHTML = `
          <div class="tv-hero-client-name">${clientName}</div>
          <div class="tv-hero-service-name">${ticket.serviceName}</div>
        `;
      }
      
      if (taxpayerElem) {
        const priStr = ticket.isPriority ? `PRIORITY ${(ticket.priorityType || '').toUpperCase()} • ` : '';
        const arriveStr = timeStr ? ` • Arrived: ${timeStr}` : '';
        taxpayerElem.innerText = `Duration: ${durationStr} • ${priStr}${pinStr}Stage: ${stageName}${arriveStr}`;
      }

      if (counterBoxElem) {
        let displayStn = (ticket.counterName || '').toUpperCase();
        let displayOfficer = ticket.officer || '';
        if (ticket.currentStage === 'releasing' || ticket.stageStatus === 'ready_for_release') {
          displayStn = displayStn || 'WINDOW 5 (RELEASING)';
          displayOfficer = displayOfficer || 'Mark Anthony Ramos (Window 5)';
        } else if (ticket.currentStage === 'recording') {
          displayStn = displayStn || 'RECORDING DESK';
          displayOfficer = displayOfficer || 'Carla Reyes (System Encoding & Roll)';
        } else {
          displayStn = displayStn || 'STATION 1';
          displayOfficer = displayOfficer || 'Assessment Officer';
        }
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">CURRENTLY PROCESSING AT</div>
          <div class="tv-hero-counter-name">${displayStn}</div>
          <div class="tv-hero-counter-officer">${displayOfficer}</div>
        `;
      }
      if (statusPillElem) {
        const isReleasing = ticket.currentStage === 'releasing' || ticket.stageStatus === 'ready_for_release';
        statusPillElem.style.display = 'inline-flex';
        statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>${isReleasing ? `RELEASING (${durationStr})` : `PROCESSING (${durationStr})`}</span>`;
      }
      return;
    }

    // 3. STANDBY QUEUE BANNER
    this.currentHeroTicket = null;
    this.currentHeroStartTime = null;
    this.prevHeroTicketId = null;

    const waitingCount = allTickets.filter(t => t.status === 'waiting' || t.status === 'serving').length;
    if (heroCard) {
      heroCard.style.display = 'flex';
      if (numElem) numElem.innerText = waitingCount > 0 ? `${waitingCount}` : 'READY';
      if (serviceElem) serviceElem.innerHTML = waitingCount > 0 
        ? `<div class="tv-hero-client-name">${waitingCount} Active Citizen Docket(s)</div><div class="tv-hero-service-name">Moving Through Workflow Stations</div>`
        : `<div class="tv-hero-client-name">Ready for Next Taxpayer</div><div class="tv-hero-service-name">Provincial Assessor's Office • All Stations Active</div>`;
      if (taxpayerElem) {
        taxpayerElem.innerText = '1. Assessment Officer • 2. Tax Mapping • 3. Appraisal/Assessment • 4. Approval • Recording • 5. Releasing';
      }
      if (counterBoxElem) {
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">WORKFLOW STATUS</div>
          <div class="tv-hero-counter-name">ALL STATIONS</div>
          <div class="tv-hero-counter-officer">Active & Ready</div>
        `;
      }
      if (statusPillElem) {
        statusPillElem.style.display = 'none';
        statusPillElem.innerHTML = '';
      }
    }
  }

  renderDecisionsFeed(decisions, fallbackTickets = []) {
    const container = document.getElementById('display-recent-grid');
    if (!container) return;

    let items = (decisions && decisions.length > 0) ? decisions.slice(0, 4) : [];

    // Fallback: If no logged decisions yet, but tickets are active in workflow, synthesize recent activity
    if (items.length === 0 && fallbackTickets && fallbackTickets.length > 0) {
      const activeTickets = fallbackTickets.filter(t => t.status === 'serving' || t.status === 'calling' || t.status === 'completed');
      if (activeTickets.length > 0) {
        items = activeTickets.slice(0, 4).map(t => ({
          ticketNumber: t.ticketNumber,
          clientName: t.clientName || 'Taxpayer',
          serviceName: t.serviceName || 'Assessment Service',
          counterName: t.counterName || (t.currentStageName ? t.currentStageName : 'Station 1'),
          decisionType: t.status === 'serving' ? 'serving' : (t.status === 'calling' ? 'called' : 'completed'),
          decisionLabel: t.status === 'serving' ? 'IN-SERVICE' : (t.status === 'calling' ? 'CALLED' : 'COMPLETED'),
          timestamp: t.startedAt || t.calledAt || t.completedAt || t.createdAt || Date.now(),
          serviceSeconds: t.serviceSeconds || 0,
          isPriority: t.isPriority
        }));
      }
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="tv-recent-empty">
          <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24" style="stroke: currentColor; width: 14px; height: 14px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>Real-time workflow audit feed active • Waiting for station logs</span>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(d => {
      const timeStr = d.timestamp ? new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      
      let badgeLabel = 'ACTION';
      let badgeClass = 'default';

      const dType = (d.decisionType || '').toLowerCase();
      const dLabel = (d.decisionLabel || '').toUpperCase();

      if (dType === 'called' || dLabel === 'CALLED') {
        badgeLabel = 'CALLED';
        badgeClass = 'called';
      } else if (dType === 'serving' || dLabel === 'IN-SERVICE' || dLabel === 'SERVING') {
        badgeLabel = 'SERVING';
        badgeClass = 'serving';
      } else if (dType === 'forwarded' || dLabel.includes('FORWARDED') || dLabel.includes('ENDORSED')) {
        badgeLabel = 'ENDORSED';
        badgeClass = 'forwarded';
      } else if (dType === 'completed' || dLabel === 'COMPLETED' || dLabel === 'RELEASED') {
        badgeLabel = 'RELEASED';
        badgeClass = 'completed';
      } else if (dType === 'noshow' || dLabel === 'NO-SHOW') {
        badgeLabel = 'NO-SHOW';
        badgeClass = 'noshow';
      } else if (dType === 'transferred' || dLabel === 'TRANSFERRED') {
        badgeLabel = 'TRANSFERRED';
        badgeClass = 'transferred';
      } else {
        badgeLabel = d.decisionLabel || 'ACTION';
        badgeClass = 'default';
      }

      // Station / Target Station formatting
      let stnDisplay = d.counterName || 'Station';
      if (dType === 'forwarded') {
        if (d.notes && d.notes.toLowerCase().includes('endorsed to')) {
          stnDisplay = d.notes.replace(/Endorsed to /i, '→ ');
        } else if (d.counterName) {
          stnDisplay = `→ ${d.counterName}`;
        }
      }

      const clientStr = d.clientName ? `${d.clientName}` : 'Citizen';
      const svcStr = d.serviceName || 'Assessment';
      let durationTag = '';
      if (dType === 'completed' && d.serviceSeconds > 0) {
        const m = Math.floor(d.serviceSeconds / 60);
        const s = d.serviceSeconds % 60;
        durationTag = ` • ⏱ ${m}m ${s}s`;
      }

      return `
        <div class="tv-recent-item-row">
          <div class="tv-recent-row-left">
            <span class="tv-recent-badge ${badgeClass}">${badgeLabel}</span>
            <span class="tv-recent-pass">#${d.ticketNumber}</span>
            ${d.isPriority ? '<span class="tag-badge accent" style="font-size: 8.5px; padding: 1px 4px; font-weight: 800;">PRI</span>' : ''}
            <span class="tv-recent-citizen" title="${clientStr}">${clientStr}</span>
            <span class="tv-recent-svc" title="${svcStr}">• ${svcStr}${durationTag}</span>
          </div>
          <div class="tv-recent-row-right">
            <span class="tv-recent-station-pill" title="${stnDisplay}">${stnDisplay}</span>
            <span class="tv-recent-time">${timeStr}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  triggerTicketCardTransition(ticketId) {
    if (!ticketId) return;
    const cards = document.querySelectorAll('.tv-client-section-card');
    const targetCard = Array.from(cards).find(c => c.getAttribute('data-ticket-id') == String(ticketId));
    if (targetCard) {
      targetCard.classList.remove('counter-dark-mode-transition');
      void targetCard.offsetWidth;
      targetCard.classList.add('counter-dark-mode-transition');
      setTimeout(() => {
        targetCard.classList.remove('counter-dark-mode-transition');
      }, 1000);
    }
  }

  triggerCounterDarkTransition(counterId) {
    if (!counterId) return;
    const counterCards = document.querySelectorAll('.tv-counter-card, .tv-client-section-card');
    const targetCard = Array.from(counterCards).find(c =>
      c.getAttribute('data-counter-id') == String(counterId) ||
      c.getAttribute('data-ticket-id') == String(counterId) ||
      c.querySelector('.tv-counter-title')?.innerText?.includes(`Station ${counterId}`) ||
      c.querySelector('.tv-counter-title')?.innerText?.includes(`Counter ${counterId}`) ||
      c.querySelector('.tv-client-station-badge')?.innerText?.includes(`Station ${counterId}`)
    );
    if (targetCard) {
      targetCard.classList.remove('counter-dark-mode-transition');
      void targetCard.offsetWidth;
      targetCard.classList.add('counter-dark-mode-transition');
      setTimeout(() => {
        targetCard.classList.remove('counter-dark-mode-transition');
      }, 1000);
    }
  }

  triggerStationMoveTransition(ticketId, newStationName, stageName) {
    if (!ticketId) return;
    const cards = document.querySelectorAll('.tv-client-section-card');
    const targetCard = Array.from(cards).find(c => c.getAttribute('data-ticket-id') == String(ticketId));
    if (targetCard) {
      targetCard.classList.remove('tv-station-moved-active');
      void targetCard.offsetWidth;
      targetCard.classList.add('tv-station-moved-active');

      const stationBadge = targetCard.querySelector('.tv-client-station-badge');
      if (stationBadge) {
        stationBadge.classList.remove('is-moved-badge');
        void stationBadge.offsetWidth;
        stationBadge.classList.add('is-moved-badge');
      }

      let movedPill = targetCard.querySelector('.tv-station-moved-pill');
      if (!movedPill) {
        movedPill = document.createElement('div');
        movedPill.className = 'tv-station-moved-pill';
        targetCard.appendChild(movedPill);
      }
      movedPill.innerHTML = `
        <span class="tv-moved-dot"></span>
        <span>FORWARDED TO ${(newStationName || 'NEXT STATION').toUpperCase()}</span>
      `;
      movedPill.style.display = 'inline-flex';

      try {
        audioEngine.playChime();
      } catch (e) {}

      setTimeout(() => {
        targetCard.classList.remove('tv-station-moved-active');
        if (movedPill) movedPill.style.display = 'none';
        if (stationBadge) stationBadge.classList.remove('is-moved-badge');
      }, 3500);
    }
  }

  getTicketStatusUpdateTime(ticket) {
    let latestActionTime = 0;
    let hasAction = false;

    if (ticket.stageHistory && Array.isArray(ticket.stageHistory) && ticket.stageHistory.length > 0) {
      for (const h of ticket.stageHistory) {
        const ts = Number(h.timestamp) || 0;
        if (ts > latestActionTime) {
          latestActionTime = ts;
          if (h.status !== 'received' || (h.officer && !h.officer.includes('Kiosk'))) {
            hasAction = true;
          }
        }
      }
    }

    if (ticket.startedAt && Number(ticket.startedAt) > latestActionTime) {
      latestActionTime = Number(ticket.startedAt);
      hasAction = true;
    }
    if (ticket.calledAt && Number(ticket.calledAt) > latestActionTime) {
      latestActionTime = Number(ticket.calledAt);
      hasAction = true;
    }
    if (ticket.updatedAt && Number(ticket.updatedAt) > latestActionTime) {
      latestActionTime = Number(ticket.updatedAt);
      hasAction = true;
    }

    if (ticket.stageStatus && ticket.stageStatus !== 'pending') {
      hasAction = true;
    }
    if (ticket.status && ticket.status !== 'waiting') {
      hasAction = true;
    }

    return {
      hasAction,
      updateTime: latestActionTime || Number(ticket.createdAt) || 0,
      createdAt: Number(ticket.createdAt) || 0
    };
  }

  triggerRealtimeStatusUpdate(ticketId, ticket, newStationName, stageName) {
    if (!ticketId) return;
    const cards = document.querySelectorAll('.tv-client-section-card');
    const targetCard = Array.from(cards).find(c => c.getAttribute('data-ticket-id') == String(ticketId));
    if (targetCard) {
      targetCard.classList.remove('tv-realtime-update-active', 'tv-station-moved-active');
      void targetCard.offsetWidth;
      targetCard.classList.add('tv-realtime-update-active');

      const stationBadge = targetCard.querySelector('.tv-client-station-badge');
      if (stationBadge) {
        stationBadge.classList.remove('is-moved-badge');
        void stationBadge.offsetWidth;
        stationBadge.classList.add('is-moved-badge');
      }

      let updatePill = targetCard.querySelector('.tv-realtime-update-pill');
      if (!updatePill) {
        updatePill = document.createElement('div');
        updatePill.className = 'tv-realtime-update-pill';
        targetCard.appendChild(updatePill);
      }

      const stageStatusText = (ticket.stageStatus || 'UPDATED').replace(/_/g, ' ').toUpperCase();
      const isReleasing = ticket.currentStage === 'releasing' || ticket.stageStatus === 'ready_for_release';
      const labelText = isReleasing ? 'READY FOR RELEASE (WINDOW 5)' : `${stageName.toUpperCase()} • ${stageStatusText}`;

      updatePill.innerHTML = `
        <span class="tv-update-pulse-dot"></span>
        <span>${labelText}</span>
      `;
      updatePill.style.display = 'inline-flex';

      const grid = document.getElementById('display-counters-grid');
      if (grid && grid.scrollTop > 10) {
        grid.scrollTo({ top: 0, behavior: 'smooth' });
      }

      try {
        audioEngine.playChime();
      } catch (e) {}

      setTimeout(() => {
        targetCard.classList.remove('tv-realtime-update-active');
        if (updatePill) updatePill.style.display = 'none';
        if (stationBadge) stationBadge.classList.remove('is-moved-badge');
      }, 4000);
    }
  }

  renderCountersMatrix(counters, tickets) {
    const container = document.getElementById('display-counters-grid');
    if (!container) return;

    if (!this.prevTicketStateKeys) this.prevTicketStateKeys = {};

    // 1. Filter all active citizen dockets currently in workflow
    const activeTickets = (tickets || []).filter(t => t.status !== 'completed' && t.status !== 'noshow');

    // Update active counters badges on TV header and index.html
    const activeCountText = `${activeTickets.length} ACTIVE ${activeTickets.length === 1 ? 'DOCKET' : 'DOCKETS'}`;
    const activeBadge = document.getElementById('tv-active-count-badge');
    if (activeBadge) {
      activeBadge.innerText = activeCountText;
    }
    const indexActiveBadge = document.getElementById('display-active-client-count');
    if (indexActiveBadge) {
      indexActiveBadge.innerText = activeCountText;
    }

    // 2. Handle empty state if no active client dockets
    if (activeTickets.length === 0) {
      container.innerHTML = `
        <div class="tv-client-empty-state">
          <div class="tv-client-empty-icon">
            <svg class="icon-svg icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <div class="tv-client-empty-title">All Citizen Dockets Processed</div>
          <div class="tv-client-empty-desc">No taxpayer dockets currently in workflow. Ready to receive walk-in clients at Station 1 (Document Review & Receiving).</div>
        </div>
      `;
      return;
    }

    // 3. Dynamic Real-Time Sorting: Move clients whose status updates in real-time to the TOP
    const sortedTickets = [...activeTickets].sort((a, b) => {
      // Actively ringing/calling tickets stay at the top
      if (a.status === 'calling' && b.status !== 'calling') return -1;
      if (b.status === 'calling' && a.status !== 'calling') return 1;

      const infoA = this.getTicketStatusUpdateTime(a);
      const infoB = this.getTicketStatusUpdateTime(b);

      // Both have real-time updates: the most recently updated client is on top
      if (infoA.hasAction && infoB.hasAction) {
        if (infoA.updateTime !== infoB.updateTime) {
          return infoB.updateTime - infoA.updateTime; // Descending: latest update first
        }
      }

      // One has an update and the other is still waiting initial intake:
      if (infoA.hasAction && !infoB.hasAction) return -1;
      if (!infoA.hasAction && infoB.hasAction) return 1;

      // Both are awaiting initial intake: priority lane first, then arrival time FIFO
      if (a.isPriority !== b.isPriority) {
        return b.isPriority ? 1 : -1;
      }
      return (infoA.createdAt || 0) - (infoB.createdAt || 0);
    });

    // Remove empty state banner if present
    const emptyBanner = container.querySelector('.tv-client-empty-state');
    if (emptyBanner) emptyBanner.remove();

    // Remove cards that are no longer active
    const activeTicketIdSet = new Set(sortedTickets.map(t => String(t.id)));
    const existingCards = container.querySelectorAll('.tv-client-section-card');
    existingCards.forEach(card => {
      const tId = card.getAttribute('data-ticket-id');
      if (tId && !activeTicketIdSet.has(tId)) {
        card.remove();
      }
    });

    // Remove legacy counter cards if any exist
    const legacyCards = container.querySelectorAll('.tv-counter-card');
    legacyCards.forEach(c => c.remove());

    // Map stages for lookup
    const stageMap = {};
    (STAGE_DEFINITIONS || []).forEach(sd => {
      stageMap[sd.key] = sd;
      stageMap[sd.id] = sd;
    });

    // 4. Render or update each Client Section Card
    sortedTickets.forEach((ticket) => {
      const isCalling = ticket.status === 'calling';
      const isServing = ticket.status === 'serving';

      // Find current station and stage info
      const counterId = ticket.counterId || (ticket.currentStage ? (stageMap[ticket.currentStage]?.id || 1) : 1);
      const station = (counters || []).find(c => c.id === counterId) || (DEFAULT_COUNTERS || []).find(c => c.id === counterId) || {
        id: counterId,
        name: `Station ${counterId}`,
        shortName: `Station ${counterId}`,
        officer: ticket.officer || 'Assessment Staff'
      };

      const currentStageKey = ticket.currentStage || (station.key || 'review');
      const stageDef = stageMap[currentStageKey] || stageMap[counterId] || { id: counterId, order: counterId, name: station.name, shortName: station.shortName || station.name };

      // Calculate station timeline and stay durations for this ticket
      const timeline = this.getStationTimeline(ticket);
      const totalStagesForTicket = timeline.length;
      const activeStation = timeline.find(s => s.key === currentStageKey) || timeline[0];
      const stageOrder = activeStation.order || stageDef.order || 1;
      const stagePct = Math.round((stageOrder / totalStagesForTicket) * 100);
      const startTime = activeStation.enteredAt || ticket.startedAt || ticket.calledAt || ticket.createdAt || Date.now();
      const stationElapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));

      // Track real-time status signature change
      if (!this.prevTicketSignatures) this.prevTicketSignatures = {};
      const currentSignature = `${ticket.status}:${ticket.currentStage}:${ticket.stageStatus}:${counterId}:${ticket.startedAt || 0}`;
      const prevSignature = this.prevTicketSignatures[ticket.id];
      const isStatusChanged = prevSignature !== undefined && prevSignature !== currentSignature;
      this.prevTicketSignatures[ticket.id] = currentSignature;

      let card = container.querySelector(`.tv-client-section-card[data-ticket-id="${ticket.id}"]`);
      if (!card) {
        card = document.createElement('div');
        card.setAttribute('data-ticket-id', ticket.id);
      }
      // Re-append card in sorted order to ensure DOM order matches sortedTickets exactly!
      container.appendChild(card);

      card.setAttribute('data-counter-id', counterId);
      card.className = `tv-client-section-card ${isServing ? 'is-serving' : ''} ${ticket.status === 'waiting' ? 'is-waiting' : ''} ${ticket.isPriority ? 'is-priority-ticket' : ''} ${card.classList.contains('tv-realtime-update-active') ? 'tv-realtime-update-active' : ''} ${card.classList.contains('tv-station-moved-active') ? 'tv-station-moved-active' : ''} ${card.classList.contains('counter-dark-mode-transition') ? 'counter-dark-mode-transition' : ''}`;

      // Live Status Pill & Running Station Stopwatch Badge
      let statusBadgeHtml = '';
      if (ticket.status === 'completed') {
        statusBadgeHtml = `
          <span class="tv-duration-pill completed" style="background:#525252; color:#ffffff; font-weight:800; font-size:13.5px; padding:6px 14px; border-radius:9999px; letter-spacing:0.3px; display:inline-flex; align-items:center; gap:6px;">
            <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>RELEASED</span>
          </span>
        `;
      } else if (isServing) {
        statusBadgeHtml = `
          <span class="tv-duration-pill serving station-timer" data-started="${startTime}" data-ticket-id="${ticket.id}" data-station-order="${stageOrder}" data-is-serving="1" style="background:#000000; color:#ffffff; font-weight:800; font-size:13.5px; padding:6px 14px; border-radius:9999px; letter-spacing:0.3px; border: 1px solid #404040; display:inline-flex; align-items:center; gap:6px;">
            <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>${this.formatDuration(stationElapsedSec)} • ${activeStation.chipLabel || `Stn ${stageOrder}`}</span>
          </span>
        `;
      } else {
        // Automatically runs the time stayed in this station
        statusBadgeHtml = `
          <span class="tv-duration-pill active station-timer" data-started="${startTime}" data-ticket-id="${ticket.id}" data-station-order="${stageOrder}" data-is-serving="0" style="background:#171717; color:#ffffff; font-weight:800; font-size:13.5px; padding:6px 14px; border-radius:9999px; letter-spacing:0.3px; border: 1px solid #333333; display:inline-flex; align-items:center; gap:6px;">
            <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>${this.formatDuration(stationElapsedSec)} • ${activeStation.chipLabel || `Stn ${stageOrder}`}</span>
          </span>
        `;
      }

      // Priority tag
      let priBadgeHtml = '';
      if (ticket.isPriority) {
        const priLabel = (ticket.priorityType || 'PRIORITY').toUpperCase();
        priBadgeHtml = `<span class="tag-badge accent" style="font-size:11.5px; padding:2px 8px; font-weight:800; border-radius:6px; letter-spacing:0.5px; display:inline-flex; align-items:center; gap:4px;"><svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg><span>${priLabel}</span></span>`;
      }

      const clientName = ticket.clientName || 'Juan Dela Cruz';
      const serviceName = ticket.serviceName || 'Real Property Tax Assessment';
      const timeArrivedStr = ticket.createdAt ? new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      
      const elapsedOfficeMin = ticket.createdAt ? Math.max(1, Math.round((Date.now() - ticket.createdAt) / 60000)) : 1;
      const officeTimeStr = `${elapsedOfficeMin}m in office`;

      const isReleasingDocket = currentStageKey === 'releasing' || ticket.stageStatus === 'ready_for_release';
      const isRecordingDocket = currentStageKey === 'recording';
      let stationDisplayName = station.name || `Station ${counterId}`;
      let officerName = station.officer || ticket.officer || 'Assessor Staff';
      if (isReleasingDocket) {
        stationDisplayName = 'Window 5: Document Releasing';
        officerName = ticket.officer || 'Mark Anthony Ramos (Releasing Officer)';
      } else if (isRecordingDocket) {
        stationDisplayName = 'Recording Desk: System Encoding & Roll';
        officerName = ticket.officer || 'Carla Reyes (Records Officer)';
      }

      // Visual Flow Pipeline & Step Chips
      const isSpecialWorkflow = isTransferSubdivisionReclass(ticket);
      const workflowSequenceText = isSpecialWorkflow
        ? '1 (Intake) → 3 (Appraisal) → 4 (Approval) → Recording → 5 (Release)'
        : '1 (Intake) → 2 (Tax Map) → 3 (Appraisal) → 4 (Approval) → Recording → 5 (Release)';

      const pipelineStepsHtml = timeline.map((st, idx) => {
        const isCurrent = st.state === 'active' || st.state === 'serving';
        const isDone = st.state === 'completed';
        let timeTag = '';
        if (isDone && st.durationSec > 0) {
          timeTag = `<span class="step-time">(${st.formattedDuration})</span>`;
        } else if (isCurrent) {
          timeTag = `<span class="step-time">(${this.formatDuration(stationElapsedSec)})</span>`;
        }
        const arrow = idx < timeline.length - 1 ? '<span class="tv-flow-arrow">→</span>' : '';
        return `
          <div class="tv-flow-step ${st.state}" title="${st.name || st.shortName}: ${st.state.toUpperCase()}">
            <span class="step-circle">${st.stepNum || (idx + 1)}</span>
            <span class="step-name">${st.shortName}</span>
            ${timeTag}
          </div>
          ${arrow}
        `;
      }).join('');

      card.innerHTML = `
        <div class="tv-docket-card-inner">
          <!-- ROW 1: Identity & Station Header -->
          <div class="tv-docket-row-header">
            <div class="tv-docket-client-identity">
              <span class="tv-docket-num">#${ticket.ticketNumber}</span>
              ${priBadgeHtml}
              <span class="tv-docket-name" title="${clientName}">${clientName}</span>
            </div>
            <div class="tv-docket-station-info">
              <div class="tv-client-station-badge tv-docket-station-badge">
                <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                <span>${stationDisplayName}</span>
              </div>
              <span class="tv-docket-officer" title="${officerName}">${officerName}</span>
            </div>
          </div>

          <!-- ROW 2: Visual Workflow Pipeline & Stepper -->
          <div class="tv-docket-flow-container">
            <div class="tv-docket-flow-pipeline">
              ${pipelineStepsHtml}
            </div>
            <div class="tv-client-progress-meta">
              <span class="tv-client-stage-label">Flow: ${workflowSequenceText} • Active: <strong>${activeStation.shortName || activeStation.name}</strong></span>
              <span class="tv-client-stage-pct">${stagePct}% Complete</span>
            </div>
          </div>

          <!-- ROW 3: Service Details & Live Status Stopwatch -->
          <div class="tv-docket-row-footer">
            <div class="tv-docket-service-meta">
              <span class="tv-docket-service" title="${serviceName}">${serviceName}</span>
              ${ticket.taxDecPin ? `<span class="tv-client-pin" title="PIN: ${ticket.taxDecPin}">PIN: ${ticket.taxDecPin}</span>` : ''}
              <span class="tv-docket-arrival">
                <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                Arrived ${timeArrivedStr} (${officeTimeStr})
              </span>
            </div>
            <div class="tv-docket-status-wrap">
              ${statusBadgeHtml}
            </div>
          </div>
        </div>
      `;

      if (isStatusChanged) {
        this.triggerRealtimeStatusUpdate(ticket.id, ticket, stationDisplayName, stageDef.shortName || stageDef.name);
      }
    });
  }
}

export const displayController = new DisplayController();
