
"use strict";

/* =========================================================
   FRATELLI WINERY LAB PWA
   Google Sheets CSV connection
   ========================================================= */

const CONFIG = {
  labCsvUrl:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTG6up-T62Nqm9cx6OSLzjzSD-VgT19juQAyrhcqiMpCp7YNXDr9oweSRPzDIHfVlaGJu9k9fPp6pgf/pub?gid=1330000360&single=true&output=csv",

  refreshInterval: 60000
};

const COLUMNS = [
  "TANK NO",
  "Vol (HL)",
  "VINTAGE",
  "VERITY",
  "Date of Analysis",
  "Alc %",
  "T.A",
  "pH",
  "FSO2",
  "TSO2"
];

let allRows = [];
let isLoading = false;

/* =========================================================
   ELEMENTS
   Supports the IDs used in the PWA HTML.
   ========================================================= */

function getElement(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
}

const elements = {
  search: getElement("searchInput"),
  groupBy: getElement("analysisFilter", "viewMode", "groupBy"),
  typeFilter: getElement("typeFilter"),
  tableHead: getElement("tableHead"),
  tableBody: getElement("tableBody"),
  status: getElement("status"),
  message: getElement("message"),
  resultSummary: getElement("resultSummary"),
  results: getElement("results"),
  rowCount: getElement("rowCount"),
  groupCount: getElement("groupCount"),
  latestDate: getElement("latestDate"),
  emptyState: getElement("emptyState"),
  refresh: getElement("refreshBtn"),
  clear: getElement("clearBtn")
};

/* =========================================================
   NORMALIZE TEXT
   This makes "CS", "cs" and " CS " match as one variety.
   ========================================================= */

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getCell(row, column) {
  return row[column] ?? "";
}

/* =========================================================
   CSV PARSER
   Handles commas, quotation marks and quoted line breaks.
   ========================================================= */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  text = String(text ?? "").replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if (
      (char === "\n" || char === "\r") &&
      !inQuotes
    ) {
      if (char === "\r" && next === "\n") i++;

      row.push(cell);

      if (row.some(value => String(value).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);

    if (row.some(value => String(value).trim() !== "")) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return [];

  const headers = rows.shift().map(header =>
    String(header).replace(/^\uFEFF/, "").trim()
  );

  return rows.map(values => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = String(values[index] ?? "").trim();
    });

    return record;
  });
}

/* =========================================================
   FIND SOURCE COLUMN
   Handles minor header formatting differences.
   ========================================================= */

function findColumn(row, wantedColumn) {
  const wanted = normalizeText(wantedColumn);
  const actual = Object.keys(row).find(
    key => normalizeText(key) === wanted
  );

  return actual || null;
}

function readColumn(row, wantedColumn) {
  const key = findColumn(row, wantedColumn);
  return key ? String(row[key] ?? "").trim() : "";
}

/* =========================================================
   FILTER INVALID ROWS
   Excludes only rows whose TANK NO is exactly "0".
   ========================================================= */

function cleanRows(rows) {
  return rows
    .filter(row => {
      const tank = normalizeText(readColumn(row, "TANK NO"));
      return tank !== "0";
    })
    .map(row => {
      const clean = {};

      COLUMNS.forEach(column => {
        clean[column] = readColumn(row, column);
      });

      return clean;
    });
}

/* =========================================================
   STATUS
   Hide informational messages requested for this PWA.
   ========================================================= */

function hideStatusMessages() {
  [elements.status, elements.message].forEach(element => {
    if (!element) return;

    element.textContent = "";
    element.hidden = true;
    element.style.display = "none";
  });
}

function showStatus(message, isError = false) {
  hideStatusMessages();

  // Only show an actual error if loading fails.
  if (!isError || !elements.status) return;

  elements.status.textContent = message;
  elements.status.hidden = false;
  elements.status.style.display = "";
}

