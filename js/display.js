/**
 * Public TV Display / Digital Signage Controller
 * Handles digital signage telemetry, hero spotlight, LIVE COUNTER DECISIONS FEED, 3-window matrix with LIVE SERVICE DURATION STOPWATCH, live clock, and audio.
 * Configuration:
 * - Counter 1: All Assessment Services
 * - Counter 2: Priority Lane & All Services
 * - Counter 3: All Assessment Services
 */

import { queueState, DEFAULT_COUNTERS } from './state.js';
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
   * Updates all active counters and hero cards smoothly without DOM destructuring
   */
  startStopwatchTicker() {
    if (this.stopwatchInterval) clearInterval(this.stopwatchInterval);
    
    this.stopwatchInterval = setInterval(() => {
      // 1. Tick Counter Matrix Stopwatches
      const servingPills = document.querySelectorAll('.tv-duration-pill.serving[data-started]');
      servingPills.forEach(pill => {
        const startMs = Number(pill.getAttribute('data-started'));
        if (startMs > 0) {
          const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
          const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
          const secs = String(elapsedSec % 60).padStart(2, '0');
          pill.innerText = `⏱ ${mins}:${secs}`;
        }
      });

      // 2. Tick Hero Card Stopwatch if currently serving
      if (this.currentHeroTicket && this.currentHeroTicket.status === 'serving' && this.currentHeroStartTime) {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - this.currentHeroStartTime) / 1000));
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        const durationStr = `${mins}:${secs}`;

        const taxpayerElem = document.getElementById('display-hero-taxpayer');
        if (taxpayerElem) {
          const priStr = this.currentHeroTicket.isPriority ? `★ ${(this.currentHeroTicket.priorityType || 'Priority').toUpperCase()}` : 'REGULAR';
          taxpayerElem.innerText = `⏱ Service Duration: ${durationStr} • ${priStr} • Target ~10-15 mins`;
        }

        const statusPillElem = document.getElementById('display-hero-status-pill');
        if (statusPillElem) {
          statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>IN SERVICE (${durationStr})</span>`;
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
      statusPill.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24" style="stroke: #f59e0b;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> <span style="color:#f59e0b; font-weight:800;">RE-CALLING NOW</span>`;
    }

    // Flash the corresponding counter card in dark mode for 1 second
    if (counter && counter.id) {
      const counterCards = document.querySelectorAll('.tv-counter-card');
      const targetCard = Array.from(counterCards).find(c => c.querySelector('.tv-counter-title')?.innerText?.includes(`Counter ${counter.id}`));
      if (targetCard) {
        targetCard.classList.remove('counter-dark-mode-transition');
        void targetCard.offsetWidth;
        targetCard.classList.add('counter-dark-mode-transition');
        setTimeout(() => {
          targetCard.classList.remove('counter-dark-mode-transition');
        }, 1000);

        const numSpan = targetCard.querySelector('.tv-counter-ticket-num span');
        if (numSpan) {
          numSpan.classList.remove('call-next-transition', 'recall-transition', 'pass-number-transition');
          void numSpan.offsetWidth;
          numSpan.classList.add(transitionClass);
        }
      }
    }
  }

  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
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
          <div class="tv-hero-counter-label">PLEASE PROCEED TO</div>
          <div class="tv-hero-counter-name">${(callingTicket.counterName || 'STATION 1').toUpperCase()}</div>
          <div class="tv-hero-counter-officer">${callingTicket.officer || 'Maria Santos (Receiving Officer)'}</div>
        `;
      }

      if (statusPillElem) {
        statusPillElem.style.display = 'inline-flex';
        statusPillElem.innerHTML = `<svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> <span>CALLING NOW</span>`;
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

  triggerCounterDarkTransition(counterId) {
    if (!counterId) return;
    const counterCards = document.querySelectorAll('.tv-counter-card');
    const targetCard = Array.from(counterCards).find(c =>
      c.getAttribute('data-counter-id') == String(counterId) ||
      c.querySelector('.tv-counter-title')?.innerText?.includes(`Station ${counterId}`) ||
      c.querySelector('.tv-counter-title')?.innerText?.includes(`Counter ${counterId}`)
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

  renderCountersMatrix(counters, tickets) {
    const container = document.getElementById('display-counters-grid');
    if (!container) return;

    if (!this.prevCounterStateKeys) this.prevCounterStateKeys = {};

    counters.forEach(counter => {
      // Find all papers/tickets stationed at this station
      const stationTickets = tickets.filter(t => (t.currentStage === counter.key || t.counterId === counter.id) && t.status !== 'completed' && t.status !== 'noshow');
      
      const activeTicket = (counter.activeTicketId ? tickets.find(t => t.id === counter.activeTicketId) : null) || stationTickets[0] || null;
      const isCalling = counter.status === 'calling' || (activeTicket && activeTicket.status === 'calling');
      const isServing = counter.status === 'serving' || (activeTicket && activeTicket.status === 'serving');

      const prevKey = this.prevCounterStateKeys[counter.id];
      const currentKey = `${counter.status}-${activeTicket ? activeTicket.id : 'none'}`;
      const isStateChanged = prevKey !== undefined && prevKey !== currentKey && (isCalling || isServing);
      this.prevCounterStateKeys[counter.id] = currentKey;

      let card = container.querySelector(`.tv-counter-card[data-counter-id="${counter.id}"]`);
      if (!card) {
        card = document.createElement('div');
        card.setAttribute('data-counter-id', counter.id);
        container.appendChild(card);
      }

      card.className = `tv-counter-card ${isCalling ? 'is-calling' : ''} ${isServing ? 'is-serving' : ''} ${card.classList.contains('counter-dark-mode-transition') ? 'counter-dark-mode-transition' : ''}`;

      let durationBadge = '';
      if (isServing && activeTicket) {
        const startTime = activeTicket.startedAt || activeTicket.calledAt || activeTicket.createdAt || Date.now();
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
        durationBadge = `<span class="tv-duration-pill serving" data-started="${startTime}">⏱ ${this.formatDuration(elapsedSec)}</span>`;
      } else if (isCalling) {
        durationBadge = `<span class="tv-duration-pill calling">SUMMONED</span>`;
      } else if (activeTicket) {
        const startTime = activeTicket.calledAt || activeTicket.startedAt || activeTicket.createdAt || Date.now();
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
        durationBadge = `<span class="tv-duration-pill serving" data-started="${startTime}" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;">⏱ ${this.formatDuration(elapsedSec)}</span>`;
      } else if (counter.status === 'break') {
        durationBadge = `<span class="tv-duration-pill break">BREAK</span>`;
      } else {
        durationBadge = `<span class="tv-duration-pill available">STANDBY</span>`;
      }

      let clientSubtitle = '';
      if (activeTicket) {
        const clientName = activeTicket.clientName || 'Juan Dela Cruz';
        const stageStatus = (activeTicket.stageStatus || 'At Station').replace(/_/g, ' ').toUpperCase();
        const timeArrivedStr = activeTicket.createdAt ? new Date(activeTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const queueCountBadge = stationTickets.length > 1 ? `<span class="tag-badge" style="background:#2563eb; color:#ffffff; font-size:8.5px; padding:1px 5px; font-weight:700;">+${stationTickets.length - 1} in queue</span>` : '';

        clientSubtitle = `
          <div class="tv-counter-client" style="font-size: 13.5px; font-weight: 800; color: var(--colors-ink, #000000); margin-top: 2px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${clientName}">
            ${clientName}
          </div>
          <div style="font-size: 10.5px; color: var(--colors-body, #737373); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;">
            ${activeTicket.serviceName}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
            <span style="font-size: 9.5px; color: var(--colors-mute, #737373); font-family: var(--font-mono); font-weight: 600;">Arrived: ${timeArrivedStr}</span>
            ${queueCountBadge}
          </div>
        `;
      } else {
        clientSubtitle = `<div class="tv-counter-client-idle" style="font-size: 11px; color: var(--colors-mute, #a3a3a3); margin-top: 4px;">Ready for next client paper</div>`;
      }

      const numHtml = activeTicket ? `<span>#${activeTicket.ticketNumber}</span>` : '<span class="tv-counter-empty-dash">--</span>';
      const stationDisplayName = counter.name.startsWith('Station') ? counter.name : `Station ${counter.id}: ${counter.shortName || counter.name}`;

      card.innerHTML = `
        <div>
          <div class="tv-counter-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="tv-counter-title" style="font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${stationDisplayName}">${stationDisplayName}</span>
            ${durationBadge}
          </div>
          <div class="tv-counter-label" style="font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${counter.label}
          </div>
          <div class="tv-counter-ticket-num" style="font-size: 26px; margin: 2px 0;">
            ${numHtml}
            ${activeTicket && activeTicket.isPriority ? '<span class="tag-badge accent" style="font-size: 8px; padding: 1px 4px; margin-left: 6px;">PRI</span>' : ''}
          </div>
          ${clientSubtitle}
        </div>
        <div class="tv-counter-officer" style="font-size: 10px; padding-top: 4px; margin-top: 4px;">
          <svg class="icon-svg icon-svg-sm" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${counter.officer}</span>
        </div>
      `;

      if (isStateChanged) {
        this.triggerCounterDarkTransition(counter.id);
      }
    });
  }
}

export const displayController = new DisplayController();
