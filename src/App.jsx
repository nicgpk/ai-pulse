import React, { useState, useEffect, useCallback, useRef } from "react";
import { CATEGORIES, fetchNews, fetchVideos } from "./feeds.js";
import "./tokens.css";
import "./tab.css";
import "./styles.css";

const PAGE_SIZE = 10;
const CACHE_TTL = 15 * 60 * 1000;

// ── Tab icons ──────────────────────────────────────────────────
const TAB_ICONS = {
  general: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  engineering: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <polyline points="1,10 4,4 7,7 11,2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  design: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="1" x2="6" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="9" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="1" y1="6" x2="3" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="9" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  product: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1L11 3.5V8.5L6 11L1 8.5V3.5L6 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
};

// ── Helpers ────────────────────────────────────────────────────
function filterByDate(articles, filter) {
  if (filter === "all") return articles;
  const cutoff = filter === "today" ? 24 * 3_600_000 : 7 * 24 * 3_600_000;
  const now = Date.now();
  return articles.filter((a) => {
    if (!a.rawDate) return true;
    try { return now - new Date(a.rawDate).getTime() <= cutoff; }
    catch { return true; }
  });
}

function formatRelativeTime(ts) {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function readingTime(summary) {
  if (!summary) return null;
  const words = summary.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min`;
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  // ── Core state ───────────────────────────────────────────────
  const [theme, setTheme] = useState("dark");
  const [density, setDensity] = useState(
    () => localStorage.getItem("pulse-density") || "comfortable"
  );
  const [activeCategory, setActiveCategory] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return CATEGORIES.find((c) => c.id === tab) ? tab : "general";
  });
  const [cache, setCache] = useState({});
  const [lastUpdated, setLastUpdated] = useState({});
  const [videoCache, setVideoCache] = useState({});
  const [videoLoading, setVideoLoading] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [dateFilter, setDateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeSources, setActiveSources] = useState(new Set());
  const sentinelRef = useRef(null);
  const searchInputRef = useRef(null);

  // ── New feature state ─────────────────────────────────────────
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [savedArticles, setSavedArticles] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pulse-saved") || "[]"); }
    catch { return []; }
  });
  const [bannerCount, setBannerCount] = useState(0);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Refs for keyboard handler (avoid stale closures without re-registering)
  const visibleArticlesRef = useRef([]);
  const focusedIndexRef = useRef(-1);
  const initializedRef = useRef(new Set());
  const prevCacheCountRef = useRef({});

  // ── Derived ───────────────────────────────────────────────────
  const savedUrls = new Set(savedArticles.map((a) => a.url));
  const isSavedTab = activeCategory === "saved";

  // ── Theme ─────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const toggleDensity = () =>
    setDensity((d) => {
      const next = d === "comfortable" ? "compact" : "comfortable";
      localStorage.setItem("pulse-density", next);
      return next;
    });

  const handleTabChange = (id) => {
    setActiveCategory(id);
    if (id !== "saved") {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", id);
      history.replaceState(null, "", `?${params}`);
    }
  };

  // ── Data loading ──────────────────────────────────────────────
  const loadCategory = useCallback(
    async (categoryId, forceRefresh = false) => {
      const age = Date.now() - (lastUpdated[categoryId] || 0);
      const isFresh = cache[categoryId]?.length > 0 && age < CACHE_TTL;
      if (!forceRefresh && isFresh) return;

      if (categoryId === activeCategory) {
        setLoading(true);
        setError(null);
        setStatus("");
      }

      try {
        const articles = await fetchNews(
          categoryId,
          categoryId === activeCategory ? setStatus : () => {}
        );
        setCache((prev) => ({ ...prev, [categoryId]: articles }));
        setLastUpdated((prev) => ({ ...prev, [categoryId]: Date.now() }));
      } catch (err) {
        if (categoryId === activeCategory) setError(err.message);
      } finally {
        if (categoryId === activeCategory) setLoading(false);
      }
    },
    [cache, lastUpdated, activeCategory]
  );

  const loadVideos = useCallback((categoryId) => {
    setVideoLoading((prev) => ({ ...prev, [categoryId]: true }));
    fetchVideos(categoryId)
      .then((vids) => setVideoCache((prev) => ({ ...prev, [categoryId]: vids })))
      .catch(() => setVideoCache((prev) => ({ ...prev, [categoryId]: [] })))
      .finally(() => setVideoLoading((prev) => ({ ...prev, [categoryId]: false })));
  }, []);

  useEffect(() => {
    if (!isSavedTab) loadCategory(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    CATEGORIES.forEach((c) => loadCategory(c.id));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSavedTab) loadCategory(activeCategory, true);
    }, CACHE_TTL);
    return () => clearInterval(interval);
  }, [activeCategory]);

  useEffect(() => {
    if (isSavedTab || videoCache[activeCategory]) return;
    loadVideos(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setDateFilter("all");
    setSearch("");
    setActiveSources(new Set());
  }, [activeCategory]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [dateFilter, search, activeSources]);

  // ── New stories banner ────────────────────────────────────────
  useEffect(() => {
    CATEGORIES.forEach((cat) => {
      const newCount = (cache[cat.id] || []).length;
      if (newCount === 0) return;
      if (!initializedRef.current.has(cat.id)) {
        initializedRef.current.add(cat.id);
        prevCacheCountRef.current[cat.id] = newCount;
      } else {
        const prev = prevCacheCountRef.current[cat.id] || 0;
        if (newCount > prev && cat.id === activeCategory) {
          setBannerCount(newCount - prev);
        }
        prevCacheCountRef.current[cat.id] = newCount;
      }
    });
  }, [cache]);

  useEffect(() => { setBannerCount(0); }, [activeCategory]);

  // ── Bookmarks ─────────────────────────────────────────────────
  const toggleSave = (article) => {
    setSavedArticles((prev) => {
      const already = prev.some((a) => a.url === article.url);
      const next = already
        ? prev.filter((a) => a.url !== article.url)
        : [article, ...prev];
      localStorage.setItem("pulse-saved", JSON.stringify(next));
      return next;
    });
  };

  // ── Derived feed values ───────────────────────────────────────
  const articles = isSavedTab ? savedArticles : (cache[activeCategory] || []);
  const videos = videoCache[activeCategory] || [];
  const isVideoLoading = videoLoading[activeCategory] ?? false;
  const updatedAt = lastUpdated[activeCategory];
  const updatedText = updatedAt ? `Updated ${formatRelativeTime(updatedAt)}` : "";
  const allSources = [...new Set(articles.map((a) => a.source).filter(Boolean))].sort();

  const toggleSource = (source) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  let filteredArticles = isSavedTab ? articles : filterByDate(articles, dateFilter);
  if (activeSources.size > 0) {
    filteredArticles = filteredArticles.filter((a) => activeSources.has(a.source));
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filteredArticles = filteredArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.summary || "").toLowerCase().includes(q)
    );
  }

  const visibleArticles = filteredArticles.slice(0, visibleCount);
  const hasMore = filteredArticles.length > visibleCount;

  // Carousel takes the first 3 articles; regular list starts after them
  const showCarousel = !isSavedTab && density !== "compact" && filteredArticles.length > 0;
  const carouselSize = showCarousel ? Math.min(3, filteredArticles.length) : 0;
  const listArticles = visibleArticles.slice(carouselSize);
  const isFiltered = dateFilter !== "all" || activeSources.size > 0 || search.trim();

  const statusText = loading
    ? status
    : isSavedTab
    ? savedArticles.length === 0
      ? ""
      : `${savedArticles.length} saved`
    : articles.length > 0
    ? isFiltered
      ? filteredArticles.length > 0
        ? `${filteredArticles.length} of ${articles.length} stories`
        : "No matching stories"
      : `${articles.length} stories`
    : "";

  const clearFilters = () => {
    setDateFilter("all");
    setSearch("");
    setActiveSources(new Set());
  };

  // Keep refs in sync each render (keyboard nav targets the list, not the carousel)
  visibleArticlesRef.current = listArticles;
  focusedIndexRef.current = focusedIndex;

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdkOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setCmdkOpen(false);
        setMobileSearchOpen(false);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "j") {
        setFocusedIndex((i) => Math.min(i + 1, visibleArticlesRef.current.length - 1));
      }
      if (e.key === "k") {
        setFocusedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        const art = visibleArticlesRef.current[focusedIndexRef.current];
        if (art) window.open(art.url, "_blank", "noopener,noreferrer");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => { setFocusedIndex(-1); }, [activeCategory, search, dateFilter, activeSources]);

  // ── Infinite scroll ───────────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount((n) => n + PAGE_SIZE); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredArticles, visibleCount]);

  const allCachedArticles = Object.values(cache).flat();

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="app-container">

      {/* ── HEADER ── */}
      <header className="header">
        <div className="app-inner">
          <div className="header-content">
            <div className="header-logo">
              <PulseLogo />
              <h1 className="header-title">Pulse</h1>
              <button
                className="btn btn-outline btn-sm"
                onClick={toggleDensity}
                aria-label={density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view"}
              >
                {density === "comfortable" ? "Compact" : "Readable"}
              </button>
              <label className="theme-toggle toggle toggle-sm" aria-label="Toggle theme">
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={theme === "light"}
                  onChange={toggleTheme}
                />
                <span className="toggle-switch" />
                <span className="theme-toggle-label toggle-label">
                  {theme === "dark" ? "Dark" : "Light"}
                </span>
              </label>
            </div>

            {/* Desktop search */}
            <div className="header-search">
              <div className="search-field">
                <svg className="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9 9L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchInputRef}
                  className="search-input"
                  type="search"
                  placeholder="Search articles"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search articles"
                />
                {!search && <kbd className="search-kbd">/</kbd>}
              </div>
            </div>

            {/* Mobile search toggle */}
            <button
              className="mobile-search-btn btn btn-outline btn-sm"
              onClick={() => setMobileSearchOpen((o) => !o)}
              aria-label="Toggle search"
              aria-expanded={mobileSearchOpen}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9 9L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Mobile search bar */}
          {mobileSearchOpen && (
            <div className="mobile-search-bar">
              <div className="search-field">
                <svg className="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9 9L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search articles"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  aria-label="Search articles"
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── TAB NAVIGATION ── */}
      <nav className="app-inner">
        <ul className="tab-list tab-list-scrollable" role="tablist">
          {CATEGORIES.map((cat) => (
            <li key={cat.id} role="presentation">
              <button
                className="tab-trigger"
                role="tab"
                aria-selected={activeCategory === cat.id}
                onClick={() => handleTabChange(cat.id)}
              >
                {TAB_ICONS[cat.id] && (
                  <span className="tab-icon">{TAB_ICONS[cat.id]}</span>
                )}
                {cat.label}
              </button>
            </li>
          ))}

          {/* Saved tab — pinned right */}
          <li role="presentation" className="tab-saved-item">
            <button
              className="tab-trigger"
              role="tab"
              aria-selected={activeCategory === "saved"}
              onClick={() => handleTabChange("saved")}
            >
              <BookmarkIcon filled={activeCategory === "saved"} size={12} />
              Saved
              {savedArticles.length > 0 && (
                <span className="tab-badge">{savedArticles.length}</span>
              )}
            </button>
          </li>
        </ul>
      </nav>

      {/* ── CONTENT ── */}
      <main className="app-inner content">

        {/* New stories banner */}
        {bannerCount > 0 && (
          <NewStoriesBanner
            count={bannerCount}
            onDismiss={() => {
              setBannerCount(0);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {/* Status bar + date filter */}
        <div className="status-bar">
          <span className="status-text">
            {statusText}
            {!loading && updatedText && !isSavedTab && (
              <span className="status-updated"> · {updatedText}</span>
            )}
          </span>
          {!loading && !isSavedTab && articles.length > 0 && (
            <div className="tab-list tab-list-boxed tab-list-sm" role="group" aria-label="Date filter">
              {[
                { id: "today", label: "Today" },
                { id: "week",  label: "Week" },
                { id: "all",   label: "All" },
              ].map((f) => (
                <button
                  key={f.id}
                  className="tab-trigger"
                  aria-selected={dateFilter === f.id}
                  onClick={() => setDateFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Source filter pills */}
        {!loading && allSources.length > 1 && (
          <div className="source-bar" role="group" aria-label="Filter by source">
            <div className="tab-list tab-list-boxed tab-list-sm">
              {allSources.map((src) => (
                <button
                  key={src}
                  className="tab-trigger"
                  aria-pressed={activeSources.has(src)}
                  onClick={() => toggleSource(src)}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <LoadingSkeleton />
        ) : error && articles.length === 0 ? (
          <div className="empty-state">
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => loadCategory(activeCategory, true)}>
              Try Again
            </button>
          </div>
        ) : articles.length === 0 ? (
          <div className="empty-state">
            {isSavedTab ? (
              <p>No saved articles yet.<br />Bookmark stories to read later.</p>
            ) : (
              <>
                <p>No stories found. Try refreshing.</p>
                <button className="btn btn-primary" onClick={() => loadCategory(activeCategory, true)}>
                  Refresh
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {filteredArticles.length === 0 ? (
              <div className="empty-state">
                <p>No matching stories.</p>
                <button className="btn btn-outline" onClick={clearFilters}>Clear filters</button>
              </div>
            ) : (
              <>
                {/* Hero carousel — first 3 articles */}
                {showCarousel && (
                  <HeroCarousel
                    articles={filteredArticles.slice(0, carouselSize)}
                    savedUrls={savedUrls}
                    onToggleSave={toggleSave}
                  />
                )}

                {/* Regular card list */}
                {listArticles.map((article, i) => (
                  <React.Fragment key={article.url || i}>
                    <NewsCard
                      article={article}
                      index={i}
                      compact={density === "compact"}
                      isSaved={savedUrls.has(article.url)}
                      onToggleSave={toggleSave}
                      isFocused={focusedIndex === i}
                    />
                    {i === 4 && !isSavedTab && (
                      isVideoLoading ? (
                        <VideoLoadingSkeleton />
                      ) : videos.length > 0 ? (
                        <div className="video-section">
                          <h2 className="video-section-title">Watch</h2>
                          <div className="video-grid">
                            {videos.map((v, vi) => (
                              <VideoCard key={v.videoId || vi} video={v} index={vi} />
                            ))}
                          </div>
                        </div>
                      ) : null
                    )}
                  </React.Fragment>
                ))}
                {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
              </>
            )}
          </>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="app-inner footer-inner">
          <span className="footer-brand">Pulse</span>
          <div className="footer-shortcuts">
            <span className="footer-shortcut"><kbd>j</kbd> <kbd>k</kbd> navigate</span>
            <span className="footer-shortcut"><kbd>/</kbd> search</span>
            <span className="footer-shortcut"><kbd>⌘K</kbd> palette</span>
          </div>
          {updatedAt && !isSavedTab && (
            <span className="footer-meta">Last updated {updatedText}</span>
          )}
        </div>
      </footer>

      {/* ── COMMAND PALETTE ── */}
      {cmdkOpen && (
        <CommandPalette
          allCachedArticles={allCachedArticles}
          onTabChange={handleTabChange}
          onClose={() => setCmdkOpen(false)}
          activeCategory={activeCategory}
          savedArticles={savedArticles}
        />
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  ICONS
// ═══════════════════════════════════════════════════════════════

function PulseLogo() {
  return (
    <svg
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      style={{ animation: "logo-pulse 2s ease-in-out infinite" }}
    >
      <circle cx="12" cy="12" r="6" fill="white" />
    </svg>
  );
}

function BookmarkIcon({ filled = false, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 16" fill="none" aria-hidden="true">
      <path
        d="M2 2a1 1 0 011-1h8a1 1 0 011 1v12.5l-5-3-5 3V2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}


// ═══════════════════════════════════════════════════════════════
//  HERO CAROUSEL
// ═══════════════════════════════════════════════════════════════

const CAROUSEL_INTERVAL = 5000;

function HeroCarousel({ articles, savedUrls, onToggleSave }) {
  const count = articles.length;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % count);
    }, CAROUSEL_INTERVAL);
  }, [count]);

  useEffect(() => {
    if (count < 2) return;
    if (paused) { clearInterval(timerRef.current); return; }
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [paused, startTimer, count]);

  // Reset index if articles change
  useEffect(() => {
    if (currentIndex >= count) setCurrentIndex(0);
  }, [count]);

  const goTo = (index) => {
    setCurrentIndex(index);
    startTimer();
  };

  const article = articles[currentIndex];
  if (!article) return null;
  const rt = readingTime(article.summary);
  const isSaved = savedUrls.has(article.url);

  return (
    <div
      className={`hero-carousel${paused ? " hero-carousel--paused" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slide content — key triggers fade on change */}
      <div key={currentIndex} className="hero-carousel-slide">
        <div className="hero-card-eyebrow">Featured</div>
        <div className="hero-card-meta">
          {article.tag && <span className="news-card-tag">{article.tag}</span>}
          <span className="news-card-source">{article.source}</span>
          <span className="news-card-date">{article.date}{rt && ` · ${rt} read`}</span>
        </div>
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="hero-card-link">
          <h2 className="hero-card-title">{article.title}</h2>
        </a>
        {article.summary && (
          <p className="hero-card-summary">{article.summary}</p>
        )}
        <div className="hero-card-actions">
          <button
            className={`btn btn-outline btn-sm hero-save-btn${isSaved ? " hero-save-btn--saved" : ""}`}
            onClick={() => onToggleSave(article)}
            aria-label={isSaved ? "Remove bookmark" : "Bookmark article"}
          >
            <BookmarkIcon filled={isSaved} />
            {isSaved ? "Saved" : "Save"}
          </button>
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Read
          </a>
        </div>
      </div>

      {/* Progress dots */}
      {count > 1 && (
        <div className="hero-carousel-dots" role="tablist" aria-label="Featured articles">
          {articles.map((_, i) => (
            <button
              key={i}
              className={`hero-carousel-dot${i === currentIndex ? " hero-carousel-dot--active" : ""}`}
              onClick={() => goTo(i)}
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={`Article ${i + 1}`}
            >
              {i === currentIndex && (
                <span
                  className="hero-carousel-progress"
                  style={{ animationDuration: `${CAROUSEL_INTERVAL}ms` }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  NEWS CARD
// ═══════════════════════════════════════════════════════════════

function NewsCard({ article, index, compact, isSaved, onToggleSave, isFocused }) {
  const rt = !compact && readingTime(article.summary);
  return (
    <div
      className={`news-card-wrapper${isFocused ? " news-card--focused" : ""}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`news-card${compact ? " news-card--compact" : ""}`}
      >
        <div className="news-card-inner">
          <div className="news-card-meta">
            {article.tag && <span className="news-card-tag">{article.tag}</span>}
            <span className="news-card-source">{article.source}</span>
            <span className="news-card-date">{article.date}{rt && ` · ${rt} read`}</span>
          </div>
          <h3 className="news-card-title">{article.title}</h3>
          {!compact && article.summary && (
            <p className="news-card-summary">{article.summary}</p>
          )}
        </div>
      </a>
      <button
        className={`btn-bookmark btn-bookmark--card${isSaved ? " btn-bookmark--saved" : ""}`}
        onClick={() => onToggleSave(article)}
        aria-label={isSaved ? "Remove bookmark" : "Bookmark"}
      >
        <BookmarkIcon filled={isSaved} size={13} />
      </button>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  VIDEO CARD
// ═══════════════════════════════════════════════════════════════

function VideoCard({ video, index }) {
  const thumbnail = video.videoId
    ? `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`
    : null;

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="video-card"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="video-card-inner">
        <div className="video-card-thumb">
          {thumbnail && (
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          )}
          <div className="video-card-overlay">
            <div className="video-card-play">
              <span>▶</span>
            </div>
          </div>
        </div>
        <div className="video-card-body">
          <h4 className="video-card-title">{video.title}</h4>
          <p className="video-card-channel">{video.channel} · {video.date}</p>
        </div>
      </div>
    </a>
  );
}


// ═══════════════════════════════════════════════════════════════
//  NEW STORIES BANNER
// ═══════════════════════════════════════════════════════════════

function NewStoriesBanner({ count, onDismiss }) {
  return (
    <div className="new-stories-banner">
      <button className="new-stories-btn" onClick={onDismiss}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 10V2M2 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count} new {count === 1 ? "story" : "stories"} — click to refresh
      </button>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  COMMAND PALETTE
// ═══════════════════════════════════════════════════════════════

function CommandPalette({ allCachedArticles, onTabChange, onClose, activeCategory, savedArticles }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const tabCommands = [
    ...CATEGORIES.map((c) => ({ type: "tab", id: c.id, label: c.label, icon: TAB_ICONS[c.id] })),
    { type: "tab", id: "saved", label: "Saved", icon: <BookmarkIcon size={12} /> },
  ];

  const articleResults = query.trim()
    ? allCachedArticles
        .filter((a) =>
          a.title.toLowerCase().includes(query.toLowerCase()) ||
          (a.source || "").toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 8)
    : [];

  const results = query.trim()
    ? articleResults.map((a) => ({ type: "article", ...a }))
    : tabCommands;

  const handleSelect = (item) => {
    if (item.type === "tab") onTabChange(item.id);
    else window.open(item.url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[selectedIndex]) handleSelect(results[selectedIndex]);
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="cmdk-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="cmdk-search-icon" aria-hidden="true">
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9 9L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search articles or jump to tab…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            aria-label="Command palette search"
          />
          {query && (
            <button className="cmdk-clear" onClick={() => setQuery("")} aria-label="Clear">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="cmdk-results" role="listbox">
          {!query.trim() && <div className="cmdk-section-label">Jump to</div>}
          {query.trim() && results.length === 0 && (
            <div className="cmdk-empty">No results for "{query}"</div>
          )}
          {results.map((item, i) => (
            <button
              key={item.type === "tab" ? item.id : (item.url || i)}
              className={`cmdk-item${i === selectedIndex ? " cmdk-item--selected" : ""}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(i)}
              role="option"
              aria-selected={i === selectedIndex}
            >
              {item.type === "tab" ? (
                <>
                  <span className="cmdk-item-icon">{item.icon}</span>
                  <span className="cmdk-item-label">{item.label}</span>
                  {item.id === activeCategory && (
                    <span className="cmdk-item-badge">Current</span>
                  )}
                </>
              ) : (
                <>
                  <span className="cmdk-item-source">{item.source}</span>
                  <span className="cmdk-item-label">{item.title}</span>
                  <span className="cmdk-item-arrow">↗</span>
                </>
              )}
            </button>
          ))}
        </div>

        <div className="cmdk-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  LOADING SKELETONS
// ═══════════════════════════════════════════════════════════════

function LoadingSkeleton() {
  return (
    <div>
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          style={{
            padding: "var(--spacing-4) 0",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--spacing-2)", marginBottom: "var(--spacing-2)" }}>
            <div className="skeleton-line" style={{ height: 18, width: 50, animationDelay: `${i * 100}ms` }} />
            <div className="skeleton-line-subtle" style={{ height: 18, width: 80, animationDelay: `${i * 100}ms` }} />
          </div>
          <div className="skeleton-line" style={{ height: 17, width: `${60 + (i % 3) * 14}%`, marginBottom: "var(--spacing-2)", animationDelay: `${i * 100}ms` }} />
          <div className="skeleton-line-subtle" style={{ height: 14, width: "85%", animationDelay: `${i * 100}ms` }} />
        </div>
      ))}
    </div>
  );
}

function VideoLoadingSkeleton() {
  return (
    <div className="video-section">
      <div className="skeleton-line" style={{ height: 11, width: 52, marginBottom: "var(--spacing-4)" }} />
      <div className="video-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="video-skeleton-card" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="video-skeleton-thumb" />
            <div className="video-skeleton-body">
              <div className="skeleton-line" style={{ height: 14, width: "80%", marginBottom: "var(--spacing-2)" }} />
              <div className="skeleton-line" style={{ height: 14, width: "55%", marginBottom: "var(--spacing-2)" }} />
              <div className="skeleton-line-subtle" style={{ height: 12, width: "40%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
