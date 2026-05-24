/* ─────────────────────────────────────────
   BidcoreAI · script.js  (multi-page version)
   Real separate HTML pages — no SPA routing.
   Handles: mobile menu, modal, slides,
   how-it-works, CSI divisions, star rating,
   form submissions, billing toggle, reveal anim.
───────────────────────────────────────── */

/* ─── MOBILE MENU ─── */
function openMob(){
  const nav = document.getElementById('mob-nav');
  const overlay = document.getElementById('mob-overlay');
  if(!nav || !overlay) return;
  // Remove any leftover inline styles that could block CSS classes
  nav.style.removeProperty('transform');
  overlay.style.removeProperty('display');
  nav.classList.add('on');
  overlay.classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeMob(){
  const nav = document.getElementById('mob-nav');
  const overlay = document.getElementById('mob-overlay');
  if(!nav || !overlay) return;
  nav.classList.remove('on');
  overlay.classList.remove('on');
  document.body.style.overflow = '';
}

/* ─── MODAL ─── */
function openModal(interest){
  const modal = document.getElementById('modal');
  if(!modal) return;
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
  if(interest){
    const sel = document.getElementById('m-int');
    if(sel){ sel.value = interest; onInterestChange(); }
  }
}
function closeModal(){
  const modal = document.getElementById('modal');
  if(!modal) return;
  modal.classList.remove('on');
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', function(){
  // Modal close on backdrop click
  const modal = document.getElementById('modal');
  if(modal) modal.addEventListener('click', function(e){ if(e.target===this) closeModal(); });

  // Strip any leftover inline styles from mobile nav elements (safety net)
  const mobNav = document.getElementById('mob-nav');
  const mobOverlay = document.getElementById('mob-overlay');
  if(mobNav) { mobNav.style.removeProperty('transform'); mobNav.style.removeProperty('display'); }
  if(mobOverlay) { mobOverlay.style.removeProperty('display'); }
});

/* ─── SCREENSHOT SLIDES ─── */
function switchSlide(i){
  document.querySelectorAll('.slide-pane').forEach((p,idx)=>p.classList.toggle('on',idx===i));
  document.querySelectorAll('.slides-tabs .stab').forEach((t,idx)=>t.classList.toggle('on',idx===i));
}

/* ─── HOW IT WORKS ─── */
const HIW_DATA = [
  {badge:'Step 1',title:'Upload Project Documents',desc:'Drop in your SOWs, specifications, solicitations, hazardous reports, and addenda. BidcoreAI organizes them in version-controlled folders and shares read-only access with subs via invite link.',
   pts:[{t:'Drag-and-drop upload',s:'PDF, Word, Excel — any format accepted'},
        {t:'Folder organization',s:'Rev 0, Rev 01, Addendum 1 — always the right version'},
        {t:'Sub sharing',s:'Invite link gives subs read-only access instantly'}]},
  {badge:'Step 2',title:'AI Document Analysis',desc:'The moment a document is uploaded, AI reads it end-to-end — extracts scope, identifies risk items, generates a bid checklist, and highlights missing information.',
   pts:[{t:'Scope extraction',s:'Exact scope of work pulled from specs and SOWs'},
        {t:'Risk flag identification',s:'Hazardous materials, exclusions, missing specs flagged'},
        {t:'Bid checklist generated',s:'Auto-checklist of what to price before you start'}]},
  {badge:'Step 3',title:'Generate Bid Packages',desc:'One click creates structured bid packages from your project documents — scoped by trade, organized by CSI division, ready to send to subcontractors.',
   pts:[{t:'CSI-structured packages',s:'Divisions 01–50, organized by trade'},
        {t:'Scope auto-populated',s:'AI pulls scope descriptions directly from project docs'},
        {t:'Multiple packages, one click',s:'9, 15, 20+ packages generated instantly'}]},
  {badge:'Step 4',title:'Invite Subcontractors',desc:'Discover nearby subcontractors via radius search, pull from your private directory, or add manually. Send professional ITBs with one click and track opens in real time.',
   pts:[{t:'Nearby sub discovery',s:'Google Places + AI matching finds local subs fast'},
        {t:'Private directory',s:'Import CSV or add manually — your sub list, always available'},
        {t:'Automated ITB delivery',s:'Professional invitations sent with project docs attached'}]},
  {badge:'Step 5',title:'Level & Compare Bids',desc:'As sub bids arrive, BidcoreAI organizes them side by side — scope gaps, alternates, exclusions, and price variances highlighted automatically.',
   pts:[{t:'Side-by-side comparison',s:'All bids leveled in one view with variance analysis'},
        {t:'Scope gap alerts',s:'Missing items and exclusions flagged automatically'},
        {t:'Alternates & add-ons tracked',s:'All pricing variants captured and compared'}]},
  {badge:'Step 6',title:'Build Cost Estimate',desc:'Apply your private cost database rates, add markup, overhead, contingency, and bond. AI analyzes your margin in real time and alerts you to risk before you finalize.',
   pts:[{t:'Your private cost library',s:'50 CSI divisions — materials, labor, equipment, assemblies'},
        {t:'Markup & overhead settings',s:'Set GC markup, sub premium, contingency, bond'},
        {t:'AI margin alerts',s:'Real-time risk flags when margins drop below threshold'}]},
  {badge:'Step 7',title:'Write & Submit Proposal',desc:'AI drafts your complete proposal — Cover Letter, Technical Approach, Management Plan, Price Schedule — federal-compliant and export-ready as .doc or PDF.',
   pts:[{t:'Federal-compliant drafting',s:'Sections for RFP, IFB, IDIQ, RFQ, Sources Sought'},
        {t:'Refine with AI',s:'One click improves any section — unlimited refinements'},
        {t:'Export & submit',s:'.doc, .txt, or PDF — ready to attach to SAM.gov submission'}]}
];

