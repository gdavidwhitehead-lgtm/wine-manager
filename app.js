const STORAGE_KEY = "wine-manager-inventory-v1";
const RESEARCH_CACHE_KEY = "wine-manager-research-v1";
const DATA_VERSION = 1;
const config = window.WINE_MANAGER_CONFIG || {};
const researchData = window.WINE_RESEARCH || { winery: {}, wines: {} };
const wiensAgingChart = window.WIENS_AGING_CHART || { rules: [] };
const tableName = config.tableName || "wines";
const researchFunctionName = config.researchFunctionName || "research-wine";
const baseWines = (window.WINE_DATA || []).map(normalizeWine);
let wines = loadSavedWines();
let researchCache = loadResearchCache();
let supabaseClient = null;
let currentUser = null;
let syncMode = "local";

const state = {
  search: "",
  color: "All",
  status: "All",
  region: "All",
  sort: "drink",
};

const els = {
  search: document.querySelector("#searchInput"),
  color: document.querySelector("#colorFilter"),
  status: document.querySelector("#statusFilter"),
  region: document.querySelector("#regionFilter"),
  sort: document.querySelector("#sortSelect"),
  reset: document.querySelector("#resetFilters"),
  add: document.querySelector("#addWine"),
  signInOut: document.querySelector("#signInOut"),
  export: document.querySelector("#exportData"),
  import: document.querySelector("#importData"),
  totalBottles: document.querySelector("#totalBottles"),
  uniqueWines: document.querySelector("#uniqueWines"),
  drinkNow: document.querySelector("#drinkNow"),
  holdBottles: document.querySelector("#holdBottles"),
  redWhiteSplit: document.querySelector("#redWhiteSplit"),
  redFill: document.querySelector("#redFill"),
  whiteFill: document.querySelector("#whiteFill"),
  colorLegend: document.querySelector("#colorLegend"),
  statusBars: document.querySelector("#statusBars"),
  regionBars: document.querySelector("#regionBars"),
  priorityList: document.querySelector("#priorityList"),
  lowStockList: document.querySelector("#lowStockList"),
  wineRows: document.querySelector("#wineRows"),
  resultCount: document.querySelector("#resultCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  dialog: document.querySelector("#wineDialog"),
  form: document.querySelector("#wineForm"),
  formMode: document.querySelector("#formMode"),
  formTitle: document.querySelector("#formTitle"),
  wineId: document.querySelector("#wineId"),
  closeDialog: document.querySelector("#closeDialog"),
  deleteWine: document.querySelector("#deleteWine"),
  saveNote: document.querySelector("#saveNote"),
  authDialog: document.querySelector("#authDialog"),
  authForm: document.querySelector("#authForm"),
  googleSignIn: document.querySelector("#googleSignIn"),
  closeAuthDialog: document.querySelector("#closeAuthDialog"),
  authNote: document.querySelector("#authNote"),
  detailDialog: document.querySelector("#detailDialog"),
  detailTitle: document.querySelector("#detailTitle"),
  detailKicker: document.querySelector("#detailKicker"),
  detailContent: document.querySelector("#detailContent"),
  closeDetailDialog: document.querySelector("#closeDetailDialog"),
};

const currentYear = new Date().getFullYear();
updateSourceLabel();

function normalizeWine(wine) {
  return {
    id: wine.id || makeId(),
    color: clean(wine.color) || "Unknown",
    varietal: clean(wine.varietal),
    winery: clean(wine.winery),
    wine: clean(wine.wine),
    vintage: toOptionalNumber(wine.vintage),
    region: clean(wine.region) || "Unknown",
    country: clean(wine.country),
    quantity: Math.max(0, toOptionalNumber(wine.quantity) || 0),
    collection_rating: clean(wine.collection_rating) || "Not rated",
    professional_score: clean(wine.professional_score) || "N/R",
    critic_publication: clean(wine.critic_publication) || "—",
    drink_from: toOptionalNumber(wine.drink_from),
    drink_through: toOptionalNumber(wine.drink_through),
    cellaring_status: clean(wine.cellaring_status) || "Hold",
    score_source_url: clean(wine.score_source_url),
    notes: clean(wine.notes),
  };
}

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `wine-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function loadSavedWines() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.version === DATA_VERSION && Array.isArray(saved.wines)) {
      return saved.wines.map(normalizeWine);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return baseWines;
}

function loadResearchCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(RESEARCH_CACHE_KEY) || "null");
    return saved?.version === DATA_VERSION && saved.research ? saved.research : {};
  } catch {
    localStorage.removeItem(RESEARCH_CACHE_KEY);
    return {};
  }
}

function persistResearchCache() {
  localStorage.setItem(
    RESEARCH_CACHE_KEY,
    JSON.stringify({
      version: DATA_VERSION,
      savedAt: new Date().toISOString(),
      research: researchCache,
    }),
  );
}

function persistWines() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: DATA_VERSION,
      savedAt: new Date().toISOString(),
      wines,
    }),
  );
  updateSourceLabel();
}

function updateSourceLabel() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (syncMode === "cloud") {
    els.lastUpdated.textContent = `Cloud synced: ${wines.length} wines`;
    els.signInOut.textContent = "Sign Out";
    return;
  }
  if (syncMode === "signed-out") {
    els.lastUpdated.textContent = `Cloud ready · local copy: ${wines.length} wines`;
    els.signInOut.textContent = "Sign In";
    return;
  }
  els.lastUpdated.textContent = saved
    ? `Saved locally: ${wines.length} wines`
    : `Workbook import: ${wines.length} wines`;
  els.signInOut.textContent = "Cloud Sync";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function searchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function wineResearchKey(wine) {
  return [wine.winery, wine.wine, wine.vintage || ""]
    .map((part) => String(part || "").trim().toLowerCase())
    .join("|");
}

function getResearch(wine) {
  const wineMatch = researchData.wines?.[wineResearchKey(wine)];
  const wineryMatch = researchData.winery?.[wine.winery];
  return {
    ai: researchCache[wine.id] || null,
    wine: wineMatch || null,
    winery: wineryMatch || null,
  };
}

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isWiensWine(wine) {
  return normalizeMatchText(wine.winery).includes("wiens");
}

function getWiensAgingRule(wine) {
  if (!isWiensWine(wine)) return null;
  const haystack = normalizeMatchText(`${wine.wine} ${wine.varietal}`);
  const candidates = wiensAgingChart.rules || [];

  const ranked = candidates
    .map((rule) => {
      const names = [rule.name, ...(rule.aliases || [])];
      const matchedName = names.find((name) => haystack.includes(normalizeMatchText(name)));
      if (!matchedName) return null;
      const score = normalizeMatchText(matchedName).length;
      return { ...rule, matchedName, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return ranked[0] || null;
}

function getWiensDrinkability(wine) {
  const rule = getWiensAgingRule(wine);
  const vintage = toOptionalNumber(wine.vintage);
  if (!rule || !vintage) return null;

  const startYear = vintage + rule.startPeak;
  const endYear = vintage + rule.endPeak;
  let status = "Peak Now";
  let guidance = "This bottle is in Wiens Cellars' published peak drinkability window.";
  if (currentYear < startYear) {
    status = "Hold";
    guidance = `Hold until ${startYear} for the start of Wiens Cellars' peak window.`;
  } else if (currentYear > endYear) {
    status = "Past Peak";
    guidance = "Wiens Cellars' published peak window has passed; consider opening soon and expect maturity.";
  }

  return {
    ...rule,
    vintage,
    startYear,
    endYear,
    status,
    guidance,
  };
}

