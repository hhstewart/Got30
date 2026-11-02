/* Got 30? : the whole app. Runs in the browser (website) and in the Chrome side panel (extension). */
const $ = id => document.getElementById(id);

/* ---------- time zones ---------- */
const ZONES = [
  ["America/New_York","Eastern","ET"], ["America/Chicago","Central","CT"], ["America/Denver","Mountain","MT"],
  ["America/Phoenix","Arizona","Arizona time"], ["America/Los_Angeles","Pacific","PT"], ["America/Anchorage","Alaska","Alaska time"],
  ["Pacific/Honolulu","Hawaii","Hawaii time"], ["Europe/London","London","London time"], ["Europe/Zurich","Zurich / Central Europe","CET"],
  ["Asia/Hong_Kong","Hong Kong","Hong Kong time"], ["Asia/Tokyo","Tokyo","Tokyo time"],
];
const BROWSER_TZ = (()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver"; }catch{ return "America/Denver"; } })();
if(!ZONES.some(z=>z[0]===BROWSER_TZ)) ZONES.push([BROWSER_TZ, BROWSER_TZ.split("/").pop().replace(/_/g," "), BROWSER_TZ.split("/").pop().replace(/_/g," ")+" time"]);
const zoneLabel = tz => (ZONES.find(z=>z[0]===tz)||[tz,tz,tz])[2];
function fillZones(sel, val){
  sel.replaceChildren(...ZONES.map(([id,name,short])=>{ const o=document.createElement("option"); o.value=id; o.textContent=`${name} (${short})`; return o; }));
  sel.value = val;
}

// Offset of a time zone from UTC at a given moment, in ms
function tzOffset(ms, tz){
  const p = new Intl.DateTimeFormat("en-US",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).formatToParts(ms);
  const g = k => +p.find(x=>x.type===k).value;
  return Date.UTC(g("year"),g("month")-1,g("day"),g("hour")%24,g("minute"),g("second")) - Math.floor(ms/1000)*1000;
}
// "2026-11-10" + "14:00" in a zone -> real moment (ms)
function zoned(dateStr, timeStr, tz){
  if(!dateStr || !timeStr) return null;
  const [y,mo,d] = dateStr.split("-").map(Number), [h,mi] = timeStr.split(":").map(Number);
  if([y,mo,d,h,mi].some(n=>Number.isNaN(n))) return null;
  const guess = Date.UTC(y,mo-1,d,h,mi);
  let ms = guess - tzOffset(guess,tz);
  ms = guess - tzOffset(ms,tz);      // second pass handles daylight saving edges
  return ms;
}
// moment -> "YYYY-MM-DDTHH:MM" wall time in a zone (for datetime inputs)
function wall(ms, tz){
  const p = new Intl.DateTimeFormat("en-CA",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(ms);
  const g = k => p.find(x=>x.type===k).value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")%24===0&&g("hour")!=="00"?"00":g("hour")}:${g("minute")}`;
}
function clock(ms, tz){
  const p = new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"numeric",minute:"2-digit",hour12:true}).formatToParts(ms);
  const h=p.find(x=>x.type==="hour").value, m=p.find(x=>x.type==="minute").value, ap=(p.find(x=>x.type==="dayPeriod")||{value:""}).value.toLowerCase();
  return { txt: h + (m==="00" ? "" : ":"+m), ap };
}
const dayName = (ms,tz,long=true) => new Intl.DateTimeFormat("en-US",{timeZone:tz,weekday:long?"long":"short",month:"short",day:"numeric"}).format(ms);
function range(a, b, tz){
  const s=clock(a,tz), e=clock(b,tz);
  return `${dayName(a,tz)}: ${s.ap===e.ap ? s.txt : s.txt+s.ap}-${e.txt}${e.ap}`;
}
const pad = n => String(n).padStart(2,"0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
function plusDays(s,n){ const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+n); return iso(d); }
const fmtDate = s => s ? new Date(s+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "";

/* ---------- settings saved on this device ---------- */
const SETTINGS_KEY = "got30-me";
const SLOT_TIMES = [["10:00","13:00"],["14:00","17:00"],["09:00","12:00"],["11:00","15:00"],["13:00","16:00"]];
function defaultSlots(){
  const out=[]; const d=new Date(); d.setDate(d.getDate()+3);
  while(out.length<5){ if(d.getDay()%6!==0) out.push({d:iso(d), a:SLOT_TIMES[out.length][0], b:SLOT_TIMES[out.length][1]}); d.setDate(d.getDate()+1); }
  return out;
}
function loadSettings(){ try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null"); }catch{ return null; } }
function saveSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify({ me:$("me").value, about:$("about").value, myTz:$("myTz").value, mins:$("mins").value, slots:readSlotInputs() })); }catch{}
}

