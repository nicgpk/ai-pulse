/* ═══════════════════════════════════════════════════════════
   FEEDS — Data fetching for AI Pulse

   PERFORMANCE: All feeds are fetched in parallel via
   Promise.allSettled() so loading time = slowest single feed,
   not the sum of all feeds.

   RELEVANCE: Articles from general-purpose feeds (TechCrunch,
   VentureBeat) are filtered by category keywords so each tab
   only shows relevant content. Dedicated sources (UX Collective,
   InfoQ, etc.) bypass the filter — their content is trusted.

   FALLBACK: If RSS yields nothing, Hacker News Algolia API is
   used instead — free, no key, no CORS restrictions.
   ═══════════════════════════════════════════════════════════ */


// ── Categories ───────────────────────────────────────────────
export const CATEGORIES = [
  { id: "general",     label: "Breaking",    hnQuery: "artificial intelligence AI" },
  { id: "engineering", label: "Engineering", hnQuery: "AI developer tools LLM API coding assistant" },
  { id: "design",      label: "Design",      hnQuery: "AI design tools UX product design figma generative" },
  { id: "product",     label: "Product",     hnQuery: "AI product management PM strategy roadmap" },
  { id: "videos",      label: "Videos",      hnQuery: null },
];


// ── RSS Feed Sources ──────────────────────────────────────────
// Each feed is tagged with a `trusted` flag — trusted sources
// bypass keyword filtering because their entire feed is
// category-relevant. General sources get filtered.
const RSS_FEEDS = {
  general: [
    { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch", trusted: true },
    { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge", trusted: true },
    { url: "https://arstechnica.com/ai/feed/", source: "Ars Technica", trusted: true },
    { url: "https://www.technologyreview.com/feed/", source: "MIT Tech Review", trusted: false },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat", trusted: false },
  ],

  engineering: [
    // Dedicated AI dev sources — trusted (entire feed is relevant)
    { url: "https://arstechnica.com/ai/feed/", source: "Ars Technica", trusted: true },
    { url: "https://www.infoq.com/ai-ml-data-eng/rss/", source: "InfoQ", trusted: true },
    { url: "https://simonwillison.net/atom/everything/", source: "Simon Willison", trusted: true },
    { url: "https://blog.langchain.dev/rss/", source: "LangChain", trusted: true },
    // Broader sources — filtered by engineering keywords
    { url: "https://github.blog/feed/", source: "GitHub Blog", trusted: false },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat", trusted: false },
  ],

  design: [
    // Design sources — filtered because they cover non-AI topics too
    { url: "https://uxdesign.cc/feed", source: "UX Collective", trusted: false },
    { url: "https://www.nngroup.com/feed/rss/", source: "Nielsen Norman", trusted: false },
    { url: "https://www.figma.com/blog/feed/", source: "Figma", trusted: false },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat", trusted: false },
  ],

  product: [
    // Product/PM sources — filtered because they cover non-AI topics too
    { url: "https://www.lennysnewsletter.com/feed", source: "Lenny's Newsletter", trusted: false },
    { url: "https://review.firstround.com/feed", source: "First Round Review", trusted: false },
    { url: "https://www.mindtheproduct.com/feed/", source: "Mind the Product", trusted: false },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat", trusted: false },
    { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch", trusted: false },
  ],

  // Verified AI YouTube channel IDs
  videos: [
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg", source: "Two Minute Papers", trusted: true },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew", source: "Yannic Kilcher", trusted: true },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA", source: "Lex Fridman", trusted: false },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UChpleBmo18P08aKCIgti38g", source: "Matt Wolfe", trusted: true },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCl6vWwMCjufI8OPtOInHf0g", source: "Google DeepMind", trusted: true },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCXUPKJO5MZQN11PqgIvyuvQ", source: "Andrej Karpathy", trusted: true },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCVHgDSsGsQhqPUVyoHHzRhg", source: "AI Jason", trusted: true },
  ],
};


