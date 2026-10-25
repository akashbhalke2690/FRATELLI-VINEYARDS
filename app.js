
/* FRATELLI VINEYARDS - THA AKLUJ WINERY LAB
   Google Sheets CSV viewer
   Search only in VERITY.
   Show all 10 analysis columns.
   Exclude tank number 0 and invalid tank records.
*/

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTG6up-T62Nqm9cx6OSLzjzSD-VgT19juQAyrhcqiMpCp7YNXDr9oweSRPzDIHfVlaGJu9k9fPp6pgf/pub?gid=1330000360&single=true&output=csv";

const REFRESH_INTERVAL_MS = 60000;

let sourceRows = [];
let headers = [];
let lastFetchTime = null;

const $ = id => document.getElementById(id);

const VISIBLE_COLUMNS = [
  { label: "TANK NO", aliases: ["TANK NO", "TANK NUMBER", "TANK", "VESSEL", "TANKNAME"] },
  { label: "Vol (HL)", aliases: ["VOL (HL)", "VOL HL", "VOLUME HL", "VOLUME", "VOL"] },
  { label: "VINTAGE", aliases: ["VINTAGE", "YEAR"] },
  { label: "VERITY", aliases: ["VERITY", "VARIETY", "GRAPE VARIETY"] },
  { label: "Date of Analysis", aliases: ["DATE OF ANALYSIS", "ANALYSIS DATE", "SAMPLE DATE", "SAMPLING DATE", "DATE"] },
  { label: "Alc %", aliases: ["ALC %", "ALCOHOL %", "ALCOHOL", "ABV"] },
  { label: "T.A", aliases: ["T.A", "TA", "TOTAL ACIDITY", "TITRATABLE ACIDITY"] },
  { label: "pH", aliases: ["PH"] },
  { label: "FSO2", aliases: ["FSO2", "FREE SO2", "FREE SULPHUR DIOXIDE", "FREE SULFUR DIOXIDE"] },
  { label: "TSO2", aliases: ["TSO2", "TOTAL SO2", "TOTAL SULPHUR DIOXIDE", "TOTAL SULFUR DIOXIDE"] }
];

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i++;
      row.push(cell);

      if (row.some(v => v.trim() !== "")) rows.push(row);

      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(v => v.trim() !== "")) rows.push(row);
  }

  return rows;
}

function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findColumn(names) {
  const normalized = headers.map(norm);

  for (const name of names) {
    const index = normalized.findIndex(h => h === norm(name));
    if (index >= 0) return index;
  }

  for (const name of names) {
    const index = normalized.findIndex(h => h.includes(norm(name)));
    if (index >= 0) return index;
  }

  return -1;
}

function parseDate(value) {
  if (!value || !String(value).trim()) return null;

  const s = String(value).trim();
  const match = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);

  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    let year = Number(match[3]);

    if (year < 100) year += year < 50 ? 2000 : 1900;

    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : b;
    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

function setStatus(message, error = false) {
  const element = $("status");
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", error);
}

/* Keep the message area empty. */
function showMessage(message = "") {
  const element = $("message");
  if (!element) return;

  element.textContent = "";
  element.hidden = true;
}

function objectRows() {
  return sourceRows.map(cells =>
    Object.fromEntries(
      headers.map((heading, index) => [
        heading,
        cells[index] ?? ""
      ])
    )
  );
}

