import { useState, useEffect, useCallback, useRef } from "react";
import { CATEGORIES, fetchNews, fetchVideos } from "./feeds.js";
import "./tokens.css";
import "./tab.css";
import "./styles.css";

const PAGE_SIZE = 10;

// ── Date filter helper ────────────────────────────────────────
function filterByDate(articles, filter) {
  if (filter === "all") return articles;
  const cutoff = filter === "today" ? 24 * 3_600_000 : 7 * 24 * 3_600_000;
  const now = Date.now();
  return articles.filter((a) => {
    if (!a.rawDate) return true; // no date info — show it
    try {
      return now - new Date(a.rawDate).getTime() <= cutoff;
    } catch {
      return true;
    }
  });
}

function formatRelativeTime(ts) {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function App() {
  // ── State ────────────────────────────────────────────────
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
  const sentinelRef = useRef(null);

  // ── Theme ────────────────────────────────────────────────
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
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    history.replaceState(null, "", `?${params}`);
  };

  // ── Data Loading ─────────────────────────────────────────
  const loadCategory = useCallback(
    async (categoryId, forceRefresh = false) => {
      if (!forceRefresh && cache[categoryId]?.length > 0) return;

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
    [cache, activeCategory]
  );

  const loadVideos = useCallback((categoryId) => {
    setVideoLoading((prev) => ({ ...prev, [categoryId]: true }));
    fetchVideos(categoryId)
      .then((vids) => setVideoCache((prev) => ({ ...prev, [categoryId]: vids })))
      .catch(() => setVideoCache((prev) => ({ ...prev, [categoryId]: [] })))
      .finally(() => setVideoLoading((prev) => ({ ...prev, [categoryId]: false })));
  }, []);

  // Load active tab immediately, then pre-fetch all others in background
  useEffect(() => {
    loadCategory(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    const others = CATEGORIES.filter((c) => c.id !== activeCategory);
    others.forEach((c) => loadCategory(c.id));
  }, []); // once on mount

  // Fetch videos for the active tab (cached)
  useEffect(() => {
    if (videoCache[activeCategory]) return;
    loadVideos(activeCategory);
  }, [activeCategory]);

  // Reset pagination and filter on tab change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setDateFilter("all");
  }, [activeCategory]);

  // Reset pagination on filter change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [dateFilter]);

  // ── Derived values ───────────────────────────────────────
  const articles = cache[activeCategory] || [];
  const filteredArticles = filterByDate(articles, dateFilter);
  const videos = videoCache[activeCategory] || [];
  const isVideoLoading = videoLoading[activeCategory] ?? false;
  const visibleArticles = filteredArticles.slice(0, visibleCount);
  const hasMore = filteredArticles.length > visibleCount;
  const updatedAt = lastUpdated[activeCategory];

  // Status text
  const updatedText = updatedAt ? `Updated ${formatRelativeTime(updatedAt)}` : "";
  const statusText = loading
    ? status
    : articles.length > 0
    ? dateFilter !== "all"
      ? filteredArticles.length > 0
        ? `${filteredArticles.length} of ${articles.length} stories`
        : "No stories in this period"
      : `${articles.length} stories`
    : "";

  // Infinite scroll — load next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((n) => n + PAGE_SIZE);
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredArticles, visibleCount]);

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="app-inner">
          <div className="header-content">
            <div className="header-logo">
              <PulseLogo />
              <h1 className="header-title">Pulse</h1>
            </div>
            <div className="header-actions">
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
          </div>
        </div>
      </header>

      {/* ── TAB NAVIGATION ── */}
      <nav className="app-inner">
        <ul className="tab-list" role="tablist">
          {CATEGORIES.map((cat) => (
            <li key={cat.id} role="presentation">
              <button
                className="tab-trigger"
                role="tab"
                aria-selected={activeCategory === cat.id}
                onClick={() => handleTabChange(cat.id)}
              >
                {cat.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── CONTENT ── */}
      <main className="app-inner content">
        <div className="status-bar">
          <span className="status-text">
            {statusText}
            {!loading && updatedText && (
              <span className="status-updated"> · {updatedText}</span>
            )}
          </span>
          {!loading && articles.length > 0 && (
            <div className="filter-group" role="group" aria-label="Date filter">
              {[
                { id: "today", label: "Today" },
                { id: "week",  label: "Week"  },
                { id: "all",   label: "All"   },
              ].map((f) => (
                <button
                  key={f.id}
                  className="filter-btn"
                  data-active={dateFilter === f.id}
                  onClick={() => setDateFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : error && articles.length === 0 ? (
          <div className="empty-state">
            <p>{error}</p>
            <button
              className="btn btn-primary"
              onClick={() => loadCategory(activeCategory, true)}
            >
              Try Again
            </button>
          </div>
        ) : articles.length === 0 ? (
          <div className="empty-state">
            <p>No stories found. Try refreshing.</p>
            <button
              className="btn btn-primary"
              onClick={() => loadCategory(activeCategory, true)}
            >
              Refresh
            </button>
          </div>
        ) : (
          <>
            {/* Videos first — above the fold */}
            {isVideoLoading ? (
              <VideoLoadingSkeleton />
            ) : videos.length > 0 ? (
              <div className="video-section">
                <h2 className="video-section-title">Watch</h2>
                <div className="video-grid">
                  {videos.map((v, i) => (
                    <VideoCard key={v.videoId || i} video={v} index={i} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Articles */}
            {filteredArticles.length === 0 ? (
              <div className="empty-state">
                <p>No stories from this period.</p>
                <button
                  className="btn btn-outline"
                  onClick={() => setDateFilter("all")}
                >
                  Show all stories
                </button>
              </div>
            ) : (
              <>
                {visibleArticles.map((article, i) => (
                  <NewsCard key={article.url || i} article={article} index={i} compact={density === "compact"} />
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
          {updatedAt && (
            <span className="footer-meta">Last updated {updatedText}</span>
          )}
        </div>
      </footer>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  LOGO
// ═══════════════════════════════════════════════════════════════

function PulseLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ animation: "logo-pulse 2s ease-in-out infinite" }}
    >
      <circle cx="12" cy="12" r="6" fill="white" />
    </svg>
  );
}


// ═══════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function NewsCard({ article, index, compact }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`news-card${compact ? " news-card--compact" : ""}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="news-card-inner">
        <div className="news-card-meta">
          {article.tag && <span className="news-card-tag">{article.tag}</span>}
          <span className="news-card-source">{article.source}</span>
          <span className="news-card-date">{article.date}</span>
        </div>
        <h3 className="news-card-title">{article.title}</h3>
        {!compact && article.summary && (
          <p className="news-card-summary">{article.summary}</p>
        )}
      </div>
    </a>
  );
}

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
          <p className="video-card-channel">
            {video.channel} · {video.date}
          </p>
        </div>
      </div>
    </a>
  );
}

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