let activeStep = 0;
function setStep(i){
  activeStep = i;
  document.querySelectorAll('.hiw-step').forEach((s,idx)=>s.classList.toggle('on',idx===i));
  renderPanel(i);
}
function renderPanel(i){
  const d = HIW_DATA[i];
  if(!d) return;
  const panel = document.getElementById('hiw-panel');
  if(!panel) return;
  panel.innerHTML = `
    <div class="hp-badge"><svg width="10" height="10"><use href="#ic-cpu"/></svg> ${d.badge}</div>
    <div class="hp-title">${d.title}</div>
    <div class="hp-desc">${d.desc}</div>
    <div class="hp-points">
      ${d.pts.map(p=>`<div class="hp-pt">
        <div class="hp-pt-ico"><svg width="13" height="13"><use href="#ic-check"/></svg></div>
        <div><div class="hp-pt-t">${p.t}</div><div class="hp-pt-s">${p.s}</div></div>
      </div>`).join('')}
    </div>
    <div class="hp-cta"><button class="btn btn-p btn-sm" onclick="openModal()"><svg width="13" height="13"><use href="#ic-zap"/></svg> Try It Free</button></div>
  `;
}
setTimeout(()=>renderPanel(0), 50);

/* ─── BILLING TOGGLE — Estimator & Pro have fixed prices, Premium is Ask for Pricing ─── */
let isYearly = false;
function toggleBilling(){
  isYearly = !isYearly;
  const btn = document.getElementById('billing-toggle');
  if(btn) btn.classList.toggle('on', isYearly);
  const estimatorPrice = document.getElementById('estimator-price');
  const estimatorPer   = estimatorPrice && estimatorPrice.closest('.pamt') && estimatorPrice.closest('.pamt').querySelector('.pper');
  if(estimatorPrice) estimatorPrice.textContent = isYearly ? '623' : '59';
  if(estimatorPer)   estimatorPer.textContent   = isYearly ? '/year' : '/month';
  const soloPrice = document.getElementById('solo-price');
  const soloPer   = soloPrice && soloPrice.closest('.pamt') && soloPrice.closest('.pamt').querySelector('.pper');
  if(soloPrice) soloPrice.textContent = isYearly ? '1999' : '199';
  if(soloPer)   soloPer.textContent   = isYearly ? '/year' : '/month';
}

