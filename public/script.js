/* ─────────────────────────────────────────
   BidcoreAI · script.js
   Handles: navigation, slides, how-it-works,
   CSI divisions, star rating, form submissions
   (SMTP via server-side /api/send endpoint),
   billing toggle, mobile menu, reveal animations
───────────────────────────────────────── */

/* ─── PAGE ROUTING ─── */
const PAGES = ['home','solutions','pricing','services','feedback','contact'];
function goPage(id){
  PAGES.forEach(p=>{
    const el = document.getElementById('pg-'+p);
    const nl = document.getElementById('nl-'+p);
    if(el) el.classList.toggle('on', p===id);
    if(nl) nl.classList.toggle('on', p===id);
  });
  window.scrollTo({top:0,behavior:'instant'});
  initReveal();
}

/* ─── MOBILE MENU ─── */
function openMob(){
  document.getElementById('mob-nav').classList.add('on');
  document.getElementById('mob-overlay').classList.add('on');
  document.body.style.overflow='hidden';
}
function closeMob(){
  document.getElementById('mob-nav').classList.remove('on');
  document.getElementById('mob-overlay').classList.remove('on');
  document.body.style.overflow='';
}

/* ─── MODAL ─── */
function openModal(){
  document.getElementById('modal').classList.add('on');
  document.body.style.overflow='hidden';
}
function closeModal(){
  document.getElementById('modal').classList.remove('on');
  document.body.style.overflow='';
}
document.getElementById('modal').addEventListener('click',function(e){
  if(e.target===this) closeModal();
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
// Initialize first step
setTimeout(()=>renderPanel(0), 50);

/* ─── BILLING TOGGLE ─── */
let isYearly = false;
function toggleBilling(){
  isYearly = !isYearly;
  const btn = document.getElementById('billing-toggle');
  if(btn) btn.classList.toggle('on', isYearly);
  // Solo Estimator: $89/mo or $999/yr
  const soloPrice = document.getElementById('solo-price');
  const soloYearly = document.getElementById('solo-yearly');
  if(soloPrice) soloPrice.textContent = isYearly ? '999' : '89';
  const soloPer = soloPrice && soloPrice.closest('.pamt')?.querySelector('.pper');
  if(soloPer) soloPer.textContent = isYearly ? '/year' : '/month';
  if(soloYearly) soloYearly.style.display = isYearly ? 'none' : 'none'; // yearly note shown via pamt
  // Growing Team: $249/mo or $2,799/yr
  const teamPrice = document.getElementById('team-price');
  if(teamPrice) teamPrice.textContent = isYearly ? '2,799' : '249';
  const teamPer = teamPrice && teamPrice.closest('.pamt')?.querySelector('.pper');
  if(teamPer) teamPer.textContent = isYearly ? '/year' : '/month';
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
  const wrap=document.getElementById('div-opts-wrap');
  if(!wrap)return;
  wrap.innerHTML=DIVS.map(d=>{
    const ck=sel.includes(d.c);
    return`<label class="dopt${ck?' ck':''}" onclick="toggleDiv('${d.c}',this)">
      <input type="checkbox" value="${d.c}"${ck?' checked':''}> Div ${d.c} — ${d.n}
    </label>`;
  }).join('');
  updateDivLbl();
}
function toggleDiv(code,el){
  const cb=el.querySelector('input');
  cb.checked=!cb.checked;
  el.classList.toggle('ck',cb.checked);
  updateDivLbl();
}
function updateDivLbl(){
  const lbl=document.getElementById('div-sel-lbl');
  if(!lbl)return;
  const ck=[...document.querySelectorAll('#div-opts-wrap input:checked')].map(c=>c.value);
  lbl.textContent=ck.length===DIVS.length?'All divisions selected':ck.length===0?'No divisions selected':`Selected: Div ${ck.join(', ')}`;
}
function divTab(type,btn){
  document.querySelectorAll('.div-tabs .dtab').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on');
  if(type==='all') renderDivs(DIVS.map(d=>d.c));
  else if(type==='arch') renderDivs(ARCH);
  else if(type==='struct') renderDivs(STRUCT);
  else if(type==='mep') renderDivs(MEP);
  
  
  else renderDivs([]);
}
renderDivs(DIVS.map(d=>d.c));

/* ─── STAR RATING ─── */
let starVal=0;
function setRating(v){
  starVal=v;
  document.querySelectorAll('#star-rating .star').forEach((s,i)=>s.classList.toggle('lit',i<v));
  const lbls=['','Poor','Fair','Good','Very Good','Excellent'];
  const lbl=document.getElementById('rating-lbl');
  if(lbl)lbl.textContent=lbls[v]||'';
}

/* ─── EMAIL VIA SERVER API ─── */
/*
  To enable real email sending, deploy server.js (Node.js + Express) alongside this site.
  The server reads SMTP/Resend credentials from environment variables:
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME
    or RESEND_API_KEY + RESEND_FROM_EMAIL
  and exposes POST /api/send

  For static hosting (Render static site), you need a separate backend service.
  See server.js for full implementation.
*/
async function sendEmail(payload, btnId, errId, bodyId, okId){
  const btn = document.getElementById(btnId);
  const err = document.getElementById(errId);
  if(btn){ btn.disabled=true; btn.innerHTML='<svg width="14" height="14" style="animation:spin 1s linear infinite;display:inline-block"><use href="#ic-refresh"/></svg> Sending…'; }
  if(err) err.style.display='none';

  let sent = false;

  // Try the /api/send endpoint (works when server.js is running)
  try {
    const res = await fetch('/api/send', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if(json.tooLarge){
      err.innerHTML = 'Files are too large to attach. Please email your drawings directly to <a href="mailto:barkha@bidcoreai.com" style="color:var(--blue)">barkha@bidcoreai.com</a> with subject: <strong>Takeoff Request</strong>';
      err.style.display='block';
      if(btn){btn.disabled=false;btn.innerHTML='<svg width="14" height="14"><use href="#ic-send"/></svg> Submit Takeoff Request';}
      return;
    }
    sent = json.success === true;
  } catch(e){ sent = false; }

  if(sent){
    const bd = document.getElementById(bodyId);
    const ok = document.getElementById(okId);
    if(bd) bd.style.display='none';
    if(ok) ok.style.display='block';
  } else {
    // Fallback: open email client
    const subj = encodeURIComponent(payload.subject || 'BidcoreAI Inquiry');
    const body = encodeURIComponent(
      Object.entries(payload)
        .filter(([k])=>k!=='subject')
        .map(([k,vl])=>`${k}: ${vl}`)
        .join('\n')
    );
    window.open(`mailto:barkha@bidcoreai.com?subject=${subj}&body=${body}`, '_blank');
    // Show success anyway since mailto opened
    const bd = document.getElementById(bodyId);
    const ok = document.getElementById(okId);
    if(bd) bd.style.display='none';
    if(ok) ok.style.display='block';
  }

  if(btn){ btn.disabled=false; btn.innerHTML='<svg width="14" height="14"><use href="#ic-send"/></svg> Submit'; }
}

function v(id){ const el=document.getElementById(id); return el?el.value.trim():''; }
function isEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

/* ─── MODAL FORM ─── */
function submitModal(){
  const fn=v('m-fn'),em=v('m-em'),co=v('m-co'),tr=v('m-tr');
  const err=document.getElementById('m-err');
  if(!fn||!em||!co||!tr){err.textContent='Please fill in all required fields.';err.style.display='block';return;}
  if(!isEmail(em)){err.textContent='Please enter a valid email.';err.style.display='block';return;}
  sendEmail({
    subject:`BidcoreAI Request — ${fn} (${co})`,
    name:`${fn} ${v('m-ln')}`,
    email:em, company:co, trade:tr,
    interest:v('m-int'), challenge:v('m-ch'), source:'Demo Modal'
  },'m-btn','m-err','mod-form','mod-ok');
}

/* ─── TAKEOFF SERVICE FORM ─── */
async function submitSvc(){
  const fn=v('tf-fn'),em=v('tf-em'),co=v('tf-co'),tr=v('tf-tr'),pn=v('tf-pn'),st=v('tf-st');
  const dr=document.getElementById('tf-dr');
  const err=document.getElementById('svc-err');
  const hasFile = dr && dr.files.length > 0;
  const hasLink = v('tf-cloud').length > 0;
  if(!fn||!em||!co||!tr||!pn||!st||(!hasFile && !hasLink)){err.style.display='block';return;}
  if(!isEmail(em)){err.textContent='Please enter a valid email.';err.style.display='block';return;}
  const ck=[...document.querySelectorAll('#div-opts-wrap input:checked')].map(c=>c.value).join(', ')||'All Divisions';

  const btn=document.getElementById('svc-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<svg width="14" height="14" style="animation:spin 1s linear infinite;display:inline-block"><use href="#ic-refresh"/></svg> Sending…';}
  err.style.display='none';

  // Build FormData so files are sent as real attachments
  const fd = new FormData();
  const meta = {
    subject:`Takeoff Service Request — ${pn} (${co})`,
    name:`${fn} ${v('tf-ln')}`, email:em, company:co, trade:tr, state:st,
    project_name:pn, project_type:v('tf-pt'), est_value:v('tf-pv'),
    drawing_sheets:v('tf-ps'), bid_due:v('tf-dd'), scope:v('tf-sc'),
    cloud_link:v('tf-cloud'), divisions:ck, notes:v('tf-nt'), source:'Takeoff Service Form'
  };
  fd.append('meta', JSON.stringify(meta));
  [...dr.files].forEach(f => fd.append('files', f));

  let sent = false;
  try {
    const res = await fetch('/api/send-with-files', { method:'POST', body:fd });
    const json = await res.json();
    sent = json.success === true;
  } catch(e){ sent = false; }

  if(sent){
    document.getElementById('svc-form-body').style.display='none';
    document.getElementById('svc-ok').style.display='block';
  } else {
    err.textContent='Submission failed. Please email barkha@bidcoreai.com directly.';
    err.style.display='block';
  }
  if(btn){btn.disabled=false;btn.innerHTML='<svg width="14" height="14"><use href="#ic-send"/></svg> Submit Takeoff Request';}
}

/* ─── FEEDBACK FORM ─── */
function submitFeedback(){
  const em=v('fb-email'),area=v('fb-area'),msg=v('fb-msg');
  const err=document.getElementById('fb-err');
  if(!area||!msg||starVal===0){err.textContent='Please rate the platform, select an area, and fill in your feedback.';err.style.display='block';return;}
  sendEmail({
    subject:`BidcoreAI Feedback — ${area} (${starVal}/5 stars)`,
    name:v('fb-name'), email:em, role:v('fb-role'),
    rating:`${starVal}/5`, area, feedback:msg,
    feature_request:v('fb-feat'), source:'Feedback Form'
  },'fb-btn','fb-err','fb-form-body','fb-ok');
}

/* ─── CONTACT FORM ─── */
function submitContact(){
  const name=v('ct-name'),em=v('ct-email'),subj=v('ct-subj'),msg=v('ct-msg');
  const err=document.getElementById('ct-err');
  if(!name||!em||!subj||!msg){err.style.display='block';return;}
  if(!isEmail(em)){err.textContent='Please enter a valid email.';err.style.display='block';return;}
  sendEmail({
    subject:`BidcoreAI Contact — ${subj}`,
    name, email:em, company:v('ct-co'),
    subject_area:subj, message:msg, source:'Contact Form'
  },'ct-btn','ct-err','ct-form-body','ct-ok');
}

/* ─── REVEAL ON SCROLL ─── */
function initReveal(){
  setTimeout(()=>{
    const obs = new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add('vis'); });
    },{threshold:0.08});
    document.querySelectorAll('.rv:not(.vis)').forEach(el=>obs.observe(el));
  },50);
}
initReveal();
