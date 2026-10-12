/**
 * DIGITAL GARDEN FEEDS - FRONTEND APPLICATION LOGIC
 * Supports Dual Execution Mode: Wails Desktop IPC & Web Browser / Mobile PWA REST API
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    isWails: false,
    currentFilter: 'all',
    currentCategory: 'All',
    currentFeedID: 0,
    searchQuery: '',
    feeds: [],
    items: [],
    rules: [],
    queue: [],
    queueFilter: 'pending',
    currentView: 'queue',
    activeItem: null,
    activeNote: null,
    collapsedCategories: {},
    // PDF Reader state
    pdfDoc: null,
    pdfCurrentPage: 1,
    pdfScale: 1.5,
    pdfRendering: false,
    pdfView: false,
  };

  // --- DOM ELEMENTS ---
  const el = {
    sidebar: document.getElementById('sidebar'),
    openSidebarBtn: document.getElementById('open-sidebar-btn'),
    closeSidebarBtn: document.getElementById('close-sidebar-btn'),
    categoryList: document.getElementById('category-list'),
    feedContainer: document.getElementById('feed-container'),
    searchInput: document.getElementById('search-input'),
    currentViewTitle: document.getElementById('current-view-title'),
    currentViewSubtext: document.getElementById('current-view-subtext'),
    markAllReadBtn: document.getElementById('mark-all-read-btn'),
    refreshAllBtn: document.getElementById('refresh-all-btn'),
    backToFeedsBtn: document.getElementById('back-to-feeds-btn'),
    
    // Counters
    countQueue: document.getElementById('count-queue'),
    countToday: document.getElementById('count-today'),

    // Reader Drawer
    readerBackdrop: document.getElementById('reader-backdrop'),
    readerDrawer: document.getElementById('reader-drawer'),
    playInMpvBtn: document.getElementById('play-in-mpv-btn'),
    closeReaderBtn: document.getElementById('close-reader-btn'),
    closeReaderXBtn: document.getElementById('close-reader-x-btn'),
    modeReaderBtn: document.getElementById('mode-reader-btn'),
    modeWebviewBtn: document.getElementById('mode-webview-btn'),
    extractFullArticleBtn: document.getElementById('extract-full-article-btn'),
    articleView: document.getElementById('article-view'),
    readerWebviewContainer: document.getElementById('reader-webview-container'),
    readerWebviewIframe: document.getElementById('reader-webview-iframe'),
    readerBookmarkBtn: document.getElementById('reader-bookmark-btn'),
    toggleGardenNoteBtn: document.getElementById('toggle-garden-note-btn'),
    externalLinkBtn: document.getElementById('external-link-btn'),
    readerCategoryBadge: document.getElementById('reader-category-badge'),
    readerFeedTitle: document.getElementById('reader-feed-title'),
    readerDate: document.getElementById('reader-date'),
    readerTitle: document.getElementById('reader-title'),
    readerAuthor: document.getElementById('reader-author'),
    readerMediaContainer: document.getElementById('reader-media-container'),
    readerContent: document.getElementById('reader-content'),
    gardenNotePanel: document.getElementById('garden-note-panel'),
    noteMarkdownInput: document.getElementById('note-markdown-input'),
    noteTagsInput: document.getElementById('note-tags-input'),
    saveNoteBtn: document.getElementById('save-note-btn'),

    // Modals
    addFeedModal: document.getElementById('add-feed-modal'),
    addFeedOpenBtn: document.getElementById('add-feed-open-btn'),
    addFeedCloseBtn: document.getElementById('add-feed-close-btn'),
    addFeedCancelBtn: document.getElementById('add-feed-cancel-btn'),
    addFeedSubmitBtn: document.getElementById('add-feed-submit-btn'),
    feedUrlInput: document.getElementById('feed-url-input'),
    feedCategoryInput: document.getElementById('feed-category-input'),
    feedScopeInput: document.getElementById('feed-scope-input'),

    settingsModal: document.getElementById('settings-modal'),
    settingsOpenBtn: document.getElementById('settings-open-btn'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    localIpList: document.getElementById('local-ip-list'),
    qrTarget: document.getElementById('qr-target'),

    // Rules & Feed management
    ruleKeywordInput: document.getElementById('rule-keyword-input'),
    ruleActionInput: document.getElementById('rule-action-input'),
    addRuleBtn: document.getElementById('add-rule-btn'),
    rulesList: document.getElementById('rules-list'),
    manageFeedsList: document.getElementById('manage-feeds-list'),
  };

  // --- API / INTEROP LAYER ---
  const API = {
    async windowMinimise() {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.WindowMinimise) {
        return window.go.main.App.WindowMinimise();
      }
      if (window.runtime && window.runtime.WindowMinimise) {
        return window.runtime.WindowMinimise();
      }
    },

    async windowToggleMaximise() {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.WindowToggleMaximise) {
        return window.go.main.App.WindowToggleMaximise();
      }
      if (window.runtime && window.runtime.WindowToggleMaximise) {
        return window.runtime.WindowToggleMaximise();
      }
    },

    async windowClose() {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.WindowClose) {
        return window.go.main.App.WindowClose();
      }
      if (window.runtime && window.runtime.Quit) {
        return window.runtime.Quit();
      }
    },

    async getFeeds() {
      if (state.isWails) return window.go.main.App.GetFeeds();
      const res = await fetch('/api/feeds');
      return res.json();
    },

    async addFeed(url, category, scope) {
      if (state.isWails) return window.go.main.App.AddFeed(url, category, scope);
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, category, scope }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async deleteFeed(id) {
      if (state.isWails) return window.go.main.App.DeleteFeed(id);
      const res = await fetch('/api/feeds/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      return res.json();
    },

    async updateFeedTitle(id, title) {
      if (state.isWails) return window.go.main.App.UpdateFeedTitle(id, title);
      const res = await fetch('/api/feeds/update-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title }),
      });
      return res.json();
    },

    async getItems(category, feedID, filterType, searchQuery) {
      if (state.isWails) {
        return window.go.main.App.GetItems(category, feedID, filterType, searchQuery, 100, 0);
      }
      const params = new URLSearchParams({
        category: category || '',
        feed_id: feedID || 0,
        filter: filterType || '',
        q: searchQuery || '',
      });
      const res = await fetch(`/api/items?${params.toString()}`);
      return res.json();
    },

    async extractFullArticle(itemID, url = '') {
      if (state.isWails) {
        if (itemID > 0) return window.go.main.App.ExtractFullArticle(itemID);
        if (url && window.go.main.App.ExtractFullArticleByURL) return window.go.main.App.ExtractFullArticleByURL(url);
        return '';
      }
      const res = await fetch('/api/items/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemID, url: url }),
      });
      const data = await res.json();
      return data.content;
    },

    async toggleRead(itemID, isRead) {
      if (state.isWails) return window.go.main.App.ToggleRead(itemID, isRead);
      const res = await fetch('/api/items/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemID, is_read: isRead }),
      });
      return res.json();
    },

    async markAllAsRead(feedID) {
      if (state.isWails) return window.go.main.App.MarkAllAsRead(feedID);
      const res = await fetch('/api/items/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_id: feedID }),
      });
      return res.json();
    },

    async toggleBookmark(itemID) {
      if (state.isWails) return window.go.main.App.ToggleBookmark(itemID);
      const res = await fetch('/api/items/bookmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemID }),
      });
      const data = await res.json();
      return data.is_bookmarked;
    },

    async saveNote(itemID, noteMarkdown, tags) {
      if (state.isWails) return window.go.main.App.SaveGardenNote(itemID, noteMarkdown, tags);
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemID, note_markdown: noteMarkdown, tags }),
      });
      return res.json();
    },

    async getNote(itemID) {
      if (state.isWails) return window.go.main.App.GetGardenNote(itemID);
      const res = await fetch(`/api/notes?item_id=${itemID}`);
      return res.json();
    },

    async getAllNotes() {
      if (state.isWails) return window.go.main.App.GetAllGardenNotes();
      const res = await fetch('/api/notes');
      return res.json();
    },

    async refreshAll() {
      if (state.isWails) return window.go.main.App.RefreshFeeds();
      const res = await fetch('/api/refresh', { method: 'POST' });
      return res.json();
    },

    async playInMPV(urlStr) {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.PlayInMPV) {
        return window.go.main.App.PlayInMPV(urlStr);
      }
      try {
        const res = await fetch(`/api/video/mpv?url=${encodeURIComponent(urlStr)}`);
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    async openURL(urlStr) {
      if (window.go && window.go.main && window.go.main.App && window.go.main.App.OpenURL) {
        return window.go.main.App.OpenURL(urlStr);
      }
      window.open(urlStr, '_blank');
    },

    async getInfo() {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.GetPWAInfo) {
        return window.go.main.App.GetPWAInfo();
      }
      try {
        const res = await fetch('/api/info');
        return await res.json();
      } catch (e) {
        return { urls: [window.location.origin] };
      }
    },

    // Queue APIs
    async getQueue(status) {
      if (state.isWails) return window.go.main.App.GetQueue(status || '');
      const res = await fetch(`/api/queue?status=${status || ''}`);
      return res.json();
    },

    async addURLToQueue(url) {
      if (state.isWails) return window.go.main.App.AddURLToQueue(url);
      const res = await fetch('/api/queue/add-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      return res.json();
    },

    async addItemToQueue(itemID) {
      if (state.isWails) return window.go.main.App.AddItemToQueue(itemID);
      const res = await fetch('/api/queue/add-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemID }),
      });
      return res.json();
    },

    async setQueueStatus(id, status) {
      if (state.isWails) return window.go.main.App.SetQueueStatus(id, status);
      const res = await fetch('/api/queue/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      return res.json();
    },

    async deleteQueueItem(id) {
      if (state.isWails) return window.go.main.App.RemoveFromQueue(id);
      const res = await fetch('/api/queue/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      return res.json();
    },

    // Download APIs
    async startVideoDownload(url, title, thumbnail, itemID) {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.StartVideoDownload) {
        return window.go.main.App.StartVideoDownload(url, title || '', thumbnail || '', itemID || null);
      }
    },
    async getDownloads() {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.GetDownloads) {
        return window.go.main.App.GetDownloads();
      }
      return [];
    },
    async deleteDownload(id, deleteFile) {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.DeleteDownload) {
        return window.go.main.App.DeleteDownload(id, !!deleteFile);
      }
    },
    async openDownloadedFile(filePath) {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.OpenDownloadedFile) {
        return window.go.main.App.OpenDownloadedFile(filePath);
      }
    },
    async openDownloadFolder(filePath) {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.OpenDownloadFolder) {
        return window.go.main.App.OpenDownloadFolder(filePath || '');
      }
    },

    async getRules() {
      if (state.isWails) return window.go.main.App.GetFilterRules();
      const res = await fetch('/api/filters');
      return res.json();
    },

    async addRule(keyword, action, targetField) {
      if (state.isWails) return window.go.main.App.AddFilterRule(keyword, action, targetField);
      const res = await fetch('/api/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, action, target_field: targetField }),
      });
      return res.json();
    },

    async deleteRule(id) {
      if (state.isWails) return window.go.main.App.DeleteFilterRule(id);
      const res = await fetch('/api/filters/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      return res.json();
    },

    async getServerInfo() {
      if (window.go && window.go.main && window.go.main.App && window.go.main.App.GetServerInfo) {
        return window.go.main.App.GetServerInfo();
      }
      try {
        const res = await fetch('/api/info');
        return await res.json();
      } catch (e) {
        return { port: 8080 };
      }
    },

    // PDF: open native file picker and return base64-encoded PDF + filename
    async openPDFFile() {
      if (state.isWails && window.go && window.go.main && window.go.main.App) {
        return window.go.main.App.OpenPDFFile();
      }
      // Web fallback: use <input type="file">
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf,.pdf';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target.result.split(',')[1];
            resolve({ data: base64, file_name: file.name });
          };
          reader.readAsDataURL(file);
        };
        input.click();
      });
    },

    async generateSpeechAudio(text, rate = 1.0, voice = '') {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.GenerateSpeechAudio) {
        return window.go.main.App.GenerateSpeechAudio(text, rate, voice);
      }
      return null;
    },

    async getAvailableVoices() {
      if (state.isWails && window.go && window.go.main && window.go.main.App && window.go.main.App.GetAvailableVoices) {
        return window.go.main.App.GetAvailableVoices();
      }
      return [{ id: 'espeak', name: 'eSpeak NG (Default)' }];
    },
  };

  // --- INITIALIZATION ---
  async function init() {
    state.isWails = typeof window.runtime !== 'undefined' && typeof window.go !== 'undefined';
    console.log(`Digital Garden Feeds initialized. Environment: ${state.isWails ? 'Wails Desktop' : 'Web / Mobile PWA'}`);

    if (!state.isWails) {
      document.querySelectorAll('.window-controls').forEach((c) => (c.style.display = 'none'));
    }

    try {
      const info = await API.getServerInfo();
      if (info && info.port) state.pwaPort = info.port;
    } catch (e) {}

    registerServiceWorker();

    try {
      setupEventListeners();
    } catch (e) {
      console.error('Error setting up event listeners:', e);
    }

    if (window.runtime && window.runtime.EventsOn) {
      window.runtime.EventsOn('download_progress', (item) => {
        if (state.currentView === 'downloads') {
          loadDownloads();
        }
      });
      window.runtime.EventsOn('download_updated', () => {
        if (state.currentView === 'downloads') {
          loadDownloads();
        }
      });
    }

    try {
      await loadFeeds();
    } catch (e) {
      console.error('Error loading feeds:', e);
    }

    try {
      await loadItems();
    } catch (e) {
      console.error('Error loading items:', e);
    }

    try {
      await loadRules();
    } catch (e) {
      console.error('Error loading rules:', e);
    }

    updatePwaInfo();

    if (state.isWails && window.runtime && window.runtime.EventsOn) {
      window.runtime.EventsOn('feeds_updated', () => {
        loadFeeds();
        loadItems();
      });
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && !state.isWails) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.log('SW registration error:', err));
    }
  }

  // --- DATA LOADING & RENDERING ---
  async function loadFeeds() {
    try {
      state.feeds = (await API.getFeeds()) || [];
      renderCategories();
      renderManageFeeds();
    } catch (e) {
      console.error('Error loading feeds:', e);
    }
  }

  function updateUniversalHeader(title, subtitle) {
    if (el.currentViewTitle) el.currentViewTitle.textContent = title;
    if (el.currentViewSubtext) el.currentViewSubtext.textContent = subtitle;
  }

  async function loadQueue() {
    try {
      state.queue = (await API.getQueue('')) || [];
      renderQueue();
      const pendingCount = (state.queue || []).filter((q) => q.status === 'pending').length;
      updateUniversalHeader('My Queue', `Watchlist • ${pendingCount} video${pendingCount === 1 ? '' : 's'}`);
      updateCounters();
    } catch (e) {
      console.error('Error loading queue:', e);
    }
  }

  async function loadDownloads() {
    updateUniversalHeader("Video Downloads", "Manage active & completed downloads");
    try {
      const downloads = (await API.getDownloads()) || [];
      renderDownloadsList(downloads);
    } catch (e) {
      console.error('Error loading downloads:', e);
    }
  }

  function renderDownloadsList(downloads) {
    const listEl = document.getElementById('downloads-list');
    if (!listEl) return;
    if (!downloads || downloads.length === 0) {
      listEl.innerHTML = `
        <div class="loading-state" style="padding: 40px 0;">
          <i class="icon-download" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 12px;"></i>
          <p class="subtext">No downloads yet. Click 'Download Video' from any card!</p>
        </div>`;
      return;
    }

    listEl.innerHTML = downloads.map(dl => {
      const isDownloading = dl.status === 'downloading';
      const isCompleted = dl.status === 'completed';
      const isFailed = dl.status === 'failed';
      const thumb = dl.thumbnail || 'appicon.png';

      return `
        <div class="download-item-card" data-dl-id="${dl.id}">
          <img src="${escapeHtml(thumb)}" class="download-thumb" onerror="this.src='appicon.png'" />
          <div class="download-info">
            <div class="download-title">${escapeHtml(dl.title || dl.url)}</div>
            ${isDownloading ? `
              <div class="download-progress-container">
                <div class="download-progress-fill" style="width: ${dl.progress}%;"></div>
              </div>
              <div class="download-meta">
                <span class="download-badge downloading">Downloading ${dl.progress}%</span>
                <span>Speed: ${escapeHtml(dl.speed || '0 B/s')}</span>
                <span>ETA: ${escapeHtml(dl.eta || '--:--')}</span>
              </div>
            ` : isCompleted ? `
              <div class="download-meta">
                <span style="max-width: 540px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #4a3820; font-size: 0.78rem; font-weight: 500;">${escapeHtml(dl.file_path || '')}</span>
              </div>
            ` : `
              <div class="download-meta">
                <span class="download-badge failed">Failed</span>
                <span style="color: #e74c3c;">${escapeHtml(dl.error_msg || 'Download failed')}</span>
              </div>
            `}
          </div>
          <div class="download-actions">
            ${isCompleted ? `
              <button class="btn btn-secondary btn-sm open-dl-file-btn" data-filepath="${escapeHtml(dl.file_path)}" title="Play Video / Open File">
                <i class="icon-play"></i> Open
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm delete-dl-btn" data-id="${dl.id}" title="Delete Record">
              <i class="icon-trash-2"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadItems() {
    try {
      const downloadsContainer = document.getElementById('downloads-container');
      if (state.currentView === 'downloads') {
        if (el.feedContainer) el.feedContainer.style.display = 'none';
        if (downloadsContainer) downloadsContainer.style.display = 'block';
        await loadDownloads();
        return;
      }

      if (downloadsContainer) downloadsContainer.style.display = 'none';
      if (el.feedContainer) el.feedContainer.style.display = ''; // clear inline, let CSS grid take over

      if (state.currentView === 'queue') {
        await loadQueue();
        return;
      }

      el.feedContainer.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading video stream...</p>
        </div>`;

      if (state.currentView === 'bookmarks') {
        const bookmarkedItems = (await API.getItems('', 0, 'bookmarked', state.searchQuery)) || [];
        state.items = bookmarkedItems;
        updateUniversalHeader("Bookmarks", `Bookmarked Items • ${bookmarkedItems.length} item${bookmarkedItems.length === 1 ? '' : 's'}`);
        renderFeedCards();
        updateCounters();
        return;
      }

      if (state.currentView === 'today' || state.currentFilter === 'today') {
        const todayItems = (await API.getItems('', 0, 'today', state.searchQuery)) || [];
        state.items = todayItems;
        updateUniversalHeader("Today's Feed", `Released Today • ${todayItems.length} item${todayItems.length === 1 ? '' : 's'}`);
        renderFeedCards();
        updateCounters();
        return;
      }

      const catParam = state.currentFeedID > 0 ? '' : state.currentCategory;
      state.items = (await API.getItems(catParam, state.currentFeedID, state.currentFilter, state.searchQuery)) || [];

      if (state.currentFeedID > 0) {
        const f = state.feeds.find((item) => item.id === state.currentFeedID);
        const title = f ? f.title : 'Channel Feed';
        const type = f && f.feed_type === 'youtube' ? 'YouTube Channel' : 'RSS Feed';
        updateUniversalHeader(title, `${type} • ${state.items.length} item${state.items.length === 1 ? '' : 's'}`);
      } else if (state.currentCategory && state.currentCategory !== 'All') {
        updateUniversalHeader(state.currentCategory, `Category • ${state.items.length} item${state.items.length === 1 ? '' : 's'}`);
      } else {
        updateUniversalHeader('All Feeds', `Feed Stream • ${state.items.length} item${state.items.length === 1 ? '' : 's'}`);
      }

      renderFeedCards();
      updateCounters();
    } catch (e) {
      console.error('Error loading items:', e);
      el.feedContainer.innerHTML = `<div class="loading-state"><p>Error loading items: ${e.message}</p></div>`;
    }
  }

  async function loadRules() {
    try {
      state.rules = (await API.getRules()) || [];
      renderRulesList();
    } catch (e) {
      console.error('Error loading rules:', e);
    }
  }

  function getSavedCategoryOrder() {
    try {
      const saved = localStorage.getItem('vayu_category_order');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCategoryOrder(orderArray) {
    try {
      localStorage.setItem('vayu_category_order', JSON.stringify(orderArray));
    } catch (e) {}
  }

  function renderCategories() {
    state.collapsedCategories = state.collapsedCategories || {};
    const categoriesMap = {};
    state.feeds.forEach((f) => {
      const cat = f.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(f);
    });

    let savedOrder = getSavedCategoryOrder();
    const existingCats = Object.keys(categoriesMap);
    existingCats.forEach((cat) => {
      if (!savedOrder.includes(cat)) {
        savedOrder.push(cat);
      }
    });
    savedOrder = savedOrder.filter((cat) => existingCats.includes(cat));
    saveCategoryOrder(savedOrder);

    let html = '';

    savedOrder.forEach((catName, index) => {
      const feeds = categoriesMap[catName] || [];
      const isCatActive = state.currentCategory === catName && state.currentFeedID === 0;
      const isCollapsed = !!state.collapsedCategories[catName];
      const isFirst = index === 0;
      const isLast = index === savedOrder.length - 1;

      html += `
        <div class="category-group" data-category="${escapeHtml(catName)}" style="margin-bottom:6px;">
          <div class="nav-item category-parent-item ${isCatActive ? 'active' : ''}" data-category="${escapeHtml(catName)}" data-feed-id="0">
            <i class="icon-chevron-down category-chevron ${isCollapsed ? 'collapsed' : ''}" data-toggle-cat="${escapeHtml(catName)}" title="Toggle collapse"></i>
            <span class="nav-item-title">${escapeHtml(catName)}</span>
          </div>
          <div class="subfeed-list ${isCollapsed ? 'collapsed' : ''}">
            ${feeds
              .map((f) => {
                const isFeedActive = state.currentFeedID === f.id;
                let feedIcon = 'icon-file-text';
                const feedType = (f.feed_type || '').toLowerCase();
                const feedUrl = (f.feed_url || '').toLowerCase();
                const catLower = (catName || '').toLowerCase();

                if (feedType === 'youtube' || feedUrl.includes('youtube.com') || feedUrl.includes('youtu.be')) {
                  feedIcon = 'icon-play';
                } else if (feedType === 'github' || feedUrl.includes('github.com')) {
                  feedIcon = 'icon-code';
                } else if (feedType === 'substack' || catLower === 'substack') {
                  feedIcon = 'icon-book-open';
                }

                return `
                <div class="nav-item subfeed-item ${isFeedActive ? 'active' : ''}" data-category="${escapeHtml(catName)}" data-feed-id="${f.id}">
                  <i class="${feedIcon} nav-item-icon subfeed-icon"></i>
                  <span class="nav-item-title">${escapeHtml(f.title)}</span>
                  <span class="item-more-dots feed-rename-btn" data-feed-id="${f.id}" data-feed-title="${escapeHtml(f.title)}" title="Rename feed">⋮</span>
                </div>`;
              })
              .join('')}
          </div>
        </div>`;
    });

    el.categoryList.innerHTML = html;
    attachCategoryDragListeners();
  }

  let draggedCategory = null;

  function attachCategoryDragListeners() {
    const groups = el.categoryList.querySelectorAll('.category-group');
    groups.forEach((group) => {
      group.addEventListener('dragstart', (e) => {
        draggedCategory = group.dataset.category;
        group.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggedCategory);
        }
      });

      group.addEventListener('dragend', () => {
        draggedCategory = null;
        group.classList.remove('dragging');
        groups.forEach((g) => g.classList.remove('drag-over'));
      });

      group.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (draggedCategory && group.dataset.category !== draggedCategory) {
          group.classList.add('drag-over');
        }
      });

      group.addEventListener('dragleave', () => {
        group.classList.remove('drag-over');
      });

      group.addEventListener('drop', (e) => {
        e.preventDefault();
        group.classList.remove('drag-over');
        const targetCategory = group.dataset.category;
        if (!draggedCategory || draggedCategory === targetCategory) return;

        let order = getSavedCategoryOrder();
        const dragIdx = order.indexOf(draggedCategory);
        const targetIdx = order.indexOf(targetCategory);

        if (dragIdx !== -1 && targetIdx !== -1) {
          order.splice(dragIdx, 1);
          order.splice(targetIdx, 0, draggedCategory);
          saveCategoryOrder(order);
          renderCategories();
        }
      });
    });
  }

  function getFeedIconClass(feedType) {
    switch (feedType) {
      case 'youtube':
        return 'icon-video';
      case 'substack':
        return 'icon-mail';
      case 'github':
        return 'icon-git-branch';
      case 'hackernews':
        return 'icon-newspaper';
      default:
        return 'icon-rss';
    }
  }

  function getPlatformLabel(feedType, url) {
    const type = (feedType || '').toLowerCase();
    const link = (url || '').toLowerCase();
    if (type === 'youtube' || link.includes('youtube.com') || link.includes('youtu.be')) return 'YouTube';
    if (type === 'substack' || link.includes('substack.com')) return 'Substack';
    if (type === 'github' || link.includes('github.com')) return 'GitHub';
    if (type === 'hackernews' || link.includes('news.ycombinator.com')) return 'HackerNews';
    if (link.includes('medium.com')) return 'Medium';
    if (link.includes('dev.to')) return 'Dev.to';
    return 'Blog';
  }

  function getBadgeClassForType(feedType, url) {
    const label = getPlatformLabel(feedType, url);
    switch (label) {
      case 'YouTube': return 'cat-youtube';
      case 'Substack': return 'cat-substack';
      case 'GitHub': return 'cat-github';
      case 'HackerNews': return 'cat-hackernews';
      default: return 'cat-blog';
    }
  }

  function getBadgeClass(feedType) {
    switch (feedType) {
      case 'youtube':
        return 'cat-youtube';
      case 'substack':
        return 'cat-substack';
      case 'github':
        return 'cat-github';
      case 'hackernews':
        return 'cat-hackernews';
      default:
        return 'cat-blog';
    }
  }

  function estimateReadingTime(text) {
    if (!text) return '1 min read';
    const words = text.replace(/<[^>]*>/g, '').trim().split(/\s+/).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  }

  function getJewelColorClass(title) {
    const colors = ['card-badge-purple', 'card-badge-teal', 'card-badge-amber', 'card-badge-magenta'];
    let hash = 0;
    for (let i = 0; i < (title || '').length; i++) {
      hash = (hash << 5) - hash + title.charCodeAt(i);
      hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
  }

  function getPlatformIconSvg(platformLabel) {
    switch (platformLabel) {
      case 'YouTube':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="5" fill="#e50914"/><polygon points="9.5,7.5 16.5,12 9.5,16.5" fill="#ffffff"/></svg>`;
      case 'Substack':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#ff6719"/><path d="M7 6h10v2.6H7zm0 4.2h10v2.6H7zm0 4.2l5 3.2 5-3.2V20H7z" fill="#ffffff"/></svg>`;
      case 'GitHub':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#6e40c9"/><circle cx="9" cy="9" r="2" fill="#fff"/><circle cx="15" cy="15" r="2" fill="#fff"/><path d="M9 11v4a2 2 0 002 2h4" stroke="#fff" stroke-width="1.8" fill="none"/></svg>`;
      case 'HackerNews':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#ff6600"/><text x="12" y="16.5" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">Y</text></svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#0d9488"/><path d="M7 8h10M7 12h10M7 16h6" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg>`;
    }
  }

  function getContentTypeLabel(platformLabel, feedType) {
    if (platformLabel === 'YouTube' || feedType === 'youtube') return 'Video';
    if (platformLabel === 'Substack') return 'Article';
    if (platformLabel === 'GitHub') return 'Repository';
    if (platformLabel === 'HackerNews') return 'Discussion';
    return 'Article';
  }

  function formatDurationOrReadTime(itemOrQueue, isVideo) {
    if (isVideo) {
      const text = `${itemOrQueue.title || ''} ${itemOrQueue.snippet || ''} ${itemOrQueue.description || ''}`;
      const match = text.match(/(?:duration|length)?[:\s]*(\d+h\s*\d+m|\d+:\d{2}(?::\d{2})?|\d+\s*(?:hr|hours|mins|minutes))/i);
      if (match) return match[1];
      return 'Video';
    }
    return estimateReadingTime(itemOrQueue.content || itemOrQueue.snippet || itemOrQueue.description);
  }

  function getMediaBoxHtml(itemOrQueue, platformLabel) {
    const isVideo = platformLabel === 'YouTube' || (itemOrQueue.content_type === 'youtube') || (itemOrQueue.feed_type === 'youtube');

    if (isVideo || platformLabel === 'YouTube') {
      return `
        <div class="card-media">
          <div class="card-icon-badge card-badge-youtube">
            <svg width="34" height="24" viewBox="0 0 28 20" fill="none">
              <rect width="28" height="20" rx="5" fill="#e50914"/>
              <polygon points="11,5.5 19,10 11,14.5" fill="#ffffff"/>
            </svg>
          </div>
        </div>`;
    }

    if (platformLabel === 'Substack') {
      return `
        <div class="card-media">
          <div class="card-icon-badge card-badge-substack">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M6 5h12v3.4H6zm0 5.2h12v3.4H6zm0 5.2l6 4.2 6-4.2V21H6z" fill="#ff6719"/>
            </svg>
          </div>
        </div>`;
    }

    if (platformLabel === 'GitHub') {
      return `
        <div class="card-media">
          <div class="card-icon-badge card-badge-github">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#ffffff" stroke-width="2"/>
              <circle cx="9" cy="9" r="2" fill="#ffffff"/>
              <circle cx="15" cy="15" r="2" fill="#ffffff"/>
              <path d="M9 11v3a2 2 0 0 0 2 2h4" stroke="#ffffff" stroke-width="2"/>
            </svg>
          </div>
        </div>`;
    }

    if (platformLabel === 'HackerNews') {
      return `
        <div class="card-media">
          <div class="card-icon-badge card-badge-hackernews">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <text x="12" y="18" fill="#ffffff" font-size="18" font-weight="bold" text-anchor="middle" font-family="sans-serif">Y</text>
            </svg>
          </div>
        </div>`;
    }

    const jewelClass = getJewelColorClass(itemOrQueue.title);
    return `
      <div class="card-media">
        <div class="card-icon-badge ${jewelClass}">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
      </div>`;
  }

  function renderQueue() {
    if (!state.queue || state.queue.length === 0) {
      el.feedContainer.innerHTML = `
        <div class="loading-state">
          <i class="icon-list-todo" style="font-size: 3rem; color: var(--accent-primary); margin-bottom: 12px;"></i>
          <h3>Your Queue is empty</h3>
          <p class="subtext">Paste any YouTube video or article URL above, or add items from Discover!</p>
          <button class="btn btn-primary btn-sm" id="empty-queue-add-btn" style="margin-top:14px;">
            <i class="icon-link"></i> Add URL to Queue
          </button>
        </div>`;
      const btn = document.getElementById('empty-queue-add-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          document.getElementById('add-url-modal').classList.add('open');
        });
      }
      return;
    }

    const pendingCount = state.queue.filter((q) => q.status === 'pending').length;
    const doneCount = state.queue.filter((q) => q.status === 'done').length;

    const filteredQueue = state.queue.filter((q) => {
      if (state.queueFilter === 'pending') return q.status === 'pending';
      if (state.queueFilter === 'done') return q.status === 'done';
      return true;
    });

    let html = `
      <div class="queue-filter-bar">
        <div class="btn-group">
          <button class="btn queue-filter-tab ${state.queueFilter === 'pending' ? 'active' : ''}" data-queue-filter="pending">
            Up Next ${pendingCount})
          </button>
          <button class="btn queue-filter-tab ${state.queueFilter === 'done' ? 'active' : ''}" data-queue-filter="done">
            Completed ${doneCount})
          </button>
          <button class="btn queue-filter-tab ${state.queueFilter === 'all' ? 'active' : ''}" data-queue-filter="all">
            All ${state.queue.length})
          </button>
        </div>
      </div>`;

    if (filteredQueue.length === 0) {
      html += `
        <div class="loading-state" style="padding:40px 0;">
          <p class="subtext">No items in this filter view.</p>
        </div>`;
    } else {
      html += filteredQueue
        .map((q, index) => {
          const platformLabel = getPlatformLabel(q.content_type, q.url);
          const isVideo = platformLabel === 'YouTube' || q.content_type === 'youtube';
          const platformIconSvg = getPlatformIconSvg(platformLabel);
          const mediaHtml = getMediaBoxHtml(q, platformLabel);
          const formattedDate = formatDate(q.added_at);
          const durationStr = formatDurationOrReadTime(q, isVideo);
          const isDone = q.status === 'done';
          const isActive = index === 0;
          const channelName = (q.item_id && state.items.find((i) => i.id === q.item_id)?.feed_title) || platformLabel;

          return `
          <article class="feed-card ${isActive ? 'active-card' : ''} ${isDone ? 'read' : ''}" data-queue-id="${q.id}">
            ${mediaHtml}

            <div class="card-content">
              <div class="card-meta-top">
                <span class="card-meta-date">
                  <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  ${formattedDate}
                </span>
                <span class="card-meta-dot">•</span>
                <span class="card-meta-duration">
                  <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  ${durationStr}
                </span>
              </div>

              <h3 class="card-title" title="${escapeHtml(q.title)}">${escapeHtml(q.title)}</h3>
              ${q.description ? `<p class="card-snippet" title="${escapeHtml(q.description)}">${escapeHtml(q.description)}</p>` : ''}

              <div class="card-channel-row">
                <span class="card-platform-icon">${platformIconSvg}</span>
                <span class="card-channel-name">${escapeHtml(channelName)}</span>
              </div>
            </div>

            <div class="card-actions-col">
              <button class="btn card-check-btn queue-status-btn ${isDone || isActive ? 'checked' : ''}" data-id="${q.id}" data-status="${isDone ? 'pending' : 'done'}" title="${isDone ? 'Mark as Pending' : 'Mark as Done'}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
              <div class="card-options-dropdown" data-id="${q.id}">
                <button class="btn card-options-btn" data-toggle-card-options="${q.id}" title="Options">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                </button>
                <div class="card-options-menu" id="card-options-menu-${q.id}">
                  <button class="card-options-item queue-remove-btn" data-id="${q.id}">
                    <i class="icon-trash-2"></i> Remove from Queue
                  </button>
                </div>
              </div>
            </div>
          </article>`;
        })
        .join('');
    }

    el.feedContainer.innerHTML = html;
  }

  function renderFeedCards() {
    if (state.items.length === 0) {
      el.feedContainer.innerHTML = `
        <div class="loading-state">
          <i class="icon-sprout" style="font-size: 3rem; color: var(--accent-primary); margin-bottom: 12px;"></i>
          <h3>No posts found</h3>
          <p class="subtext">Add new resources or adjust your filter rules!</p>
        </div>`;
      return;
    }

    const html = state.items
      .map((item, index) => {
        const platformLabel = getPlatformLabel(item.feed_type, item.link);
        const isVideo = platformLabel === 'YouTube' || item.feed_type === 'youtube';
        const platformIconSvg = getPlatformIconSvg(platformLabel);
        const mediaHtml = getMediaBoxHtml(item, platformLabel);
        const formattedDate = formatDate(item.pub_date);
        const cleanTitle = escapeHtml(decodeEntities(item.title || 'Untitled Story'));
        let rawSnippet = decodeEntities(item.snippet || item.title || '');
        if (rawSnippet.includes('Story posted on Hacker News') || rawSnippet.includes('Click to read article')) {
          rawSnippet = isVideo
            ? `Video content from ${item.feed_title || 'YouTube Channel'}`
            : `Latest update from ${item.feed_title || 'Feed'}`;
        }
        const cleanSnippet = escapeHtml(rawSnippet);
        const durationStr = formatDurationOrReadTime(item, isVideo);
        const isRead = item.is_read;
        const isActive = index === 0;
        const channelName = item.feed_title || platformLabel || 'Feed';

        return `
        <article class="feed-card ${isActive ? 'active-card' : ''} ${isRead ? 'read' : ''}" data-id="${item.id}">
          ${mediaHtml}

          <div class="card-content">
            <div class="card-meta-top">
              <span class="card-meta-date">
                <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${formattedDate}
              </span>
              <span class="card-meta-dot">•</span>
              <span class="card-meta-duration">
                <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                ${durationStr}
              </span>
            </div>

            <h3 class="card-title" title="${cleanTitle}">${cleanTitle}</h3>
            ${cleanSnippet ? `<p class="card-snippet" title="${cleanSnippet}">${cleanSnippet}</p>` : ''}

            <div class="card-channel-row">
              <span class="card-platform-icon">${platformIconSvg}</span>
              <span class="card-channel-name">${escapeHtml(channelName)}</span>
            </div>
          </div>

          <div class="card-actions-col">
            <button class="btn card-check-btn read-btn ${isRead || isActive ? 'checked' : ''}" data-id="${item.id}" title="${isRead ? 'Mark as Unread' : 'Mark as Read'}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <div class="card-options-dropdown" data-id="${item.id}">
              <button class="btn card-options-btn" data-toggle-card-options="${item.id}" title="Options">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
              <div class="card-options-menu" id="card-options-menu-${item.id}">
                <button class="card-options-item add-to-queue-btn" data-id="${item.id}">
                  <i class="icon-plus"></i> Add to Queue
                </button>
                <button class="card-options-item card-bookmark-btn" data-id="${item.id}">
                  <i class="icon-bookmark" style="${item.is_bookmarked ? 'color: var(--amber-glow); fill: var(--amber-glow);' : ''}"></i> ${item.is_bookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
                ${isVideo ? `
                  <button class="card-options-item card-download-btn" data-url="${escapeHtml(item.link)}" data-title="${cleanTitle}" data-thumb="${escapeHtml(item.thumbnail || '')}" data-id="${item.id}">
                    <i class="icon-download"></i> Download Video
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </article>`;
      })
      .join('');

    el.feedContainer.innerHTML = html;
  }

  function renderGardenNotesGrid(notes) {
    if (!notes || notes.length === 0) {
      el.feedContainer.innerHTML = `
        <div class="loading-state">
          <i class="icon-sprout" style="font-size: 3rem; color: var(--accent-primary); margin-bottom: 12px;"></i>
          <h3>Your Digital Garden is empty</h3>
          <p class="subtext">Open any article and write your personal notes and takeaways!</p>
        </div>`;
      return;
    }

    const html = notes
      .map((note) => {
        const formattedDate = formatDate(note.updated_at);
        return `
        <div class="garden-note-card" data-item-id="${note.item_id}">
          <div>
            <div class="card-badge-row">
              <span class="cat-tag cat-blog">🌱 Garden Note</span>
              <span class="card-date">${formattedDate}</span>
            </div>
            <h3 class="card-title" style="color:var(--accent-primary); margin-bottom:4px;">${escapeHtml(note.item_title)}</h3>
            <div class="subtext" style="margin-bottom:12px;">Source: ${escapeHtml(note.feed_title)}</div>
            <div class="article-body" style="font-size:0.9rem; background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; margin-bottom:12px;">
              ${escapeHtml(note.note_markdown)}
            </div>
            ${note.tags ? `<div style="font-size:0.8rem; color:var(--accent-primary); font-weight:600;">${escapeHtml(note.tags)}</div>` : ''}
          </div>
          <div class="card-footer" style="margin-top:14px;">
            <button class="btn btn-secondary btn-sm open-note-item-btn" data-item-id="${note.item_id}">
              Open Article &rarr;
            </button>
          </div>
        </div>`;
      })
      .join('');

    el.feedContainer.innerHTML = html;
  }

  async function updateCounters() {
    const todayItems = (await API.getItems('', 0, 'today', '')) || [];
    const pendingQueue = (state.queue || []).filter((q) => q.status === 'pending').length;
    if (el.countQueue) el.countQueue.textContent = pendingQueue;
    if (el.countToday) el.countToday.textContent = todayItems.length;
  }

  // --- READER DRAWER & GARDEN NOTES ---
  async function openQueueItem(q) {
    if (!q) return;

    if (q.item_id && q.item_id > 0) {
      let item = state.items.find((i) => i.id === q.item_id);
      if (!item) {
        try {
          const res = await API.getItems('All', 0, '', '');
          item = res.find((i) => i.id === q.item_id);
        } catch (e) {}
      }
      if (item) {
        openReader(item);
        return;
      }
    }

    const ytID = extractYouTubeID(q.url);
    const mockItem = {
      id: 0,
      feed_id: 0,
      title: q.title || q.url,
      link: q.url,
      guid: q.url,
      feed_type: q.content_type === 'youtube' || Boolean(ytID) ? 'youtube' : 'blog',
      feed_title: q.content_type === 'youtube' || Boolean(ytID) ? 'YouTube' : 'Web Link',
      pub_date: q.added_at || new Date().toISOString(),
      content: q.description || '',
      snippet: q.description || '',
      is_bookmarked: false,
      is_read: q.status === 'done',
    };
    openReader(mockItem);
  }

  async function openReader(itemOrID) {
    if (window.appStopAudioReader) window.appStopAudioReader();
    let item;
    if (typeof itemOrID === 'object' && itemOrID !== null) {
      item = itemOrID;
    } else {
      const itemID = itemOrID;
      item = state.items.find((i) => i.id === itemID);
      if (!item) {
        try {
          const res = await API.getItems('All', 0, '', '');
          item = res.find((i) => i.id === itemID);
        } catch (e) {}
      }
    }
    if (!item) return;

    state.activeItem = item;
    if (item.id > 0 && !item.is_read) {
      item.is_read = true;
      API.toggleRead(item.id, true);
      renderFeedCards();
      updateCounters();
    }

    const linkYtID = extractYouTubeID(item.link) || extractYouTubeID(item.guid);
    const isYouTube = item.feed_type === 'youtube' || Boolean(linkYtID);

    if (el.readerFeedTitle) el.readerFeedTitle.textContent = item.feed_title || 'Web';
    if (el.readerDate) el.readerDate.textContent = formatDate(item.pub_date);
    if (el.readerTitle) el.readerTitle.textContent = item.title || item.link;
    if (el.readerAuthor) el.readerAuthor.textContent = item.author ? `By ${item.author}` : '';
    if (el.externalLinkBtn) el.externalLinkBtn.href = item.link;

    // Calculate Reading Time
    const readingTimeEl = document.getElementById('reader-reading-time');
    const wordCount = (item.content || item.snippet || '').replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length;
    const estMinutes = Math.max(1, Math.ceil(wordCount / 200));
    if (readingTimeEl) readingTimeEl.textContent = `${estMinutes} min read`;

    el.readerMediaContainer.innerHTML = '';

    if (isYouTube) {
      // YouTube video feed / direct link: use full YouTube Theater Mode
      const activeYtID = linkYtID || extractYouTubeID(item.link) || extractYouTubeID(item.content);
      const embedPath = `/api/video/embed?id=${activeYtID}`;
      state.youtubeEmbedUrl = activeYtID ? (state.pwaPort ? `http://localhost:${state.pwaPort}${embedPath}` : `https://www.youtube.com/embed/${activeYtID}?autoplay=1&rel=0&playsinline=1`) : '';
      setReaderMode('youtube');
      if (el.playInMpvBtn) el.playInMpvBtn.style.display = 'flex';
    } else {
      state.youtubeEmbedUrl = '';
      let bodyContent = item.content || item.snippet || item.title || '';
      if (bodyContent.includes('Story posted on Hacker News')) {
        bodyContent = item.snippet || item.title;
      }
      
      // Clean up body content: remove post headers, duplicate title headings, and author avatars/photos
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = bodyContent;

      // 1. Remove post headers, byline wrappers, and avatar buttons
      tempDiv.querySelectorAll('.post-header, .single-post-header, .article-header, .entry-header, .byline-wrapper, .pfp-button, .pfp-img, .pfp-wrapper, .profile-hover-card-target, .profile-hover-card, .author-photo, .byline-image, .pfp, .avatar, .author-avatar, .profile-card, img.avatar, img.author-photo, img.byline-image, img[src*="user_image"], img[src*="user-image"], img[src*="profile"], img[src*="avatar"], img[src*="c_fill,g_faces"]').forEach(el => el.remove());

      // 2. Remove duplicate title headings matching article title
      const headingCandidates = tempDiv.querySelectorAll('h1, h2, h3, .post-title, .article-title, .entry-title');
      headingCandidates.forEach(heading => {
        const hText = heading.textContent.trim().toLowerCase().replace(/[^\w\s]/gi, '');
        const tText = (item.title || '').trim().toLowerCase().replace(/[^\w\s]/gi, '');
        if (hText && tText && (hText === tText || tText.includes(hText) || hText.includes(tText))) {
          heading.remove();
        }
      });

      bodyContent = tempDiv.innerHTML;

      // If article embeds a YouTube video, render it cleanly in media container above body
      const contentYtID = extractYouTubeID(item.content || '');
      if (contentYtID) {
        el.readerMediaContainer.innerHTML = `<div class="media-container"><iframe src="https://www.youtube.com/embed/${contentYtID}?autoplay=1&rel=0&playsinline=1" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:420px; border:none; border-radius:12px;"></iframe></div>`;
      }

      if (item.link && !bodyContent.includes('hn-post-card')) {
        bodyContent += `
          <div class="full-article-box">
            <a href="${escapeHtml(item.link)}" target="_blank" class="full-article-link">
              Open Full Story on ${escapeHtml(item.feed_title || 'Web')} &rarr;
            </a>
          </div>`;
      }
      el.readerContent.innerHTML = bodyContent;
      setReaderMode('reader');
      if (el.playInMpvBtn) el.playInMpvBtn.style.display = 'none';
    }
    
    // Attach scroll progress bar listener
    const readerScroll = document.getElementById('reader-scroll-content');
    const progressBar = document.getElementById('reading-progress-bar');
    if (readerScroll && progressBar) {
      progressBar.style.width = '0%';
      readerScroll.onscroll = () => {
        const totalHeight = readerScroll.scrollHeight - readerScroll.clientHeight;
        const progress = totalHeight > 0 ? (readerScroll.scrollTop / totalHeight) * 100 : 0;
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      };
    }
    if (el.readerBookmarkBtn) el.readerBookmarkBtn.className = `icon-btn ${item.is_bookmarked ? 'active' : ''}`;
    el.readerDrawer.classList.add('open');
    if (el.readerBackdrop) el.readerBackdrop.classList.add('open');
    if (el.openSidebarBtn) el.openSidebarBtn.style.display = 'none';
    const topBarBrand = document.querySelector('.top-bar-brand');
    if (topBarBrand) topBarBrand.style.display = 'none';
    if (el.backToFeedsBtn) el.backToFeedsBtn.style.display = 'inline-flex';
    const searchBox = document.querySelector('.search-box');
    if (searchBox) searchBox.style.display = 'none';
    const topDropdown = document.getElementById('top-reader-options-dropdown');
    if (topDropdown) topDropdown.style.display = 'block';

    // Automatic silent background full article extraction if current content is short
    const plainText = (item.content || '').replace(/<[^>]*>/g, '').trim();
    if (plainText.length < 350 && item.link && item.feed_type !== 'youtube' && item.feed_type !== 'github' && item.feed_type !== 'hackernews') {
      API.extractFullArticle(item.id || 0, item.link || '').then((fullHTML) => {
        if (fullHTML && fullHTML.length > (item.content || '').length) {
          item.content = fullHTML;
          if (state.activeItem && (state.activeItem.id === item.id || state.activeItem.link === item.link)) {
            let updatedBody = fullHTML;
            if (item.link && !updatedBody.includes('hn-post-card')) {
              updatedBody += `
                <div class="full-article-box">
                  <a href="${escapeHtml(item.link)}" target="_blank" class="full-article-link">
                    Open Full Story on ${escapeHtml(item.feed_title || 'Web')} &rarr;
                  </a>
                </div>`;
            }
            el.readerContent.innerHTML = updatedBody;
          }
        }
      }).catch(() => {});
    }

    // Load Garden Note
    try {
      const note = await API.getNote(item.id);
      state.activeNote = note;
      if (note) {
        if (el.noteMarkdownInput) el.noteMarkdownInput.value = note.note_markdown || '';
        if (el.noteTagsInput) el.noteTagsInput.value = note.tags || '';
      } else {
        if (el.noteMarkdownInput) el.noteMarkdownInput.value = '';
        if (el.noteTagsInput) el.noteTagsInput.value = '';
      }
    } catch (e) {
      if (el.noteMarkdownInput) el.noteMarkdownInput.value = '';
      if (el.noteTagsInput) el.noteTagsInput.value = '';
    }

    el.readerDrawer.classList.add('open');
    if (el.readerBackdrop) el.readerBackdrop.classList.add('open');
  }

  function setReaderMode(mode) {
    if (mode === 'youtube') {
      // YouTube: show webview pane and load the embed URL once
      if (el.readerDrawer) el.readerDrawer.classList.add('video-mode');
      if (el.articleView) el.articleView.classList.add('hidden');
      if (el.readerWebviewContainer) el.readerWebviewContainer.classList.remove('hidden');
      if (el.readerWebviewIframe) {
        el.readerWebviewIframe.setAttribute('referrerpolicy', 'no-referrer');
        el.readerWebviewIframe.src = state.youtubeEmbedUrl || 'about:blank';
      }
      if (el.modeReaderBtn) el.modeReaderBtn.classList.remove('active');
      if (el.modeWebviewBtn) el.modeWebviewBtn.classList.add('active');
      if (el.extractFullArticleBtn) el.extractFullArticleBtn.style.display = 'none';
    } else if (mode === 'webview') {
      if (el.readerDrawer) el.readerDrawer.classList.remove('video-mode');
      if (el.modeReaderBtn) el.modeReaderBtn.classList.remove('active');
      if (el.modeWebviewBtn) el.modeWebviewBtn.classList.add('active');
      if (el.articleView) el.articleView.classList.add('hidden');
      if (el.readerWebviewContainer) el.readerWebviewContainer.classList.remove('hidden');
      if (state.youtubeEmbedUrl) {
        // already loaded
      } else if (state.activeItem && state.activeItem.link && el.readerWebviewIframe) {
        el.readerWebviewIframe.src = state.activeItem.link;
      }
    } else {
      if (el.readerDrawer) el.readerDrawer.classList.remove('video-mode');
      if (el.modeWebviewBtn) el.modeWebviewBtn.classList.remove('active');
      if (el.modeReaderBtn) el.modeReaderBtn.classList.add('active');
      if (el.readerWebviewContainer) el.readerWebviewContainer.classList.add('hidden');
      if (el.articleView) el.articleView.classList.remove('hidden');
    }
  }

  window.appSetReaderMode = setReaderMode;
  window.appOpenURL = (url) => API.openURL(url);
  window.appPlayInMPV = (url) => API.playInMPV(url);
  window.appCloseReader = closeReader;

  function closeReader() {
    el.readerDrawer.classList.remove('open');
    el.readerDrawer.classList.remove('video-mode');
    if (el.readerBackdrop) el.readerBackdrop.classList.remove('open');
    el.readerWebviewIframe.src = 'about:blank';
    el.readerMediaContainer.innerHTML = '';
    el.articleView.classList.remove('youtube-mode');
    state.activeItem = null;
    state.youtubeEmbedUrl = '';
    if (el.backToFeedsBtn) el.backToFeedsBtn.style.display = 'none';
    if (el.openSidebarBtn) el.openSidebarBtn.style.display = 'inline-flex';
    const topBarBrand = document.querySelector('.top-bar-brand');
    if (topBarBrand) topBarBrand.style.display = 'inline-block';
    const searchBox = document.querySelector('.search-box');
    if (searchBox) searchBox.style.display = 'flex';
    const topDropdown = document.getElementById('top-reader-options-dropdown');
    if (topDropdown) topDropdown.style.display = 'none';
    const topMenu = document.getElementById('top-reader-options-menu');
    if (topMenu) topMenu.style.display = 'none';
    if (window.appStopAudioReader) window.appStopAudioReader();
  }

  async function saveGardenNote() {
    if (!state.activeItem) return;
    const noteText = el.noteMarkdownInput.value.trim();
    const tags = el.noteTagsInput.value.trim();

    if (!noteText) return;

    try {
      await API.saveNote(state.activeItem.id, noteText, tags);
      state.activeItem.has_note = true;
      alert('Digital Garden note saved!');
      loadItems();
    } catch (e) {
      alert('Error saving note: ' + e.message);
    }
  }

  // --- PWA SETUP & RULES UI ---
  async function updatePwaInfo() {
    const info = await API.getInfo();
    if (info && info.urls && info.urls.length > 0) {
      el.localIpList.innerHTML = info.urls.map((u) => `<li>${u}</li>`).join('');

      if (window.qrcode && info.urls[0]) {
        const qr = qrcode(0, 'M');
        qr.addData(info.urls[0]);
        qr.make();
        el.qrTarget.innerHTML = qr.createImgTag(5);
      }
    }
  }

  function renderRulesList() {
    if (!el.rulesList) return;
    if (state.rules.length === 0) {
      el.rulesList.innerHTML = '<p class="subtext">No noise filtering rules defined yet.</p>';
      return;
    }
    el.rulesList.innerHTML = state.rules
      .map(
        (r) => `
      <div class="manage-feed-item">
        <div>
          <div class="manage-feed-title">'${escapeHtml(r.keyword)}'</div>
          <div class="manage-feed-url">Action: ${escapeHtml(r.action)} (${escapeHtml(r.target_field)})</div>
        </div>
        <button class="btn btn-secondary btn-sm delete-rule-btn" data-id="${r.id}" title="Delete Rule">
          <i class="icon-trash-2"></i> Delete
        </button>
      </div>`
      )
      .join('');
  }

  function renderManageFeeds() {
    if (!el.manageFeedsList) return;
    if (state.feeds.length === 0) {
      el.manageFeedsList.innerHTML = '<p class="subtext">No feeds added yet.</p>';
      return;
    }
    el.manageFeedsList.innerHTML = state.feeds
      .map(
        (f) => `
      <div class="manage-feed-item">
        <div style="min-width:0; flex:1; margin-right:12px;">
          <div class="manage-feed-title">${escapeHtml(f.title)}</div>
          <div class="manage-feed-url">${escapeHtml(f.feed_url)}</div>
        </div>
        <button class="btn btn-secondary btn-sm delete-feed-btn" data-id="${f.id}" title="Delete Feed" style="flex-shrink:0;">
          <i class="icon-trash-2"></i> Delete
        </button>
      </div>`
      )
      .join('');
  }

  // --- PDF READER ---
  function openPDFViewer() {
    const panel = document.getElementById('pdf-viewer-panel');
    if (panel) {
      panel.classList.add('open');
      state.pdfView = true;
    }
  }

  function closePDFViewer() {
    const panel = document.getElementById('pdf-viewer-panel');
    if (panel) {
      panel.classList.remove('open');
      state.pdfView = false;
    }
    // Restore active nav state to previous view
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach((n) => n.classList.remove('active'));
    const prevNavItem = document.querySelector(`.nav-item[data-view="${state.currentView}"]`);
    if (prevNavItem) prevNavItem.classList.add('active');
  }

  async function loadPDFFile() {
    let result;
    try {
      result = await API.openPDFFile();
    } catch (e) {
      alert('Could not open file picker: ' + e.message);
      return;
    }
    if (!result || !result.data) return; // user cancelled

    // Update filename display
    const filenameEl = document.getElementById('pdf-filename');
    if (filenameEl) filenameEl.textContent = result.file_name || 'document.pdf';

    // Hide empty state, show loading
    const emptyState = document.getElementById('pdf-empty-state');
    const canvas = document.getElementById('pdf-canvas');
    if (emptyState) emptyState.style.display = 'none';
    if (canvas) canvas.style.display = 'none';

    try {
      // Set PDF.js worker source (CDN)
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      } else {
        alert('PDF.js not loaded. Please check your internet connection and reload.');
        if (emptyState) emptyState.style.display = '';
        return;
      }

      // Decode base64 → Uint8Array
      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
      state.pdfDoc = await loadingTask.promise;
      state.pdfCurrentPage = 1;
      state.pdfScale = 1.5;

      const totalEl = document.getElementById('pdf-total-pages');
      if (totalEl) totalEl.textContent = state.pdfDoc.numPages;

      await renderPDFPage(1);
    } catch (e) {
      console.error('PDF load error:', e);
      alert('Could not render PDF: ' + (e.message || e));
      if (emptyState) emptyState.style.display = '';
    }
  }

  async function renderPDFPage(pageNum) {
    if (!state.pdfDoc || state.pdfRendering) return;
    state.pdfRendering = true;

    try {
      const page = await state.pdfDoc.getPage(pageNum);
      const canvas = document.getElementById('pdf-canvas');
      if (!canvas) { state.pdfRendering = false; return; }

      const viewport = page.getViewport({ scale: state.pdfScale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.display = 'block';

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      state.pdfCurrentPage = pageNum;

      const currentEl = document.getElementById('pdf-current-page');
      const zoomEl = document.getElementById('pdf-zoom-level');
      if (currentEl) currentEl.textContent = pageNum;
      if (zoomEl) zoomEl.textContent = Math.round(state.pdfScale * 100) + '%';

      // Scroll canvas into view smoothly
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error('PDF render error:', e);
    } finally {
      state.pdfRendering = false;
    }
  }

  function setupEventListeners() {
    document.addEventListener('click', (e) => {
      // Close reader button handler
      const closeBtn = e.target.closest('#close-reader-btn, #close-reader-x-btn, .close-reader-btn');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeReader();
        return;
      }

      // Intercept external article hyperlinks to open in default browser and prevent app window navigation
      const articleLink = e.target.closest('.article-body a, a[target="_blank"]');
      if (articleLink && articleLink.href && !articleLink.closest('#close-reader-btn')) {
        const href = articleLink.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
          e.preventDefault();
          e.stopPropagation();
          API.openURL(articleLink.href);
          return;
        }
      }

      // Card Options Three-Dots Menu Toggle
      const cardOptionsBtn = e.target.closest('[data-toggle-card-options]');
      if (cardOptionsBtn) {
        e.preventDefault();
        e.stopPropagation();
        const cardID = cardOptionsBtn.dataset.toggleCardOptions;
        const targetMenu = document.getElementById(`card-options-menu-${cardID}`);
        document.querySelectorAll('.card-options-menu').forEach((menu) => {
          if (menu !== targetMenu) menu.classList.remove('show');
        });
        if (targetMenu) targetMenu.classList.toggle('show');
        return;
      } else if (!e.target.closest('.card-options-menu')) {
        document.querySelectorAll('.card-options-menu').forEach((menu) => menu.classList.remove('show'));
      }

      // Card Action: Download Video
      const cardDlBtn = e.target.closest('.card-download-btn');
      if (cardDlBtn) {
        e.preventDefault();
        e.stopPropagation();
        const url = cardDlBtn.dataset.url;
        const title = cardDlBtn.dataset.title;
        const thumb = cardDlBtn.dataset.thumb;
        const itemID = parseInt(cardDlBtn.dataset.id || '0', 10);
        document.querySelectorAll('.card-options-menu').forEach((menu) => menu.classList.remove('show'));
        API.startVideoDownload(url, title, thumb, itemID).then(() => {
          // Switch to downloads view
          state.currentView = 'downloads';
          document.querySelectorAll('.nav-item, .mobile-nav-item').forEach((n) => n.classList.remove('active'));
          const downloadsNav = document.getElementById('nav-downloads');
          if (downloadsNav) downloadsNav.classList.add('active');
          loadItems();
        }).catch((err) => {
          alert('Could not start download: ' + (err.message || err));
        });
        return;
      }

      // Card Action: Bookmark Toggle
      const cardBmBtn = e.target.closest('.card-bookmark-btn');
      if (cardBmBtn) {
        e.preventDefault();
        e.stopPropagation();
        const itemID = parseInt(cardBmBtn.dataset.id || '0', 10);
        document.querySelectorAll('.card-options-menu').forEach((menu) => menu.classList.remove('show'));
        API.toggleBookmark(itemID).then((isBookmarked) => {
          const item = state.items.find((i) => i.id === itemID);
          if (item) item.is_bookmarked = isBookmarked;
          if (state.currentView === 'bookmarks') {
            loadItems();
          } else {
            renderFeedCards();
          }
        });
        return;
      }

      // Download Action: Open File
      const openDlFileBtn = e.target.closest('.open-dl-file-btn');
      if (openDlFileBtn) {
        e.preventDefault();
        e.stopPropagation();
        const filePath = openDlFileBtn.dataset.filepath;
        API.openDownloadedFile(filePath);
        return;
      }

      // Download Action: Delete Record
      const deleteDlBtn = e.target.closest('.delete-dl-btn');
      if (deleteDlBtn) {
        e.preventDefault();
        e.stopPropagation();
        const dlID = parseInt(deleteDlBtn.dataset.id || '0', 10);
        if (confirm('Delete this download record and file?')) {
          API.deleteDownload(dlID, true).then(() => {
            loadDownloads();
          });
        }
        return;
      }

      // Open Downloads Folder Button
      const openDlFolderBtn = e.target.closest('#open-downloads-folder-btn');
      if (openDlFolderBtn) {
        e.preventDefault();
        e.stopPropagation();
        API.openDownloadFolder('');
        return;
      }

      // Rename Feed / Channel click on 3-dots
      const renameBtn = e.target.closest('.feed-rename-btn, .item-more-dots');
      if (renameBtn && renameBtn.dataset.feedId) {
        e.preventDefault();
        e.stopPropagation();
        const feedID = parseInt(renameBtn.dataset.feedId, 10);
        const currentTitle = renameBtn.dataset.feedTitle || '';
        if (feedID > 0) {
          const newTitle = prompt('Rename channel / feed title:', currentTitle);
          if (newTitle && newTitle.trim() !== '' && newTitle.trim() !== currentTitle) {
            API.updateFeedTitle(feedID, newTitle.trim()).then(() => {
              loadFeeds();
              loadItems();
            });
          }
        }
        return;
      }

      // Category Reorder Move Up / Move Down
      const moveUpBtn = e.target.closest('.cat-move-up');
      if (moveUpBtn) {
        e.preventDefault();
        e.stopPropagation();
        const cat = moveUpBtn.dataset.cat;
        let order = getSavedCategoryOrder();
        const idx = order.indexOf(cat);
        if (idx > 0) {
          const temp = order[idx - 1];
          order[idx - 1] = order[idx];
          order[idx] = temp;
          saveCategoryOrder(order);
          renderCategories();
        }
        return;
      }

      const moveDownBtn = e.target.closest('.cat-move-down');
      if (moveDownBtn) {
        e.preventDefault();
        e.stopPropagation();
        const cat = moveDownBtn.dataset.cat;
        let order = getSavedCategoryOrder();
        const idx = order.indexOf(cat);
        if (idx !== -1 && idx < order.length - 1) {
          const temp = order[idx + 1];
          order[idx + 1] = order[idx];
          order[idx] = temp;
          saveCategoryOrder(order);
          renderCategories();
        }
        return;
      }

      // Category collapse toggle click
      const catChevron = e.target.closest('[data-toggle-cat]');
      if (catChevron) {
        e.preventDefault();
        e.stopPropagation();
        const catName = catChevron.dataset.toggleCat;
        state.collapsedCategories[catName] = !state.collapsedCategories[catName];
        renderCategories();
        return;
      }

      const navItem = e.target.closest('.nav-item, .mobile-nav-item');
      if (navItem) {
        e.preventDefault();
        const view = navItem.dataset.view;
        const filterType = navItem.dataset.filterType;
        const category = navItem.dataset.category;
        const feedID = parseInt(navItem.dataset.feedId || '0', 10);

        // PDF Reader nav item — open PDF panel without changing feed view state
        if (view === 'pdf') {
          openPDFViewer();
          document.querySelectorAll('.nav-item, .mobile-nav-item').forEach((n) => n.classList.remove('active'));
          navItem.classList.add('active');
          return;
        }

        if (view) {
          state.currentView = view;
        } else if (category || feedID > 0) {
          state.currentView = 'discover';
        }

        state.currentFilter = filterType || 'all';
        if (category) state.currentCategory = category;
        state.currentFeedID = feedID;

        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach((n) => n.classList.remove('active'));
        navItem.classList.add('active');

        loadItems();
        if (window.innerWidth <= 768 && el.sidebar) {
          el.sidebar.classList.remove('open');
          const backdrop = document.getElementById('sidebar-backdrop');
          if (backdrop) backdrop.classList.remove('open');
        }
      }

      // Queue Filter Pill Buttons (Up Next / Completed / All)
      const qFilterBtn = e.target.closest('[data-queue-filter]');
      if (qFilterBtn) {
        state.queueFilter = qFilterBtn.dataset.queueFilter;
        renderQueue();
      }

      // Add to Queue button from Discover card
      const addToQueueBtn = e.target.closest('.add-to-queue-btn');
      if (addToQueueBtn) {
        const itemID = parseInt(addToQueueBtn.dataset.id, 10);
        API.addItemToQueue(itemID).then(() => {
          addToQueueBtn.innerHTML = '<i class="icon-check"></i> Queued';
          addToQueueBtn.disabled = true;
          loadQueue();
        }).catch((err) => alert('Already in queue!'));
      }

      // Visual active selection when clicking any feed card
      const anyFeedCard = e.target.closest('.feed-card');
      if (anyFeedCard && !e.target.closest('.card-options-dropdown, .card-check-btn')) {
        document.querySelectorAll('.feed-card.active-card').forEach((c) => c.classList.remove('active-card'));
        anyFeedCard.classList.add('active-card');
      }

      // Queue Item Consume Button or Queue Card Click
      const queueCard = e.target.closest('.feed-card[data-queue-id]');
      if (queueCard) {
        const qID = parseInt(queueCard.dataset.queueId, 10);
        const q = state.queue.find((item) => item.id === qID);

        const statusBtn = e.target.closest('.queue-status-btn');
        const removeBtn = e.target.closest('.queue-remove-btn');
        const consumeBtn = e.target.closest('.open-queue-item-btn');

        if (statusBtn) {
          e.stopPropagation();
          const newStatus = statusBtn.dataset.status;
          API.setQueueStatus(qID, newStatus).then(() => loadQueue());
          return;
        }

        if (removeBtn) {
          e.stopPropagation();
          API.deleteQueueItem(qID).then(() => loadQueue());
          return;
        }

        if (consumeBtn || !e.target.closest('.icon-btn, .btn')) {
          e.stopPropagation();
          if (q) openQueueItem(q);
          return;
        }
      }

      // Card item click (Discover / Bookmarks)
      const card = e.target.closest('.feed-card');
      const actionBtn = e.target.closest('.icon-btn, .btn');
      if (card && !actionBtn && card.dataset.id) {
        const itemID = parseInt(card.dataset.id, 10);
        if (itemID) openReader(itemID);
      }

      // Open Note Item button from Garden Notes View
      const openNoteBtn = e.target.closest('.open-note-item-btn');
      if (openNoteBtn) {
        const itemID = parseInt(openNoteBtn.dataset.itemId, 10);
        openReader(itemID);
      }

      // Bookmark / Read button click inside cards
      if (actionBtn && actionBtn.classList.contains('bookmark-btn')) {
        const itemID = parseInt(actionBtn.dataset.id, 10);
        API.toggleBookmark(itemID).then((isBookmarked) => {
          actionBtn.classList.toggle('active', isBookmarked);
          loadItems();
        });
      }

      if (actionBtn && actionBtn.classList.contains('read-btn')) {
        const itemID = parseInt(actionBtn.dataset.id, 10);
        const item = state.items.find((i) => i.id === itemID);
        if (item) {
          item.is_read = !item.is_read;
          API.toggleRead(itemID, item.is_read).then(() => loadItems());
        }
      }

      // Delete Rule
      const deleteRuleBtn = e.target.closest('.delete-rule-btn');
      if (deleteRuleBtn) {
        const id = parseInt(deleteRuleBtn.dataset.id, 10);
        API.deleteRule(id).then(() => loadRules());
      }

      // Delete Feed
      const deleteFeedBtn = e.target.closest('.delete-feed-btn');
      if (deleteFeedBtn) {
        const id = parseInt(deleteFeedBtn.dataset.id, 10);
        if (confirm('Delete this feed and its items?')) {
          API.deleteFeed(id).then(() => {
            loadFeeds();
            loadItems();
          });
        }
      }
    });

    // Reader View Mode Toggles (Reader Mode vs Live Webview)
    if (el.modeReaderBtn) el.modeReaderBtn.addEventListener('click', () => setReaderMode('reader'));
    if (el.modeWebviewBtn) el.modeWebviewBtn.addEventListener('click', () => setReaderMode('webview'));

    // Extract Full Article Text Button
    if (el.extractFullArticleBtn) {
      el.extractFullArticleBtn.addEventListener('click', async () => {
        if (!state.activeItem) return;
        el.extractFullArticleBtn.disabled = true;
        el.extractFullArticleBtn.innerHTML = '<i class="icon-sparkles spinning"></i> Extracting...';
        try {
          const fullHTML = await API.extractFullArticle(state.activeItem.id || 0, state.activeItem.link || '');
          state.activeItem.content = fullHTML;
          el.readerContent.innerHTML = fullHTML;
          alert('Full article extracted!');
        } catch (e) {
          alert('Could not extract full article: ' + e.message);
        } finally {
          el.extractFullArticleBtn.disabled = false;
          el.extractFullArticleBtn.innerHTML = '<i class="icon-sparkles"></i> Extract Full Text';
        }
      });
    }

    // Frameless Native Window Action Controls
    const winMinBtn = document.getElementById('win-min-btn');
    const winMaxBtn = document.getElementById('win-max-btn');
    const winCloseBtn = document.getElementById('win-close-btn');

    if (winMinBtn) winMinBtn.addEventListener('click', () => API.windowMinimise());
    if (winMaxBtn) winMaxBtn.addEventListener('click', () => API.windowToggleMaximise());
    if (winCloseBtn) winCloseBtn.addEventListener('click', () => API.windowClose());

    // Image Lightbox Modal logic
    const imageLightboxModal = document.getElementById('image-lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxCloseBtn = document.getElementById('lightbox-close-btn');

    function openImageLightbox(imgSrc, captionText) {
      if (!imageLightboxModal || !lightboxImg) return;
      lightboxImg.src = imgSrc;
      if (lightboxCaption) lightboxCaption.textContent = captionText || '';
      imageLightboxModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeImageLightbox() {
      if (!imageLightboxModal) return;
      imageLightboxModal.classList.remove('open');
      document.body.style.overflow = '';
    }

    if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeImageLightbox);
    if (imageLightboxModal) {
      imageLightboxModal.addEventListener('click', closeImageLightbox);
    }

    // Article Image Click -> Open Lightbox (Capturing Phase)
    document.addEventListener('click', (e) => {
      const clickedImg = e.target.closest('img');
      if (clickedImg && clickedImg.src && clickedImg.id !== 'lightbox-img') {
        const isInsideReader = clickedImg.closest('.article-body') || clickedImg.closest('.reader-drawer');
        if (isInsideReader) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          const figure = clickedImg.closest('figure');
          const caption = clickedImg.alt || clickedImg.title || (figure ? (figure.querySelector('figcaption')?.innerText || '') : '');
          openImageLightbox(clickedImg.src, caption);
        }
      }
    }, true);



    // Fix Wails Frameless 6px edge window-resize capture over scrollbars
    function disableWailsEdgeResizeOverScrollbar() {
      if (window.wails && window.wails.flags) {
        window.wails.flags.borderThickness = 1;
      }
    }
    disableWailsEdgeResizeOverScrollbar();
    setInterval(disableWailsEdgeResizeOverScrollbar, 500);

    // Top Bar Reader Options Dropdown (Three dots)
    const topReaderOptionsBtn = document.getElementById('top-reader-options-btn');
    const topReaderOptionsMenu = document.getElementById('top-reader-options-menu');

    if (topReaderOptionsBtn && topReaderOptionsMenu) {
      topReaderOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = topReaderOptionsMenu.style.display === 'block';
        topReaderOptionsMenu.style.display = isOpen ? 'none' : 'block';
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#top-reader-options-dropdown')) {
          topReaderOptionsMenu.style.display = 'none';
        }
      });
    }

    // Reader Width Switcher logic
    const widthBtns = document.querySelectorAll('.width-btn');
    const articleViewEl = document.getElementById('article-view');

    function setReaderWidth(widthMode) {
      if (!articleViewEl) return;
      articleViewEl.classList.remove('reader-width-compact', 'reader-width-balanced', 'reader-width-full');
      articleViewEl.classList.add(`reader-width-${widthMode}`);
      widthBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.width === widthMode);
      });
      localStorage.setItem('vayu_reader_width', widthMode);
    }

    const savedWidth = localStorage.getItem('vayu_reader_width') || 'balanced';
    setReaderWidth(savedWidth);

    widthBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setReaderWidth(btn.dataset.width);
        if (topReaderOptionsMenu) topReaderOptionsMenu.style.display = 'none';
      });
    });

    // Reader Font Size Controller logic
    const fontDecreaseBtns = document.querySelectorAll('.font-decrease-btn');
    const fontIncreaseBtns = document.querySelectorAll('.font-increase-btn');
    const fontSizeLabels = document.querySelectorAll('.font-size-label');

    const fontScales = [
      { percent: 80, rem: '0.95rem' },
      { percent: 90, rem: '1.06rem' },
      { percent: 100, rem: '1.18rem' },
      { percent: 115, rem: '1.36rem' },
      { percent: 130, rem: '1.53rem' },
      { percent: 150, rem: '1.77rem' }
    ];

    let currentFontIndex = 2; // Default 100%

    function updateReaderFontSize(index) {
      if (index < 0) index = 0;
      if (index >= fontScales.length) index = fontScales.length - 1;
      currentFontIndex = index;

      const scale = fontScales[currentFontIndex];
      document.documentElement.style.setProperty('--article-font-size', scale.rem);
      if (articleViewEl) {
        articleViewEl.style.setProperty('--article-font-size', scale.rem);
      }
      fontSizeLabels.forEach((lbl) => {
        lbl.textContent = `${scale.percent}%`;
      });
      localStorage.setItem('vayu_reader_fontsize_idx', currentFontIndex);
    }

    const savedFontIdx = parseInt(localStorage.getItem('vayu_reader_fontsize_idx'), 10);
    if (!isNaN(savedFontIdx)) {
      updateReaderFontSize(savedFontIdx);
    } else {
      updateReaderFontSize(2);
    }

    fontDecreaseBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateReaderFontSize(currentFontIndex - 1);
      });
    });

    fontIncreaseBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateReaderFontSize(currentFontIndex + 1);
      });
    });

    const listenArticleBtns = document.querySelectorAll('.listen-article-btn');
    listenArticleBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.startAudioReader) window.startAudioReader();
        const readerMenu = document.getElementById('reader-options-menu');
        const topMenu = document.getElementById('top-reader-options-menu');
        if (readerMenu) readerMenu.classList.remove('open');
        if (topMenu) topMenu.style.display = 'none';
      });
    });

    // --- ARTICLE AUDIO READER (PIPER NEURAL TTS ENGINE) ---
    const audioBar = document.getElementById('audio-reader-bar');
    const audioPlayPauseBtn = document.getElementById('audio-play-pause-btn');
    const audioPlayPauseIcon = document.getElementById('audio-play-pause-icon');
    const audioStopBtn = document.getElementById('audio-stop-btn');
    const audioCloseBtn = document.getElementById('audio-close-btn');
    const audioProgressText = document.getElementById('audio-progress-text');
    const audioSpeedSelect = document.getElementById('audio-speed-select');
    const audioVoiceSelect = document.getElementById('audio-voice-select');
    const listenArticleBtn = document.getElementById('listen-article-btn');

    let currentAudioObj = null;
    let audioParagraphs = [];
    let audioCurrentIndex = 0;
    let audioIsPlaying = false;
    let audioIsPaused = false;
    let audioRate = 1.0;
    let audioVoice = '';

    async function loadVoices() {
      if (!audioVoiceSelect) return;
      try {
        const voices = await API.getAvailableVoices();
        if (voices && voices.length > 0) {
          audioVoiceSelect.innerHTML = voices.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
          audioVoice = audioVoiceSelect.value;
        }
      } catch (e) {
        console.warn('Could not load voices:', e);
      }
    }
    loadVoices();

    function getArticleParagraphs() {
      const container = document.getElementById('reader-content');
      if (!container) return [];
      const list = [];
      const titleEl = document.getElementById('reader-title');
      if (titleEl && titleEl.innerText.trim().length > 0) {
        list.push(titleEl);
      }

      const elements = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, blockquote, li'));
      const filtered = elements.filter(el => {
        const hasChildBlock = el.querySelector('p, h1, h2, h3, h4, blockquote');
        const text = (el.innerText || el.textContent || '').trim();
        return !hasChildBlock && text.length > 3;
      });

      if (filtered.length === 0) {
        const text = (container.innerText || container.textContent || '').trim();
        if (text.length > 0) {
          const blocks = text.split(/\n\s*\n/).filter(b => b.trim().length > 3);
          container.innerHTML = blocks.map(b => `<p class="vayu-audio-p">${escapeHtml(b)}</p>`).join('');
          return Array.from(container.querySelectorAll('.vayu-audio-p'));
        }
      }

      list.push(...filtered);
      return list;
    }

    function highlightParagraph(index) {
      audioParagraphs.forEach(p => p.classList.remove('audio-reading-highlight'));
      if (index >= 0 && index < audioParagraphs.length) {
        const target = audioParagraphs[index];
        target.classList.add('audio-reading-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    async function speakCurrentParagraph() {
      if (audioCurrentIndex >= audioParagraphs.length) {
        stopAudioReader();
        if (audioProgressText) audioProgressText.textContent = 'Finished reading';
        return;
      }

      const targetEl = audioParagraphs[audioCurrentIndex];
      const text = (targetEl.innerText || targetEl.textContent || '').trim();

      if (!text || text.length < 2) {
        audioCurrentIndex++;
        speakCurrentParagraph();
        return;
      }

      highlightParagraph(audioCurrentIndex);

      if (audioProgressText) {
        audioProgressText.textContent = `Reading ${audioCurrentIndex + 1} of ${audioParagraphs.length}`;
      }

      if (currentAudioObj) {
        currentAudioObj.pause();
        currentAudioObj = null;
      }

      try {
        const dataUrl = await API.generateSpeechAudio(text, audioRate, audioVoice);
        if (!dataUrl) {
          console.warn('Audio generation returned empty result');
          audioCurrentIndex++;
          speakCurrentParagraph();
          return;
        }

        currentAudioObj = new Audio(dataUrl);
        currentAudioObj.onended = () => {
          if (audioIsPlaying && !audioIsPaused) {
            audioCurrentIndex++;
            speakCurrentParagraph();
          }
        };
        currentAudioObj.onerror = (err) => {
          console.warn('Audio playback error:', err);
          if (audioIsPlaying && !audioIsPaused) {
            audioCurrentIndex++;
            speakCurrentParagraph();
          }
        };

        audioIsPlaying = true;
        audioIsPaused = false;
        updateAudioUI();
        currentAudioObj.play();
      } catch (err) {
        console.error('TTS Generation error:', err);
        audioCurrentIndex++;
        speakCurrentParagraph();
      }
    }

    function startAudioReader() {
      stopAudioReader();
      audioParagraphs = getArticleParagraphs();
      if (audioParagraphs.length === 0) {
        alert('No readable text found in this article.');
        return;
      }
      audioCurrentIndex = 0;
      audioIsPlaying = true;
      audioIsPaused = false;
      if (audioBar) audioBar.style.display = 'flex';
      speakCurrentParagraph();
      updateAudioUI();
    }

    function pauseAudioReader() {
      if (currentAudioObj && !currentAudioObj.paused) {
        currentAudioObj.pause();
        audioIsPaused = true;
        audioIsPlaying = false;
        updateAudioUI();
      }
    }

    function resumeAudioReader() {
      if (currentAudioObj && currentAudioObj.paused) {
        currentAudioObj.play();
        audioIsPaused = false;
        audioIsPlaying = true;
        updateAudioUI();
      } else {
        speakCurrentParagraph();
      }
    }

    function stopAudioReader() {
      if (currentAudioObj) {
        currentAudioObj.pause();
        currentAudioObj = null;
      }
      audioIsPlaying = false;
      audioIsPaused = false;
      audioCurrentIndex = 0;
      highlightParagraph(-1);
      if (audioBar) audioBar.style.display = 'none';
      updateAudioUI();
    }

    window.appStopAudioReader = stopAudioReader;
    window.startAudioReader = startAudioReader;

    function updateAudioUI() {
      if (audioPlayPauseIcon) {
        if (audioIsPlaying && !audioIsPaused) {
          audioPlayPauseIcon.className = 'icon-pause';
        } else {
          audioPlayPauseIcon.className = 'icon-play';
        }
      }
    }

    if (listenArticleBtn) {
      listenArticleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const readerMenu = document.getElementById('reader-options-menu');
        if (readerMenu) readerMenu.classList.remove('open');
        const topMenu = document.getElementById('top-reader-options-menu');
        if (topMenu) topMenu.style.display = 'none';
        startAudioReader();
      });
    }

    if (audioPlayPauseBtn) {
      audioPlayPauseBtn.addEventListener('click', () => {
        if (audioIsPlaying && !audioIsPaused) {
          pauseAudioReader();
        } else {
          resumeAudioReader();
        }
      });
    }

    if (audioStopBtn) {
      audioStopBtn.addEventListener('click', () => {
        stopAudioReader();
      });
    }

    if (audioCloseBtn) {
      audioCloseBtn.addEventListener('click', () => {
        stopAudioReader();
      });
    }

    if (audioSpeedSelect) {
      audioSpeedSelect.addEventListener('change', (e) => {
        audioRate = parseFloat(e.target.value) || 1.0;
        if (audioIsPlaying && !audioIsPaused) {
          speakCurrentParagraph();
        }
      });
    }

    if (audioVoiceSelect) {
      audioVoiceSelect.addEventListener('change', (e) => {
        audioVoice = e.target.value;
        if (audioIsPlaying && !audioIsPaused) {
          speakCurrentParagraph();
        }
      });
    }

    // Keyboard Shortcuts (Esc closes Reader, PDF viewer & Modals)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (imageLightboxModal && imageLightboxModal.classList.contains('open')) {
          closeImageLightbox();
          return;
        }
        if (state.pdfView) { closePDFViewer(); return; }
        closeReader();
        if (el.addFeedModal) el.addFeedModal.classList.remove('open');
        if (el.settingsModal) el.settingsModal.classList.remove('open');
      }
      // PDF arrow key page navigation
      if (state.pdfView && state.pdfDoc) {
        if (e.key === 'ArrowLeft') {
          if (state.pdfCurrentPage > 1) renderPDFPage(state.pdfCurrentPage - 1);
        } else if (e.key === 'ArrowRight') {
          if (state.pdfCurrentPage < state.pdfDoc.numPages) renderPDFPage(state.pdfCurrentPage + 1);
        }
      }
    });

    // PDF Viewer controls
    const pdfCloseBtn = document.getElementById('pdf-close-btn');
    const pdfOpenFileBtn = document.getElementById('pdf-open-file-btn');
    const pdfOpenToolbarBtn = document.getElementById('pdf-open-toolbar-btn');
    const pdfPrevBtn = document.getElementById('pdf-prev-btn');
    const pdfNextBtn = document.getElementById('pdf-next-btn');
    const pdfZoomInBtn = document.getElementById('pdf-zoom-in-btn');
    const pdfZoomOutBtn = document.getElementById('pdf-zoom-out-btn');

    if (pdfCloseBtn) pdfCloseBtn.addEventListener('click', closePDFViewer);
    if (pdfOpenFileBtn) pdfOpenFileBtn.addEventListener('click', loadPDFFile);
    if (pdfOpenToolbarBtn) pdfOpenToolbarBtn.addEventListener('click', loadPDFFile);
    if (pdfPrevBtn) pdfPrevBtn.addEventListener('click', () => {
      if (state.pdfDoc && state.pdfCurrentPage > 1) renderPDFPage(state.pdfCurrentPage - 1);
    });
    if (pdfNextBtn) pdfNextBtn.addEventListener('click', () => {
      if (state.pdfDoc && state.pdfCurrentPage < state.pdfDoc.numPages) renderPDFPage(state.pdfCurrentPage + 1);
    });
    if (pdfZoomInBtn) pdfZoomInBtn.addEventListener('click', () => {
      state.pdfScale = Math.min(state.pdfScale + 0.25, 4.0);
      if (state.pdfDoc) renderPDFPage(state.pdfCurrentPage);
    });
    if (pdfZoomOutBtn) pdfZoomOutBtn.addEventListener('click', () => {
      state.pdfScale = Math.max(state.pdfScale - 0.25, 0.5);
      if (state.pdfDoc) renderPDFPage(state.pdfCurrentPage);
    });

    // Sidebar Collapse / Toggle & Mobile Overlay Handlers
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('#open-sidebar-btn, #open-sidebar-toggle-btn');
      if (toggleBtn && el.sidebar) {
        e.preventDefault();
        e.stopPropagation();
        const backdrop = document.getElementById('sidebar-backdrop');

        if (window.innerWidth <= 768) {
          el.sidebar.classList.remove('collapsed');
          const isOpen = el.sidebar.classList.toggle('open');
          if (backdrop) backdrop.classList.toggle('open', isOpen);
        } else {
          el.sidebar.classList.toggle('collapsed');
        }
        return;
      }

      // Close sidebar when clicking backdrop on mobile
      const backdropClick = e.target.closest('#sidebar-backdrop');
      if (backdropClick && el.sidebar) {
        el.sidebar.classList.remove('open');
        backdropClick.classList.remove('open');
        return;
      }
    });

    if (el.closeSidebarBtn) {
      el.closeSidebarBtn.addEventListener('click', () => {
        if (el.sidebar) el.sidebar.classList.remove('open');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.classList.remove('open');
      });
    }

    // Search Input
    let searchTimeout;
    if (el.searchInput) {
      el.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          state.searchQuery = e.target.value.trim();
          loadItems();
        }, 300);
      });
    }

    // Mark All Read
    if (el.markAllReadBtn) {
      el.markAllReadBtn.addEventListener('click', async () => {
        await API.markAllAsRead(state.currentFeedID);
        loadFeeds();
        loadItems();
      });
    }

    // Refresh All
    if (el.refreshAllBtn) {
      el.refreshAllBtn.addEventListener('click', async () => {
        el.refreshAllBtn.classList.add('spinning');
        await API.refreshAll();
        setTimeout(() => {
          el.refreshAllBtn.classList.remove('spinning');
          loadFeeds();
          loadItems();
        }, 2000);
      });
    }

    // Reader Close & Save Note & Backdrop Click
    if (el.playInMpvBtn) {
      el.playInMpvBtn.addEventListener('click', async () => {
        if (state.activeItem && state.activeItem.link) {
          const menu = document.getElementById('reader-options-menu');
          if (menu) menu.classList.remove('open');
          try {
            const res = await API.playInMPV(state.activeItem.link);
            if (res && res.error) {
              alert(res.error);
            } else {
              if (el.readerWebviewIframe) el.readerWebviewIframe.src = 'about:blank';
            }
          } catch (err) {
            alert('Failed to launch external player: ' + err.message);
          }
        }
      });
    }
    if (el.closeReaderBtn) el.closeReaderBtn.addEventListener('click', closeReader);
  // Global Escape key shortcut
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (el.readerDrawer && el.readerDrawer.classList.contains('open')) {
        closeReader();
      }
      const menu = document.getElementById('reader-options-menu');
      if (menu) menu.classList.remove('open');
      const topMenu = document.getElementById('top-reader-options-menu');
      if (topMenu) topMenu.classList.remove('open');
    }
  });

    if (el.closeReaderXBtn) el.closeReaderXBtn.addEventListener('click', closeReader);
    if (el.readerBackdrop) el.readerBackdrop.addEventListener('click', closeReader);
    if (el.backToFeedsBtn) el.backToFeedsBtn.addEventListener('click', closeReader);

    // Close three-dot dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('reader-options-menu');
      const btn = document.getElementById('reader-options-btn');
      if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.remove('open');
      }
    });

    if (el.saveNoteBtn) el.saveNoteBtn.addEventListener('click', saveGardenNote);
    if (el.readerBookmarkBtn) {
      el.readerBookmarkBtn.addEventListener('click', async () => {
        if (!state.activeItem) return;
        const isBookmarked = await API.toggleBookmark(state.activeItem.id);
        state.activeItem.is_bookmarked = isBookmarked;
        el.readerBookmarkBtn.className = `icon-btn ${isBookmarked ? 'active' : ''}`;
        loadItems();
      });
    }

    // Modals: Add URL Modal
    const addUrlModal = document.getElementById('add-url-modal');
    const addUrlOpenBtn = document.getElementById('add-url-open-btn');
    const addUrlCloseBtn = document.getElementById('add-url-close-btn');
    const addUrlCancelBtn = document.getElementById('add-url-cancel-btn');
    const addUrlSubmitBtn = document.getElementById('add-url-submit-btn');
    const customUrlInput = document.getElementById('custom-url-input');

    if (addUrlOpenBtn && addUrlModal) addUrlOpenBtn.addEventListener('click', () => addUrlModal.classList.add('open'));
    if (addUrlCloseBtn && addUrlModal) addUrlCloseBtn.addEventListener('click', () => addUrlModal.classList.remove('open'));
    if (addUrlCancelBtn && addUrlModal) addUrlCancelBtn.addEventListener('click', () => addUrlModal.classList.remove('open'));

    if (addUrlSubmitBtn && addUrlModal && customUrlInput) {
      addUrlSubmitBtn.addEventListener('click', async () => {
        const url = customUrlInput.value.trim();
        if (!url) return alert('Please enter a valid URL!');

        addUrlSubmitBtn.disabled = true;
        addUrlSubmitBtn.textContent = 'Adding to Queue...';

        try {
          await API.addURLToQueue(url);
          addUrlModal.classList.remove('open');
          customUrlInput.value = '';
          state.currentView = 'queue';
          await loadItems();
        } catch (e) {
          alert('Failed to add to queue: ' + (e.message || 'Already in queue or invalid URL'));
        } finally {
          addUrlSubmitBtn.disabled = false;
          addUrlSubmitBtn.innerHTML = '<i class="icon-plus"></i> Add to Queue';
        }
      });
    }

    // Modals: Add Feed Modal
    if (el.addFeedOpenBtn && el.addFeedModal) el.addFeedOpenBtn.addEventListener('click', () => el.addFeedModal.classList.add('open'));
    if (el.addFeedCloseBtn && el.addFeedModal) el.addFeedCloseBtn.addEventListener('click', () => el.addFeedModal.classList.remove('open'));
    if (el.addFeedCancelBtn && el.addFeedModal) el.addFeedCancelBtn.addEventListener('click', () => el.addFeedModal.classList.remove('open'));

    if (el.addFeedSubmitBtn && el.addFeedModal && el.feedUrlInput && el.feedCategoryInput) {
      el.addFeedSubmitBtn.addEventListener('click', async () => {
        const url = el.feedUrlInput.value.trim();
        const cat = el.feedCategoryInput.value.trim();
        const scope = el.feedScopeInput ? el.feedScopeInput.value : 'latest';
        if (!url) return alert('Please enter a URL, YouTube handle (@handle), or GitHub repo!');

        el.addFeedSubmitBtn.disabled = true;
        el.addFeedSubmitBtn.textContent = 'Resolving...';

        try {
          await API.addFeed(url, cat, scope);
          el.addFeedModal.classList.remove('open');
          el.feedUrlInput.value = '';
          el.feedCategoryInput.value = '';
          await loadFeeds();
          await loadItems();
        } catch (e) {
          alert('Failed to add feed: ' + e.message);
        } finally {
          el.addFeedSubmitBtn.disabled = false;
          el.addFeedSubmitBtn.innerHTML = '<i class="icon-plus"></i> Add Feed';
        }
      });
    }

    // Settings Modal Tabs & Open
    if (el.settingsOpenBtn && el.settingsModal) {
      el.settingsOpenBtn.addEventListener('click', () => {
        updatePwaInfo();
        el.settingsModal.classList.add('open');
      });
    }
    if (el.settingsCloseBtn && el.settingsModal) el.settingsCloseBtn.addEventListener('click', () => el.settingsModal.classList.remove('open'));

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    // Add Rule
    if (el.addRuleBtn && el.ruleKeywordInput && el.ruleActionInput) {
      el.addRuleBtn.addEventListener('click', async () => {
        const kw = el.ruleKeywordInput.value.trim();
        const action = el.ruleActionInput.value;
        if (!kw) return;
        await API.addRule(kw, action, 'title');
        el.ruleKeywordInput.value = '';
        loadRules();
      });
    }
  }

  // --- HELPERS ---
  function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function extractYouTubeID(str) {
    if (!str) return null;
    const match = str.match(/(?:v=|\/watch\?v=|\/embed\/|youtu\.be\/|\/shorts\/|videoId>)([a-zA-Z0-9_\-]{11})/);
    return match ? match[1] : null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function decodeEntities(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
