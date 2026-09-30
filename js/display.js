/**
 * Public TV Display / Digital Signage Controller
 * Handles digital signage telemetry, hero spotlight, LIVE COUNTER DECISIONS FEED, 3-window matrix with LIVE SERVICE DURATION STOPWATCH, live clock, and audio.
 * Configuration:
 * - Counter 1: All Assessment Services
 * - Counter 2: Priority Lane & All Services
 * - Counter 3: All Assessment Services
 */

import { queueState, DEFAULT_COUNTERS, STAGE_DEFINITIONS, SERVICES } from './state.js';
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
    this.maxVisibleDockets = 4;
    this.currentOverflowTab = 'overflow';
    this.isAutoPopupEnabled = true;
    this.autoPopupCycleTimer = null;
    this.autoCloseTimer = null;
    this.latestOverflowTickets = [];
    this.latestAllTickets = [];
    this.lastCounters = [];
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

  getServiceEstimation(ticket) {
    if (!ticket) return '';
    if (ticket.estimation) return ticket.estimation;
    const sId = ticket.serviceId || ticket.serviceCode;
    const srv = (SERVICES || []).find(s => s.id === sId || s.code === sId || s.name === ticket.serviceName);
    return srv && srv.estimation ? srv.estimation : '';
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
          const estStr = this.getServiceEstimation(this.currentHeroTicket);
          const priStr = this.currentHeroTicket.isPriority ? `PRIORITY ${(this.currentHeroTicket.priorityType || '').toUpperCase()} • ` : '';
          const pinStr = this.currentHeroTicket.taxDecPin ? `PIN: ${this.currentHeroTicket.taxDecPin} • ` : '';
          const stageName = this.currentHeroTicket.currentStageName || 'Document Review & Receiving';
          const estDisplay = estStr ? ` • Est: ${estStr}` : '';
          taxpayerElem.innerText = `Duration: ${durationStr} • ${priStr}${pinStr}Stage: ${stageName}${estDisplay}`;
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

    // Close overflow modal on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeOverflowModal();
    });

    const overflowModal = document.getElementById('tv-overflow-modal');
    if (overflowModal) {
      overflowModal.addEventListener('click', (e) => {
        if (e.target === overflowModal) this.closeOverflowModal();
      });
      const box = overflowModal.querySelector('.modal-box');
      if (box) {
        box.addEventListener('mouseenter', () => {
          if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
          }
        });
      }
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
    const stages = (STAGE_DEFINITIONS && STAGE_DEFINITIONS.length) ? STAGE_DEFINITIONS : [
      { id: 1, key: 'review', shortName: 'Assessment Officer' },
      { id: 2, key: 'tax_mapping', shortName: 'Tax Mapping' },
      { id: 3, key: 'appraisal', shortName: 'Appraisal/Assessment' },
      { id: 4, key: 'approval', shortName: 'Approval' },
      { id: 5, key: 'releasing', shortName: 'Releasing' }
    ];

    const history = (ticket.stageHistory && Array.isArray(ticket.stageHistory)) ? ticket.stageHistory : [];
    const currentCounterId = ticket.counterId || (ticket.currentStage ? (stages.find(s => s.key === ticket.currentStage)?.id || 1) : 1);
    const now = Date.now();

    // Map each stage key and order to earliest entry timestamp
    const stageEntries = {};

    // Initial station 1 intake entry
    const initialTime = ticket.createdAt || (history[0] && history[0].timestamp) || now;
    stageEntries['review'] = initialTime;
    stageEntries[1] = initialTime;

    // Scan stageHistory for stage transitions
    history.forEach(h => {
      const stageKey = h.stage;
      if (stageKey && h.timestamp) {
        if (!stageEntries[stageKey] || h.timestamp < stageEntries[stageKey]) {
          stageEntries[stageKey] = h.timestamp;
        }
        const stageDef = stages.find(s => s.key === stageKey);
        if (stageDef) {
          if (!stageEntries[stageDef.id] || h.timestamp < stageEntries[stageDef.id]) {
            stageEntries[stageDef.id] = h.timestamp;
          }
        }
      }
    });

    return stages.map((st, idx) => {
      const order = idx + 1;
      const enteredAt = stageEntries[st.key] || stageEntries[order] || null;
      const isCurrent = order === currentCounterId;
      const isPast = order < currentCounterId;

      let leftAt = null;
      let state = 'pending';
      let durationSec = 0;

      if (isPast) {
        state = 'completed';
        const nextStage = stages[idx + 1];
        if (nextStage && (stageEntries[nextStage.key] || stageEntries[nextStage.id])) {
          leftAt = stageEntries[nextStage.key] || stageEntries[nextStage.id];
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
        const estStr = this.getServiceEstimation(callingTicket);
        const priStr = callingTicket.isPriority ? `PRIORITY ${(callingTicket.priorityType || '').toUpperCase()} • ` : '';
        const arriveStr = timeStr ? ` • Arrived: ${timeStr}` : '';
        const estDisplay = estStr ? ` • Est: ${estStr}` : '';
        taxpayerElem.innerText = `${priStr}${pinStr}Stage: ${stageName}${arriveStr}${estDisplay}`;
      }

      if (counterBoxElem) {
        const isReleasing = callingTicket.currentStage === 'releasing' || callingTicket.stageStatus === 'ready_for_release';
        const displayStn = isReleasing ? 'WINDOW 1 (RELEASING)' : (callingTicket.counterName || 'STATION 1').toUpperCase();
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">CURRENT STATION</div>
          <div class="tv-hero-counter-name">${displayStn}</div>
          <div class="tv-hero-counter-officer">${callingTicket.officer || (isReleasing ? 'Maria Santos (Assessment & Releasing)' : 'Maria Santos (Receiving Officer)')}</div>
        `;
      }

      if (statusPillElem) {
        const isReleasing = callingTicket.currentStage === 'releasing' || callingTicket.stageStatus === 'ready_for_release';
        statusPillElem.style.display = 'inline-flex';
        statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>${isReleasing ? 'READY FOR RELEASE AT WINDOW 1' : `NOW AT ${(callingTicket.counterName || 'STATION 1').toUpperCase()}`}</span>`;
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
        const estStr = this.getServiceEstimation(ticket);
        const priStr = ticket.isPriority ? `PRIORITY ${(ticket.priorityType || '').toUpperCase()} • ` : '';
        const arriveStr = timeStr ? ` • Arrived: ${timeStr}` : '';
        const estDisplay = estStr ? ` • Est: ${estStr}` : '';
        taxpayerElem.innerText = `Duration: ${durationStr} • ${priStr}${pinStr}Stage: ${stageName}${arriveStr}${estDisplay}`;
      }

      if (counterBoxElem) {
        const isReleasing = ticket.currentStage === 'releasing' || ticket.stageStatus === 'ready_for_release';
        const displayStn = isReleasing ? 'WINDOW 1 (RELEASING)' : (ticket.counterName || 'STATION 1').toUpperCase();
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">CURRENTLY PROCESSING AT</div>
          <div class="tv-hero-counter-name">${displayStn}</div>
          <div class="tv-hero-counter-officer">${ticket.officer || (isReleasing ? 'Maria Santos (Assessment & Releasing)' : 'Assessment Officer')}</div>
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
        : `<div class="tv-hero-client-name">Ready for Next Taxpayer</div><div class="tv-hero-service-name">Provincial Assessor's Office • All 5 Stations Active</div>`;
      if (taxpayerElem) {
        taxpayerElem.innerText = '1. Assessment Officer • 2. Tax Mapping • 3. Appraisal/Assessment • 4. Approval • 5. Releasing';
      }
      if (counterBoxElem) {
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">WORKFLOW STATUS</div>
          <div class="tv-hero-counter-name">5 STATIONS</div>
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

    let items = (decisions && decisions.length > 0) ? decisions.slice(0, 8) : [];

    // Fallback: If no logged decisions yet, but tickets are active in workflow, synthesize recent activity
    if (items.length === 0 && fallbackTickets && fallbackTickets.length > 0) {
      const activeTickets = fallbackTickets.filter(t => t.status === 'serving' || t.status === 'calling' || t.status === 'completed');
      if (activeTickets.length > 0) {
        items = activeTickets.slice(0, 8).map(t => ({
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
      const labelText = isReleasing ? 'READY FOR RELEASE (WINDOW 1)' : `${stageName.toUpperCase()} • ${stageStatusText}`;

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

    const maxVisible = this.maxVisibleDockets || 4;
    const visibleTickets = sortedTickets.slice(0, maxVisible);
    const overflowTickets = sortedTickets.slice(maxVisible);

    this.latestOverflowTickets = overflowTickets;
    this.latestAllTickets = sortedTickets;
    this.lastCounters = counters;

    // Update overflow header buttons in TV display and index.html
    const overflowBtns = [document.getElementById('tv-open-overflow-btn'), document.getElementById('display-open-overflow-btn')];
    overflowBtns.forEach(btn => {
      if (btn) {
        if (overflowTickets.length > 0) {
          btn.style.display = 'inline-flex';
          btn.innerText = `+${overflowTickets.length} More in Queue ↗`;
        } else {
          btn.style.display = 'none';
        }
      }
    });

    // Remove empty state banner if present
    const emptyBanner = container.querySelector('.tv-client-empty-state');
    if (emptyBanner) emptyBanner.remove();

    // Remove cards that are no longer in visibleTickets
    const visibleTicketIdSet = new Set(visibleTickets.map(t => String(t.id)));
    const existingCards = container.querySelectorAll('.tv-client-section-card');
    existingCards.forEach(card => {
      const tId = card.getAttribute('data-ticket-id');
      if (tId && !visibleTicketIdSet.has(tId)) {
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

    // 4. Render or update each visible Client Section Card
    visibleTickets.forEach((ticket) => {
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
      const totalStages = (STAGE_DEFINITIONS && STAGE_DEFINITIONS.length) ? STAGE_DEFINITIONS.length : 5;
      const stageOrder = stageDef.order || stageDef.id || counterId || 1;
      const stagePct = Math.round((stageOrder / totalStages) * 100);

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

      // Calculate station timeline and stay durations for all 6 stations
      const timeline = this.getStationTimeline(ticket);
      const activeStation = timeline.find(s => s.order === stageOrder) || timeline[0];
      const startTime = activeStation.enteredAt || ticket.startedAt || ticket.calledAt || ticket.createdAt || Date.now();
      const stationElapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));

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
            <span>${this.formatDuration(stationElapsedSec)} • Stn ${stageOrder}</span>
          </span>
        `;
      } else {
        // Automatically runs the time stayed in this station
        statusBadgeHtml = `
          <span class="tv-duration-pill active station-timer" data-started="${startTime}" data-ticket-id="${ticket.id}" data-station-order="${stageOrder}" data-is-serving="0" style="background:#171717; color:#ffffff; font-weight:800; font-size:13.5px; padding:6px 14px; border-radius:9999px; letter-spacing:0.3px; border: 1px solid #333333; display:inline-flex; align-items:center; gap:6px;">
            <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>${this.formatDuration(stationElapsedSec)} • Stn ${stageOrder}</span>
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
      const ticketEst = this.getServiceEstimation(ticket);
      const timeArrivedStr = ticket.createdAt ? new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      
      const elapsedOfficeMin = ticket.createdAt ? Math.max(1, Math.round((Date.now() - ticket.createdAt) / 60000)) : 1;
      const officeTimeStr = `${elapsedOfficeMin}m in office`;

      const isReleasingDocket = currentStageKey === 'releasing' || ticket.stageStatus === 'ready_for_release';
      const stationDisplayName = isReleasingDocket
        ? 'Window 1: Document Releasing'
        : (station.name.startsWith('Station') ? station.name : `Station ${counterId}: ${station.shortName || station.name}`);
      const officerName = isReleasingDocket ? 'Maria Santos (Assessment & Releasing)' : (station.officer || ticket.officer || 'Assessor Staff');

      // 6-step progress indicators
      const stepIndicatorsHtml = timeline.map(st => {
        let titleAttr = `Stage ${st.order}: ${st.shortName} (${st.state})`;
        if (st.state === 'completed') {
          titleAttr = `Stage ${st.order}: ${st.shortName} • Stayed ${st.formattedDuration}`;
        }
        return `<div class="tv-step-bar ${st.state}" title="${titleAttr}"></div>`;
      }).join('');

      // Station stay duration strip for all 6 stations
      const stationTimesStripHtml = timeline.map(st => {
        let timeContent = '—';
        let titleAttr = `Station ${st.order} (${st.shortName}): Pending`;

        if (st.state === 'completed') {
          timeContent = st.formattedDuration;
          const arrStr = st.enteredAt ? new Date(st.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          const depStr = st.leftAt ? new Date(st.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          titleAttr = `Station ${st.order} (${st.shortName}): Stayed ${st.formattedDuration}${arrStr ? ` (${arrStr} - ${depStr})` : ''}`;
        } else if (st.state === 'active' || st.state === 'serving') {
          const liveSec = Math.max(0, Math.floor((Date.now() - st.enteredAt) / 1000));
          const arrStr = st.enteredAt ? new Date(st.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          timeContent = `<span class="tv-live-station-time" data-station-started="${st.enteredAt}">${this.formatDuration(liveSec)}</span>`;
          titleAttr = `Station ${st.order} (${st.shortName}): Currently here${arrStr ? ` since ${arrStr}` : ''} (${st.state})`;
        }

        return `
          <div class="tv-station-time-chip ${st.state}" title="${titleAttr}">
            <span class="chip-stn">S${st.order}:</span>
            <span class="chip-val">${timeContent}</span>
          </div>
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

          <!-- ROW 2: 5-Stage Stepper Progress Bar -->
          <div class="tv-docket-stepper-wrap">
            <div class="tv-client-stepper-bars">
              ${stepIndicatorsHtml}
            </div>
            <div class="tv-client-progress-meta">
              <span class="tv-client-stage-label">Stage ${stageOrder} of ${totalStages}: ${stageDef.shortName || stageDef.name}</span>
              <span class="tv-client-stage-pct">${stagePct}% Complete</span>
            </div>
          </div>

          <!-- ROW 3: Service Details & Live Status Stopwatch -->
          <div class="tv-docket-row-footer">
            <div class="tv-docket-service-meta">
              <span class="tv-docket-service" title="${serviceName}">${serviceName}</span>
              ${ticketEst ? `<span class="tv-docket-est-pill" title="Citizen's Charter Turnaround: ${ticketEst}">Est: ${ticketEst}</span>` : ''}
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

    // 5. Overflow Footer Banner
    let overflowBanner = container.querySelector('#tv-docket-overflow-banner');
    if (overflowTickets.length > 0) {
      if (!overflowBanner) {
        overflowBanner = document.createElement('div');
        overflowBanner.id = 'tv-docket-overflow-banner';
        overflowBanner.className = 'tv-docket-overflow-banner';
        overflowBanner.onclick = () => this.openOverflowModal();
      }
      overflowBanner.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:28px; height:28px; border-radius:50%; background:#000000; color:#ffffff; font-weight:800; font-size:12px; font-family:var(--font-mono, monospace); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            +${overflowTickets.length}
          </div>
          <div>
            <div style="font-weight:800; font-size:12.5px; color:var(--colors-ink, #000000);">
              ${overflowTickets.length} More Queued Citizen ${overflowTickets.length === 1 ? 'Docket' : 'Dockets'} In Line
            </div>
            <div style="font-size:10.5px; color:var(--colors-body, #737373);">
              Next in line: ${overflowTickets.map(t => '#' + t.ticketNumber).slice(0, 3).join(', ')}${overflowTickets.length > 3 ? '...' : ''}
            </div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" style="font-size:11px; font-weight:700; border-radius:9999px; padding:4px 12px; pointer-events:none;">
          Open Pop-up List ↗
        </button>
      `;
      container.appendChild(overflowBanner);
    } else if (overflowBanner) {
      overflowBanner.remove();
    }

    // 6. Live update overflow modal if currently opened
    const modal = document.getElementById('tv-overflow-modal');
    if (modal && modal.classList.contains('active')) {
      this.renderOverflowModalContent(overflowTickets, sortedTickets);
    }

    // 7. Manage Auto-Cycle timer on TV
    this.setupAutoPopupCycle(overflowTickets.length);
  }

  // =========================================================================
  // OVERFLOW MODAL METHODS (POPPED-UP LIST OF QUEUES)
  // =========================================================================

  openOverflowModal(isAuto = false) {
    const modal = document.getElementById('tv-overflow-modal');
    if (!modal) return;

    this.renderOverflowModalContent(this.latestOverflowTickets, this.latestAllTickets);
    modal.classList.add('active');

    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }

    if (isAuto) {
      // Auto close after 8 seconds if not interacted with
      this.autoCloseTimer = setTimeout(() => {
        this.closeOverflowModal();
      }, 8000);
    }
  }

  closeOverflowModal() {
    const modal = document.getElementById('tv-overflow-modal');
    if (modal) modal.classList.remove('active');
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
  }

  setOverflowTab(tab) {
    this.currentOverflowTab = tab;
    const btnOverflow = document.getElementById('tv-tab-overflow');
    const btnAll = document.getElementById('tv-tab-all');
    if (btnOverflow && btnAll) {
      if (tab === 'overflow') {
        btnOverflow.className = 'btn btn-primary btn-sm';
        btnAll.className = 'btn btn-outline btn-sm';
      } else {
        btnOverflow.className = 'btn btn-outline btn-sm';
        btnAll.className = 'btn btn-primary btn-sm';
      }
    }
    this.renderOverflowModalContent(this.latestOverflowTickets, this.latestAllTickets);
  }

  toggleAutoPopup(enabled) {
    this.isAutoPopupEnabled = enabled;
    this.setupAutoPopupCycle((this.latestOverflowTickets || []).length);
  }

  setupAutoPopupCycle(overflowCount) {
    if (this.autoPopupCycleTimer) {
      clearInterval(this.autoPopupCycleTimer);
      this.autoPopupCycleTimer = null;
    }

    if (overflowCount <= 0 || !this.isAutoPopupEnabled) {
      return;
    }

    // Auto-pop up on TV display every 25 seconds for 8 seconds
    this.autoPopupCycleTimer = setInterval(() => {
      const modal = document.getElementById('tv-overflow-modal');
      if (modal && !modal.classList.contains('active') && this.isAutoPopupEnabled && (this.latestOverflowTickets || []).length > 0) {
        this.openOverflowModal(true);
      }
    }, 25000);
  }

  renderOverflowModalContent(overflowTickets, allTickets) {
    const listContainer = document.getElementById('tv-overflow-list-container');
    if (!listContainer) return;

    const ticketsToRender = this.currentOverflowTab === 'all' ? (allTickets || []) : (overflowTickets || []);
    
    // Update badge counts in tabs
    const overflowTabCount = document.getElementById('tv-overflow-tab-count');
    if (overflowTabCount) overflowTabCount.textContent = (overflowTickets || []).length;
    const allTabCount = document.getElementById('tv-overflow-all-count');
    if (allTabCount) allTabCount.textContent = (allTickets || []).length;

    const subtitle = document.getElementById('tv-overflow-subtitle');
    if (subtitle) {
      subtitle.textContent = this.currentOverflowTab === 'all'
        ? `All ${allTickets?.length || 0} active dockets currently in office workflow`
        : `Showing ${overflowTickets?.length || 0} client queues waiting in line beyond the top screen view`;
    }

    if (ticketsToRender.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--colors-body, #737373);">
          <div style="font-size: 13.5px; font-weight: 700; color: var(--colors-ink, #000); margin-bottom: 4px;">No Queued Dockets in this View</div>
          <div style="font-size: 11.5px;">All client dockets are currently accommodated on the primary display.</div>
        </div>
      `;
      return;
    }

    const stageMap = {};
    (STAGE_DEFINITIONS || []).forEach(sd => {
      stageMap[sd.key] = sd;
      stageMap[sd.id] = sd;
    });

    listContainer.innerHTML = ticketsToRender.map((ticket, idx) => {
      const isCalling = ticket.status === 'calling';
      const isServing = ticket.status === 'serving';
      const counterId = ticket.counterId || (ticket.currentStage ? (stageMap[ticket.currentStage]?.id || 1) : 1);
      const station = (this.lastCounters || []).find(c => c.id === counterId) || (DEFAULT_COUNTERS || []).find(c => c.id === counterId) || {
        id: counterId,
        name: `Station ${counterId}`,
        shortName: `Station ${counterId}`,
        officer: ticket.officer || 'Assessment Staff'
      };

      const currentStageKey = ticket.currentStage || (station.key || 'review');
      const stageDef = stageMap[currentStageKey] || stageMap[counterId] || { id: counterId, order: counterId, name: station.name, shortName: station.shortName || station.name };
      const stageOrder = stageDef.order || stageDef.id || counterId || 1;

      const clientName = ticket.clientName || 'Juan Dela Cruz';
      const serviceName = ticket.serviceName || 'Real Property Tax Assessment';
      const ticketEst = this.getServiceEstimation(ticket);
      const timeArrivedStr = ticket.createdAt ? new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const elapsedOfficeMin = ticket.createdAt ? Math.max(1, Math.round((Date.now() - ticket.createdAt) / 60000)) : 1;
      const officeTimeStr = `${elapsedOfficeMin}m in office`;

      let priBadgeHtml = '';
      if (ticket.isPriority) {
        const priLabel = (ticket.priorityType || 'PRIORITY').toUpperCase();
        priBadgeHtml = `<span style="font-size: 10px; font-weight: 800; background: #000; color: #fff; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">${priLabel}</span>`;
      }

      let statusPillHtml = '';
      if (isCalling) {
        statusPillHtml = `<span style="background: #000; color: #fff; font-weight: 800; font-size: 11px; padding: 3px 8px; border-radius: 9999px;">NOW CALLING</span>`;
      } else if (isServing) {
        statusPillHtml = `<span style="background: #000; color: #fff; font-weight: 800; font-size: 11px; padding: 3px 8px; border-radius: 9999px;">SERVING • STN ${stageOrder}</span>`;
      } else {
        statusPillHtml = `<span style="background: #f0f0f0; color: #000; border: 1px solid #d4d4d4; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 9999px;">IN LINE • STN ${stageOrder}</span>`;
      }

      const queuePos = this.currentOverflowTab === 'all' ? `Queue #${idx + 1}` : `Waiting #${idx + 1} (+${idx + 5} overall)`;

      return `
        <div class="tv-overflow-item-card" style="background: var(--colors-canvas, #ffffff); border: 1px solid var(--colors-hairline, #e5e5e5); border-radius: var(--rounded-lg, 12px); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: var(--font-mono); font-size: 18px; font-weight: 900; color: var(--colors-ink, #000000);">#${ticket.ticketNumber}</span>
              ${priBadgeHtml}
              <span style="font-size: 13.5px; font-weight: 800; color: var(--colors-ink, #000000); text-transform: uppercase;">${clientName}</span>
            </div>
            <span style="font-size: 10.5px; font-weight: 700; font-family: var(--font-mono); color: #000000; background: #f0f0f0; border: 1px solid #d4d4d4; padding: 2px 8px; border-radius: 9999px;">
              ${queuePos}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--colors-body, #525252);">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
              <span><strong>Station ${stageOrder}:</strong> ${stageDef.shortName || stageDef.name}</span>
            </div>
            <div><strong>Arrived:</strong> ${timeArrivedStr} (${officeTimeStr})</div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px dashed var(--colors-hairline, #e5e5e5); font-size: 11px;">
            <div style="color: var(--colors-body, #737373); max-width: 65%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
              <span>${serviceName} ${ticket.taxDecPin ? `• PIN: ${ticket.taxDecPin}` : ''}</span>
              ${ticketEst ? `<span class="tv-docket-est-pill" style="font-size: 10px;" title="Official Turnaround: ${ticketEst}">Est: ${ticketEst}</span>` : ''}
            </div>
            <div>
              ${statusPillHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

export const displayController = new DisplayController();
