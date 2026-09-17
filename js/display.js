/**
 * Public TV Display / Digital Signage Controller
 * Handles digital signage telemetry, hero spotlight, LIVE COUNTER DECISIONS FEED, 3-window matrix with LIVE SERVICE DURATION STOPWATCH, live clock, and audio.
 * Configuration:
 * - Counter 1: All Assessment Services
 * - Counter 2: Priority Lane & All Services
 * - Counter 3: All Assessment Services
 */

import { queueState, DEFAULT_COUNTERS, STAGE_DEFINITIONS } from './state.js';
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
              ? `⏱ ${durationStr} Serving Stn ${stnOrder}`
              : `⏱ ${durationStr} in Stn ${stnOrder}`;
          } else {
            pill.innerText = `⏱ ${durationStr}`;
          }
        }
      });

      // 2. Tick Section 2 Live Station Time Chips (Every Station Stay Strip)
      const liveChips = document.querySelectorAll('.tv-live-station-time[data-station-started]');
      liveChips.forEach(chip => {
        const startMs = Number(chip.getAttribute('data-station-started'));
        if (startMs > 0) {
          const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
          chip.innerText = `⏱ ${this.formatDuration(elapsedSec)}`;
        }
      });

      // 3. Tick Hero Card Stopwatch if currently serving
      if (this.currentHeroTicket && this.currentHeroTicket.status === 'serving' && this.currentHeroStartTime) {
        const elapsedSec = Math.max(0, Math.floor((now - this.currentHeroStartTime) / 1000));
        const durationStr = this.formatDuration(elapsedSec);

        const taxpayerElem = document.getElementById('display-hero-taxpayer');
        if (taxpayerElem) {
          const priStr = this.currentHeroTicket.isPriority ? `★ ${(this.currentHeroTicket.priorityType || 'Priority').toUpperCase()}` : 'REGULAR';
          taxpayerElem.innerText = `⏱ Service Duration: ${durationStr} • ${priStr} • Target ~10-15 mins`;
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
      statusPill.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24" style="stroke: #f59e0b;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span style="color:#f59e0b; font-weight:800;">NOW PROCESSING</span>`;
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
   * Computes the station timeline and stay durations for all 6 stations
   * from the docket's stageHistory, createdAt, startedAt, and completedAt.
   */
  getStationTimeline(ticket) {
    const stages = STAGE_DEFINITIONS || [
      { id: 1, key: 'review', shortName: 'Review & Receiving' },
      { id: 2, key: 'tax_mapping', shortName: 'Tax Mapping' },
      { id: 3, key: 'backtracking', shortName: 'Backtracking' },
      { id: 4, key: 'approval', shortName: 'Appraisal & Approval' },
      { id: 5, key: 'recording', shortName: 'Encoding & Roll' },
      { id: 6, key: 'release', shortName: 'Tax Dec Release' }
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
    const videoWrap = document.getElementById('tv-video-player-wrap');

    if (videoWrap) videoWrap.style.display = 'flex';

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
          <div style="font-size: 22px; font-weight: 800; color: #ffffff; text-transform: uppercase; margin-bottom: 2px;">${clientName}</div>
          <div style="font-size: 13.5px; font-weight: 600; color: #e5e5e5;">${callingTicket.serviceName}</div>
        `;
      }
      if (taxpayerElem) {
        const priStr = callingTicket.isPriority ? `★ ${(callingTicket.priorityType || 'Priority').toUpperCase()} • ` : '';
        const arriveStr = timeStr ? ` • Arrived: ${timeStr}` : '';
        taxpayerElem.innerText = `${priStr}${pinStr}Stage: ${stageName}${arriveStr}`;
      }

      if (counterBoxElem) {
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">CURRENT STATION</div>
          <div class="tv-hero-counter-name">${(callingTicket.counterName || 'STATION 1').toUpperCase()}</div>
          <div class="tv-hero-counter-officer">${callingTicket.officer || 'Maria Santos (Receiving Officer)'}</div>
        `;
      }

      if (statusPillElem) {
        statusPillElem.style.display = 'inline-flex';
        statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>NOW AT ${(callingTicket.counterName || 'STATION 1').toUpperCase()}</span>`;
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
          <div style="font-size: 22px; font-weight: 800; color: #ffffff; text-transform: uppercase; margin-bottom: 2px;">${clientName}</div>
          <div style="font-size: 13.5px; font-weight: 600; color: #e5e5e5;">${ticket.serviceName}</div>
        `;
      }
      
      if (taxpayerElem) {
        const priStr = ticket.isPriority ? `★ ${(ticket.priorityType || 'Priority').toUpperCase()} • ` : '';
        const arriveStr = timeStr ? ` • Arrived: ${timeStr}` : '';
        taxpayerElem.innerText = `⏱ Duration: ${durationStr} • ${priStr}${pinStr}Stage: ${stageName}${arriveStr}`;
      }

      if (counterBoxElem) {
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">CURRENTLY PROCESSING AT</div>
          <div class="tv-hero-counter-name">${(ticket.counterName || 'STATION 1').toUpperCase()}</div>
          <div class="tv-hero-counter-officer">${ticket.officer || 'Assessment Officer'}</div>
        `;
      }
      if (statusPillElem) {
        statusPillElem.style.display = 'inline-flex';
        statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>PROCESSING (${durationStr})</span>`;
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
      if (serviceElem) serviceElem.innerText = waitingCount > 0 ? `${waitingCount} Citizen Docket(s) Active in Office Workflow` : "Provincial Assessor's Office - All 6 Stations Active";
      if (taxpayerElem) {
        taxpayerElem.innerText = '1. Review & Receiving • 2. Tax Mapping • 3. Backtracking • 4. Approval • 5. Recording • 6. Releasing';
      }
      if (counterBoxElem) {
        counterBoxElem.innerHTML = `
          <div class="tv-hero-counter-label">WORKFLOW STATUS</div>
          <div class="tv-hero-counter-name" style="font-size: 18px;">6 STATIONS</div>
          <div class="tv-hero-counter-officer">Active & Processing</div>
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

    if (!decisions || decisions.length === 0) {
      container.innerHTML = `
        <div style="padding: 12px 6px; text-align: center; color: #a3a3a3; font-size: 11px; font-family: var(--font-mono);">
          Real-time assessor decisions feed active • Waiting for station logs
        </div>
      `;
      return;
    }

    container.innerHTML = decisions.slice(0, 5).map(d => {
      const timeStr = d.timestamp ? new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      
      let badgeStyle = '';
      if (d.decisionType === 'called') {
        badgeStyle = 'background: #000000; color: #ffffff;';
      } else if (d.decisionType === 'serving') {
        badgeStyle = 'background: #2563eb; color: #ffffff;';
      } else if (d.decisionType === 'completed') {
        badgeStyle = 'background: #10b981; color: #ffffff;';
      } else if (d.decisionType === 'forwarded') {
        badgeStyle = 'background: #7c3aed; color: #ffffff;';
      } else if (d.decisionType === 'noshow') {
        badgeStyle = 'background: #f5f5f5; color: #737373; border: 1px solid #d4d4d4;';
      } else {
        badgeStyle = 'background: #fafafa; color: #525252; border: 1px dashed #737373;';
      }

      const clientLabel = d.clientName ? `${d.clientName} • ` : '';
      let subNote = `${clientLabel}${d.serviceName}`;
      if (d.decisionType === 'completed' && d.serviceSeconds > 0) {
        const m = Math.floor(d.serviceSeconds / 60);
        const s = d.serviceSeconds % 60;
        subNote = `${clientLabel}${d.serviceName} • ⏱ ${m}m ${s}s`;
      }

      return `
        <div class="tv-recent-card" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: 8px; background: #fafafa; border: 1px solid #e5e5e5; min-width: 0;">
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
              <span class="tag-badge" style="font-size: 8.5px; padding: 1px 6px; border-radius: 9999px; font-weight: 700; ${badgeStyle}">
                ${d.decisionLabel || 'ACTION'}
              </span>
              <span style="font-weight: 800; font-family: var(--font-mono); font-size: 13px; color: #000000;">
                #${d.ticketNumber}
              </span>
              ${d.isPriority ? '<span class="tag-badge accent" style="font-size:8px; padding:1px 4px;">PRI</span>' : ''}
            </div>
            <div style="font-size: 10px; color: #525252; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;" title="${subNote}">
              ${subNote}
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0; margin-left: 8px;">
            <div style="font-size: 11px; font-weight: 700; color: #000000;">${d.counterName || 'Station'}</div>
            <div style="font-size: 9.5px; color: #737373; font-family: var(--font-mono);">${timeStr}</div>
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

    // 3. Sort active tickets: Calling first, Serving second, Waiting/Queued third
    const sortedTickets = [...activeTickets].sort((a, b) => {
      const order = { calling: 1, serving: 2, waiting: 3, hold: 4 };
      const statusA = order[a.status] || 5;
      const statusB = order[b.status] || 5;
      if (statusA !== statusB) return statusA - statusB;

      if (a.status === 'calling') {
        return (b.calledAt || 0) - (a.calledAt || 0);
      }
      if (a.status === 'serving') {
        return (b.startedAt || 0) - (a.startedAt || 0);
      }
      // If waiting: priority dockets first, then arrival time
      if (a.isPriority !== b.isPriority) {
        return b.isPriority ? 1 : -1;
      }
      return (a.createdAt || 0) - (b.createdAt || 0);
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
      const stageOrder = stageDef.order || stageDef.id || counterId || 1;
      const stagePct = Math.round((stageOrder / 6) * 100);

      // Track station change for transition animation
      if (!this.prevTicketStations) this.prevTicketStations = {};
      const prevStationId = this.prevTicketStations[ticket.id];
      const isStationMoved = prevStationId !== undefined && prevStationId !== counterId;
      this.prevTicketStations[ticket.id] = counterId;

      let card = container.querySelector(`.tv-client-section-card[data-ticket-id="${ticket.id}"]`);
      if (!card) {
        card = document.createElement('div');
        card.setAttribute('data-ticket-id', ticket.id);
        container.appendChild(card);
      }

      card.setAttribute('data-counter-id', counterId);
      card.className = `tv-client-section-card ${isServing ? 'is-serving' : ''} ${ticket.status === 'waiting' ? 'is-waiting' : ''} ${ticket.isPriority ? 'is-priority-ticket' : ''} ${card.classList.contains('tv-station-moved-active') ? 'tv-station-moved-active' : ''} ${card.classList.contains('counter-dark-mode-transition') ? 'counter-dark-mode-transition' : ''}`;

      // Calculate station timeline and stay durations for all 6 stations
      const timeline = this.getStationTimeline(ticket);
      const activeStation = timeline.find(s => s.order === stageOrder) || timeline[0];
      const startTime = activeStation.enteredAt || ticket.startedAt || ticket.calledAt || ticket.createdAt || Date.now();
      const stationElapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));

      // Live Status Pill & Running Station Stopwatch Badge (Replaces static PENDING)
      let statusBadgeHtml = '';
      if (ticket.status === 'completed') {
        statusBadgeHtml = `
          <span class="tv-duration-pill completed" style="background:#10b981; color:#ffffff; font-weight:700; font-size:10.5px; padding:3px 10px; border-radius:9999px; letter-spacing:0.3px;">
            ✓ RELEASED / COMPLETED
          </span>
        `;
      } else if (isServing) {
        statusBadgeHtml = `
          <span class="tv-duration-pill serving station-timer" data-started="${startTime}" data-ticket-id="${ticket.id}" data-station-order="${stageOrder}" data-is-serving="1" style="background:#2563eb; color:#ffffff; font-weight:700; font-size:10.5px; padding:3px 10px; border-radius:9999px; letter-spacing:0.3px; box-shadow:0 2px 8px rgba(37,99,235,0.35);">
            ⏱ ${this.formatDuration(stationElapsedSec)} Serving Stn ${stageOrder}
          </span>
        `;
      } else {
        // Automatically runs the time stayed in this station (replaces static PENDING)
        statusBadgeHtml = `
          <span class="tv-duration-pill active station-timer" data-started="${startTime}" data-ticket-id="${ticket.id}" data-station-order="${stageOrder}" data-is-serving="0" style="background:#0d9488; color:#ffffff; font-weight:700; font-size:10.5px; padding:3px 10px; border-radius:9999px; letter-spacing:0.3px; box-shadow:0 2px 8px rgba(13,148,136,0.3);">
            ⏱ ${this.formatDuration(stationElapsedSec)} in Stn ${stageOrder}
          </span>
        `;
      }

      // Priority tag
      let priBadgeHtml = '';
      if (ticket.isPriority) {
        const priLabel = (ticket.priorityType || 'PRIORITY').toUpperCase();
        priBadgeHtml = `<span class="tag-badge accent" style="font-size:9px; padding:1px 6px; font-weight:800; border-radius:4px; letter-spacing:0.5px;">★ ${priLabel}</span>`;
      }

      const clientName = ticket.clientName || 'Juan Dela Cruz';
      const serviceName = ticket.serviceName || 'Real Property Tax Assessment';
      const timeArrivedStr = ticket.createdAt ? new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      
      const elapsedOfficeMin = ticket.createdAt ? Math.max(1, Math.round((Date.now() - ticket.createdAt) / 60000)) : 1;
      const officeTimeStr = `${elapsedOfficeMin}m in office`;

      const stationDisplayName = station.name.startsWith('Station') ? station.name : `Station ${counterId}: ${station.shortName || station.name}`;
      const officerName = station.officer || ticket.officer || 'Assessor Staff';

      // 6-step progress indicators
      const stepIndicatorsHtml = timeline.map(st => {
        let titleAttr = `Stage ${st.order}: ${st.shortName} (${st.state})`;
        if (st.state === 'completed') {
          titleAttr = `Stage ${st.order}: ${st.shortName} • Stayed ${st.formattedDuration}`;
        }
        return `<div class="tv-step-bar ${st.state}" title="${titleAttr}"></div>`;
      }).join('');

      // Station stay duration strip for all 6 stations (Know what time it stayed in every station)
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
          timeContent = `<span class="tv-live-station-time" data-station-started="${st.enteredAt}">⏱ ${this.formatDuration(liveSec)}</span>`;
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
        <div class="tv-client-3sec-row">
          <!-- SECTION 1: Taxpayer & Ticket Identity -->
          <div class="tv-client-sec tv-client-sec-taxpayer">
            <div class="tv-client-ticket-id">
              <span class="tv-client-hash">#</span><span class="tv-client-num">${ticket.ticketNumber}</span>
              ${priBadgeHtml}
            </div>
            <div class="tv-client-name" title="${clientName}">
              ${clientName}
            </div>
            <div class="tv-client-service" title="${serviceName}">
              ${serviceName}
            </div>
            ${ticket.taxDecPin ? `<div class="tv-client-pin" title="PIN: ${ticket.taxDecPin}">PIN: ${ticket.taxDecPin}</div>` : ''}
          </div>

          <!-- SECTION 2: Station Assignment & 6-Stage Progression Stepper -->
          <div class="tv-client-sec tv-client-sec-station">
            <div class="tv-client-station-header">
              <div class="tv-client-station-badge">
                <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                <span>${stationDisplayName}</span>
              </div>
              <div class="tv-client-officer" title="${officerName}">
                <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>${officerName}</span>
              </div>
            </div>

            <div class="tv-client-progress-wrap">
              <div class="tv-client-stepper-bars">
                ${stepIndicatorsHtml}
              </div>
              <div class="tv-station-times-strip">
                ${stationTimesStripHtml}
              </div>
              <div class="tv-client-progress-meta">
                <span class="tv-client-stage-label">Stage ${stageOrder} of 6: ${stageDef.shortName || stageDef.name}</span>
                <span class="tv-client-stage-pct">${stagePct}%</span>
              </div>
            </div>
          </div>

          <!-- SECTION 3: Live Status Pill & Timers -->
          <div class="tv-client-sec tv-client-sec-status">
            <div class="tv-client-status-pill-wrap">
              ${statusBadgeHtml}
            </div>
            <div class="tv-client-time-meta">
              <span class="tv-client-arr-time">
                <svg class="icon-svg icon-svg-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                Arrived: ${timeArrivedStr}
              </span>
              <span class="tv-client-turnaround">⏱ ${officeTimeStr}</span>
            </div>
          </div>
        </div>
      `;

      if (isStationMoved) {
        this.triggerStationMoveTransition(ticket.id, stationDisplayName, stageDef.shortName || stageDef.name);
      }
    });
  }
}

export const displayController = new DisplayController();