/* ---------- availability rows ---------- */
function buildSlots(list){
  $("slots").replaceChildren(...list.map((s,i)=>{
    const row=document.createElement("div"); row.className="slot";
    row.innerHTML = `<input type="date" class="d" id="d${i}" aria-label="Day ${i+1}">
      <input type="time" id="a${i}" step="900" aria-label="Start ${i+1}">
      <input type="time" id="b${i}" step="900" aria-label="End ${i+1}">
      <div class="out" id="o${i}"></div>`;
    row.querySelector(".d").value=s.d||""; row.querySelector(`#a${i}`).value=s.a||""; row.querySelector(`#b${i}`).value=s.b||"";
    return row;
  }));
}
const readSlotInputs = () => [0,1,2,3,4].map(i=>({ d:$("d"+i).value, a:$("a"+i).value, b:$("b"+i).value }));
// Returns the slots as text in THEIR zone, and updates the preview under each row
function convertSlots(myTz, theirTz){
  const out=[]; const now=Date.now();
  readSlotInputs().forEach((s,i)=>{
    const o=$("o"+i); o.classList.remove("past");
    const a=zoned(s.d,s.a,myTz), b=zoned(s.d,s.b,myTz);
    if(a==null || b==null){ o.textContent = s.d||s.a||s.b ? "Add a day, start and end time" : "Leave blank to skip"; return; }
    if(b<=a){ o.textContent="End time needs to be after the start"; o.classList.add("past"); return; }
    const txt = range(a,b,theirTz);
    out.push(txt);
    if(a<now){ o.textContent="This time has already passed"; o.classList.add("past"); return; }
    o.innerHTML = myTz===theirTz ? "Shows as: <b></b>" : `They'll see: <b></b>`;
    o.querySelector("b").textContent = myTz===theirTz ? txt : `${txt} ${zoneLabel(theirTz)}`;
  });
  return out;
}

/* ---------- views ---------- */
let view="write";
function setView(v){
  view=v;
  $("writeView").hidden = v!=="write"; $("trackView").hidden = v!=="track";
  $("navWrite").toggleAttribute("aria-current", v==="write"); $("navTrack").toggleAttribute("aria-current", v==="track");
  (v==="write" ? $("navWrite") : $("navTrack")).setAttribute("aria-current","page");
  if(v==="track") renderTracker();
}
$("navWrite").onclick = ()=>setView("write");
$("navTrack").onclick = ()=>setView("track");

/* ---------- writer ---------- */
const FIELDS = ["me","about","myTz","them","firm","role","email","theirTz","common","tag","found","interest","mins","extra"];
const gmailUrl = (to, su, body) => "https://mail.google.com/mail/?" + new URLSearchParams({ view:"cm", fs:"1", tf:"1", to:to||"", su, body }).toString();
let tab="email", draft=null, edited=false;
const first = n => (n||"there").split(/\s+/)[0];

function read(){
  const o={}; FIELDS.forEach(k=>o[k]=$(k).value.trim());
  o.slots = convertSlots(o.myTz, o.theirTz);
  o.zone = zoneLabel(o.theirTz);
  return o;
}

function buildDraft(f){
  const slots = f.slots.map(s=>"- "+s).join("\n") || "- (add your availability)";
  const availLine = f.myTz===f.theirTz ? `Here's my availability (${f.zone}):` : `Here's my availability in your time zone (${f.zone}):`;
  const subject = [f.firm, f.tag, "Chat"].filter(Boolean).join(" ");
  const extra = f.extra ? ` I also ${/^(saw|read|noticed|heard)/i.test(f.extra)?"":"noticed "}${f.extra.replace(/\.$/,"")}, which I thought was really cool.` : "";
  const email =
`Hi ${first(f.them)},

My name is ${f.me}, and I'm a ${f.about}. I came across your profile on ${f.found} and saw that you're a ${f.role} at ${f.firm}. I saw that ${f.common}, so I figured I'd reach out.${extra}

I'm really passionate about a career in ${f.interest}, and I'd love to hear how you got to where you are. Would you have ${f.mins} minutes to chat sometime in the next couple of weeks?

${availLine}
${slots}

Happy to work around your schedule if none of those work.

Thanks so much,
${f.me}`;
  const followup =
`Hi ${first(f.them)},

Just wanted to bump this in case it got buried. I'd still love ${f.mins} minutes to hear about your path to ${f.firm}.

${f.myTz===f.theirTz ? "Here are a few times that work for me" : "Here are a few times that work for me in your time zone"} (${f.zone}):
${slots}

Totally understand if things are busy. Thanks again,
${f.me}`;
  return { subject, email, fsubject:"Re: "+subject, followup, questions:[
    `What made you choose ${f.firm || "your firm"} over other places you looked at?`,
    `What does a normal week look like for a ${f.role || "person in your role"}?`,
    `What do you wish you'd known as a student going into ${f.interest || "this field"}?`,
    `What skills or experiences set candidates apart for roles like yours?`,
    `Is there anyone else you'd recommend I talk to?`
  ]};
}

function regenerate(){ draft = buildDraft(read()); edited=false; render(); }