/* =========================================================
   FETCH GOOGLE SHEETS CSV
   ========================================================= */

async function loadData() {
  if (isLoading) return;

  isLoading = true;

  if (elements.refresh) {
    elements.refresh.disabled = true;
  }

  try {
    const separator = CONFIG.labCsvUrl.includes("?") ? "&" : "?";
    const url = CONFIG.labCsvUrl + separator + "_=" + Date.now();

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Google Sheets returned HTTP " + response.status);
    }

    const csvText = await response.text();

    if (!csvText.trim() || csvText.trim().startsWith("<!DOCTYPE")) {
      throw new Error(
        "The published CSV is empty or did not return CSV data."
      );
    }

    const parsedRows = parseCSV(csvText);

    if (parsedRows.length === 0) {
      throw new Error("No laboratory rows were found in the CSV.");
    }

    allRows = cleanRows(parsedRows);

    renderTable();
    hideStatusMessages();
  } catch (error) {
    console.error("Unable to load winery laboratory data:", error);

    showStatus(
      "Unable to load Google Sheets data. Check the published CSV URL and internet connection, then refresh.",
      true
    );

    // Keep any previously loaded data on screen.
    if (allRows.length > 0) {
      renderTable();
    }
  } finally {
    isLoading = false;

    if (elements.refresh) {
      elements.refresh.disabled = false;
    }
  }
}

/* =========================================================
   SEARCH
   Search ONLY the VERITY (wine variety) column.
   ========================================================= */

function getFilteredRows() {
  const searchText = normalizeText(
    elements.search ? elements.search.value : ""
  );

  const selectedType = normalizeText(
    elements.typeFilter ? elements.typeFilter.value : ""
  );

  return allRows.filter(row => {
    const variety = normalizeText(row["VERITY"]);

    // Search only the wine variety field.
    if (searchText && !variety.includes(searchText)) {
      return false;
    }

    if (
      selectedType &&
      selectedType !== "ALL" &&
      selectedType !== "ALL TYPES" &&
      normalizeText(row["VINTAGE"]) !== selectedType &&
      normalizeText(row["VERITY"]) !== selectedType
    ) {
      return false;
    }

    return true;
  });
}

/* =========================================================
   GROUPING MODE
   Recognizes common dropdown values for wine grouping.
   ========================================================= */

function getGroupingMode() {
  if (!elements.groupBy) return "none";

  const value = normalizeText(elements.groupBy.value);

  if (
    value.includes("WINE") ||
    value.includes("VERITY") ||
    value.includes("VARIETY")
  ) {
    return "wine";
  }

  if (value.includes("VINTAGE") || value.includes("YEAR")) {
    return "vintage";
  }

  if (value.includes("TANK")) {
    return "tank";
  }

  // Options such as None, All, or no grouping.
  return "none";
}

function getGroupName(row, mode) {
  if (mode === "wine") {
    return normalizeText(row["VERITY"]);
  }

  if (mode === "vintage") {
    return normalizeText(row["VINTAGE"]);
  }

  if (mode === "tank") {
    return normalizeText(row["TANK NO"]);
  }

  return "";
}

function getDisplayGroupName(row, mode) {
  if (mode === "wine") return row["VERITY"].trim();
  if (mode === "vintage") return row["VINTAGE"].trim();
  if (mode === "tank") return row["TANK NO"].trim();

  return "";
}

/* =========================================================
   GROUP ROWS
   One group per normalized wine variety.
   Blank variety names are not placed in an "Uncategorised"
   group; they remain individual rows.
   ========================================================= */

function groupRows(rows, mode) {
  if (mode === "none") {
    return [{ name: "", rows }];
  }

  const groups = new Map();
  const blankNameRows = [];

  rows.forEach(row => {
    const key = getGroupName(row, mode);

    if (!key) {
      blankNameRows.push(row);
      return;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        name: getDisplayGroupName(row, mode),
        rows: []
      });
    }

    groups.get(key).rows.push(row);
  });

  const sortedGroups = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, group]) => group);

  // Keep rows with blank grouping values visible without
  // creating an "Uncategorised" box.
  blankNameRows.forEach(row => {
    sortedGroups.push({
      name: "",
      rows: [row]
    });
  });

  return sortedGroups;
}