/* ─── CSI DIVISIONS ─── */
const DIVS = [
  {c:'01',n:'General Requirements'},{c:'02',n:'Existing Conditions'},
  {c:'03',n:'Concrete'},{c:'04',n:'Masonry'},
  {c:'05',n:'Metals'},{c:'06',n:'Wood & Composites'},
  {c:'07',n:'Moisture Protection'},{c:'08',n:'Openings'},
  {c:'09',n:'Finishes'},{c:'10',n:'Specialties'},
  {c:'11',n:'Equipment'},{c:'12',n:'Furnishings'},
  {c:'13',n:'Special Construction'},{c:'14',n:'Conveying Equipment'},
  {c:'21',n:'Fire Suppression'},{c:'22',n:'Plumbing'},
  {c:'23',n:'HVAC'},{c:'25',n:'Integrated Automation'},
  {c:'26',n:'Electrical'},{c:'27',n:'Communications'},
  {c:'28',n:'Electronic Safety & Security'},{c:'31',n:'Earthwork'},
  {c:'32',n:'Exterior Improvements'},{c:'33',n:'Utilities'},
  {c:'34',n:'Transportation'},{c:'35',n:'Waterway & Marine'},
  {c:'40',n:'Process Integration'},{c:'41',n:'Material Processing'},
  {c:'42',n:'Process Heating'},{c:'43',n:'Process Gas Handling'},
  {c:'44',n:'Pollution Control'},{c:'45',n:'Industry-Specific Mfg'},
  {c:'46',n:'Water & Wastewater'},{c:'48',n:'Electrical Power Generation'},
  {c:'50',n:'Reserved – Special'}
];
const ARCH=['04','06','07','08','09','10','12'];
const STRUCT=['03','04','05'];
const MEP=['22','23','25','26','27','28'];

function renderDivs(sel){
  const wrap = document.getElementById('div-opts-wrap');
  if(!wrap) return;
  wrap.innerHTML = DIVS.map(d=>{
    const ck = sel.includes(d.c);
    return `<label class="dopt${ck?' ck':''}" onclick="toggleDiv('${d.c}',this)">
      <input type="checkbox" value="${d.c}"${ck?' checked':''}> Div ${d.c} — ${d.n}
    </label>`;
  }).join('');
  updateDivLbl();
}
function toggleDiv(code,el){
  const cb = el.querySelector('input');
  cb.checked = !cb.checked;
  el.classList.toggle('ck', cb.checked);
  updateDivLbl();
}
function updateDivLbl(){
  const lbl = document.getElementById('div-sel-lbl');
  if(!lbl) return;
  const ck = [...document.querySelectorAll('#div-opts-wrap input:checked')].map(c=>c.value);
  lbl.textContent = ck.length===DIVS.length ? 'All divisions selected' : ck.length===0 ? 'No divisions selected' : `Selected: Div ${ck.join(', ')}`;
}
function divTab(type,btn){
  document.querySelectorAll('.div-tabs .dtab').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on');
  if(type==='all')         renderDivs(DIVS.map(d=>d.c));
  else if(type==='arch')   renderDivs(ARCH);
  else if(type==='struct') renderDivs(STRUCT);
  else if(type==='mep')    renderDivs(MEP);
  else                     renderDivs([]);
}
renderDivs(DIVS.map(d=>d.c));

/* ─── STAR RATING ─── */
let starVal = 0;
function setRating(v){
  starVal = v;
  document.querySelectorAll('#star-rating .star').forEach((s,i)=>s.classList.toggle('lit',i<v));
  const lbls = ['','Poor','Fair','Good','Very Good','Excellent'];
  const lbl = document.getElementById('rating-lbl');
  if(lbl) lbl.textContent = lbls[v] || '';
}