function render(){
  const f = read();
  $("toLine").value = f.them + (f.firm ? `, ${f.firm}` : "");
  const isFollow = tab==="followup";
  $("compose").hidden = !(tab==="email"||isFollow);
  $("coach").hidden = tab!=="coach";
  $("prep").hidden = tab!=="prep";
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected", b.dataset.tab===tab));
  $("rebuild").hidden = !edited;
  $("statusText").textContent = edited ? "You edited this draft, so form changes won't overwrite it." : "Updates as you fill in the form. Edit anything before you copy it.";
  if(!$("compose").hidden){
    if(document.activeElement!==$("subj")) $("subj").value = isFollow ? draft.fsubject : draft.subject;
    if(document.activeElement!==$("bodyText")) $("bodyText").value = isFollow ? draft.followup : draft.email;
    updateCount();
    updateGmail();
  }
  if(tab==="coach") renderChecks(f);
  if(tab==="prep") $("questions").replaceChildren(...draft.questions.map(q=>{ const li=document.createElement("li"); li.textContent=q; return li; }));
}
const words = t => (t.match(/\b[\w'’-]+\b/g)||[]).length;
function updateCount(){ const n=words($("bodyText").value); $("count").textContent = `${n} words` + (n>170 ? " · try to trim under 150" : ""); }

function updateGmail(){ $("gmailBtn").href = gmailUrl($("email").value.trim(), $("subj").value, $("bodyText").value); }
$("subj").addEventListener("input",()=>{ draft[tab==="followup"?"fsubject":"subject"]=$("subj").value; edited=true; $("rebuild").hidden=false; updateGmail(); });
$("bodyText").addEventListener("input",()=>{ draft[tab==="followup"?"followup":"email"]=$("bodyText").value; edited=true; $("rebuild").hidden=false; updateCount(); updateGmail(); });
$("gmailBtn").addEventListener("click",()=>{ updateGmail(); setTimeout(()=>toast("After you send it, hit “I sent it” to track it"),400); });
$("rebuild").onclick = ()=>{ regenerate(); toast("Rebuilt from the form"); };

function renderChecks(f){
  const s = draft.subject.toLowerCase(), e = draft.email, n = words(e);
  const items = [
    [!!f.tag && s.includes(f.tag.toLowerCase()), "Shared connection in the subject", "People open emails that show a link to them right away."],
    [/\b(15|20|30)\s*(min|minutes)\b/i.test(e), "One small, specific ask", "A short call is easy to say yes to. Big asks get ignored."],
    [f.slots.length>=3 && f.slots.filter(x=>e.includes(x)).length>=3, "Specific times listed", `${f.slots.length} options given. They just pick one and reply.`],
    [f.slots.length>0 && e.includes(f.zone), "Times are in their time zone", f.myTz===f.theirTz ? "You're in the same time zone." : `Shown in ${f.zone} so they don't have to do the math.`],
    [n<=170, "Short enough to read on a phone", `${n} words. Under 150 is the sweet spot.`],
    [!!f.found && !!f.role, "Shows you looked them up", "Mentioning their role and where you found them proves it isn't a mass email."],
  ];
  $("checks").replaceChildren(...items.map(([ok,t,d])=>{
    const li=document.createElement("li");
    li.innerHTML=`<span class="mark ${ok?"":"no"}">${ok?"✓":"!"}</span><div><strong></strong><small></small></div>`;
    li.querySelector("strong").textContent=t; li.querySelector("small").textContent=d; return li;
  }));
}

$("f").addEventListener("input", ()=>{ $("exNote").hidden=true; saveSettings(); if(edited){ read(); if(tab==="coach") renderChecks(read()); } else regenerate(); });
$("f").addEventListener("submit", e=>e.preventDefault());
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{ tab=b.dataset.tab; render(); }));

async function copy(text){
  try{ await navigator.clipboard.writeText(text); toast("Copied"); }
  catch{ const t=$("bodyText"); t.focus(); t.select(); toast("Press Ctrl+C or Cmd+C to copy"); }
}
$("copySubj").onclick = ()=>copy($("subj").value);
$("copyBody").onclick = ()=>copy($("bodyText").value);

let tt; function toast(m){ const el=$("toast"); el.textContent=m; el.hidden=false; clearTimeout(tt); tt=setTimeout(()=>el.hidden=true,2800); }

/* ---------- tracker ---------- */
const STATUSES = ["Drafted","Sent","Followed up","Call booked","Talked","No reply"];
const LS = "got30-contacts";
let contacts = [], filter = "all";
const rows = new Map();
const myTz = () => $("myTz").value || BROWSER_TZ;

const isDue = c => c.status==="Sent" && c.followUpOn && c.followUpOn <= today();
const FILTERS = {
  all: ()=>true, due: isDue,
  wait: c => c.status==="Sent" || c.status==="Followed up",
  calls: c => c.status==="Call booked" || c.status==="Talked",
  noreply: c => c.status==="No reply",
};
function loadLocal(){ try{ const a=JSON.parse(localStorage.getItem(LS)||"[]"); return Array.isArray(a)?a:[]; }catch{ return []; } }
function saveLocal(){ try{ localStorage.setItem(LS, JSON.stringify(contacts)); }catch{ toast("Couldn't save. Your browser may be blocking storage."); } }

function relDay(ms){
  const t = zoned(wall(Date.now(),myTz()).slice(0,10),"00:00",myTz());
  const days = Math.floor((ms - t)/86400000);
  if(ms < Date.now()) return "passed";
  if(ms - Date.now() < 3600000) return "starting soon";
  return days===0 ? "today" : days===1 ? "tomorrow" : `in ${days} days`;
}
function callText(c){
  const me=myTz(), them=c.theirTz||me, a=c.callAt;
  const mine = `${dayName(a,me,false)} at ${clock(a,me).txt}${clock(a,me).ap}`;
  if(them===me) return { mine, both: `${mine} ${zoneLabel(me)}` };
  const theirs = `${clock(a,them).txt}${clock(a,them).ap} ${zoneLabel(them)}`;
  return { mine, both: `${mine} your time (${theirs})` };
}
function gcalUrl(c){
  const s=new Date(c.callAt), e=new Date(c.callAt + (Number(c.mins)||30)*60000);
  const z=d=>d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  const q=new URLSearchParams({ action:"TEMPLATE", text:`Coffee chat: ${c.name}${c.firm?` (${c.firm})`:""}`, dates:`${z(s)}/${z(e)}`,
    details:`Networking call. ${[c.role,c.firm].filter(Boolean).join(" at ")}\nNotes: ${c.notes||""}` });
  if(c.email) q.set("add", c.email);   // adds them as a guest, so saving sends the invite
  return "https://calendar.google.com/calendar/render?"+q.toString();
}

function renderTracker(){
  $("navCount").textContent = contacts.length;
  $("kOut").textContent = contacts.filter(c=>c.status!=="Drafted").length;
  $("kWait").textContent = contacts.filter(FILTERS.wait).length;
  $("kDue").textContent = contacts.filter(isDue).length;
  $("kCalls").textContent = contacts.filter(FILTERS.calls).length;

  // upcoming calls
  const up = contacts.filter(c=>c.callAt && c.callAt > Date.now()-3600000 && c.status!=="Talked").sort((a,b)=>a.callAt-b.callAt).slice(0,5);
  $("upcoming").hidden = !up.length;
  $("upList").replaceChildren(...up.map(c=>{
    const el=document.createElement("div"); el.className="up";
    el.innerHTML=`<div><div class="who"></div><div class="when"></div></div><a class="btnlink" target="_blank" rel="noopener">Add to Google Calendar</a>`;
    el.querySelector(".who").textContent = c.name + (c.firm?` · ${c.firm}`:"");
    const r=relDay(c.callAt), when=el.querySelector(".when");
    when.textContent = callText(c).both + " · ";
    const s=document.createElement("span"); s.textContent=r; if(r==="today"||r==="starting soon"||r==="tomorrow") s.className="soon"; when.append(s);
    el.querySelector("a").href = gcalUrl(c);
    return el;
  }));

  const shown = contacts.filter(FILTERS[filter]);
  if(!contacts.length){ $("emptyBox").hidden=false; $("emptyTitle").textContent="No one in your tracker yet"; $("emptyText").textContent="After you send an email, hit “I sent it: add to tracker” on the Write tab. Or add someone above. Each contact gets a follow-up reminder a week out, a call time, and a spot for notes."; }
  else if(!shown.length){ $("emptyBox").hidden=false; $("emptyTitle").textContent="Nobody here right now"; $("emptyText").textContent="No contacts match this filter."; }
  else $("emptyBox").hidden=true;

  const seen=new Set();
  contacts.forEach(c=>{
    seen.add(c.id);
    let r=rows.get(c.id); if(!r){ r=makeCard(c.id); rows.set(c.id,r); }
    fillCard(r,c); r.el.hidden = !FILTERS[filter](c);
  });
  for(const [id,r] of rows){ if(!seen.has(id)){ r.el.remove(); rows.delete(id); } }
  const cards=$("cards"), order=contacts.map(c=>rows.get(c.id).el);
  if(order.some((el,i)=>cards.children[i]!==el)) order.forEach(el=>cards.appendChild(el));
}

function makeCard(id){
  const el=document.createElement("article"); el.className="card";
  el.innerHTML=`
    <div class="top"><div><h4></h4><div class="sub"></div></div><span class="pill"></span></div>
    <div class="meta">
      <label>Status<select class="st">${STATUSES.map(s=>`<option>${s}</option>`).join("")}</select></label>
      <label>Follow up on<input type="date" class="fu"></label>
      <label class="full">Their email<input type="email" class="em" placeholder="Add it to send a calendar invite"></label>
    </div>
    <div class="sub dates"></div>
    <div class="callbox">
      <div class="meta">
        <label class="full">Call time<input type="datetime-local" class="ct"></label>
        <label>Time entered in<select class="ctz"><option value="me">My time</option><option value="them">Their time</option></select></label>
        <label>Their time zone<select class="ttz"></select></label>
      </div>
      <div class="calltxt"></div>
      <div><a class="btnlink gcal" target="_blank" rel="noopener">Add to Google Calendar</a></div>
      <small class="hint gnote"></small>
    </div>
    <textarea class="notes" aria-label="Notes" placeholder="Notes: what you talked about, who they referred you to, next steps"></textarea>
    <div class="row">
      <button type="button" class="ghost draftFu">Write follow-up</button>
      <button type="button" class="ghost danger del">Remove</button>
    </div>`;
  const q=s=>el.querySelector(s);
  const r={el, h:q("h4"), sub:q(".sub"), pill:q(".pill"), st:q(".st"), fu:q(".fu"), dates:q(".dates"), notes:q(".notes"),
    box:q(".callbox"), ct:q(".ct"), ctz:q(".ctz"), ttz:q(".ttz"), calltxt:q(".calltxt"), gcal:q(".gcal"), gnote:q(".gnote"), em:q(".em"), del:q(".del"), draftFu:q(".draftFu"), c:null};
  ["st","fu","notes","ct","ctz","ttz","em"].forEach(k=>r[k].id=`${k}-${id}`);
  r.em.onchange=()=>write(id,{email:r.em.value.trim()});
  fillZones(r.ttz, myTz());

  r.st.onchange=()=>{
    const s=r.st.value, patch={status:s};
    if(s==="Sent" && !r.c.sentOn){ patch.sentOn=today(); patch.followUpOn=plusDays(today(),7); }
    if(s==="Followed up"){ patch.followedUpOn=today(); patch.followUpOn=plusDays(today(),7); }
    write(id,patch);
    if(s==="Call booked" && !r.c.callAt) setTimeout(()=>r.ct.focus(),0);
  };
  r.fu.onchange=()=>write(id,{followUpOn:r.fu.value||null});
  const setCall=()=>{
    if(!r.ct.value){ write(id,{callAt:null}); return; }
    const [d,t]=r.ct.value.split("T");
    const tz = r.ctz.value==="them" ? (r.c.theirTz||myTz()) : myTz();
    const ms=zoned(d,t,tz); if(ms==null) return;
    const patch={callAt:ms, callEnteredIn:r.ctz.value};
    if(r.c.status!=="Call booked" && r.c.status!=="Talked") patch.status="Call booked";
    write(id,patch);
  };
  r.ct.onchange=setCall;
  r.ctz.onchange=()=>{ write(id,{callEnteredIn:r.ctz.value}); };
  r.ttz.onchange=()=>write(id,{theirTz:r.ttz.value});
  let nt; r.notes.oninput=()=>{ clearTimeout(nt); nt=setTimeout(()=>write(id,{notes:r.notes.value},true),600); };
  r.notes.onblur=()=>{ clearTimeout(nt); if(r.c && r.notes.value!==(r.c.notes||"")) write(id,{notes:r.notes.value}); };
  let armed=null;
  r.del.onclick=()=>{
    if(!armed){ r.del.textContent="Tap again to remove"; armed=setTimeout(()=>{armed=null; r.del.textContent="Remove";},4000); return; }
    clearTimeout(armed); armed=null;
    contacts = contacts.filter(x=>x.id!==id); persistDelete(id); renderTracker();
  };
  r.draftFu.onclick=()=>{
    const c=r.c;
    [["them","name"],["firm","firm"],["role","role"],["email","email"],["common","common"],["tag","tag"],["found","found"],["interest","interest"],["theirTz","theirTz"]]
      .forEach(([field,key])=>{ if(c[key]) $(field).value=c[key]; });
    $("exNote").hidden=true; tab="followup"; regenerate(); setView("write"); window.scrollTo({top:0});
    toast(`Follow-up drafted for ${c.name}`);
  };
  return r;
}

function fillCard(r,c){
  r.c=c;
  r.h.textContent=c.name||"Unnamed";
  r.sub.textContent=[c.role,c.firm].filter(Boolean).join(" at ");
  const due=isDue(c);
  r.el.classList.toggle("due",due);
  r.pill.textContent = due ? "Follow-up due" : c.status;
  r.pill.className = "pill " + (due ? "s-due" : "s-"+String(c.status||"").replace(/\s+/g,"-"));
  const act=document.activeElement;
  if(act!==r.st) r.st.value=c.status||"Sent";
  if(act!==r.fu) r.fu.value=c.followUpOn||"";
  if(act!==r.notes) r.notes.value=c.notes||"";
  if(act!==r.em) r.em.value=c.email||"";
  r.gnote.textContent = c.email ? `Opens Google Calendar with ${c.email} added. Hit Save, then Send, and they get the invite.` : "Add their email above and this will send them the invite too.";
  if(act!==r.ttz) r.ttz.value=c.theirTz||myTz();
  if(act!==r.ctz) r.ctz.value=c.callEnteredIn||"me";
  const showCall = c.status==="Call booked" || c.status==="Talked" || !!c.callAt;
  r.box.hidden = !showCall;
  if(showCall){
    const tz = (c.callEnteredIn==="them" ? (c.theirTz||myTz()) : myTz());
    if(act!==r.ct) r.ct.value = c.callAt ? wall(c.callAt,tz) : "";
    if(c.callAt){
      const t=callText(c), rel=relDay(c.callAt);
      r.calltxt.innerHTML="<b></b> · <span></span>";
      r.calltxt.querySelector("b").textContent=t.both; r.calltxt.querySelector("span").textContent=rel;
      r.gcal.href=gcalUrl(c); r.gcal.parentElement.hidden=false;
    } else { r.calltxt.textContent="Set the time they agreed to. It shows in both time zones."; r.gcal.parentElement.hidden=true; }
  }
  const bits=[];
  if(c.sentOn) bits.push("Sent "+fmtDate(c.sentOn));
  if(c.followedUpOn) bits.push("Followed up "+fmtDate(c.followedUpOn));
  r.dates.textContent=bits.join(" · "); r.dates.hidden=!bits.length;
}

function write(id, patch, quiet){
  const c=contacts.find(x=>x.id===id); if(!c) return;
  Object.assign(c, patch, {updatedAt:Date.now()}); persist(c);
  if(!quiet) renderTracker();
}
function addContact(c){
  const key=(c.name+"|"+(c.firm||"")).toLowerCase();
  if(contacts.some(x=>((x.name||"")+"|"+(x.firm||"")).toLowerCase()===key)){ toast(`${c.name} is already in your tracker`); return false; }
  const now=Date.now(), id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(now)+Math.random().toString(36).slice(2);
  const nc = Object.assign({notes:"", theirTz:myTz(), mins:"30"}, c, {id, createdAt:now, updatedAt:now});
  contacts.unshift(nc); persist(nc); renderTracker(); toast(`Added ${c.name} to your tracker`); return true;
}

$("logBtn").onclick=()=>{
  const f=read();
  if(!f.them){ toast("Add their name first"); return; }
  addContact({name:f.them, firm:f.firm, role:f.role, email:f.email, common:f.common, tag:f.tag, found:f.found, interest:f.interest,
    theirTz:f.theirTz, mins:f.mins, status:"Sent", sentOn:today(), followUpOn:plusDays(today(),7)});
};
$("addForm").addEventListener("submit",ev=>{
  ev.preventDefault();
  const name=$("aName").value.trim(); if(!name) return;
  if(addContact({name, firm:$("aFirm").value.trim(), role:$("aRole").value.trim(), status:"Drafted"})){
    $("aName").value=""; $("aFirm").value=""; $("aRole").value=""; $("aName").focus();
  }
});
document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{
  filter=b.dataset.f; document.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",x===b)); renderTracker();
});
// Keep "today" and "in 2 days" fresh if the sidebar stays open
setInterval(()=>{ if(view==="track") renderTracker(); }, 60000);

