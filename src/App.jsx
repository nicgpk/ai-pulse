import { useState, useEffect, useCallback } from "react";
import { CATEGORIES, fetchNews } from "./feeds.js";
import "./tokens.css";
import "./styles.css";

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║  App.jsx — Main Application Component                        ║
 ║                                                              ║
 ║  This file orchestrates the entire app:                      ║
 ║  • Manages dark/light theme (stored on the <html> element)   ║
 ║  • Tracks which category tab is active                       ║
 ║  • Fetches and caches news data                              ║
 ║  • Renders the header, tabs, articles, and footer            ║
 ║                                                              ║
 ║  All styling comes from CSS classes in styles.css which       ║
 ║  reference midashands tokens from tokens.css.                 ║
 ╚══════════════════════════════════════════════════════════════╝
 */

export default function App() {
  // ── State ────────────────────────────────────────────────
  const [theme, setTheme] = useState("dark");
  const [activeCategory, setActiveCategory] = useState("general");
  const [cache, setCache] = useState({});       // Stores articles per category
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");

  // ── Theme ────────────────────────────────────────────────
  // We put data-theme on <html> so the CSS token selectors work
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // ── Data Loading ─────────────────────────────────────────
  const loadCategory = useCallback(
    async (categoryId, forceRefresh = false) => {
      // Don't refetch if we already have cached data (unless forcing)
      if (!forceRefresh && cache[categoryId]?.length > 0) return;

      setLoading(true);
      setError(null);
      setStatus("");

      try {
        const articles = await fetchNews(categoryId, setStatus);
        setCache((prev) => ({ ...prev, [categoryId]: articles }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [cache]
  );

  // Load data whenever the active tab changes
  useEffect(() => {
    loadCategory(activeCategory);
  }, [activeCategory]);

  // ── Derived values ───────────────────────────────────────
  const articles = cache[activeCategory] || [];
  const isVideo = activeCategory === "videos";

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="app-inner">
          <div className="header-content">
            <div className="header-logo">
              <h1 className="header-title">AI Pulse</h1>
              <span className="header-badge">midashands</span>
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
              <button
                className="btn btn-outline btn-sm"
                onClick={toggleTheme}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? "☀ Light" : "● Dark"}
              </button>
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
            </button>
          ))}
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <main className="app-inner content">
        {/* Status bar */}
        <div className="status-bar">
          <span className="status-text">
            {loading
              ? status
              : articles.length > 0
              ? `${articles.length} stories`
              : ""}
          </span>
          {!loading && status && articles.length > 0 && (
            <span className="status-source">{status}</span>
          )}
        </div>

        {/* Content states */}
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
            <p>No articles found. Try refreshing.</p>
            <button
              className="btn btn-primary"
              onClick={() => loadCategory(activeCategory, true)}
            >
              Refresh
            </button>
          </div>
        ) : isVideo ? (
          <div className="video-grid">
            {articles.map((video, i) => (
              <VideoCard key={i} video={video} index={i} />
            ))}
          </div>
        ) : (
          <div>
            {articles.map((article, i) => (
              <NewsCard key={i} article={article} index={i} />
            ))}
          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="app-inner">
          <span>AI Pulse · midashands design system</span>
        </div>
      </footer>
    </div>
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
            <div
              className="skeleton-line"
              style={{ height: 18, width: 50, animationDelay: `${i * 100}ms` }}
            />
            <div
              className="skeleton-line-subtle"
              style={{ height: 18, width: 80, animationDelay: `${i * 100}ms` }}
            />
          </div>
          <div
            className="skeleton-line"
            style={{ height: 17, width: `${60 + (i % 3) * 14}%`, marginBottom: "var(--spacing-2)", animationDelay: `${i * 100}ms` }}
          />
          <div
            className="skeleton-line-subtle"
            style={{ height: 14, width: "85%", animationDelay: `${i * 100}ms` }}
          />
        </div>
      ))}
    </div>
  );
}
