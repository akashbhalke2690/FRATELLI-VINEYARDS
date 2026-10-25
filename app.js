
/* FRATELLI VINEYARDS - THA Akluj Analysis Viewer
   Read-only winery laboratory data from published Google Sheets CSV.
   Search filters the VERITY column only.
   All 10 laboratory columns remain visible.
*/

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTG6up-T62Nqm9cx6OSLzjzSD-VgT19juQAyrhcqiMpCp7YNXDr9oweSRPzDIHfVlaGJu9k9fPp6pgf/pub?gid=1330000360&single=true&output=csv";

const REFRESH_INTERVAL_MS = 60 * 1000;

let sourceRows = [];
let headers = [];
let lastFetchTime = null;

const $ = (id) => document.getElementById(id);

const VISIBLE_COLUMNS = [
  {
    label: "TANK NO",
    aliases: ["TANK NO", "TANK NUMBER", "TANK", "VESSEL", "TANKNAME"]
  },
  {
    label: "Vol (HL)",
    aliases: ["VOL (HL)", "VOL HL", "VOLUME HL", "VOLUME", "VOL"]
  },
  {
    label: "VINTAGE",
    aliases: ["VINTAGE", "YEAR"]
  },
  {
    label: "VERITY",
    aliases: ["VERITY", "VARIETY", "GRAPE VARIETY"]
  },
  {
    label: "Date of Analysis",
    aliases: [
      "DATE OF ANALYSIS",
      "ANALYSIS DATE",
      "SAMPLE DATE",
      "SAMPLING DATE",
      "DATE"
    ]
  },
  {
    label: "Alc %",
    aliases: ["ALC %", "ALCOHOL %", "ALCOHOL", "ABV"]
  },
  {
    label: "T.A",
    aliases: ["T.A", "TA", "TOTAL ACIDITY", "TITRATABLE ACIDITY"]
  },
  {
    label: "pH",
    aliases: ["PH"]
  },
  {
    label: "FSO2",
    aliases: [
      "FSO2",
      "FREE SO2",
      "FREE SULPHUR DIOXIDE",
      "FREE SULFUR DIOXIDE"
    ]
  },
  {
    label: "TSO2",
    aliases: [
      "TSO2",
      "TOTAL SO2",
      "TOTAL SULPHUR DIOXIDE",
      "TOTAL SULFUR DIOXIDE"
    ]
  }
];