// ── Category keyword filters ──────────────────────────────────
// Articles from non-trusted feeds must match at least one
// keyword to appear in that category's tab.
const CATEGORY_KEYWORDS = {
  engineering: [
    "api", "sdk", "model", "llm", "developer", "code", "coding", "open source",
    "open-source", "training", "fine-tun", "benchmark", "inference", "deployment",
    "framework", "library", "parameter", "token", "transformer", "neural",
    "dataset", "github", "research", "paper", "embedding", "rag", "agent",
    "architecture", "hardware", "gpu", "chip", "cursor", "copilot",
    "programming", "software engineer", "machine learning", "deep learning",
    "langchain", "prompt", "context window", "multimodal", "vector database",
    "agentic", "devtool", "code generation", "vscode", "autocomplete",
    "retrieval", "workflow automation", "openai api", "anthropic api",
  ],
  design: [
    "design", "ux", "ui", "user experience", "user interface",
    "generative", "image generation", "text-to-image",
    "figma", "prototype", "artwork", "aesthetic", "interface", "illustration",
    "typography", "branding", "graphic", "dall-e", "midjourney", "stable diffusion",
    "sketch", "mockup", "wireframe", "animation", "motion", "video generation",
    "sora", "runway", "flux", "adobe", "canva", "photoshop",
    "ai design", "design tool", "generative ui", "design system",
    "ux research", "usability", "accessibility", "ai-generated", "creative ai",
  ],
  product: [
    "product", "launch", "release", "growth", "revenue", "customer",
    "roadmap", "strategy", "saas", "b2b", "enterprise", "platform",
    "subscription", "pricing", "invest", "acquisition", "feature", "startup",
    "chatbot", "ai product", "product manager", "product management",
    "go-to-market", "gtm", "user research", "product-led", "product strategy",
    "user adoption", "retention", "activation", "north star", "okr",
    "ai assistant", "ai tool", "ai workflow", "copilot",
  ],
};

// Video keyword filter for non-trusted channels (e.g. Lex Fridman
// covers non-AI topics so we filter his videos)
const VIDEO_KEYWORDS = [
  "ai", "artificial intelligence", "machine learning", "neural", "gpt",
  "llm", "chatgpt", "claude", "gemini", "openai", "anthropic", "deepmind",
  "model", "robot", "agent", "data", "future", "tech", "deep learning",
];


// ── CORS Proxies (tried in order) ────────────────────────────
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];


// ── RSS Parsing ──────────────────────────────────────────────
function parseRSS(xml, source, isYouTube) {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return [];

    const articles = [];

    if (isYouTube) {
      doc.querySelectorAll("entry").forEach((entry) => {
        const title = entry.querySelector("title")?.textContent || "";
        const link = entry.querySelector("link")?.getAttribute("href") || "";
        const published = entry.querySelector("published")?.textContent || "";
        const channel = entry.querySelector("author name")?.textContent || source;

        let videoId = "";
        const vidEl = entry.getElementsByTagName("yt:videoId")[0];
        if (vidEl) videoId = vidEl.textContent;
        if (!videoId) {
          const match = link.match(/[?&]v=([^&]+)/);
          if (match) videoId = match[1];
        }

        if (title && link) {
          articles.push({ title, url: link, date: published, channel, videoId, isVideo: true });
        }
      });
    } else {
      doc.querySelectorAll("item").forEach((item) => {
        const title = item.querySelector("title")?.textContent?.trim() || "";
        const linkEl = item.querySelector("link");
        const link = linkEl?.textContent?.trim() || linkEl?.getAttribute("href") || "";
        const pubDate = item.querySelector("pubDate")?.textContent || "";
        const rawDesc = item.querySelector("description")?.textContent || "";

        const summary = rawDesc
          .replace(/<[^>]*>/g, "")
          .replace(/&\w+;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200);

        const category = item.querySelector("category")?.textContent || "";

        if (title && link) {
          articles.push({
            title,
            url: link,
            date: pubDate,
            summary: summary + (summary.length >= 200 ? "…" : ""),
            source,
            tag: category.slice(0, 18) || guessTag(title),
          });
        }
      });
    }

    return articles;
  } catch {
    return [];
  }
}


