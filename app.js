
"use strict";

// Google Sheets published CSV URL — keep this as a plain URL.
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTG6up-T62Nqm9cx6OSLzjzSD-VgT19juQAyrhcqiMpCp7YNXDr9oweSRPzDIHfVlaGJu9k9fPp6pgf/pub?gid=1330000360&single=true&output=csv";

const $ = (id) => document.getElementById(id);

const searchInput = $("searchInput");
const viewMode = $("viewMode");
const dateFilter = $("dateFilter");
const refreshBtn = $("refreshBtn");
const results = $("results");
const status = $("status");
const updatedAt = $("updatedAt");
const rowCount = $("rowCount");
const groupCount = $("groupCount");
const latestDate = $("latestDate");
const message = $("message");

let allRows = [];
let loadError = false;

// Match headers even if their capitalization or spacing differs.
function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Read CSV correctly, including quoted values containing commas.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  text = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;

      row.push(field);

      if (row.some((cell) => String(cell).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);

  if (row.some((cell) => String(cell).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

// Convert supported date formats into YYYY-MM-DD for reliable comparisons.
function parseDate(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  // YYYY-MM-DD or YYYY/MM/DD, optionally followed by a time.
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s.*)?$/);

  if (match) {
    return makeDateKey(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  // DD/MM/YYYY or DD-MM-YYYY, optionally followed by a time.
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/);

  if (match) {
    return makeDateKey(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  // Google Sheets may return dates as M/D/YYYY.
  // For ambiguous dates, DD/MM/YYYY is preferred.
  return "";
}

function makeDateKey(year, month, day) {
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function displayDate(value) {
  const key = parseDate(value);

  if (!key) return String(value || "");

  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}

function findColumn(headers, candidates) {
  const normalized = headers.map(normalizeHeader);

  for (const candidate of candidates) {
    const index = normalized.indexOf(normalizeHeader(candidate));
    if (index !== -1) return index;
  }

  return -1;
}

function buildData(csvText) {
  const csvRows = parseCSV(csvText);

  if (csvRows.length < 2) {
    throw new Error("The published sheet has no data rows.");
  }

  const headers = csvRows[0].map((value) => String(value || "").trim());

  const columns = {
    tank: findColumn(headers, ["TANK NO", "Tank No", "Tank Number", "Tank"]),
    volume: findColumn(headers, ["Vol (HL)", "Volume HL", "Volume"]),
    vintage: findColumn(headers, ["VINTAGE", "Vintage"]),
    wine: findColumn(headers, ["VERITY", "Variety", "Wine", "Wine Variety"]),
    date: findColumn(headers, ["Date of Analysis", "Analysis Date", "Date"]),
    alcohol: findColumn(headers, ["Alc %", "Alcohol", "Alcohol %"]),
    ta: findColumn(headers, ["T.A", "TA", "Total Acidity"]),
    ph: findColumn(headers, ["pH"]),
    fso2: findColumn(headers, ["FSO2", "Free SO2", "Free Sulphur Dioxide"]),
    tso2: findColumn(headers, ["TSO2", "Total SO2", "Total Sulphur Dioxide"])
  };

  if (columns.tank === -1) {
    throw new Error('Could not find the "TANK NO" column in the CSV.');
  }

  if (columns.wine === -1) {
    throw new Error('Could not find the "VERITY" or wine variety column.');
  }

  if (columns.date === -1) {
    throw new Error('Could not find the "Date of Analysis" column.');
  }

  return csvRows.slice(1).map((cells) => {
    const get = (index) =>
      index >= 0 ? String(cells[index] ?? "").trim() : "";

    const record = {
      tank: get(columns.tank),
      volume: get(columns.volume),
      vintage: get(columns.vintage),
      wine: get(columns.wine),
      date: get(columns.date),
      dateKey: parseDate(get(columns.date)),
      alcohol: get(columns.alcohol),
      ta: get(columns.ta),
      ph: get(columns.ph),
      fso2: get(columns.fso2),
      tso2: get(columns.tso2)
    };

    return record;
  }).filter((record) => {
    // Exclude tank 0, but retain other tank numbers.
    return record.tank !== "" && record.tank !== "0";
  });
}

const fields = [
  ["TANK NO", "tank"],
  ["Vol (HL)", "volume"],
  ["VINTAGE", "vintage"],
  ["VERITY", "wine"],
  ["Date of Analysis", "date"],
  ["Alc %", "alcohol"],
  ["T.A", "ta"],
  ["pH", "ph"],
  ["FSO2", "fso2"],
  ["TSO2", "tso2"]
];

// Add dependable styles for the generated results table.
function addStyles() {
  if ($("appGeneratedStyles")) return;

  const style = document.createElement("style");
  style.id = "appGeneratedStyles";
  style.textContent = `
    .app-table-wrap { width:100%; overflow-x:auto; margin:12px 0 22px; }
    .app-table { width:100%; border-collapse:collapse; font-size:13px; }
    .app-table th,.app-table td {
      padding:10px 12px; text-align:left; border-bottom:1px solid #dfe5e2;
      white-space:nowrap;
    }
    .app-table th { background:#edf2ef; font-weight:700; }
    .app-group { margin:16px 0; padding:14px; border:1px solid #dfe5e2;
      border-radius:12px; min-width:0; }
    .app-group-title { margin:0 0 10px; font-size:16px; }
    .app-empty { padding:18px 12px; }
    .app-error { color:#a32121; }
  `;

  document.head.appendChild(style);
}

function getFilteredRows() {
  const query = normalizeText(searchInput?.value || "");
  const selectedDate = dateFilter?.value || "";

  return allRows.filter((record) => {
    // Search by tank number OR wine variety.
    const matchesSearch =
      !query ||
      normalizeText(record.tank).includes(query) ||
      normalizeText(record.wine).includes(query);

    // Exact analysis-date match, not "from this date onward".
    const matchesDate =
      !selectedDate || record.dateKey === selectedDate;

    return matchesSearch && matchesDate;
  });
}

function getGroups(rows) {
  const mode = viewMode?.value || "tank";

  if (mode === "none") {
    return [{ key: "all", title: "All matching rows", rows }];
  }

  const groups = new Map();

  for (const record of rows) {
    let key;
    let title;

    if (mode === "wine") {
      // Normalize capitalization and extra spaces so the same wine
      // variety appears in one group.
      key = normalizeText(record.wine);

      // Do not create an "Uncategorised" group for blank wine names.
      if (!key) continue;

      title = record.wine.trim().replace(/\s+/g, " ");
    } else {
      key = normalizeText(record.tank);
      title = record.tank;
    }

    if (!groups.has(key)) {
      groups.set(key, { key, title, rows: [] });
    }

    groups.get(key).rows.push(record);
  }

  return Array.from(groups.values());
}

function renderTable(rows) {
  const head = fields.map(([label]) =>
    `<th>${escapeHTML(label)}</th>`
  ).join("");

  const body = rows.map((record) => {
    return `<tr>${fields.map(([, key]) => {
      const value = key === "date"
        ? displayDate(record.date)
        : record[key];

      return `<td>${escapeHTML(value)}</td>`;
    }).join("")}</tr>`;
  }).join("");

  return `
    <div class="app-table-wrap">
      <table class="app-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function render() {
  addStyles();

  if (loadError) return;

  const filtered = getFilteredRows();
  const groups = getGroups(filtered);

  if (rowCount) rowCount.textContent = String(filtered.length);
  if (groupCount) groupCount.textContent = String(groups.length);

  const dates = filtered
    .map((record) => record.dateKey)
    .filter(Boolean)
    .sort();

  if (latestDate) {
    latestDate.textContent = dates.length
      ? displayDate(dates[dates.length - 1])
      : "—";
  }

  if (!results) return;

  if (!filtered.length || !groups.length) {
    results.innerHTML = `
      <div class="app-empty">
        <strong>No matching records found.</strong>
        <p>Check the tank number, wine variety, or analysis date.</p>
      </div>`;
    return;
  }

  results.innerHTML = groups.map((group) => {
    const heading = viewMode?.value === "none"
      ? group.title
      : `${group.title} (${group.rows.length})`;

    return `
      <section class="app-group">
        <h3 class="app-group-title">${escapeHTML(heading)}</h3>
        ${renderTable(group.rows)}
      </section>`;
  }).join("");
}

async function loadData() {
  loadError = false;

  if (status) status.textContent = "Loading laboratory data…";
  if (message) message.textContent = "";
  if (results) results.innerHTML = "";

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Loading…";
  }

  try {
    const response = await fetch(CSV_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Google Sheets returned HTTP ${response.status}.`);
    }

    const csvText = await response.text();

    if (
      csvText.trim().startsWith("<!DOCTYPE html") ||
      csvText.trim().startsWith("<html")
    ) {
      throw new Error(
        "Google Sheets returned a webpage instead of CSV. Check that the sheet is published to the web as CSV."
      );
    }

    allRows = buildData(csvText);

    if (status) status.textContent = "Data loaded successfully";
    if (updatedAt) updatedAt.textContent =
      "Updated: " + new Date().toLocaleString();

    render();
  } catch (error) {
    loadError = true;

    if (status) status.textContent = "Unable to load data";
    if (message) {
      message.textContent = error.message ||
        "Could not load the Google Sheets data.";
      message.classList.add("app-error");
    }

    if (results) results.innerHTML = "";
    if (rowCount) rowCount.textContent = "—";
    if (groupCount) groupCount.textContent = "—";
    if (latestDate) latestDate.textContent = "—";

    console.error("Winery lab PWA:", error);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "↻ Refresh";
    }
  }
}

searchInput?.addEventListener("input", render);
viewMode?.addEventListener("change", render);
dateFilter?.addEventListener("change", render);
refreshBtn?.addEventListener("click", loadData);

loadData();