/* Parse CSV correctly, including commas inside quoted cells. */
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

      if (row.some(v => v.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);

    if (row.some(v => v.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

/* Normalize column headings for matching. */
function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/* Find a column using its possible heading names. */
function findColumn(names) {
  const normalized = headers.map(norm);

  for (const name of names) {
    const index = normalized.findIndex(
      heading => heading === norm(name)
    );

    if (index >= 0) return index;
  }

  for (const name of names) {
    const index = normalized.findIndex(
      heading => heading.includes(norm(name))
    );

    if (index >= 0) return index;
  }

  return -1;
}

function parseDate(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const s = String(value).trim();

  const match = s.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/
  );

  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    let year = Number(match[3]);

    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

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

function showMessage(message) {
  const element = $("message");

  if (!element) return;

  element.textContent = message;
  element.hidden = !message;
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

/* Display results. Search matches VERITY only. */
function render() {
  const all = objectRows();

  if (!all.length) {
    $("results").innerHTML = "";
    $("rowCount").textContent = "0";
    $("groupCount").textContent = "0";
    $("latestDate").textContent = "—";
    return;
  }

  const tankIdx = findColumn([
    "TANK NO",
    "TANK NUMBER",
    "TANK",
    "VESSEL",
    "TANKNAME"
  ]);

  const wineIdx = findColumn([
    "WINE",
    "WINE NAME",
    "WINE TYPE",
    "PRODUCT",
    "VARIETY",
    "VERITY",
    "BRAND"
  ]);

  const varietyIdx = findColumn([
    "VERITY",
    "VARIETY",
    "GRAPE VARIETY"
  ]);

  const dateIdx = findColumn([
    "DATE OF ANALYSIS",
    "ANALYSIS DATE",
    "SAMPLE DATE",
    "DATE",
    "ANALYSISDATE",
    "SAMPLING DATE"
  ]);

  const search = $("searchInput").value.trim().toLowerCase();
  const mode = $("viewMode").value;

  const from = $("dateFilter").value
    ? new Date($("dateFilter").value + "T00:00:00")
    : null;

  /* IMPORTANT:
     Search only the VERITY column.
     Do not search tank numbers, dates, or analysis values.
  */
  const filtered = all.filter(row => {
    if (search) {
      if (varietyIdx < 0) return false;

      const variety = String(
        row[headers[varietyIdx]] ?? ""
      ).trim().toLowerCase();

      if (!variety.includes(search)) return false;
    }

    if (from && dateIdx >= 0) {
      const date = parseDate(row[headers[dateIdx]]);

      if (!date || date < from) return false;
    }

    return true;
  });

  const dateOf = row =>
    dateIdx >= 0
      ? parseDate(row[headers[dateIdx]])
      : null;

  const allDates = filtered
    .map(dateOf)
    .filter(Boolean)
    .sort((a, b) => b - a);

  $("latestDate").textContent = allDates.length
    ? allDates[0].toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "—";

  $("rowCount").textContent = String(filtered.length);

  const keyOf = row => {
    if (mode === "tank") {
      return (
        (tankIdx >= 0 && row[headers[tankIdx]]) ||
        (wineIdx >= 0 && row[headers[wineIdx]]) ||
        "Uncategorised"
      );
    }

    if (mode === "wine") {
      return (
        (wineIdx >= 0 && row[headers[wineIdx]]) ||
        (tankIdx >= 0 && row[headers[tankIdx]]) ||
        "Uncategorised"
      );
    }

    return "All analysis rows";
  };

  const groups = new Map();

  filtered.forEach(row => {
    const key = keyOf(row);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  });

  $("groupCount").textContent = String(groups.size);

  const sorted = [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, {
      numeric: true
    })
  );

  if (!filtered.length) {
    $("results").innerHTML =
      '<div class="empty">No matching wine varieties found. Check the VERITY column or clear the search.</div>';

    showMessage(
      search
        ? `No varieties containing "${search}" were found.`
        : "No analysis rows match the selected date."
    );

    return;
  }

  /* Keep ALL 10 columns visible, including during searches. */
  const cols = getVisibleColumns();

  const missingColumns = cols
    .filter(column => column.index < 0)
    .map(column => column.label);

  $("results").innerHTML = sorted.map(([name, rows]) => {
    rows.sort(
      (a, b) =>
        (dateOf(b)?.getTime() || 0) -
        (dateOf(a)?.getTime() || 0)
    );

    const latest = rows
      .map(dateOf)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];

    const table = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${cols.map(column =>
                `<th>${escapeHTML(column.label)}</th>`
              ).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${cols.map(column => {
                  const value = column.index >= 0
                    ? (row[headers[column.index]] ?? "")
                    : "";

                  return `<td>${escapeHTML(
                    String(value).trim() || "—"
                  )}</td>`;
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
            <small>
              ${rows.length}
              analysis row${rows.length === 1 ? "" : "s"}
            </small>
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

  if (missingColumns.length) {
    showMessage(
      "These columns were not matched in the sheet: " +
      missingColumns.join(", ") +
      ". Check the Google Sheets headings."
    );
  } else {
    showMessage(
      search
        ? `Search: "${search}" in VERITY only. Showing all 10 columns.`
        : "Read-only view. Showing all 10 requested columns from the published THA Akluj tab."
    );
  }
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

/* Fetch the latest published Google Sheets CSV. */
async function refreshData() {
  if (!CSV_URL || CSV_URL.includes("PASTE_PUBLISHED")) {
    setStatus("Setup needed", true);

    showMessage(
      "Paste the published CSV URL into app.js."
    );

    return;
  }

  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "↻ Loading…";

  setStatus("Connecting to Google Sheets…");

  try {
    const url = new URL(CSV_URL);

    url.searchParams.set(
      "_refresh",
      String(Date.now())
    );

    const response = await fetch(url.toString(), {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        "Google Sheets returned HTTP " + response.status
      );
    }

    const text = await response.text();

    if (/<!doctype html|<html/i.test(text.slice(0, 500))) {
      throw new Error(
        "Received a web page instead of CSV. Check the published CSV URL."
      );
    }

    const parsed = parseCSV(text);

    if (parsed.length < 2) {
      throw new Error(
        "CSV has no data rows, or the tab is empty."
      );
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

    $("updatedAt").textContent =
      "Fetched " + lastFetchTime.toLocaleTimeString();

    setStatus("Connected · " + sourceRows.length + " rows");

    render();
  } catch (error) {
    setStatus("Could not refresh data", true);

    showMessage(
      "Could not load the sheet: " +
      error.message +
      " Check that the THA Akluj tab is published as CSV and the URL in app.js is correct."
    );
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "↻ Refresh";
  }
}

/* Connect controls. */
$("refreshBtn").addEventListener("click", refreshData);
$("searchInput").addEventListener("input", render);
$("viewMode").addEventListener("change", render);
$("dateFilter").addEventListener("change", render);

/* Register the service worker for the PWA. */
if (
  "serviceWorker" in navigator &&
  location.protocol.startsWith("http")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch(() => {});
  });
}

/* Initial load and automatic refresh every minute. */
refreshData();
setInterval(refreshData, REFRESH_INTERVAL_MS);