/* ---------- fill in from LinkedIn (Chrome extension only) ---------- */
const isExtension = !!(window.chrome && chrome.scripting && chrome.tabs);

// Runs inside the LinkedIn tab when you click the button. Reads only what's on your screen.
function readLinkedInProfile(){
  const txt = el => ((el && el.innerText) || "").trim();
  const main = document.querySelector("main") || document.body;
  const h1 = main.querySelector("h1");
  let name = txt(h1) || (document.title || "").split("|")[0].replace(/^\(\d+\)\s*/,"").trim();
  const top = h1 ? (h1.closest("section") || h1.parentElement) : main;
  const headline = txt(top.querySelector(".text-body-medium"));
  const loc = txt(top.querySelector(".text-body-small.inline"));
  let company = "";
  const cur = top.querySelector('button[aria-label^="Current company"], a[aria-label^="Current company"]');
  if(cur) company = (cur.getAttribute("aria-label") || "").replace(/^Current company:\s*/i,"").replace(/\.\s*Click.*$/i,"").trim();
  let expTitle = "", expCompany = "";
  const anchor = document.getElementById("experience");
  const sec = anchor ? anchor.closest("section") : null;
  const item = sec ? sec.querySelector("li") : null;
  if(item){
    const spans = [...item.querySelectorAll('span[aria-hidden="true"]')].map(s=>s.innerText.trim()).filter(Boolean);
    expTitle = spans[0] || ""; expCompany = (spans[1] || "").split("·")[0].trim();
  }
  return { name, headline, location: loc, company, expTitle, expCompany, pageText: (main.innerText || "").slice(0, 40000) };
}