function getVisibleColumns() {
  return VISIBLE_COLUMNS.map(column => ({
    label: column.label,
    index: findColumn(column.aliases)
  }));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function render() {
  const resultsElement = $("results");
  if (!resultsElement || !headers.length) return;

  const all = objectRows();

  const tankIdx = findColumn([
    "TANK NO", "TANK NUMBER", "TANK", "VESSEL", "TANKNAME"
  ]);

  const wineIdx = findColumn([
    "WINE", "WINE NAME", "WINE TYPE", "PRODUCT", "BRAND"
  ]);

  const varietyIdx = findColumn([
    "VERITY", "VARIETY", "GRAPE VARIETY"
  ]);

  const dateIdx = findColumn([
    "DATE OF ANALYSIS", "ANALYSIS DATE", "SAMPLE DATE",
    "SAMPLING DATE", "DATE"
  ]);

  const search = $("searchInput")
    ? $("searchInput").value.trim().toLowerCase()
    : "";

  const mode = $("viewMode") ? $("viewMode").value : "all";

  const fromValue = $("dateFilter") ? $("dateFilter").value : "";
  const from = fromValue ? new Date(fromValue + "T00:00:00") : null;

  const filtered = all.filter(row => {
    /* Exclude tank number 0. */
    if (tankIdx >= 0) {
      const tank = String(row[headers[tankIdx]] ?? "").trim();

      if (tank === "0") return false;
    }

    /* Search only the VERITY column. */
    if (search) {
      if (varietyIdx < 0) return false;

      const variety = String(
        row[headers[varietyIdx]] ?? ""
      ).trim().toLowerCase();

      if (!variety.includes(search)) return false;
    }

    /* Apply the selected analysis date filter. */
    if (from && dateIdx >= 0) {
      const date = parseDate(row[headers[dateIdx]]);
      if (!date || date < from) return false;
    }

    return true;
  });

  const dateOf = row =>
    dateIdx >= 0 ? parseDate(row[headers[dateIdx]]) : null;

  const dates = filtered
    .map(dateOf)
    .filter(Boolean)
    .sort((a, b) => b - a);

  if ($("latestDate")) {
    $("latestDate").textContent = dates.length
      ? dates[0].toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric"
        })
      : "—";
  }

  if ($("rowCount")) {
    $("rowCount").textContent = String(filtered.length);
  }

  const tankValue = row =>
    tankIdx >= 0 ? String(row[headers[tankIdx]] ?? "").trim() : "";

  const wineValue = row =>
    wineIdx >= 0 ? String(row[headers[wineIdx]] ?? "").trim() : "";

  function groupKey(row) {
    if (mode === "tank") {
      return tankValue(row) || wineValue(row);
    }

    if (mode === "wine") {
      return wineValue(row) || tankValue(row);
    }

    return "All analysis rows";
  }

  const grouped = new Map();

  filtered.forEach(row => {
    const key = groupKey(row);

    /* Never create an "Uncategorised" group. */
    if (!key || key.toLowerCase() === "uncategorised") return;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  if ($("groupCount")) {
    $("groupCount").textContent = String(grouped.size);
  }

  if (!grouped.size) {
    resultsElement.innerHTML =
      '<div class="empty">No matching analysis rows found.</div>';
    showMessage();
    return;
  }

  /* All 10 columns remain visible while searching. */
  const columns = getVisibleColumns();

  const sortedGroups = [...grouped.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  resultsElement.innerHTML = sortedGroups.map(([name, rows]) => {
    rows.sort(
      (a, b) => (dateOf(b)?.getTime() || 0) - (dateOf(a)?.getTime() || 0)
    );

    const latest = rows.map(dateOf).filter(Boolean)
      .sort((a, b) => b - a)[0];

    const table = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${columns.map(column =>
                `<th>${escapeHTML(column.label)}</th>`
              ).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${columns.map(column => {
                  const value = column.index >= 0
                    ? row[headers[column.index]] ?? ""
                    : "";

                  return `<td>${escapeHTML(String(value).trim() || "—")}</td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    return `
      <article class="group-card">
        <div class="group-head">
          <div>
            <h3>${escapeHTML(name)}</h3>
            <small>${rows.length} analysis row${rows.length === 1 ? "" : "s"}</small>
          </div>
          <span class="latest-pill">
            Latest: ${
              latest
                ? latest.toLocaleDateString(undefined, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                  })
                : "Date unavailable"
            }
          </span>
        </div>
        ${table}
      </article>
    `;
  }).join("");

  /* Do not display the removed read-only/subtitle message. */
  showMessage();
}

async function refreshData() {
  if (!CSV_URL) {
    setStatus("Setup needed", true);
    return;
  }

  const refreshButton = $("refreshBtn");

  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = "↻ Loading…";
  }

  setStatus("Connecting to Google Sheets…");

  try {
    const url = new URL(CSV_URL);
    url.searchParams.set("_refresh", String(Date.now()));

    const response = await fetch(url.toString(), {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Google Sheets returned HTTP " + response.status);
    }

    const text = await response.text();

    if (/<!doctype html|<html/i.test(text.slice(0, 500))) {
      throw new Error("Received a webpage instead of CSV.");
    }

    const parsed = parseCSV(text);

    if (parsed.length < 2) {
      throw new Error("CSV has no data rows.");
    }

    headers = parsed[0].map((heading, index) =>
      index === 0
        ? heading.replace(/^\uFEFF/, "").trim()
        : heading.trim()
    );

    sourceRows = parsed.slice(1).filter(row =>
      row.some(cell => String(cell).trim() !== "")
    );

    lastFetchTime = new Date();

    if ($("updatedAt")) {
      $("updatedAt").textContent =
        "Fetched " + lastFetchTime.toLocaleTimeString();
    }

    setStatus("Connected · " + sourceRows.length + " rows");
    render();
  } catch (error) {
    setStatus("Could not refresh data", true);
    showMessage();

    if ($("results")) {
      $("results").innerHTML =
        '<div class="empty">Could not load the sheet. Check the published CSV URL and internet connection.</div>';
    }

    console.error("CSV refresh error:", error);
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "↻ Refresh";
    }
  }
}

/* Connect the controls if they exist. */
if ($("refreshBtn")) {
  $("refreshBtn").addEventListener("click", refreshData);
}

if ($("searchInput")) {
  $("searchInput").addEventListener("input", render);
}

if ($("viewMode")) {
  $("viewMode").addEventListener("change", render);
}

if ($("dateFilter")) {
  $("dateFilter").addEventListener("change", render);
}

/* Register the PWA service worker. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

/* Initial load and automatic refresh. */
refreshData();
setInterval(refreshData, REFRESH_INTERVAL_MS);
