import { useState, useEffect, useCallback, useRef } from "react";
import { CATEGORIES, fetchNews } from "./feeds.js";
import "./tokens.css";
import "./styles.css";

const PAGE_SIZE = 10;

export default function App() {
  // ── State ────────────────────────────────────────────────
  const [theme, setTheme] = useState("dark");
  const [activeCategory, setActiveCategory] = useState("general");
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // ── Theme ────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // ── Data Loading ─────────────────────────────────────────
  const loadCategory = useCallback(
    async (categoryId, forceRefresh = false) => {
      if (!forceRefresh && cache[categoryId]?.length > 0) return;

      // Only show loading state for the active tab
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
      } catch (err) {
        if (categoryId === activeCategory) setError(err.message);
      } finally {
        if (categoryId === activeCategory) setLoading(false);
      }
    },
    [cache, activeCategory]
  );

  // Load active tab immediately, then pre-fetch all others in background
  useEffect(() => {
    loadCategory(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    // After mount, silently pre-fetch every other category
    const others = CATEGORIES.filter((c) => c.id !== activeCategory);
    others.forEach((c) => loadCategory(c.id));
  }, []); // once on mount

  // Reset pagination when tab changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory]);

  // ── Derived values ───────────────────────────────────────
  const articles = cache[activeCategory] || [];
  const isVideo = activeCategory === "videos";
  const visibleArticles = articles.slice(0, visibleCount);
  const hasMore = articles.length > visibleCount;

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
  }, [articles, visibleCount]);

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
                className={`btn btn-outline btn-sm ${loading ? "spinning" : ""}`}
                onClick={() => loadCategory(activeCategory, true)}
                disabled={loading}
                aria-label="Refresh"
              >
                ↻
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
        <div className="tab-nav" role="tablist">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className="tab-btn"
              data-active={activeCategory === cat.id}
              onClick={() => setActiveCategory(cat.id)}
              role="tab"
              aria-selected={activeCategory === cat.id}
            >
              {cat.label}
              {/* Dot indicator when pre-fetched and ready */}
              {cat.id !== activeCategory && cache[cat.id]?.length > 0 && (
                <span className="tab-ready-dot" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <main className="app-inner content">
        <div className="status-bar">
          <span className="status-text">
            {loading
              ? status
              : articles.length > 0
              ? `${visibleCount < articles.length ? `${visibleCount} of ` : ""}${articles.length} stories`
              : ""}
          </span>
          {!loading && status && articles.length > 0 && (
            <span className="status-source">{status}</span>
          )}
        </div>

        {loading ? (
          <LoadingSkeleton isVideo={isVideo} />
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
        ) : isVideo ? (
          <>
            <div className="video-grid">
              {visibleArticles.map((video, i) => (
                <VideoCard key={video.videoId || i} video={video} index={i} />
              ))}
            </div>
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          </>
        ) : (
          <>
            <div>
              {visibleArticles.map((article, i) => (
                <NewsCard key={article.url || i} article={article} index={i} />
              ))}
            </div>
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          </>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="app-inner">
          <span>Pulse</span>
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

function NewsCard({ article, index }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-card"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="news-card-inner">
        <div className="news-card-meta">
          {article.tag && <span className="news-card-tag">{article.tag}</span>}
          <span className="news-card-source">{article.source}</span>
          <span className="news-card-date">{article.date}</span>
        </div>
        <h3 className="news-card-title">{article.title}</h3>
        {article.summary && (
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

function LoadingSkeleton({ isVideo }) {
  if (isVideo) {
    return (
      <div className="video-grid">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            <div
              className="skeleton-line"
              style={{ height: 160, borderRadius: 0, animationDelay: `${i * 100}ms` }}
            />
            <div style={{ padding: "var(--spacing-3) var(--spacing-4)" }}>
              <div
                className="skeleton-line"
                style={{ height: 14, width: "80%", marginBottom: "var(--spacing-2)", animationDelay: `${i * 100}ms` }}
              />
              <div
                className="skeleton-line-subtle"
                style={{ height: 12, width: "45%", animationDelay: `${i * 100}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

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
