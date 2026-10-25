/* FRATELLI VINEYARDS - THA Akluj analysis viewer
   SETUP: Replace CSV_URL with the published CSV URL for the THA Akluj tab.
   Do not paste an edit URL. See README.md for the exact steps.
*/
const CSV_URL = "PASTE_PUBLISHED_THA_AKLUJ_CSV_URL_HERE";
const REFRESH_INTERVAL_MS = 60 * 1000;
let sourceRows = [];
let headers = [];
let lastFetchTime = null;
const $ = (id) => document.getElementById(id);

function parseCSV(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell); if (row.some(v => v.trim() !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); if (row.some(v => v.trim() !== "")) rows.push(row); }
  return rows;
}
function norm(s) { return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function findColumn(names) {
  const normalized = headers.map(norm);
  for (const name of names) { const i = normalized.findIndex(h => h === norm(name)); if (i >= 0) return i; }
  for (const name of names) { const i = normalized.findIndex(h => h.includes(norm(name))); if (i >= 0) return i; }
  return -1;
}
function parseDate(value) {
  if (value == null || String(value).trim() === "") return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) { let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += y < 50 ? 2000 : 1900; const d = a > 12 ? a : b > 12 ? b : a; const mo = a > 12 ? b : b > 12 ? a : b; const dt = new Date(y, mo - 1, d); return isNaN(dt) ? null : dt; }
  const dt = new Date(s); return isNaN(dt) ? null : dt;
}
function dateText(value) { const d = parseDate(value); return d ? d.toLocaleDateString(undefined, {day:"2-digit",month:"short",year:"numeric"}) : (value || "—"); }
function setStatus(message, error=false) { const el=$('status'); el.textContent=message; el.classList.toggle('error',error); }
function showMessage(message) { $('message').textContent=message; $('message').hidden=!message; }
function objectRows() { return sourceRows.map(cells => Object.fromEntries(headers.map((h,i)=>[h, cells[i] ?? ""]))); }
function pickValue(row, idx) { return idx >= 0 ? (row[headers[idx]] ?? "").trim() : ""; }
function render() {
  const all = objectRows();
  if (!all.length) { $('results').innerHTML=''; $('rowCount').textContent='0'; $('groupCount').textContent='0'; $('latestDate').textContent='—'; return; }
  const tankIdx=findColumn(['tank','tank no','tank number','vessel','tankname']);
  const wineIdx=findColumn(['wine','wine name','wine type','product','variety','brand']);
  const dateIdx=findColumn(['analysis date','date of analysis','sample date','date','analysisdate','sampling date']);
  const search=$('searchInput').value.toLowerCase().trim(); const mode=$('viewMode').value; const from=$('dateFilter').value ? new Date($('dateFilter').value+'T00:00:00') : null;
  let filtered=all.filter(row=>{
    const vals=headers.map(h=>String(row[h]??''));
    if(search && !vals.some(v=>v.toLowerCase().includes(search))) return false;
    if(from && dateIdx>=0){const d=parseDate(row[headers[dateIdx]]);if(!d||d<from)return false;}
    return true;
  });
  const dateOf=row=>dateIdx>=0?parseDate(row[headers[dateIdx]]):null;
  const allDates=filtered.map(dateOf).filter(Boolean).sort((a,b)=>b-a);
  $('latestDate').textContent=allDates.length?allDates[0].toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):'—';
  $('rowCount').textContent=String(filtered.length);
  const keyOf=row=> mode==='tank' ? (tankIdx>=0 && row[headers[tankIdx]] ? row[headers[tankIdx]] : (wineIdx>=0 ? row[headers[wineIdx]] : 'Uncategorised')) : mode==='wine' ? (wineIdx>=0 && row[headers[wineIdx]] ? row[headers[wineIdx]] : (tankIdx>=0 ? row[headers[tankIdx]] : 'Uncategorised')) : 'All analysis rows';
  const groups=new Map(); filtered.forEach(row=>{const key=keyOf(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)});
  $('groupCount').textContent=String(groups.size);
  const sorted=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}));
  if(!filtered.length){$('results').innerHTML='<div class="empty">No analysis rows match your search.</div>';return;}
  $('results').innerHTML=sorted.map(([name,rows])=>{
    rows.sort((a,b)=>(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0));
    const latest=rows.map(dateOf).filter(Boolean).sort((a,b)=>b-a)[0];
    const cols=headers.filter(h=>h.trim()!=='');
    const table=`<div class="table-wrap"><table><thead><tr>${cols.map(h=>`<th>${escapeHTML(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(h=>`<td>${escapeHTML(r[h]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return `<article class="group-card"><div class="group-head"><div><h3>${escapeHTML(name)}</h3><small>${rows.length} analysis row${rows.length===1?'':'s'}</small></div><span class="latest-pill">Latest: ${latest?latest.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):'Date unavailable'}</span></div>${table}</article>`;
  }).join('');
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function refreshData() {
  if(!CSV_URL || CSV_URL.includes('PASTE_PUBLISHED')) { setStatus('Setup needed',true); showMessage('The app files are ready. Complete Step 2 in README.md, then paste the published CSV URL into app.js.'); return; }
  $('refreshBtn').disabled=true; $('refreshBtn').textContent='↻ Loading…'; setStatus('Connecting to Google Sheets…');
  try {
    const url=new URL(CSV_URL); url.searchParams.set('_refresh',String(Date.now()));
    const response=await fetch(url.toString(),{cache:'no-store'});
    if(!response.ok) throw new Error('Google Sheets returned HTTP '+response.status);
    const text=await response.text();
    if(/<!doctype html|<html/i.test(text.slice(0,500))) throw new Error('Received a web page instead of CSV. Check the published CSV URL in app.js.');
    const parsed=parseCSV(text); if(parsed.length<2) throw new Error('CSV has no data rows, or the tab is empty.');
    headers=parsed[0].map((h,i)=>i===0?h.replace(/^\uFEFF/,'').trim():h.trim()); sourceRows=parsed.slice(1).filter(r=>r.some(c=>String(c).trim()!==''));
    lastFetchTime=new Date(); $('updatedAt').textContent='Fetched '+lastFetchTime.toLocaleTimeString();
    setStatus('Connected · '+sourceRows.length+' rows'); showMessage('Read-only view. Data is fetched from the published THA Akluj tab.'); render();
  } catch(err) { setStatus('Could not refresh data',true); showMessage('Could not load the sheet: '+err.message+' Check that the THA Akluj tab is published as CSV and the URL in app.js is correct.'); }
  finally { $('refreshBtn').disabled=false; $('refreshBtn').textContent='↻ Refresh'; }
}
$('refreshBtn').addEventListener('click',refreshData); $('searchInput').addEventListener('input',render); $('viewMode').addEventListener('change',render); $('dateFilter').addEventListener('change',render);
if('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
refreshData(); setInterval(refreshData,REFRESH_INTERVAL_MS);