/* ─── EMAIL VIA SERVER API ─── */
async function sendEmail(payload, btnId, errId, bodyId, okId){
  const btn = document.getElementById(btnId);
  const err = document.getElementById(errId);
  if(btn){ btn.disabled=true; btn.innerHTML='<svg width="14" height="14" style="animation:spin 1s linear infinite;display:inline-block"><use href="#ic-refresh"/></svg> Sending…'; }
  if(err) err.style.display='none';
  let sent = false;
  try {
    const res = await fetch('/api/send', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    const json = await res.json();
    sent = json.success === true;
  } catch(e){ sent = false; }
  if(sent){
    const bd = document.getElementById(bodyId);
    const ok = document.getElementById(okId);
    if(bd) bd.style.display='none';
    if(ok) ok.style.display='block';
  } else {
    const subj = encodeURIComponent(payload.subject||'BidcoreAI Inquiry');
    const body = encodeURIComponent(Object.entries(payload).filter(([k])=>k!=='subject').map(([k,vl])=>`${k}: ${vl}`).join('\n'));
    window.open(`mailto:barkha@bidcoreai.com?subject=${subj}&body=${body}`,'_blank');
    const bd = document.getElementById(bodyId);
    const ok = document.getElementById(okId);
    if(bd) bd.style.display='none';
    if(ok) ok.style.display='block';
  }
  if(btn){ btn.disabled=false; btn.innerHTML='<svg width="14" height="14"><use href="#ic-send"/></svg> Submit'; }
}

function v(id){ const el=document.getElementById(id); return el?el.value.trim():''; }
function isEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

/* ─── DEMO DATE & TIME SCHEDULER ─── */
const DEMO_MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEMO_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
let demoSelIdx  = null;
let demoISTH    = 22;
let demoISTM    = 0;
let _demoDates  = [];
let _calYear    = new Date().getFullYear();
let _calMonth   = new Date().getMonth();
let _calVisible = false;

function getNextFri(){
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+1);
  while(d.getDay()!==5) d.setDate(d.getDate()+1);
  return [{dayName:DEMO_DAYS[d.getDay()],mon:DEMO_MONS[d.getMonth()],date:d.getDate(),year:d.getFullYear(),month:d.getMonth(),label:`${DEMO_DAYS[d.getDay()]}, ${DEMO_MONS[d.getMonth()]} ${d.getDate()}`}];
}

function istToLocalStr(year, month, day, istH, istM){
  // IST = UTC+5:30 → subtract 5h 30m to get UTC
  let utcH = istH - 5, utcM = istM - 30;
  if(utcM < 0){ utcM += 60; utcH--; }
  if(utcH < 0){ utcH += 24; day--; }
  const utc = new Date(Date.UTC(year, month, day, utcH, utcM));
  const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeStr = utc.toLocaleTimeString('en-US',{timeZone:tz, hour:'2-digit', minute:'2-digit', timeZoneName:'short'});
  return timeStr;
}

function getLocalTZShort(){
  return new Date().toLocaleTimeString('en-US',{timeZoneName:'short'}).split(' ').pop();
}

function renderCardsHTML(){
  return _demoDates.map((dt,i)=>`
    <div class="demo-date-card${demoSelIdx===i?' demo-date-sel':''}" onclick="demoPick(${i})">
      <div class="demo-day-name">${dt.dayName}</div>
      <div class="demo-day-num">${dt.date}</div>
      <div class="demo-mon">${dt.mon} ${dt.year}</div>
    </div>`).join('');
}

function renderDemoSlots(){
  const list = document.getElementById('slot-list');
  if(!list) return;
  _demoDates = getNextFri();
  demoSelIdx = 0; demoISTH = 22; demoISTM = 0; _calVisible = false;
  const timeVal = `${String(demoISTH).padStart(2,'0')}:${String(demoISTM).padStart(2,'0')}`;
  const tzShort = getLocalTZShort();
  const sd = _demoDates[0];
  list.innerHTML = `
    <div class="demo-slot-row">
      <div id="demo-cards" class="demo-cards-wrap">${renderCardsHTML()}</div>
      <div class="demo-slot-right">
        <div class="demo-slot-time-row">
          <div class="demo-slot-col">
            <div class="demo-time-lbl">Time <span style="font-weight:400;color:var(--g400)">(IST · UTC+5:30)</span></div>
            <input type="time" id="demo-time-inp" class="demo-time-inp" value="${timeVal}" onchange="demoTimeChange(this.value)">
          </div>
          <div class="demo-slot-arr">→</div>
          <div class="demo-slot-col">
            <div class="demo-time-lbl">Your Time <span class="demo-tz-badge">${tzShort}</span></div>
            <div class="demo-local-time" id="demo-local"><strong>${istToLocalStr(sd.year,sd.month,sd.date,demoISTH,demoISTM)}</strong></div>
          </div>
        </div>
        <div class="demo-time-sub">Suggested: 10:00 PM – 11:00 PM IST</div>
      </div>
    </div>
    <div class="demo-cal-toggle">
      <button type="button" class="demo-cal-btn" onclick="toggleCal()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><rect x="1" y="2" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M1 6h14" stroke="currentColor" stroke-width="1.5"/><path d="M5 1v2M11 1v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Find another date
      </button>
    </div>
    <div id="demo-cal" class="demo-cal" style="display:none"></div>`;
}