const TZ_HINTS = [
  [/district of columbia|washington,? d\.?c|dc-baltimore/i, "America/New_York"],
  [/arizona|phoenix|scottsdale|tempe/i, "America/Phoenix"],
  [/alaska|anchorage/i, "America/Anchorage"], [/hawaii|honolulu/i, "Pacific/Honolulu"],
  [/california|oregon|nevada|seattle|washington,? united states|san francisco|los angeles|bay area|las vegas|san diego/i, "America/Los_Angeles"],
  [/colorado|utah|new mexico|wyoming|montana|idaho|denver|boulder|salt lake/i, "America/Denver"],
  [/illinois|texas|minnesota|wisconsin|missouri|iowa|louisiana|alabama|mississippi|tennessee|arkansas|oklahoma|kansas|nebraska|dakota|chicago|dallas|houston|austin|nashville|minneapolis|st\.? louis|new orleans/i, "America/Chicago"],
  [/new york|new jersey|connecticut|massachusetts|pennsylvania|maryland|virginia|georgia|florida|carolina|ohio|michigan|delaware|rhode island|vermont|new hampshire|maine|indiana|kentucky|boston|atlanta|miami|charlotte|philadelphia|nyc|toronto|ontario/i, "America/New_York"],
  [/united kingdom|england|london|scotland|ireland|dublin/i, "Europe/London"],
  [/switzerland|zurich|zug|germany|france|netherlands|spain|italy|austria|belgium|sweden|denmark|norway|luxembourg|frankfurt|paris|amsterdam|madrid|milan/i, "Europe/Zurich"],
  [/hong kong/i, "Asia/Hong_Kong"], [/japan|tokyo/i, "Asia/Tokyo"],
];
const tzFromLocation = s => (TZ_HINTS.find(([re])=>re.test(s||"")) || [])[1] || null;
function splitHeadline(h){
  const m = (h||"").match(/^(.*?)\s+(?:at|@)\s+(.+?)(?:\s*[|·•,].*)?$/i);
  return m ? { role:m[1].trim(), firm:m[2].trim() } : { role:(h||"").split(/[|·•]/)[0].trim(), firm:"" };
}

