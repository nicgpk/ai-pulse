/* ═══════════════════════════════════════════════════════════
   FEEDS — Data fetching for AI Pulse

   HOW THIS WORKS (plain English):

   1. RSS feeds are "live lists" of articles that news sites
      publish automatically. We read those lists directly.

   2. Since browsers block cross-site requests (a security
      rule called "CORS"), we use free proxy services that
      fetch the feed on our behalf.

   3. If all proxies fail (some hosting environments block
      them), we fall back to the Anthropic API which uses
      Claude + web search to find real news.

   4. Results are returned as simple JavaScript arrays that
      the UI components can display.
   ═══════════════════════════════════════════════════════════ */


// ── Categories ───────────────────────────────────────────────
export const CATEGORIES = [
  { id: "general",     label: "Breaking",    query: "latest AI artificial intelligence news" },
  { id: "engineering", label: "Engineering",  query: "AI engineering developer tools LLM news" },
  { id: "design",      label: "Design",      query: "AI design generative creative tools news" },
  { id: "product",     label: "Product",     query: "AI product management startup launches news" },
  { id: "videos",      label: "Videos",      query: "best AI technology YouTube videos this week" },
];


// ── RSS Feed Sources ─────────────────────────────────────────
const RSS_FEEDS = {
  general: [
    { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
    { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
    { url: "https://arstechnica.com/ai/feed/", source: "Ars Technica" },
    { url: "https://www.technologyreview.com/feed/", source: "MIT Tech Review" },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
  ],
  engineering: [
    { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
    { url: "https://arstechnica.com/ai/feed/", source: "Ars Technica" },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
  ],
  design: [
    { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
    { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
  ],
  product: [
    { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
    { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
    { url: "https://www.technologyreview.com/feed/", source: "MIT Tech Review" },
  ],
  videos: [
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCWN3xxRkmTPphYit4FYgjAw", source: "Two Minute Papers" },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCXZCJLdBc09xxGUCnbWGvuA", source: "TheAIGRID" },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCMLtBahI5DMrt0NPvDSoIRQ", source: "Matt Wolfe" },
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCLXo7UDZvByw2ixzpQCufnA", source: "Vox" },
  ],
};


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

        articles.push({ title, url: link, date: published, channel, videoId, isVideo: true });
      });
    } else {
      doc.querySelectorAll("item").forEach((item) => {
        const title = item.querySelector("title")?.textContent?.trim() || "";
        const linkEl = item.querySelector("link");
        const link = linkEl?.textContent?.trim() || linkEl?.getAttribute("href") || "";
        const pubDate = item.querySelector("pubDate")?.textContent || "";
        const rawDesc = item.querySelector("description")?.textContent || "";

        // Strip HTML tags and entities from the description
        const summary = rawDesc
          .replace(/<[^>]*>/g, "")
          .replace(/&\w+;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200);

        const category = item.querySelector("category")?.textContent || "";

        articles.push({
          title,
          url: link,
          date: pubDate,
          summary: summary + (summary.length >= 200 ? "…" : ""),
          source,
          tag: category.slice(0, 18) || guessTag(title),
        });
      });
    }

    return articles;
  } catch {
    return [];
  }
}


// ── Fetch with proxy + timeout ───────────────────────────────
async function fetchViaProxy(feedUrl, proxyFn) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(proxyFn(feedUrl), { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}


// ── Fetch all RSS feeds for a category ───────────────────────
async function fetchRSSFeeds(categoryId) {
  const feeds = RSS_FEEDS[categoryId] || [];
  const isYouTube = categoryId === "videos";
  let allArticles = [];

  for (const feed of feeds) {
    for (const proxy of PROXIES) {
      try {
        const xml = await fetchViaProxy(feed.url, proxy);
        const articles = parseRSS(xml, feed.source, isYouTube);
        if (articles.length > 0) {
          allArticles = allArticles.concat(articles);
          break; // This proxy worked, move to next feed
        }
      } catch {
        // Try next proxy
      }
    }
  }

  return allArticles;
}


// ── Anthropic API fallback ───────────────────────────────────
async function fetchViaAPI(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  const isVideo = categoryId === "videos";

  const systemPrompt = isVideo
    ? `Find 6 recent popular AI YouTube videos. Return ONLY a JSON array: [{"title":"...","channel":"...","url":"https://youtube.com/watch?v=...","date":"Mar 2025","videoId":"..."}]`
    : `Find 6 recent AI news articles about: ${cat.query}. Return ONLY a JSON array: [{"title":"...","source":"...","summary":"2 sentences","url":"...","date":"Mar 2025","tag":"short label"}]`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: `Search for: ${cat.query}` }],
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  let text = "";
  for (const block of (data.content || [])) {
    if (block.type === "text") text += block.text + "\n";
  }
  if (!text.trim()) throw new Error("Empty response");

  const cleaned = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}

  // Try to find JSON array in the text
  const matches = cleaned.match(/\[[\s\S]*?\]/g);
  if (matches) {
    for (const m of matches.sort((a, b) => b.length - a.length)) {
      try { return JSON.parse(m); } catch {}
    }
  }

  throw new Error("Could not parse response");
}


// ── Main fetch function (RSS → API fallback) ─────────────────
export async function fetchNews(categoryId, onStatus) {
  // Step 1: Try RSS feeds
  onStatus("Fetching RSS feeds…");
  try {
    const rssResults = await fetchRSSFeeds(categoryId);
    if (rssResults.length > 0) {
      onStatus("via RSS");
      return deduplicate(rssResults);
    }
  } catch (error) {
    console.log("RSS failed:", error.message);
  }

  // Step 2: Fall back to Anthropic API
  onStatus("Using AI search…");
  try {
    const apiResults = await fetchViaAPI(categoryId);
    if (apiResults.length > 0) {
      onStatus("via AI");
      if (categoryId === "videos") {
        apiResults.forEach((r) => {
          r.isVideo = true;
          if (!r.videoId && r.url) {
            const m = r.url.match(/[?&]v=([^&]+)/);
            if (m) r.videoId = m[1];
          }
        });
      }
      return apiResults;
    }
  } catch (error) {
    throw new Error(`All sources failed: ${error.message}`);
  }

  throw new Error("No results found");
}


// ── Helpers ──────────────────────────────────────────────────
function deduplicate(articles) {
  const seen = new Set();
  let results = articles.filter((a) => {
    const key = a.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first
  results.sort((a, b) => {
    try { return new Date(b.date) - new Date(a.date); } catch { return 0; }
  });

  // Format dates to relative time
  results = results.map((a) => ({ ...a, date: formatDate(a.date) }));

  return results.slice(0, 15);
}

function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const hoursAgo = Math.floor((Date.now() - date.getTime()) / 3600000);
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
    [["chatgpt", "gpt-"], "GPT"],
    [["claude"], "Claude"],
    [["gemini"], "Gemini"],
    [["openai"], "OpenAI"],
    [["anthropic"], "Anthropic"],
    [["google"], "Google"],
    [["microsoft", "copilot"], "Microsoft"],
    [["apple"], "Apple"],
    [["nvidia"], "Nvidia"],
    [["robot"], "Robotics"],
    [["agent"], "Agents"],
    [["open source"], "Open Source"],
    [["startup", "funding"], "Startup"],
    [["regulat", "policy"], "Policy"],
    [["llama", "meta ai"], "Meta AI"],
    [["image", "dall-e", "midjourney"], "GenAI"],
  ];
  for (const [keys, tag] of tags) {
    if (keys.some((k) => t.includes(k))) return tag;
  }
  return "AI";
}