// ── Relevance filtering ───────────────────────────────────────
function filterByRelevance(articles, categoryId, trusted, isVideo) {
  if (trusted) return articles; // Dedicated sources — trust everything

  if (isVideo) {
    // Non-trusted video channels (e.g. Lex Fridman) — filter by AI keywords
    return articles.filter((v) => {
      const text = v.title.toLowerCase();
      return VIDEO_KEYWORDS.some((kw) => text.includes(kw));
    });
  }

  const keywords = CATEGORY_KEYWORDS[categoryId];
  if (!keywords) return articles; // 'general' — no filter

  return articles.filter((a) => {
    const text = `${a.title} ${a.summary || ""}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
}


// ── Fetch single feed (tries each proxy in sequence) ─────────
async function fetchOneFeed(feed, isYouTube, categoryId) {
  for (const proxy of PROXIES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let xml;
      try {
        const res = await fetch(proxy(feed.url), { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        xml = await res.text();
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }

      const raw = parseRSS(xml, feed.source, isYouTube);
      if (raw.length > 0) {
        return filterByRelevance(raw, categoryId, feed.trusted, isYouTube);
      }
    } catch {
      // Try next proxy
    }
  }
  return [];
}


// ── Fetch all feeds in parallel ───────────────────────────────
async function fetchRSSFeeds(categoryId) {
  const feeds = RSS_FEEDS[categoryId] || [];
  const isYouTube = categoryId === "videos";

  // All feeds run at the same time — total wait = slowest feed, not sum
  const results = await Promise.allSettled(
    feeds.map((feed) => fetchOneFeed(feed, isYouTube, categoryId))
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);
}


// ── Hacker News Algolia fallback (no CORS, no key needed) ─────
async function fetchFromHN(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat?.hnQuery) return [];

  const params = new URLSearchParams({
    tags: "story",
    query: cat.hnQuery,
    hitsPerPage: "15",
    numericFilters: "points>20",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?${params}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HN API HTTP ${res.status}`);

    const data = await res.json();
    return (data.hits || [])
      .filter((h) => h.title && (h.url || h.objectID))
      .map((h) => ({
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        date: h.created_at || "",
        source: "Hacker News",
        tag: guessTag(h.title),
        summary: "",
      }));
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}


// ── Main export ───────────────────────────────────────────────
export async function fetchNews(categoryId, onStatus) {
  onStatus("Loading…");

  try {
    const rssResults = await fetchRSSFeeds(categoryId);
    if (rssResults.length > 0) {
      onStatus("via RSS");
      return categoryId === "videos"
        ? deduplicateVideos(rssResults)
        : deduplicateArticles(rssResults);
    }
  } catch (err) {
    console.warn("RSS failed:", err.message);
  }

  if (categoryId !== "videos") {
    onStatus("Trying Hacker News…");
    try {
      const hnResults = await fetchFromHN(categoryId);
      if (hnResults.length > 0) {
        onStatus("via Hacker News");
        return deduplicateArticles(hnResults);
      }
    } catch (err) {
      console.warn("HN fallback failed:", err.message);
    }
  }

  throw new Error(
    categoryId === "videos"
      ? "Could not load videos — CORS proxies may be unavailable. Try refreshing."
      : "Could not load articles. Check your connection and try refreshing."
  );
}


// ── Deduplication & normalisation ────────────────────────────
function deduplicateArticles(articles) {
  const seen = new Set();
  const results = articles.filter((a) => {
    const key = a.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  results.sort((a, b) => {
    try { return new Date(b.date) - new Date(a.date); } catch { return 0; }
  });

  return results
    .map((a) => ({ ...a, date: formatDate(a.date) }));
}

function deduplicateVideos(videos) {
  const seen = new Set();
  const results = videos.filter((v) => {
    const key = v.videoId || v.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  results.sort((a, b) => {
    try { return new Date(b.date) - new Date(a.date); } catch { return 0; }
  });

  return results
    .map((v) => ({ ...v, date: formatDate(v.date) }));
}


// ── Helpers ──────────────────────────────────────────────────
function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const hoursAgo = Math.floor((Date.now() - date.getTime()) / 3_600_000);
    if (hoursAgo < 1) return "Just now";
    if (hoursAgo < 24) return `${hoursAgo}h ago`;

    const daysAgo = Math.floor(hoursAgo / 24);
    if (daysAgo < 7) return `${daysAgo}d ago`;

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

function guessTag(title) {
  const t = title.toLowerCase();
  const tags = [
    [["chatgpt", "gpt-4", "gpt-5", "gpt-o"], "GPT"],
    [["claude"], "Claude"],
    [["gemini"], "Gemini"],
    [["openai"], "OpenAI"],
    [["anthropic"], "Anthropic"],
    [["google", "deepmind"], "Google"],
    [["microsoft", "copilot", "azure"], "Microsoft"],
    [["apple", "siri"], "Apple"],
    [["nvidia", "gpu"], "Nvidia"],
    [["robot", "humanoid"], "Robotics"],
    [["agent", "agentic"], "Agents"],
    [["open source", "open-source", "ollama", "llama"], "Open Source"],
    [["startup", "funding", "raise", "series"], "Startup"],
    [["regulat", "policy", "law", "ban", "safety"], "Policy"],
    [["meta ai", "llama", "meta "], "Meta"],
    [["dall-e", "midjourney", "stable diffusion", "sora", "image generation"], "GenAI"],
    [["voice", "audio", "speech", "whisper"], "Audio"],
    [["code", "developer", "cursor", "engineer"], "Dev Tools"],
    [["ux", "figma", "creative", "visual design"], "Design"],
    [["product", "launch", "feature", "update"], "Product"],
  ];
  for (const [keys, tag] of tags) {
    if (keys.some((k) => t.includes(k))) return tag;
  }
  return "AI";
}