function demoPick(i){
  demoSelIdx = i;
  const dc = document.getElementById('demo-cards');
  if(dc) dc.innerHTML = renderCardsHTML();
  const sd = _demoDates[i];
  const loc = document.getElementById('demo-local');
  if(loc) loc.innerHTML = `<strong>${istToLocalStr(sd.year, sd.month, sd.date, demoISTH, demoISTM)}</strong>`;
}

function demoTimeChange(val){
  const [h,m] = val.split(':').map(Number);
  demoISTH = h; demoISTM = m;
  const sd = _demoDates[demoSelIdx];
  if(sd){
    const loc = document.getElementById('demo-local');
    if(loc) loc.innerHTML = `<strong>${istToLocalStr(sd.year, sd.month, sd.date, demoISTH, demoISTM)}</strong>`;
  }
}

function toggleCal(){
  _calVisible = !_calVisible;
  const el = document.getElementById('demo-cal');
  if(!el) return;
  if(_calVisible){
    const now = new Date();
    _calYear = now.getFullYear(); _calMonth = now.getMonth();
    renderCal();
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function renderCal(){
  const el = document.getElementById('demo-cal');
  if(!el) return;
  const DN = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const ML = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth+1, 0).getDate();
  let cells = DN.map(d=>`<div class="demo-cal-dn">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++) cells+=`<div></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const dt=new Date(_calYear,_calMonth,d);
    const isWknd=dt.getDay()===0||dt.getDay()===6;
    const isPast=dt<today;
    const sel=demoSelIdx!==null?_demoDates[demoSelIdx]:null;
    const isSel=sel&&sel.year===_calYear&&sel.month===_calMonth&&sel.date===d;
    let cls='demo-cal-day';
    if(isWknd||isPast) cls+=' cal-off';
    else if(isSel) cls+=' cal-sel';
    const click=(!isWknd&&!isPast)?` onclick="calPick(${_calYear},${_calMonth},${d})"`:''
    cells+=`<div class="${cls}"${click}>${d}</div>`;
  }
  el.innerHTML=`
    <div class="demo-cal-hdr">
      <button type="button" class="demo-cal-nav" onclick="calNav(-1)">&#8249;</button>
      <span class="demo-cal-month">${ML[_calMonth]} ${_calYear}</span>
      <button type="button" class="demo-cal-nav" onclick="calNav(1)">&#8250;</button>
    </div>
    <div class="demo-cal-grid">${cells}</div>`;
}

function calNav(dir){
  _calMonth+=dir;
  if(_calMonth<0){_calMonth=11;_calYear--;}
  if(_calMonth>11){_calMonth=0;_calYear++;}
  renderCal();
}

function calPick(year,month,day){
  const dt=new Date(year,month,day);
  _demoDates[0]={dayName:DEMO_DAYS[dt.getDay()],mon:DEMO_MONS[month],date:day,year,month,label:`${DEMO_DAYS[dt.getDay()]}, ${DEMO_MONS[month]} ${day}`};
  demoSelIdx=0;
  const dc=document.getElementById('demo-cards');
  if(dc) dc.innerHTML=renderCardsHTML();
  const loc=document.getElementById('demo-local');
  if(loc) loc.innerHTML=`<strong>${istToLocalStr(year,month,day,demoISTH,demoISTM)}</strong>`;
  _calVisible=false;
  const calEl=document.getElementById('demo-cal');
  if(calEl) calEl.style.display='none';
}

/* ─── MODAL INTEREST HANDLER ─── */
function onInterestChange(){
  const sel     = document.getElementById('m-int');
  const val     = sel ? sel.value : '';
  const slotsEl = document.getElementById('m-slots');
  const btnEl   = document.getElementById('m-btn');
  const showSlots = val==='Book Live Demo' || val==='Start Free Trial';

  if(slotsEl) slotsEl.style.display = showSlots ? 'block' : 'none';
  if(btnEl){
    btnEl.innerHTML = val==='Book Live Demo'
      ? '<svg width="15" height="15"><use href="#ic-send"/></svg> Book My Demo'
      : '<svg width="15" height="15"><use href="#ic-send"/></svg> Get Started';
  }
  if(showSlots) renderDemoSlots();
}

/* ─── MODAL FORM ─── */
function submitModal(){
  const fn=v('m-fn'),em=v('m-em'),co=v('m-co'),tr=v('m-tr');
  const interest=v('m-int');
  const err=document.getElementById('m-err');
  if(!fn||!em||!co||!tr){err.textContent='Please fill in all required fields.';err.style.display='block';return;}
  if(!isEmail(em)){err.textContent='Please enter a valid email.';err.style.display='block';return;}
  let demoInfo = '';
  if(interest==='Book Live Demo' || interest==='Start Free Trial'){
    const sd = _demoDates[demoSelIdx];
    if(sd){
      const istLabel = `${String(demoISTH).padStart(2,'0')}:${String(demoISTM).padStart(2,'0')} IST`;
      const localLabel = istToLocalStr(sd.year, sd.month, sd.date, demoISTH, demoISTM);
      demoInfo = ` — Date: ${sd.label}, ${sd.year} | Time: ${istLabel} (${localLabel})`;
    }
  }
  sendEmail({
    subject:`BidcoreAI Demo Request — ${fn} (${co})`,
    name:`${fn} ${v('m-ln')}`, email:em, company:co, trade:tr,
    interest: interest + demoInfo,
    challenge:v('m-ch'), source:'Demo Modal'
  },'m-btn','m-err','mod-form','mod-ok');
}

/* ─── TAKEOFF SERVICE FORM ─── */
async function submitSvc(){
  const fn=v('tf-fn'),em=v('tf-em'),co=v('tf-co'),tr=v('tf-tr'),pn=v('tf-pn'),st=v('tf-st');
  const dr=document.getElementById('tf-dr');
  const err=document.getElementById('svc-err');
  const selectedFiles=(window._selectedFiles&&window._selectedFiles.length)?window._selectedFiles:(dr?[...dr.files]:[]);
  const hasFile=selectedFiles.length>0, hasLink=v('tf-cloud').length>0;
  if(!fn||!em||!co||!tr||!pn||!st){err.textContent='Please fill in all required fields.';err.style.display='block';return;}
  if(!hasFile&&!hasLink){err.textContent='Please upload a file or provide a cloud link.';err.style.display='block';return;}
  if(!isEmail(em)){err.textContent='Please enter a valid email.';err.style.display='block';return;}
  const ck=[...document.querySelectorAll('#div-opts-wrap input:checked')].map(c=>c.value).join(', ')||'All Divisions';
  const btn=document.getElementById('svc-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<svg width="14" height="14" style="animation:spin 1s linear infinite;display:inline-block"><use href="#ic-refresh"/></svg> Sending…';}
  err.style.display='none';
  const fd=new FormData();
  const meta={subject:`Takeoff Service Request — ${pn} (${co})`,name:`${fn} ${v('tf-ln')}`,email:em,company:co,trade:tr,state:st,project_name:pn,project_type:v('tf-pt'),est_value:v('tf-pv'),drawing_sheets:v('tf-ps'),bid_due:v('tf-dd'),scope:v('tf-sc'),cloud_link:v('tf-cloud'),divisions:ck,notes:v('tf-nt'),source:'Takeoff Service Form'};
  fd.append('meta',JSON.stringify(meta));
  selectedFiles.forEach(f=>fd.append('files',f));
  let sent=false,errorMsg='';
  try{
    const res=await fetch('/api/send-with-files',{method:'POST',body:fd});
    const json=await res.json().catch(()=>({}));
    if(json.tooLarge){err.innerHTML='📎 Files too large. Paste a Google Drive / Dropbox link instead.';err.style.display='block';if(btn){btn.disabled=false;btn.innerHTML='<svg width="14" height="14"><use href="#ic-send"/></svg> Submit Takeoff Request';}return;}
    if(!res.ok){errorMsg=json.error||`Server error ${res.status}`;}
    sent=json.success===true;
  }catch(e){errorMsg=e.message;sent=false;}
  if(sent){document.getElementById('svc-form-body').style.display='none';document.getElementById('svc-ok').style.display='block';}
  else{const isAuthErr=errorMsg&&(errorMsg.includes('535')||errorMsg.includes('credentials')||errorMsg.includes('login'));err.innerHTML=isAuthErr?'⚠️ Email server unavailable. Please email <a href="mailto:barkha@bidcoreai.com?subject=Takeoff+Request" style="color:var(--blue);font-weight:700">barkha@bidcoreai.com</a> directly.':`Submission failed. Please email <a href="mailto:barkha@bidcoreai.com" style="color:var(--blue)">barkha@bidcoreai.com</a> directly.`;err.style.display='block';}
  if(btn){btn.disabled=false;btn.innerHTML='<svg width="14" height="14"><use href="#ic-send"/></svg> Submit Takeoff Request';}
}

/* ─── FILE LIST ─── */
function showFileList(){
  const dr=document.getElementById('tf-dr');
  if(!window._selectedFiles) window._selectedFiles=[];
  window._selectedFiles=[...dr.files];
  renderFileList();
}
function renderFileList(){
  const list=document.getElementById('tf-file-list');
  if(!list) return;
  list.innerHTML=(window._selectedFiles||[]).map((f,i)=>`<div style="display:flex;align-items:center;gap:8px;background:var(--g50);border:1px solid var(--g200);border-radius:7px;padding:6px 10px;font-size:12px;color:var(--navy)"><svg width="13" height="13" style="color:var(--blue);flex-shrink:0"><use href="#ic-file"/></svg><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span><span style="color:var(--g400);font-size:11px">${(f.size/1024/1024).toFixed(1)}MB</span><button onclick="removeFile(${i})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:14px;padding:0 2px">✕</button></div>`).join('');
}
function removeFile(i){
  if(!window._selectedFiles) return;
  window._selectedFiles.splice(i,1);
  if(window._selectedFiles.length===0) document.getElementById('tf-dr').value='';
  renderFileList();
}

/* ─── FEEDBACK FORM ─── */
function submitFeedback(){
  const area=v('fb-area'),msg=v('fb-msg');
  const err=document.getElementById('fb-err');
  if(!area||!msg||starVal===0){err.textContent='Please rate the platform, select an area, and fill in your feedback.';err.style.display='block';return;}
  sendEmail({subject:`BidcoreAI Feedback — ${area} (${starVal}/5 stars)`,name:v('fb-name'),email:v('fb-email'),role:v('fb-role'),rating:`${starVal}/5`,area,feedback:msg,feature_request:v('fb-feat'),source:'Feedback Form'},'fb-btn','fb-err','fb-form-body','fb-ok');
}

/* ─── CONTACT FORM ─── */
function submitContact(){
  const name=v('ct-name'),em=v('ct-email'),subj=v('ct-subj'),msg=v('ct-msg');
  const err=document.getElementById('ct-err');
  if(!name||!em||!subj||!msg){err.style.display='block';return;}
  if(!isEmail(em)){err.textContent='Please enter a valid email.';err.style.display='block';return;}
  sendEmail({subject:`BidcoreAI Contact — ${subj}`,name,email:em,company:v('ct-co'),subject_area:subj,message:msg,source:'Contact Form'},'ct-btn','ct-err','ct-form-body','ct-ok');
}

/* ─── FAQ ACCORDION ─── */
function toggleFaq(btn){
  const item=btn.parentElement;
  const ans=item.querySelector('.faq-a');
  const isOpen=btn.classList.contains('open');
  document.querySelectorAll('.faq-q.open').forEach(b=>{b.classList.remove('open');b.parentElement.querySelector('.faq-a').classList.remove('open');});
  if(!isOpen){btn.classList.add('open');ans.classList.add('open');}
}

/* ─── REVEAL ON SCROLL ─── */
function initReveal(){
  document.querySelectorAll('.rv:not(.will-animate):not(.vis)').forEach(el=>el.classList.add('will-animate'));
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add('vis'); });
  },{threshold:0.05,rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.rv.will-animate:not(.vis)').forEach(el=>obs.observe(el));
}
document.addEventListener('DOMContentLoaded', initReveal);

/* ─── SPIN KEYFRAME ─── */
// @keyframes spin defined in style.css