function displayDrinkWindow(wine) {
  const wiens = getWiensDrinkability(wine);
  if (wiens) return `${wiens.startYear}-${wiens.endYear}`;
  return `${wine.drink_from || "?"}-${wine.drink_through || "?"}`;
}

function displayCellaringStatus(wine) {
  const wiens = getWiensDrinkability(wine);
  if (wiens) return wiens.status;
  return wine.cellaring_status || "Unsorted";
}

function applyWiensAgingDefaults(wine) {
  const wiens = getWiensDrinkability(wine);
  if (!wiens) return wine;
  return {
    ...wine,
    drink_from: wiens.startYear,
    drink_through: wiens.endYear,
  };
}

function uniqueValues(key) {
  return [...new Set(wines.map((wine) => wine[key]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

function uniqueStatusValues() {
  return [...new Set(wines.map(displayCellaringStatus).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

function fillSelect(select, values, currentValue = "All") {
  select.replaceChildren(
    new Option("All", "All"),
    ...values.map((value) => new Option(value, value)),
  );
  select.value = values.includes(currentValue) ? currentValue : "All";
}

function refreshFilterOptions() {
  fillSelect(els.color, uniqueValues("color"), state.color);
  fillSelect(els.status, uniqueStatusValues(), state.status);
  fillSelect(els.region, uniqueValues("region"), state.region);
  state.color = els.color.value;
  state.status = els.status.value;
  state.region = els.region.value;
}

function bottleCount(rows) {
  return rows.reduce((total, wine) => total + Number(wine.quantity || 0), 0);
}

function groupByBottleCount(rows, key) {
  return rows.reduce((groups, wine) => {
    const label = wine[key] || "Unknown";
    groups[label] = (groups[label] || 0) + Number(wine.quantity || 0);
    return groups;
  }, {});
}

function starScore(rating) {
  return String(rating || "").split("").filter((char) => char === "★").length;
}

function drinkPriority(wine) {
  const wiens = getWiensDrinkability(wine);
  if (wiens?.status === "Past Peak") return 95 + starScore(wine.collection_rating);
  if (wiens?.status === "Peak Now") return 80 + starScore(wine.collection_rating);
  if (wiens?.status === "Hold") return 15 + starScore(wine.collection_rating);

  const status = wine.cellaring_status || "";
  let score = 0;
  if (status.includes("Drink Now")) score += 60;
  if (status.includes("Short")) score += 45;
  if (status.includes("Drink / Hold")) score += 35;
  if (Number(wine.drink_from) <= currentYear) score += 25;
  if (Number(wine.drink_through) <= currentYear + 3) score += 10;
  score += starScore(wine.collection_rating);
  return score;
}

function filteredWines() {
  const query = state.search.trim().toLowerCase();
  return wines.filter((wine) => {
    const haystack = [
      wine.winery,
      wine.wine,
      wine.varietal,
      wine.region,
      wine.cellaring_status,
      wine.notes,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!query || haystack.includes(query)) &&
      (state.color === "All" || wine.color === state.color) &&
      (state.status === "All" || displayCellaringStatus(wine) === state.status) &&
      (state.region === "All" || wine.region === state.region)
    );
  });
}

function sortedRows(rows) {
  return [...rows].sort((a, b) => {
    if (state.sort === "quantity") return b.quantity - a.quantity;
    if (state.sort === "rating") return starScore(b.collection_rating) - starScore(a.collection_rating);
    if (state.sort === "vintage") return Number(a.vintage || 9999) - Number(b.vintage || 9999);
    if (state.sort === "winery") return String(a.winery).localeCompare(String(b.winery));
    return drinkPriority(b) - drinkPriority(a);
  });
}

function renderBars(container, groups, limit = 6) {
  const rows = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const max = Math.max(...rows.map(([, count]) => count), 1);

  container.replaceChildren(
    ...rows.map(([label, count]) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <span>${escapeHtml(label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
        <strong>${count}</strong>
      `;
      return row;
    }),
  );
}

function renderWineList(container, rows, options = {}) {
  const items = rows.slice(0, options.limit || 5).map((wine) => {
    const item = document.createElement("div");
    item.className = "wine-item";
    item.innerHTML = `
      <div>
        <div class="wine-title">${escapeHtml(wine.winery)} ${escapeHtml(wine.wine)}</div>
        <div class="wine-meta">${wine.vintage || "NV"} · ${escapeHtml(wine.varietal || "Unknown")} · ${displayDrinkWindow(wine)}</div>
      </div>
      <span class="pill">${wine.quantity} bottle${wine.quantity === 1 ? "" : "s"}</span>
    `;
    return item;
  });
  container.replaceChildren(...items);
}

function renderTable(rows) {
  if (!rows.length) {
    els.wineRows.innerHTML = `<tr><td class="empty" colspan="9">No wines match the current filters.</td></tr>`;
    return;
  }

  els.wineRows.replaceChildren(
    ...rows.map((wine) => {
      const tr = document.createElement("tr");
      tr.className = "clickable-row";
      tr.dataset.detailId = wine.id;
      tr.innerHTML = `
        <td><button type="button" class="wine-link" data-detail-id="${wine.id}"><strong>${escapeHtml(wine.winery)}</strong><br>${escapeHtml(wine.wine)}</button></td>
        <td>${wine.vintage || "NV"}</td>
        <td>${escapeHtml(wine.varietal || "Unknown")}</td>
        <td>${escapeHtml(wine.region || "Unknown")}</td>
        <td class="status">${escapeHtml(displayCellaringStatus(wine))}</td>
        <td>${displayDrinkWindow(wine)}</td>
        <td>${escapeHtml(wine.collection_rating || "Not rated")}</td>
        <td>${wine.quantity || 0}</td>
        <td><button type="button" class="table-action" data-edit-id="${wine.id}">Edit</button></td>
      `;
      return tr;
    }),
  );
}

function render() {
  refreshFilterOptions();
  const rows = sortedRows(filteredWines());
  const total = bottleCount(rows);
  const statusGroups = rows.reduce((groups, wine) => {
    const label = displayCellaringStatus(wine);
    groups[label] = (groups[label] || 0) + Number(wine.quantity || 0);
    return groups;
  }, {});
  const colorGroups = groupByBottleCount(rows, "color");

  els.totalBottles.textContent = total;
  els.uniqueWines.textContent = rows.length;
  els.drinkNow.textContent = statusGroups["Drink Now"] || 0;
  els.holdBottles.textContent =
    (statusGroups.Hold || 0) + (statusGroups["Long-Term Hold"] || 0);

  const red = colorGroups.Red || 0;
  const white = colorGroups.White || 0;
  const redPct = total ? Math.round((red / total) * 100) : 0;
  const whitePct = total ? 100 - redPct : 0;
  els.redWhiteSplit.textContent = `${redPct}% red / ${whitePct}% white`;
  els.redFill.style.height = `${redPct}%`;
  els.whiteFill.style.height = `${whitePct}%`;
  els.colorLegend.innerHTML = `
    <span class="red">Red ${red}</span>
    <span class="white">White ${white}</span>
  `;

  renderBars(els.statusBars, statusGroups, 6);
  renderBars(els.regionBars, groupByBottleCount(rows, "region"), 6);
  renderWineList(els.priorityList, rows, { limit: 5 });
  renderWineList(
    els.lowStockList,
    [...rows].sort((a, b) => a.quantity - b.quantity || drinkPriority(b) - drinkPriority(a)),
    { limit: 5 },
  );
  renderTable(rows);
  els.resultCount.textContent = `${rows.length} wines · ${total} bottles`;
  updateSourceLabel();
}

function syncState() {
  state.search = els.search.value;
  state.color = els.color.value;
  state.status = els.status.value;
  state.region = els.region.value;
  state.sort = els.sort.value;
  render();
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "—")}</dd>
    </div>
  `;
}

function renderSourceLinks(sources = []) {
  if (!sources.length) return `<p class="muted-copy">No verified source link attached yet.</p>`;
  return `
    <div class="source-links">
      ${sources
        .map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.label)}</a>`)
        .join("")}
    </div>
  `;
}

function normalizeResearchSource(source) {
  if (!source) return null;
  if (typeof source === "string") return { label: source, url: source };
  return {
    label: source.label || source.title || source.url || "Source",
    url: source.url || "",
  };
}

function renderApiResearch(research) {
  if (!research) {
    return `
      <section class="detail-section ai-research-panel">
        <div class="detail-section-heading">
          <h3>AI Web Research</h3>
          <button type="button" class="secondary" data-run-research>Research with AI</button>
        </div>
        <p class="muted-copy">Sign in and run an AI web research pass for producer notes, tasting context, pairings, storage notes, and source links.</p>
      </section>
    `;
  }

  const listSections = [
    ["Tasting Notes", research.tasting_notes],
    ["Producer Notes", research.producer_notes],
    ["Pairings", research.pairing_ideas],
    ["Buying / Storage", research.buying_storage_notes],
  ];
  const sources = (research.sources || []).map(normalizeResearchSource).filter((source) => source?.url);

  return `
    <section class="detail-section ai-research-panel">
      <div class="detail-section-heading">
        <h3>AI Web Research</h3>
        <button type="button" class="secondary" data-run-research>Refresh Research</button>
      </div>
      <p>${escapeHtml(research.summary || "No summary returned.")}</p>
      ${listSections
        .map(([title, items]) =>
          items?.length
            ? `<h4>${escapeHtml(title)}</h4><ul class="research-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "",
        )
        .join("")}
      <p class="muted-copy">Confidence: ${escapeHtml(research.confidence || "Not specified")}${research.researched_at ? ` · ${escapeHtml(new Date(research.researched_at).toLocaleString())}` : ""}</p>
      ${renderSourceLinks(sources)}
    </section>
  `;
}

function renderWiensAgingBlock(wine) {
  const wiens = getWiensDrinkability(wine);
  if (!isWiensWine(wine)) return "";
  if (!wiens) {
    return `
      <section class="detail-section wiens-aging-panel">
        <h3>Wiens Aging Chart</h3>
        <p class="muted-copy">This is a Wiens wine, but it did not match a varietal or blend in the imported Wiens vintage aging chart. Add a closer varietal or wine name to use the chart.</p>
      </section>
    `;
  }

  return `
    <section class="detail-section wiens-aging-panel">
      <div class="detail-section-heading">
        <h3>Wiens Aging Chart</h3>
        <span class="pill">${escapeHtml(wiens.status)}</span>
      </div>
      <dl class="detail-list compact-detail-list">
        ${detailItem("Chart Match", wiens.name)}
        ${detailItem("Category", wiens.category)}
        ${detailItem("Start Peak", `Vintage + ${wiens.startPeak} = ${wiens.startYear}`)}
        ${detailItem("End Peak", `Vintage + ${wiens.endPeak} = ${wiens.endYear}`)}
      </dl>
      <p>${escapeHtml(wiens.guidance)}</p>
      <p class="muted-copy">Source: Wiens Cellars Vintage Aging Chart PDF. Start peak is the first year of peak drinkability; end peak is the last year.</p>
    </section>
  `;
}

function renderResearchBlock(title, research) {
  if (!research) {
    return `
      <section class="detail-section">
        <h3>${escapeHtml(title)}</h3>
        <p class="muted-copy">No verified research note is attached yet.</p>
      </section>
    `;
  }

  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(research.summary)}</p>
      <ul class="research-list">
        ${(research.details || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      ${renderSourceLinks(research.sources)}
    </section>
  `;
}

function openWineDetails(wine) {
  const research = getResearch(wine);
  const wineName = `${wine.winery} ${wine.wine}`.trim();
  const vintage = wine.vintage || "NV";
  const wineQuery = `${vintage} ${wine.winery} ${wine.wine} ${wine.varietal || ""} wine`;
  const scoreQuery = `${vintage} ${wine.winery} ${wine.wine} wine score tasting notes`;
  const producerQuery = `${wine.winery} winery ${wine.region || ""}`;

  els.detailKicker.textContent = `${wine.color || "Wine"} · ${wine.quantity || 0} bottle${wine.quantity === 1 ? "" : "s"}`;
  els.detailTitle.textContent = `${vintage} ${wineName}`;
  els.detailDialog.dataset.wineId = wine.id;
  els.detailContent.innerHTML = `
    <section class="detail-hero">
      <div>
        <p class="eyebrow">${escapeHtml(displayCellaringStatus(wine))}</p>
        <h3>${escapeHtml(wine.varietal || "Unknown varietal")}</h3>
        <p>${escapeHtml(wine.region || "Unknown region")}${wine.country ? `, ${escapeHtml(wine.country)}` : ""}</p>
      </div>
      <div class="detail-rating">
        <span>${escapeHtml(wine.collection_rating || "Not rated")}</span>
        <strong>${escapeHtml(wine.professional_score || "N/R")}</strong>
      </div>
    </section>

    <section class="detail-section">
      <h3>Inventory Details</h3>
      <dl class="detail-list">
        ${detailItem("Winery", wine.winery)}
        ${detailItem("Wine", wine.wine)}
        ${detailItem("Vintage", vintage)}
        ${detailItem("Color", wine.color)}
        ${detailItem("Varietal", wine.varietal)}
        ${detailItem("Region", wine.region)}
        ${detailItem("Country", wine.country)}
        ${detailItem("Quantity", wine.quantity)}
        ${detailItem("Drink Window", displayDrinkWindow(wine))}
        ${detailItem("Cellaring Status", displayCellaringStatus(wine))}
        ${detailItem("Collection Rating", wine.collection_rating)}
        ${detailItem("Professional Score", wine.professional_score)}
        ${detailItem("Critic / Publication", wine.critic_publication)}
      </dl>
    </section>

    <section class="detail-section">
      <h3>Cellar Notes</h3>
      <p>${escapeHtml(wine.notes || "No cellar notes yet.")}</p>
      ${wine.score_source_url ? renderSourceLinks([{ label: "Score Source", url: wine.score_source_url }]) : ""}
    </section>

    ${renderWiensAgingBlock(wine)}
    ${renderApiResearch(research.ai)}
    ${renderResearchBlock("AI Research: This Wine", research.wine)}
    ${renderResearchBlock("AI Research: Producer", research.winery)}

    <section class="detail-section">
      <h3>Search More</h3>
      <div class="source-links">
        <a href="${searchUrl(wineQuery)}" target="_blank" rel="noopener">Wine Search</a>
        <a href="${searchUrl(scoreQuery)}" target="_blank" rel="noopener">Scores & Tasting Notes</a>
        <a href="${searchUrl(producerQuery)}" target="_blank" rel="noopener">Producer</a>
        <a href="${searchUrl(`${wine.varietal || wine.wine} food pairing wine`)}" target="_blank" rel="noopener">Pairings</a>
      </div>
    </section>

    <div class="detail-actions">
      <button type="button" class="secondary" data-detail-edit-id="${wine.id}">Edit Inventory</button>
    </div>
  `;
  if (!els.detailDialog.open) els.detailDialog.showModal();
}

async function loadCloudResearch() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient.from("wine_research").select("wine_id,research");
  if (error) return;
  data.forEach((row) => {
    researchCache[row.wine_id] = row.research;
  });
  persistResearchCache();
}

async function runAiResearch(wine) {
  if (!supabaseClient || !currentUser) {
    window.alert("Sign in with Cloud Sync before running AI research.");
    return;
  }

  const button = els.detailContent.querySelector("[data-run-research]");
  if (button) {
    button.disabled = true;
    button.textContent = "Researching...";
  }

  try {
    const { data, error } = await supabaseClient.functions.invoke(researchFunctionName, {
      body: { wine },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.detail || data.error);
    if (!data?.research) throw new Error("The research service returned no research.");
    researchCache[wine.id] = data.research;
    persistResearchCache();
    openWineDetails(wine);
  } catch (error) {
    window.alert(`AI research failed: ${await getFunctionErrorMessage(error)}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = researchCache[wine.id] ? "Refresh Research" : "Research with AI";
    }
  }
}

async function getFunctionErrorMessage(error) {
  const fallback = error?.message || "Research request failed.";
  const response = error?.context;
  if (!response?.json) return fallback;

  try {
    const payload = await response.json();
    if (payload?.detail) return `${payload.error || fallback}: ${payload.detail}`;
    if (payload?.error) return payload.error;
  } catch {
    return fallback;
  }
  return fallback;
}

function openWineForm(wine) {
  const editing = Boolean(wine);
  const data = wine || {
    id: "",
    color: "Red",
    varietal: "",
    winery: "",
    wine: "",
    vintage: currentYear,
    region: "",
    country: "USA",
    quantity: 1,
    collection_rating: "★★★★☆",
    professional_score: "N/R",
    critic_publication: "—",
    drink_from: currentYear,
    drink_through: currentYear + 6,
    cellaring_status: "Hold",
    score_source_url: "",
    notes: "",
  };

  els.formMode.textContent = editing ? "Edit Inventory" : "Add Inventory";
  els.formTitle.textContent = editing ? `${data.winery} ${data.wine}` : "Add Wine";
  els.deleteWine.hidden = !editing;
  els.wineId.value = data.id || "";

  Object.entries(data).forEach(([key, value]) => {
    const field = els.form.elements[key];
    if (field) field.value = value ?? "";
  });

  els.dialog.showModal();
}

function wineFromForm() {
  const data = Object.fromEntries(new FormData(els.form).entries());
  return applyWiensAgingDefaults(normalizeWine({
    ...data,
    id: data.id || makeId(),
    vintage: toOptionalNumber(data.vintage),
    quantity: toOptionalNumber(data.quantity),
    drink_from: toOptionalNumber(data.drink_from),
    drink_through: toOptionalNumber(data.drink_through),
  }));
}

function toCloudRow(wine) {
  return {
    ...wine,
    user_id: currentUser?.id,
    updated_at: new Date().toISOString(),
  };
}

function fromCloudRow(row) {
  const { user_id, created_at, updated_at, ...wine } = row;
  return normalizeWine(wine);
}

async function syncWineToCloud(wine) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from(tableName).upsert(toCloudRow(wine), {
    onConflict: "id",
  });
  if (error) throw error;
}

async function deleteWineFromCloud(id) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from(tableName).delete().eq("id", id);
  if (error) throw error;
}

async function saveWine(event) {
  event.preventDefault();
  const wine = wineFromForm();
  const index = wines.findIndex((item) => item.id === wine.id);
  if (index >= 0) {
    wines[index] = wine;
  } else {
    wines = [wine, ...wines];
  }
  persistWines();
  try {
    await syncWineToCloud(wine);
  } catch (error) {
    window.alert(`Saved locally, but cloud sync failed: ${error.message}`);
  }
  els.dialog.close();
  render();
}

async function deleteCurrentWine() {
  const id = els.wineId.value;
  const wine = wines.find((item) => item.id === id);
  if (!wine) return;
  const confirmed = window.confirm(`Delete ${wine.winery} ${wine.wine}?`);
  if (!confirmed) return;
  wines = wines.filter((item) => item.id !== id);
  persistWines();
  try {
    await deleteWineFromCloud(id);
  } catch (error) {
    window.alert(`Deleted locally, but cloud sync failed: ${error.message}`);
  }
  els.dialog.close();
  render();
}

function exportData() {
  const exportText = `window.WINE_DATA = ${JSON.stringify(wines, null, 2)};\n`;
  const blob = new Blob([exportText], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "wines.js";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseImportedData(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("window.WINE_DATA")) {
    const json = trimmed.replace(/^window\.WINE_DATA\s*=\s*/, "").replace(/;\s*$/, "");
    return JSON.parse(json);
  }
  return JSON.parse(trimmed);
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = parseImportedData(await file.text());
    if (!Array.isArray(imported)) throw new Error("Imported file must contain an array of wines.");
    wines = imported.map(normalizeWine);
    persistWines();
    await seedCloudFromLocal();
    render();
  } catch (error) {
    window.alert(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function configureSupabase() {
  const hasConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const hasClient = Boolean(window.supabase?.createClient);
  if (!hasConfig || !hasClient) {
    syncMode = "local";
    updateSourceLabel();
    return;
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

async function loadCloudInventory() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from(tableName)
    .select("*")
    .order("winery", { ascending: true });
  if (error) throw error;

  if (data.length) {
    wines = data.map(fromCloudRow);
    persistWines();
  } else if (wines.length) {
    await seedCloudFromLocal();
  }
  syncMode = "cloud";
  render();
}

async function seedCloudFromLocal() {
  if (!supabaseClient || !currentUser || !wines.length) return;
  const rows = wines.map(toCloudRow);
  const { error } = await supabaseClient.from(tableName).upsert(rows, {
    onConflict: "id",
  });
  if (error) throw error;
}

async function refreshSession() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    syncMode = "signed-out";
    updateSourceLabel();
    return;
  }
  currentUser = data.session?.user || null;
  syncMode = currentUser ? "cloud" : "signed-out";
  updateSourceLabel();
  if (currentUser) {
    try {
      await loadCloudInventory();
      await loadCloudResearch();
    } catch (loadError) {
      syncMode = "signed-out";
      updateSourceLabel();
      window.alert(`Cloud load failed: ${loadError.message}`);
    }
  }
}

async function handleSignInOut() {
  if (!supabaseClient) {
    window.alert("Add your Supabase URL and anon key in config.js to enable cloud sync.");
    return;
  }
  if (currentUser) {
    await supabaseClient.auth.signOut();
    currentUser = null;
    syncMode = "signed-out";
    updateSourceLabel();
    render();
    return;
  }
  els.authDialog.showModal();
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    window.alert("Supabase is not configured yet.");
    return;
  }
  els.authNote.textContent = "Opening Google sign-in...";
  const redirectTo = window.location.href.split("#")[0];
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
    },
  });
  if (error) els.authNote.textContent = error.message;
}

async function sendSignInLink(event) {
  event.preventDefault();
  const email = els.authForm.elements.email.value.trim();
  const redirectTo = window.location.href.split("#")[0];
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    els.authNote.textContent = error.message;
    return;
  }
  els.authNote.textContent = "Check your email for the sign-in link.";
}

[els.search, els.color, els.status, els.region, els.sort].forEach((control) => {
  control.addEventListener("input", syncState);
});

els.reset.addEventListener("click", () => {
  els.search.value = "";
  els.color.value = "All";
  els.status.value = "All";
  els.region.value = "All";
  els.sort.value = "drink";
  syncState();
});

els.add.addEventListener("click", () => openWineForm());
els.signInOut.addEventListener("click", handleSignInOut);
els.export.addEventListener("click", exportData);
els.import.addEventListener("change", importData);
els.form.addEventListener("submit", saveWine);
els.closeDialog.addEventListener("click", () => els.dialog.close());
els.deleteWine.addEventListener("click", deleteCurrentWine);
els.googleSignIn.addEventListener("click", signInWithGoogle);
els.authForm.addEventListener("submit", sendSignInLink);
els.closeAuthDialog.addEventListener("click", () => els.authDialog.close());
els.closeDetailDialog.addEventListener("click", () => els.detailDialog.close());
els.detailContent.addEventListener("click", (event) => {
  const researchButton = event.target.closest("[data-run-research]");
  if (researchButton) {
    const wineId = els.detailDialog.dataset.wineId;
    const wine = wines.find((item) => item.id === wineId);
    if (wine) runAiResearch(wine);
    return;
  }

  const button = event.target.closest("[data-detail-edit-id]");
  if (!button) return;
  const wine = wines.find((item) => item.id === button.dataset.detailEditId);
  if (!wine) return;
  els.detailDialog.close();
  openWineForm(wine);
});
els.wineRows.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const wine = wines.find((item) => item.id === editButton.dataset.editId);
    if (wine) openWineForm(wine);
    return;
  }

  const detailTarget = event.target.closest("[data-detail-id]");
  if (!detailTarget) return;
  const wine = wines.find((item) => item.id === detailTarget.dataset.detailId);
  if (wine) openWineDetails(wine);
});

configureSupabase();
render();
refreshSession();
