import type { Audit, AuditRow } from './analyze.ts';
import type { Finding, PlumbingKind } from './analyze/plumbing.ts';

/**
 * Usage x doc-gap. Usage is log-damped so the top of the transclusion curve
 * does not swamp the gap term — a template used 800 times should outrank one
 * used 8 times, but not by two orders of magnitude.
 */
export function rankPriority(rows: AuditRow[]): AuditRow[] {
  return rows
    .filter((r) => r.isRoot && r.doc.gap > 0)
    .map((r) => ({ r, score: Math.log10(r.transclusions + 1) * 10 + r.doc.gap }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

export function splitBacklog(rows: AuditRow[]): { write: AuditRow[]; source: AuditRow[] } {
  return {
    write: rows.filter((r) => !r.isUpstream),
    source: rows.filter((r) => r.isUpstream),
  };
}

export function deletionCandidates(rows: AuditRow[]): AuditRow[] {
  return rows
    .filter((r) => r.isRoot && (r.tier === 'UNUSED' || r.tier === 'DOC-ONLY'))
    .sort((a, b) => Number(a.needsManualReview) - Number(b.needsManualReview));
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

const FINDING_LABELS: Record<PlumbingKind, string> = {
  'doc-redirect-circular': 'Doc redirects to its own template',
  'doc-redirect-to-template': 'Doc points at a template, not a doc',
  'doc-in-userspace': 'Documentation lives in userspace',
  'doc-shared': 'Shared documentation (intentional)',
  'doc-on-redirect': 'Doc attached to a redirect',
  'doc-subject-missing': 'Doc whose template is gone',
  'double-redirect': 'Double redirect',
  'redirect-broken': 'Redirect target does not exist',
};

/** Kinds that are records, not faults — rendered without the attention colour. */
const BENIGN: PlumbingKind[] = ['doc-shared'];

const esc = escapeHtml;
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

function titleCell(t: string): string {
  const [ns, ...rest] = t.split(':');
  return `<span class="ns">${esc(ns)}:</span>${esc(rest.join(':'))}`;
}

/** Log-scaled 0..1 for the inline usage bar. */
function usageWidth(n: number): number {
  return Math.min(100, Math.round((Math.log10(n + 1) / 3) * 100));
}

function queueTable(rows: AuditRow[], emptyNote: string): string {
  if (!rows.length) return `<p class="empty">${esc(emptyNote)}</p>`;
  return `<div class="scroll"><table>
<thead><tr><th>Page</th><th class="num">Uses</th><th class="num">Missing params</th><th>Doc</th></tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
<td class="mono">${titleCell(r.title)}</td>
<td class="num"><span class="usage"><i style="width:${usageWidth(r.transclusions)}%"></i></span>${r.transclusions}${r.transclusionsCapped ? '+' : ''}</td>
<td class="num">${r.doc.undocumentedParams.length || '—'}</td>
<td>${r.doc.hasDoc ? `<span class="chip">${esc(r.doc.sizeTier)}</span>` : '<span class="chip none">none</span>'}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table></div>`;
}

export function renderReport(a: Audit): string {
  const t = a.coverage.template;
  const m = a.coverage.module;
  const roots = a.rows.filter((r) => r.isRoot);
  const candidates = deletionCandidates(a.rows);
  const confident = candidates.filter((r) => !r.needsManualReview);
  const queue = rankPriority(a.rows);
  const undocumented = queue.filter((r) => !r.doc.hasDoc);
  const { write, source } = splitBacklog(undocumented);
  const snapshot = a.fetchedAt.slice(0, 10);

  const byKind = new Map<PlumbingKind, Finding[]>();
  for (const f of a.findings) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind)!.push(f);
  }
  const kindOrder = [...byKind.entries()].sort((x, y) => {
    const bx = BENIGN.includes(x[0]) ? 1 : 0;
    const by = BENIGN.includes(y[0]) ? 1 : 0;
    return bx - by || y[1].length - x[1].length;
  });

  const provenance = Object.entries(a.provenanceSummary).sort((x, y) => y[1] - x[1]);
  const provMax = provenance.length ? provenance[0][1] : 1;
  const native = a.provenanceSummary['written on this wiki'] ?? 0;

  return `<title>Wiki Documentation Audit</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{
  --bg:#F6F7F6; --surface:#FFFFFF; --ink:#1B1F1D; --muted:#697068; --line:#E2E5E1;
  --accent:#2E6F5E; --accent-weak:#2E6F5E22; --attention:#B4632A; --attention-weak:#B4632A1F;
  --critical:#A33A32; --shadow:0 1px 2px #1B1F1D0D;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#15181A; --surface:#1C2022; --ink:#E8EBE8; --muted:#939A93; --line:#2A2F30;
    --accent:#5FA98F; --accent-weak:#5FA98F26; --attention:#D68A4E; --attention-weak:#D68A4E26;
    --critical:#D4726A; --shadow:none;
  }
}
:root[data-theme="dark"]{
  --bg:#15181A; --surface:#1C2022; --ink:#E8EBE8; --muted:#939A93; --line:#2A2F30;
  --accent:#5FA98F; --accent-weak:#5FA98F26; --attention:#D68A4E; --attention-weak:#D68A4E26;
  --critical:#D4726A; --shadow:none;
}
*{box-sizing:border-box}
body{
  background:var(--bg); color:var(--ink); margin:0;
  font-family:"Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px; line-height:1.55; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1080px; margin:0 auto; padding:56px 24px 96px; display:flex; flex-direction:column; gap:52px}
h1,h2{font-family:Spectral,Georgia,serif; font-weight:600; text-wrap:balance; margin:0}
h1{font-size:2.1rem; letter-spacing:-.01em}
h2{font-size:1.3rem}
.lede{color:var(--muted); max-width:62ch; margin:10px 0 0}
.eyebrow{font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); font-weight:600}
section{display:flex; flex-direction:column; gap:16px}
.head{display:flex; flex-direction:column; gap:4px}
.mono,td.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.85rem}
.ns{color:var(--muted)}
.num{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap}

.stats{display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:8px; overflow:hidden}
.stat{background:var(--surface); padding:18px 20px; display:flex; flex-direction:column; gap:2px}
.stat b{font-family:Spectral,Georgia,serif; font-size:2rem; font-weight:600; font-variant-numeric:tabular-nums; line-height:1.1}
.stat span{font-size:.8rem; color:var(--muted)}

.cov{display:flex; flex-direction:column; gap:14px; background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:20px; box-shadow:var(--shadow)}
.covrow{display:flex; flex-direction:column; gap:7px}
.covtop{display:flex; justify-content:space-between; align-items:baseline; gap:12px; font-size:.9rem}
.covtop em{font-style:normal; color:var(--muted); font-variant-numeric:tabular-nums}
.bar{display:flex; height:10px; border-radius:5px; overflow:hidden; background:var(--line)}
.bar i{display:block}
.bar .done{background:var(--accent)}
.bar .todo{background:var(--attention)}
.key{display:flex; gap:18px; font-size:.8rem; color:var(--muted); flex-wrap:wrap}
.key i{display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; vertical-align:middle}

.split{display:grid; grid-template-columns:1fr; gap:22px}
@media(min-width:860px){.split{grid-template-columns:1fr 1fr}}
.panel{display:flex; flex-direction:column; gap:10px; min-width:0}
.panel h3{margin:0; font-size:.95rem; font-weight:600}
.panel p{margin:0; font-size:.83rem; color:var(--muted)}

.scroll{overflow-x:auto; border:1px solid var(--line); border-radius:8px; background:var(--surface)}
table{border-collapse:collapse; width:100%; font-size:.86rem}
th,td{text-align:left; padding:8px 12px; border-bottom:1px solid var(--line); vertical-align:middle}
th{font-size:.72rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:600; white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--accent-weak)}

.usage{display:inline-block; width:46px; height:5px; border-radius:3px; background:var(--line); margin-right:8px; vertical-align:middle}
.usage i{display:block; height:100%; border-radius:3px; background:var(--accent)}
.chip{display:inline-block; font-size:.72rem; padding:1px 7px; border-radius:99px; background:var(--accent-weak); color:var(--accent); font-weight:500}
.chip.none{background:var(--attention-weak); color:var(--attention)}
.chip.flag{background:var(--attention-weak); color:var(--attention)}
.tier{font-size:.72rem; font-weight:600; letter-spacing:.04em}
.tier.UNUSED{color:var(--critical)}
.tier[data-t="DOC-ONLY"]{color:var(--attention)}

.finding{border:1px solid var(--line); border-radius:8px; background:var(--surface); overflow:hidden}
.finding>summary{cursor:pointer; padding:11px 16px; display:flex; align-items:center; gap:10px; font-size:.9rem; font-weight:500; list-style:none}
.finding>summary::-webkit-details-marker{display:none}
.finding>summary::before{content:"▸"; color:var(--muted); font-size:.7rem; transition:transform .15s}
.finding[open]>summary::before{transform:rotate(90deg)}
.finding .n{margin-left:auto; font-variant-numeric:tabular-nums; color:var(--muted); font-size:.82rem}
.finding.warn>summary{box-shadow:inset 3px 0 0 var(--attention)}
.finding ul{margin:0; padding:4px 16px 14px 34px; display:flex; flex-direction:column; gap:6px; font-size:.84rem}
.finding li{color:var(--muted)}
.finding li b{font-family:"JetBrains Mono",ui-monospace,monospace; font-weight:500; font-size:.82rem; color:var(--ink)}

.prov{display:flex; flex-direction:column; gap:7px; background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:18px 20px}
.provrow{display:grid; grid-template-columns:1fr 46px; align-items:center; gap:12px; font-size:.86rem}
.provbar{position:relative; height:20px; display:flex; align-items:center}
.provbar i{position:absolute; left:0; height:100%; border-radius:3px; background:var(--accent-weak)}
.provbar span{position:relative; padding-left:8px}
.empty{color:var(--muted); font-size:.86rem; margin:0; padding:14px; border:1px dashed var(--line); border-radius:8px}
footer{color:var(--muted); font-size:.8rem; border-top:1px solid var(--line); padding-top:18px}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent); outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

<div class="wrap">

<header class="head">
  <p class="eyebrow">utaite.wiki · snapshot ${esc(snapshot)}</p>
  <h1>Template &amp; Module Documentation</h1>
  <p class="lede">Every Template and Module page on the wiki, measured for documentation coverage and real usage. ${roots.length} content roots; redirects excluded throughout.</p>
</header>

<section>
  <div class="stats">
    <div class="stat"><b>${pct(t.documented, t.roots)}%</b><span>Templates documented — ${t.documented} of ${t.roots}</span></div>
    <div class="stat"><b>${pct(m.documented, m.roots)}%</b><span>Modules documented — ${m.documented} of ${m.roots}</span></div>
    <div class="stat"><b>${t.missing + m.missing}</b><span>Pages with no documentation</span></div>
    <div class="stat"><b>${candidates.length}</b><span>Deletion candidates — ${confident.length} confident</span></div>
  </div>
</section>

<section>
  <div class="head"><h2>Coverage</h2><p class="lede">A page counts as documented when a <code class="mono">/doc</code> subpage exists. Quality is a separate question, handled below.</p></div>
  <div class="cov">
    <div class="covrow">
      <div class="covtop"><strong>Template</strong><em>${t.documented} documented · ${t.missing} missing</em></div>
      <div class="bar"><i class="done" style="width:${pct(t.documented, t.roots)}%"></i><i class="todo" style="width:${pct(t.missing, t.roots)}%"></i></div>
    </div>
    <div class="covrow">
      <div class="covtop"><strong>Module</strong><em>${m.documented} documented · ${m.missing} missing</em></div>
      <div class="bar"><i class="done" style="width:${pct(m.documented, m.roots)}%"></i><i class="todo" style="width:${pct(m.missing, m.roots)}%"></i></div>
    </div>
    <div class="key"><span><i style="background:var(--accent)"></i>Documented</span><span><i style="background:var(--attention)"></i>Missing</span></div>
  </div>
</section>

<section>
  <div class="head">
    <h2>What to write first</h2>
    <p class="lede">Undocumented pages ranked by usage against documentation gap, then split by origin. These are two different jobs: the left column has to be authored here, the right column already has documentation upstream to import or link.</p>
  </div>
  <div class="split">
    <div class="panel">
      <h3>Write — ${write.length} pages</h3>
      <p>Native to this wiki. Nobody else can document these.</p>
      ${queueTable(write.slice(0, 25), 'Nothing to write.')}
    </div>
    <div class="panel">
      <h3>Source — ${source.length} pages</h3>
      <p>Imported. Look upstream before writing from scratch.</p>
      ${queueTable(source.slice(0, 25), 'Nothing to source.')}
    </div>
  </div>
</section>

<section>
  <div class="head">
    <h2>Documented, but thinly</h2>
    <p class="lede">Pages that do have a <code class="mono">/doc</code> yet leave parameters unexplained. Ranked the same way; doc length is deliberately not a factor.</p>
  </div>
  ${queueTable(
    queue.filter((r) => r.doc.hasDoc && r.doc.undocumentedParams.length > 0).slice(0, 15),
    'Every documented page explains all its parameters.',
  )}
</section>

<section>
  <div class="head">
    <h2>Deletion candidates</h2>
    <p class="lede">No transclusion anywhere, no <code class="mono">require()</code> from another module, no reference from gadget code. Pages used only by other templates are classed internal and are <strong>not</strong> listed here. Static analysis cannot prove a wiki page is dead — treat these as review candidates.</p>
  </div>
  <div class="scroll"><table>
    <thead><tr><th>Page</th><th>Tier</th><th>Origin</th><th>Confidence</th></tr></thead>
    <tbody>
${candidates
  .map(
    (r) => `<tr>
<td class="mono">${titleCell(r.title)}</td>
<td><span class="tier ${esc(r.tier)}" data-t="${esc(r.tier)}">${esc(r.tier)}</span></td>
<td>${esc(r.provenance)}</td>
<td>${r.needsManualReview ? '<span class="chip flag">check by hand</span>' : '<span class="chip">no references found</span>'}</td>
</tr>`,
  )
  .join('\n')}
    </tbody>
  </table></div>
</section>

<section>
  <div class="head">
    <h2>Documentation plumbing</h2>
    <p class="lede">${a.findings.length} findings, grouped by what is actually wrong. Shared documentation is listed last because it is deliberate, not a fault.</p>
  </div>
  ${kindOrder
    .map(
      ([kind, list]) => `<details class="finding${BENIGN.includes(kind) ? '' : ' warn'}">
  <summary>${esc(FINDING_LABELS[kind] ?? kind)}<span class="n">${list.length}</span></summary>
  <ul>${list.map((f) => `<li><b>${esc(f.title)}</b> — ${esc(f.detail)}</li>`).join('')}</ul>
</details>`,
    )
    .join('\n')}
</section>

<section>
  <div class="head">
    <h2>Where these pages came from</h2>
    <p class="lede">Origin read from each page's first revision, whose interwiki-prefixed username survives transwiki import. ${native} of ${roots.length} roots were written here; the rest arrived from ${provenance.length - 1} other wikis.</p>
  </div>
  <div class="prov">
${provenance
  .map(
    ([label, n]) => `<div class="provrow">
  <div class="provbar"><i style="width:${Math.round((n / provMax) * 100)}%"></i><span>${esc(label)}</span></div>
  <div class="num">${n}</div>
</div>`,
  )
  .join('\n')}
  </div>
</section>

<footer>
  Generated from <code class="mono">wiki-audit.json</code> · snapshot ${esc(snapshot)} · redirects listed in <code class="mono">wiki/_redirects.tsv</code>. Queue tables show the top entries; the full data set is in the JSON.
</footer>

</div>`;
}