/* =========================================================
   SAFE HTML TEXT
   ========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return replacements[char];
  });
}

/* =========================================================
   TABLE HEADER
   Always show all 10 columns.
   ========================================================= */

function renderHeader() {
  if (!elements.tableHead) return;

  elements.tableHead.innerHTML =
    "<tr>" +
    COLUMNS.map(column =>
      "<th>" + escapeHTML(column) + "</th>"
    ).join("") +
    "</tr>";
}

/* =========================================================
   TABLE ROW
   ========================================================= */

function renderDataRow(row) {
  return (
    "<tr>" +
    COLUMNS.map(column =>
      "<td>" + escapeHTML(row[column]) + "</td>"
    ).join("") +
    "</tr>"
  );
}

/* =========================================================
   TABLE BODY
   Group headings are displayed inside the table.
   ========================================================= */

function renderBody(rows) {
  if (!elements.tableBody) return;

  const mode = getGroupingMode();
  const groups = groupRows(rows, mode);

  let html = "";

  groups.forEach(group => {
    if (mode !== "none" && group.name) {
      html +=
        '<tr class="group-heading">' +
        '<td colspan="' + COLUMNS.length + '">' +
        escapeHTML(group.name) +
        " (" + group.rows.length + ")" +
        "</td></tr>";
    }

    group.rows.forEach(row => {
      html += renderDataRow(row);
    });
  });

  elements.tableBody.innerHTML = html;
}

/* =========================================================
   SUMMARY AND EMPTY STATE
   ========================================================= */

function updateSummary(rows, groups) {
  if (elements.resultSummary) {
    elements.resultSummary.textContent =
      rows.length + (rows.length === 1 ? " row" : " rows");
  }

  if (elements.results) {
    elements.results.textContent = rows.length;
  }

  if (elements.rowCount) {
    elements.rowCount.textContent = rows.length;
  }

  if (elements.groupCount) {
    elements.groupCount.textContent = groups.length;
  }

  if (elements.latestDate) {
    const dates = rows
      .map(row => row["Date of Analysis"])
      .filter(Boolean);

    elements.latestDate.textContent = dates.length
      ? dates.sort().at(-1)
      : "—";
  }

  if (elements.emptyState) {
    elements.emptyState.hidden = rows.length > 0;
    elements.emptyState.style.display =
      rows.length > 0 ? "none" : "";
  }
}

/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderTable() {
  hideStatusMessages();

  const filteredRows = getFilteredRows();
  const mode = getGroupingMode();
  const groups = groupRows(filteredRows, mode);

  renderHeader();
  renderBody(filteredRows);
  updateSummary(filteredRows, groups);
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

if (elements.search) {
  elements.search.addEventListener("input", renderTable);
}

if (elements.groupBy) {
  elements.groupBy.addEventListener("change", renderTable);
}

if (elements.typeFilter) {
  elements.typeFilter.addEventListener("change", renderTable);
}

if (elements.refresh) {
  elements.refresh.addEventListener("click", loadData);
}

if (elements.clear) {
  elements.clear.addEventListener("click", () => {
    if (elements.search) elements.search.value = "";

    if (elements.typeFilter) {
      elements.typeFilter.value = "";
    }

    renderTable();
  });
}

/* =========================================================
   STARTUP
   ========================================================= */

renderHeader();
hideStatusMessages();
loadData();

// Refresh the published spreadsheet every 60 seconds.
setInterval(loadData, CONFIG.refreshInterval);

// Register the service worker used by this PWA.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(error => {
        console.warn(
          "Service worker registration failed:",
          error
        );
      });
  });
}