async function grabLinkedIn(){
  const btn = $("grabBtn");
  try{
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    if(!tab || !/^https:\/\/www\.linkedin\.com\/in\//.test(tab.url || "")){ toast("Open someone's LinkedIn profile in this tab first"); return; }
    btn.disabled = true; btn.textContent = "Reading profile...";
    const [res] = await chrome.scripting.executeScript({ target:{ tabId:tab.id }, func:readLinkedInProfile });
    const p = res && res.result;
    if(!p || !p.name){ toast("Couldn't read that profile. Scroll to the top and try again."); return; }
    const h = splitHeadline(p.headline);
    const got = [];
    $("them").value = p.name; got.push("name");
    const role = p.expTitle || h.role; if(role){ $("role").value = role; got.push("role"); }
    const firm = p.company || p.expCompany || h.firm; if(firm){ $("firm").value = firm; got.push("firm"); }
    const tz = tzFromLocation(p.location); if(tz){ $("theirTz").value = tz; got.push("time zone"); }
    $("email").value = ""; $("found").value = "LinkedIn";
    const school = ($("about").value.match(/\bat\s+(.+)$/i) || [])[1];
    if(school && p.pageText.toLowerCase().includes(school.trim().toLowerCase())){ $("common").value = `you went to ${school.trim()} too`; got.push("shared school"); }
    $("exNote").hidden = true; saveSettings(); regenerate();
    toast(`Filled in ${got.join(", ")}. Double-check before you send.`);
  }catch{
    toast("Couldn't read that page. Reload the LinkedIn tab and try again.");
  }finally{
    btn.disabled = false; btn.textContent = "Fill in from this LinkedIn profile";
  }
}
if(isExtension){ $("grabBox").hidden = false; $("grabBtn").onclick = grabLinkedIn; }

/* ---------- accounts and sync (Supabase) ---------- */
const CFG = window.GOT30_CONFIG || {};
const sb = (CFG.supabaseUrl && CFG.supabaseKey && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
let user = null, lastWrite = 0;
const cloud = () => !!(sb && user);
const byNewest = (a,b) => (b.createdAt||0) - (a.createdAt||0);
const chains = {};

function persist(c){
  if(!cloud()){ saveLocal(); return; }
  lastWrite = Date.now(); setSync("saving");
  const row = { id:c.id, user_id:user.id, data:c, updated_at:new Date().toISOString() };
  chains[c.id] = (chains[c.id] || Promise.resolve())
    .then(()=>sb.from("contacts").upsert(row))
    .then(({error})=>setSync(error ? "error" : "ok"))
    .catch(()=>setSync("error"));
}
function persistDelete(id){
  if(!cloud()){ saveLocal(); return; }
  lastWrite = Date.now();
  (chains[id] || Promise.resolve()).then(()=>sb.from("contacts").delete().eq("id", id))
    .then(({error})=>setSync(error ? "error" : "ok")).catch(()=>setSync("error"));
}
async function cloudLoad(){
  const { data, error } = await sb.from("contacts").select("id,data");
  if(error) throw error;
  return data.map(r=>Object.assign({}, r.data, { id:r.id })).sort(byNewest);
}

function setSync(state){
  const n = $("syncNote"); n.classList.toggle("err", state==="error");
  n.textContent =
    state==="loading" ? "Syncing..." :
    state==="saving"  ? "Saving..." :
    state==="ok"      ? `Synced to ${user.email}` :
    state==="error"   ? "Couldn't sync. Check your connection, then reopen the tracker." :
    sb ? "Saved on this device only. Sign in to sync across devices." : "Saved on this device and browser.";
}

function renderAccount(){
  $("acctBtn").textContent = user ? "Account" : "Sign in";
  $("acctForm").hidden = !!user; $("acctIn").hidden = !user;
  if(user) $("acctEmail").textContent = user.email || "your account";
}
function acctMsg(t, bad){ $("acctMsg").textContent = t; $("acctMsg").classList.toggle("err", !!bad); }

async function onUser(u){
  user = u; renderAccount();
  if(!u){ contacts = loadLocal().sort(byNewest); setSync(); renderTracker(); return; }
  setSync("loading");
  try{
    const remote = await cloudLoad();
    const ids = new Set(remote.map(c=>c.id));
    const toMove = loadLocal().filter(c=>!ids.has(c.id));
    contacts = remote.concat(toMove).sort(byNewest);
    renderTracker();
    if(toMove.length){
      const res = await Promise.all(toMove.map(c=>sb.from("contacts").upsert({ id:c.id, user_id:u.id, data:c })));
      if(res.every(r=>!r.error)){ try{ localStorage.removeItem(LS); }catch{} toast(`Moved ${toMove.length} contact${toMove.length>1?"s":""} into your account`); }
      else throw new Error("move failed");
    }
    setSync("ok");
  }catch{ setSync("error"); renderTracker(); }
}

async function startAuth(){
  setSync();
  if(!sb) return;                                  // no Supabase settings yet: device-only mode
  $("acctBtn").hidden = false;
  $("acctBtn").onclick = ()=>{ $("acctPanel").hidden = !$("acctPanel").hidden; if(!$("acctPanel").hidden && !user) $("acctEmailIn").focus(); };
  const go = async signUp=>{
    const email = $("acctEmailIn").value.trim(), password = $("acctPass").value;
    if(!email || password.length < 6){ acctMsg("Enter your email and a password of at least 6 characters.", true); return; }
    $("signInBtn").disabled = $("signUpBtn").disabled = true; acctMsg(signUp ? "Creating your account..." : "Signing in...");
    try{
      if(signUp){
        const opts = /^https?:/.test(location.href) ? { emailRedirectTo: location.href.split("#")[0] } : {};
        const { data, error } = await sb.auth.signUp({ email, password, options: opts });
        if(error) acctMsg(/registered|exists/i.test(error.message) ? "That email already has an account. Hit Sign in." : error.message, true);
        else if(!data.session) acctMsg("Check your email for a confirmation link, then come back and sign in.");
        else { acctMsg(""); $("acctPanel").hidden = true; toast("Account created"); }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if(error) acctMsg(/confirm/i.test(error.message) ? "Confirm your email first, then sign in." : "Wrong email or password.", true);
        else { acctMsg(""); $("acctPanel").hidden = true; toast("Signed in"); }
      }
    }catch{ acctMsg("Couldn't reach the server. Check your connection.", true); }
    finally{ $("signInBtn").disabled = $("signUpBtn").disabled = false; }
  };
  $("acctForm").addEventListener("submit", e=>{ e.preventDefault(); go(false); });
  $("signUpBtn").onclick = ()=>go(true);
  $("signOutBtn").onclick = async()=>{ await sb.auth.signOut().catch(()=>{}); $("acctPanel").hidden = true; toast("Signed out"); };

  sb.auth.onAuthStateChange((_event, session)=>{
    const u = session ? session.user : null;
    if((u && u.id) !== (user && user.id)) setTimeout(()=>onUser(u), 0);
  });
  try{ const { data } = await sb.auth.getSession(); await onUser(data.session ? data.session.user : null); }catch{ onUser(null); }

  // Pick up changes made on your other devices when you come back to this one
  document.addEventListener("visibilitychange", async()=>{
    if(document.hidden || !cloud() || Date.now()-lastWrite < 4000) return;
    try{ contacts = await cloudLoad(); renderTracker(); setSync("ok"); }catch{}
  });
}

/* ---------- start ---------- */
const saved = loadSettings();
fillZones($("myTz"), saved?.myTz || BROWSER_TZ);
fillZones($("theirTz"), "America/New_York");
if(saved){ ["me","about","mins"].forEach(k=>{ if(typeof saved[k]==="string") $(k).value=saved[k]; }); }
buildSlots(Array.isArray(saved?.slots) && saved.slots.length===5 ? saved.slots : defaultSlots());
contacts = loadLocal().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
regenerate();
renderTracker();
startAuth();
