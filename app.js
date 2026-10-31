'use strict';
const P=EmpirePlans,C=EmpireCore,R=EmpireRecords,$=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='empire-v1';
function fresh(){return P.fresh();}
function activePlan(){return P.active(data);}
let damagedArchive=null;let data;try{let raw=window.Android?.loadData()||localStorage.getItem(KEY);const parsed=raw?JSON.parse(raw):fresh();EmpireWeigh.validate(parsed.weighing,parsed.profile);data=P.prepare(parsed,validateLegacyBackup);}catch(e){damagedArchive=window.Android?.loadData()||localStorage.getItem(KEY);data=fresh();setTimeout(()=>toast('Archivio non leggibile: importa un backup. Nessun dato è stato sovrascritto.'),300);}
if(data.interfaceRevision!==1525){if(data.pageHelpSeen){delete data.pageHelpSeen.workout;delete data.pageHelpSeen.day;}data.interfaceRevision=1525;}
let route=(data.lastView?.page==='workout'&&data.lastView.planId===data.activePlanId&&data.days.some(d=>d.id===data.lastView.dayId&&d.exercises.some(e=>e.id===data.lastView.exerciseId)))?data.lastView:{page:'home'},stack=route.page==='workout'?[{page:'home'},{page:'plan',planId:data.activePlanId},{page:'day',dayId:route.dayId,sessionId:route.sessionId,planId:data.activePlanId}]:[],selection=new Set(),selectDay=null,search='',editing=false,importPending=null,dragId=null;
function save(){if(damagedArchive){toast('Archivio non leggibile: ripristina un backup.');return false;}const raw=JSON.stringify(data);let saved=false;try{if(window.Android){Android.saveData(raw);saved=true;}}catch(e){console.error(e);}try{localStorage.setItem(KEY,raw);saved=true;}catch(e){if(!saved)console.error(e);}if(!saved)toast('Salvataggio non riuscito. Esporta subito un backup.');return saved;}
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(toast.handle);toast.handle=setTimeout(()=>$('#toast').style.display='none',3200);}
function go(next){window.EmpireKeyboard?.close();stack.push({...route});route={...next,planId:next.page==='home'?undefined:data.activePlanId};data.lastView={...route};save();editing=false;search='';render();window.scrollTo(0,0);}
function back(){if(window.EmpireQr?.close())return true;if(window.EmpireKeyboard?.close())return true;if(weightEditor){closeWeightPad();return true;}if($('#modal').open){if(EmpireWeighUI.finishGuide())return true;$('#modal').close();schedulePageHelp();return true;}if(!stack.length)return false;route=stack.pop();data.lastView={...route};save();editing=false;search='';render();window.scrollTo(0,0);return true;}
window.empireBack=back;
function btn(text,action,attrs='',cls=''){return `<button class="${cls} ${['import','export','history','all-plans','edit-plan','edit-days'].includes(action)?'action-button':''}" data-action="${action}" ${attrs}>${text}</button>`;}
function header(title,sub='',extra=''){return `<header class="head ${route.page==='day'?'day-context':''}">${route.page==='home'?'':btn(uiIcon('back'),'back','aria-label="Indietro"','iconbtn')}<div class="titles">${route.page==='home'?'<div class="brand">EMPIRE</div>':''}${route.page==='day'?'<small class="context-label">GIORNO</small>':''}<h1>${esc(title)}</h1>${sub?`<p class="muted" style="margin:6px 0 0">${esc(sub)}</p>`:''}</div>${tutorialButton()}${extra}</header>`;}
function day(){return data.days.find(d=>d.id===route.dayId);}
function brandHeader(extra=''){return `<header class="empire-header"><div class="empire-logo" aria-hidden="true">E</div><div class="empire-wordmark">EMPIRE<small>TRAINING SYSTEM</small></div>${tutorialButton()}${extra}</header>`;}
// Completion is explicit. A manual date corrects display chronology without rewriting loads.
function sessionProgress(d,s){
 const exercises=d?.exercises||[],total=exercises.length;let done=0,doneSets=0,totalSets=0;
 for(const e of exercises){const sets=e.sets,series=s?.entries?.[e.id]?.series||[];if(!Number.isInteger(sets)||sets<1)continue;totalSets+=sets;const n=series.slice(0,sets).filter(v=>v.done===true).length;doneSets+=n;if(series.length>=sets&&n===sets)done++;}
 return {total,done,totalSets,doneSets,complete:total>0&&done===total};
}
function sessionWasCompleted(p,s){
 if(!s?.closed||s.archiveReason==='exercise-restart')return false;
 if(s.completion)return s.completion.status==='complete'&&s.completion.total>0&&s.completion.done===s.completion.total;
 // Legacy closed sessions count only if every prescribed set was actually checked.
 const d=p?.days.find(d=>d.id===s.dayId),entries=Object.values(s.entries||{});if(!entries.length)return false;
 const targets=s.targets?.length?s.targets:d?.exercises?.length?d.exercises:entries.map(en=>({id:en.exerciseId||en.snapshot?.id,sets:en.snapshot?.sets}));
 return targets.length>0&&targets.every(e=>Number.isInteger(e.sets)&&e.sets>0&&s.entries[e.id]?.series?.length>=e.sets&&s.entries[e.id].series.slice(0,e.sets).every(v=>v.done===true));
}
function planDayActivity(p){
 const byDay=new Map();if(!p)return {byDay,latestDayId:null};
 for(const d of p.days){
  const m=d.manualCompletion,manual=m&&P.validDate(m.date)&&Number.isFinite(Date.parse(m.markedAt));let value=manual?{date:m.date,key:m.date+'|',manual:true}:null;
  for(const session of p.sessions){
   if(session.dayId!==d.id||!sessionWasCompleted(p,session))continue;
   const finished=session.finished||session.started;
   if(manual&&Date.parse(finished)<=Date.parse(m.markedAt))continue;
   const date=P.validDate(session.date)?session.date:localISODate(session.started);if(!P.validDate(date))continue;
   const candidate={date,key:date+'|'+String(finished||''),sessionId:session.id};if(!value||candidate.key>value.key)value=candidate;
  }
  if(value)byDay.set(d.id,value);
 }
 let latest=null;for(const [dayId,value] of byDay)if(!latest||value.key>latest.key)latest={...value,dayId};
 return {byDay,latestDayId:latest?.dayId||null};
}
function localISODate(at){const x=new Date(at);return Number.isFinite(x.getTime())?x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'):'';}
function stampSession(s,d){const progress=sessionProgress(d,s);s.closed=true;s.finished=new Date().toISOString();s.completion={status:progress.complete?'complete':'partial',...progress};s.targets=(d?.exercises||[]).map(e=>({id:e.id,sets:e.sets}));return progress;}
function finishSession(){const d=day(),s=d&&currentSession(d);if(!s)return;if(!sessionProgress(d,s).complete){toast('Completa tutte le serie prima di terminare. I dati già inseriti sono salvati: puoi tornare indietro e riprendere.');return;}stampSession(s,d);save();openPlan(data.activePlanId);toast('Allenamento completato. Tutti i dati sono salvati.');}
function endSessionEarly(){const d=day(),s=d&&currentSession(d);if(!s)return;if(sessionProgress(d,s).complete){finishSession();return;}const progress=sessionProgress(d,s);ask('Termina in anticipo',progress.done+' di '+progress.total+' esercizi completati. Chiudere e conservare le serie parziali nello storico? L’allenamento non sarà segnato come completato.',()=>{if(s.closed)return;stampSession(s,d);cancelTimer();save();openPlan(data.activePlanId);toast('Sessione parziale conservata nello storico.');});}
function sessionFooter(d,s){if(!s)return '';const p=sessionProgress(d,s);return `<section class="session-finish ${p.complete?'is-complete session-finish-top':''}" aria-label="Conclusione allenamento"><div class="session-progress" role="status"><strong>${p.complete?'Tutti gli esercizi completati':p.done+' di '+p.total+' esercizi completati'}</strong><small>${p.doneSets} / ${p.totalSets} serie completate</small></div><div class="session-progress-track" role="progressbar" aria-label="Esercizi completati" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}"><span style="width:${p.total?p.done/p.total*100:0}%"></span></div>${p.complete?btn('✓ Termina allenamento','finish-session','','session-confirm full'):''}</section>`;}
function dayActivityDate(activity,id){const last=activity.byDay.get(id);return last?'Ultimo: '+P.dateIT(last.date):'Mai svolto';}
function dayCard(d,i,activity){const id=esc(d.id),color=dayColor(d,i);return `<section class="day-card ${editing?'is-editing':''}" style="--day-accent:${color}">${btn(`<span class="day-caption">ALLENAMENTO ${String(i+1).padStart(2,'0')}</span><h3 title="${esc(d.name)}">${esc(d.name)}</h3><span class="day-status-slot">${activity.latestDayId===d.id?'<span class="last-day-label">✓ ULTIMO SVOLTO</span>':''}</span>${bodyMap(d.muscles)}<span class="day-card-muscles">${esc(muscleNames(d.muscles))}</span><span class="day-last-date">${esc(dayActivityDate(activity,d.id))}</span><small>${dayBlocks(d).length} ${dayBlocks(d).length===1?'blocco':'blocchi'}</small>`,'day',`data-id="${id}" data-plan="${esc(data.activePlanId)}" data-hold-action="day-overview" aria-label="Apri ${esc(d.name)}. Tieni premuto per il riepilogo."`,'day-card-open')}${editing?`<div class="day-card-order">${btn('↑','move-day-up',`data-id="${id}" aria-label="Sposta prima ${esc(d.name)}" ${i===0?'disabled':''}`)}${btn('↓','move-day-down',`data-id="${id}" aria-label="Sposta dopo ${esc(d.name)}" ${i===data.days.length-1?'disabled':''}`)}</div><div class="day-card-actions">${btn(uiIcon('edit')+'<span>Modifica</span>','day',`data-id="${id}" aria-label="Modifica ${esc(d.name)}"`)}${btn('<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M6 16H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg><span>Duplica</span>','duplicate-day',`data-id="${id}" aria-label="Duplica ${esc(d.name)}"`)}${btn('<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7"/></svg><span>Elimina</span>','delete-day',`data-id="${id}" aria-label="Elimina ${esc(d.name)}"`,'danger')}</div>`:''}</section>`;}
function planHome(){const activity=planDayActivity(activePlan());return brandHeader(btn(uiIcon('settings'),'settings','aria-label="Impostazioni"','iconbtn'))+planContext()+resumeBanner()+`<div class="toolbar page-commands">${empireTile(empireSpecificIcon('history'),'Storico','history')}${empireTile(empireSpecificIcon('share'),'Condividi<br>scheda','share-plan')}</div>${editing?`<section class="preparation-banner"><strong>Stai preparando la scheda</strong><p>Aggiungi e organizza i giorni, poi conferma.</p><div class="toolbar preparation-actions">${btn(uiIcon('edit')+'<span>Modifica nome e date</span>','plan-metadata','','primary')}${btn(uiIcon('check')+'<span>Conferma scheda</span>','confirm-plan','','primary')}</div></section>`:''}<h2 class="section-label">I TUOI GIORNI</h2><p class="home-day-hint">Tocca per aprire il giorno. Tieni premuto per vedere il riepilogo.</p><div class="grid">${data.days.map((d,i)=>dayCard(d,i,activity)).join('')}${editing?btn('<span class="plus">+</span><h3>Aggiungi giorno</h3>','new-day','','tile add full empire-add-day'):''}</div><p class="version">EMPIRE 1.5.26 · ${data.days.length} giorni · ${CATALOG.length} esercizi nel catalogo</p>`;}
function planPeriod(p){return p.startDate&&p.endDate?P.dateIT(p.startDate)+' — '+P.dateIT(p.endDate):p.startDate?'Dal '+P.dateIT(p.startDate)+' · Senza data di fine':'Date da impostare';}
function planContext(){const p=activePlan();return p?`<section class="plan-context"><div class="row between">${btn(uiIcon('back'),'all-plans','aria-label="Tutte le schede"','plan-back')}<div class="plan-title-block"><small>SCHEDA</small><h1>${esc(p.name)}</h1></div></div><p>${esc(planPeriod(p))}</p>${p.preparing?'':empireTile(uiIcon('edit'),'Modifica<br>scheda','edit-plan',`data-id="${p.id}"`)}</section>`:'';}
function planOverview(p){return `<details class="plan-overview"><summary>Panoramica scheda</summary>${p.days.map(d=>`<section><h3>${esc(d.name)}</h3>${d.exercises.length?`<table><thead><tr><th>Esercizio</th><th>Serie</th><th>Rip.</th><th>Rec.</th></tr></thead><tbody>${d.exercises.map(e=>`<tr><th scope="row">${esc(e.name)}${e.pairId?'<small>Superset</small>':''}</th><td>${esc(e.sets??'—')}</td><td>${esc(e.reps||'—')}</td><td>${e.rest==null?'—':formatTime(e.rest)}</td></tr>`).join('')}</tbody></table>`:'<p>Nessun esercizio inserito.</p>'}</section>`).join('')||'<p>Aggiungi un giorno per vedere gli esercizi.</p>'}</details>`;}
const HOME_COLLAPSE_KEY='empire-home-collapsed-v1';
function readCollapsedPlans(){try{const ids=JSON.parse(localStorage.getItem(HOME_COLLAPSE_KEY)||'[]');return new Set(Array.isArray(ids)?ids.filter(x=>typeof x==='string'):[]);}catch{return new Set();}}
const collapsedPlans=readCollapsedPlans();
function togglePlanCard(id){if(!data.plans.some(p=>p.id===id))return;if(collapsedPlans.has(id))collapsedPlans.delete(id);else collapsedPlans.add(id);try{localStorage.setItem(HOME_COLLAPSE_KEY,JSON.stringify([...collapsedPlans]));}catch{}render();}
function homePlanCard(p){const activity=planDayActivity(p),collapsed=collapsedPlans.has(p.id),count=p.sessions.filter(s=>recordedEntries(s).length).length,id=esc(p.id);
 return `<section data-plan-card="${id}" class="panel plan-card home-plan ${collapsed?'is-collapsed':''}"><div class="home-plan-head"><div class="home-plan-title"><h2>${esc(p.name)}</h2>${collapsed?'':`<p>${esc(planPeriod(p))}</p><p>${p.days.length} ${p.days.length===1?'giorno':'giorni'} · ${count} ${count===1?'allenamento':'allenamenti'}</p>`}</div><div class="home-plan-arrows">${btn('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(collapsed?'M6 9l6 6 6-6':'M6 15l6-6 6 6')+'"/></svg>','toggle-plan',`data-id="${id}" aria-label="${collapsed?'Espandi':'Riduci'} ${esc(p.name)}" aria-expanded="${!collapsed}"`,'home-plan-arrow')}${btn('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>','open-plan',`data-id="${id}" aria-label="Apri scheda ${esc(p.name)}"`,'home-plan-arrow')}</div></div>${collapsed?'':`<div class="home-plan-content" id="home-plan-${id}"><div class="home-day-grid">${p.days.map((d,i)=>btn(`<span class="home-day-name">${esc(d.name)}${activity.latestDayId===d.id?'<span class="home-last-check" role="img" aria-label="Ultimo giorno svolto">✓</span>':''}</span><span class="home-day-muscles">${esc(muscleNames(d.muscles))}</span><span class="home-day-count">${d.exercises.length} ${d.exercises.length===1?'esercizio':'esercizi'}</span>`,'open-home-day',`data-hold-action="day-overview" data-id="${esc(d.id)}" data-plan="${id}" style="--day-accent:${dayColor(d,i)}" aria-label="Apri ${esc(d.name)}. Tieni premuto per il riepilogo."`,'home-day')).join('')}</div>${p.days.length?'<p class="home-day-hint">Tocca per allenarti. Tieni premuto per vedere il riepilogo.</p>':'<p class="home-day-hint">Apri la scheda per aggiungere i giorni.</p>'}</div>`}</section>`;
}
function dayOverviewTable(d){return d.exercises.length?`<table class="day-overview-table"><colgroup><col style="width:46%"><col style="width:15%"><col style="width:20%"><col style="width:19%"></colgroup><thead><tr><th scope="col">Esercizio</th><th scope="col">Serie</th><th scope="col"><abbr title="Ripetizioni">Rip.</abbr></th><th scope="col"><abbr title="Recupero in minuti e secondi">Rec.</abbr></th></tr></thead><tbody>${dayBlocks(d).map(block=>block.map(e=>`<tr><th scope="row">${esc(e.name)}${block.length===2?'<small>Superset</small>':''}</th><td>${esc(e.sets??'—')}</td><td>${esc(e.reps||'—')}</td><td>${e.rest==null?'—':formatTime(block.length===2?Math.max(...block.map(x=>x.rest||0)):e.rest)}</td></tr>`).join('')).join('')}</tbody></table>`:'<p>Nessun esercizio inserito in questo giorno.</p>';}
function showDayOverview(planId,dayId){const p=data.plans.find(p=>p.id===planId),d=p?.days.find(d=>d.id===dayId);if(!d)return;const modal=$('#modal');modal.innerHTML=`<section class="day-overview"><div class="day-overview-head"><p>${esc(p.name)}</p><h2>${esc(d.name)}</h2></div>${dayOverviewTable(d)}<div class="actions">${btn('Chiudi','close-modal','type="button"','primary')}</div></section>`;if(!modal.open)modal.showModal();}
function empireTile(iconMarkup,label,action,attrs=''){return btn('<span class="empire-tile-icon">'+iconMarkup+'</span><span class="empire-tile-label">'+label+'</span>',action,attrs,'empire-app-tile');}
function empireSpecificIcon(kind){const shapes={history:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2M4 4v5h5"/>',share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.3 10.8 7.4-4.6m-7.4 8 7.4 3.6"/>'};return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[kind]||'')+'</svg>';}
function home(){const count=EmpireOnlineUI.count();return brandHeader(btn(uiIcon('edit'),'profile','aria-label="Profilo utente"','iconbtn')+btn(uiIcon('settings'),'settings','aria-label="Impostazioni"','iconbtn'))+`<div class="empire-tile-grid"><div class="empire-tile-row empire-tile-three">${empireTile('<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9a5 5 0 0 1 10 0"/><path d="M12 9l2.8-2"/><path d="M7 16h10"/></svg>','Pesati','weigh-open')}${empireTile(uiIcon('edit'), 'Crea<br>scheda','new-plan')}${empireTile(EmpireOnlineUI.qrIcon(),'Ricevi<br>schede'+(count?'<span class="inbox-count">'+count+'</span>':''),'online-inbox')}</div><div class="empire-tile-row empire-tile-two">${empireTile('↑','Importa<br>Excel','import')}${empireTile('↓','Esporta<br>Excel','export',!data.plans.length?'disabled':'')}</div></div><h2 class="section-label">LE TUE SCHEDE</h2><div class="plan-list">${data.plans.map(homePlanCard).join('')||'<p class="empty">Crea una scheda, poi aggiungi i giorni e gli esercizi.</p>'}</div><p class="version">EMPIRE 1.5.26 · ${data.plans.length} schede indipendenti</p>`;}


function deletePlan(id){
 const p=data.plans.find(p=>p.id===id);if(!p)return;
 ask('Elimina scheda',`Eliminare definitivamente “${p.name}”, tutti i suoi giorni, carichi e allenamenti? Le altre schede resteranno intatte.`,()=>{
  if(data.timer?.planId===id)cancelTimer();
  data.plans=data.plans.filter(p=>p.id!==id);
  if(data.activePlanId===id)data.activePlanId=null;
  route={page:'home'};stack=[];selection.clear();selectDay=null;importPending=null;data.lastView={...route};save();render();
 });
}

function openPlan(id){
 const p=data.plans.find(p=>p.id===id);if(!p){toast('Scheda non trovata.');return;}
 data.activePlanId=id;route={page:'plan',planId:id};stack=[{page:'home'}];editing=false;selection.clear();selectDay=null;importPending=null;search='';data.lastView={...route};save();render();window.scrollTo(0,0);
}
function allPlans(){route={page:'home'};stack=[];editing=false;selection.clear();selectDay=null;importPending=null;data.lastView={...route};save();render();window.scrollTo(0,0);}
function editPlan(id){const p=data.plans.find(p=>p.id===id);showModal(p?'Nome e date della scheda':'Crea scheda',`<label>Nome della scheda<input name="plan-name" value="${esc(p?.name||'')}" required maxlength="80" placeholder="Es. Massa autunno"></label><div class="formgrid">${dateField('plan-start','Data di inizio',p?.startDate||localDate())}${dateField('plan-end','Data di fine',p?.endDate||'')}</div><div id="date-calendar" class="date-calendar" hidden></div><p class="footnote">Nome e date sono sempre modificabili. I carichi e lo storico restano associati a questa scheda.</p>`,f=>{const meta={name:f.get('plan-name'),startDate:P.dateToISO(f.get('plan-start')),endDate:String(f.get('plan-end')||'').trim()?P.dateToISO(f.get('plan-end')):''};if(p){P.update(data,p.id,meta);save();render();}else{const created=P.create(data,meta,TECH_HELP);created.preparing=true;openPlan(created.id);}});}
function openHomeDay(planId,dayId){const p=data.plans.find(p=>p.id===planId);if(!p?.days.some(d=>d.id===dayId)){toast('Giorno non disponibile.');return;}openPlan(planId);openDay(dayId);}
function openDay(id){const target=data.days.find(d=>d.id===id);if(target&&activePlan()?.preparing)target.preparing=true;save();go({page:'day',dayId:id});}
function currentSession(d,create=false){const today=localDate();let s=data.sessions.find(s=>s.id===route.sessionId&&s.dayId===d.id&&!s.closed)||[...data.sessions].reverse().find(s=>s.dayId===d.id&&s.date===today&&!s.closed);if(!s&&create){s={id:C.uid(),dayId:d.id,dayName:d.name,date:today,started:new Date().toISOString(),closed:false,entries:{},targets:d.exercises.map(e=>({id:e.id,sets:e.sets}))};data.sessions.push(s);}return s;}
function localDate(){const x=new Date();return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
function dateLabel(x,full=false){return new Date(x).toLocaleDateString('it-IT',full?{day:'2-digit',month:'short',year:'numeric'}:{day:'2-digit',month:'short'});}
function valid(e){return Number.isInteger(e.sets)&&e.sets>0&&e.sets<=30&&e.reps&&e.rest!==null&&Number.isFinite(e.rest)&&e.rest>=0&&e.rest<=3600;}
function techniqueLabel(e){const line=e.notes?.split('\n')[0]||'';return line.length<65&&C.norm(line).startsWith(C.norm(e.technique))?line:e.technique;}
function manualDayControls(d){const m=d.manualCompletion;return `<section class="day-completion" style="--day-accent:${dayColor(d,data.days.indexOf(d))}">${m?`<p class="manual-day-date">✓ Segnato manualmente: ${P.dateIT(m.date)}</p><div class="manual-day-buttons">${btn('Modifica data','mark-day-done','','primary')}${btn('Annulla marcatura','unmark-day-done','','primary')}</div>`:btn('Segna come svolto','mark-day-done','','completion-outline full')}</section>`;}
function markDayDone(){
 const p=activePlan(),d=day();if(!p||!d)return;
 showModal('Segna come svolto',`<p>${esc(d.name)}</p>${dateField('manual-date','Data',d.manualCompletion?.date||localDate())}<div id="date-calendar" class="date-calendar" hidden></div><p class="footnote">Aggiorna data e contrassegni senza registrare serie o carichi. Puoi annullare la marcatura.</p>`,f=>{
  if(activePlan()?.id!==p.id||!p.days.includes(d))throw Error('Riapri il giorno nella scheda corretta.');
  const date=P.dateToISO(f.get('manual-date'));if(!date)throw Error('Scegli una data valida.');if(date>localDate())throw Error('La data non può essere futura.');
  d.manualCompletion={date,markedAt:new Date().toISOString()};save();render();toast('Giorno segnato come svolto.');
 },'Segna come svolto');
}
function unmarkDayDone(){const d=day();if(!d?.manualCompletion)return;delete d.manualCompletion;save();render();toast('Marcatura manuale annullata.');}
function dayView(){const d=day();if(!d)return '<p>Giorno non disponibile.</p>';const s=currentSession(d);return `<div class="${editing?'day-preparing':s&&!sessionProgress(d,s).complete?'day-with-session':''}">`+header(d.name,muscleNames(d.muscles),'')+`${editing?`<section class="preparation-banner"><strong>Stai preparando il giorno</strong><p>Aggiungi gli esercizi, poi conferma.</p><div class="day-preparation-actions">${btn(uiIcon('check')+'<span>Conferma giorno</span>','confirm-day','','primary full')}${btn(uiIcon('edit')+'<span>Nome e gruppi muscolari</span>','day-metadata','','primary full')}</div></section>`:s&&sessionProgress(d,s).complete?sessionFooter(d,s):manualDayControls(d)}<div class="row between"><small>${s?'Sessione in corso · '+dateLabel(s.started,true):'Pronto per allenarti'}</small></div><div id="exercise-list">${dayBlocks(d).map((block,i)=>{const e=block[0],partner=block[1],entry=s?.entries[e.id],done=entry?.series.filter(x=>x.done).length||0;return `<div draggable="${editing}" data-drag="${e.id}" class="exercise-block ${partner?'superset-block':''}">${btn(`<span class="num">${i+1}</span>${exerciseVisual(e)}<span class="text">${partner?'<span class="badge">SUPERSET · UNICO BLOCCO</span>':''}<h3>${esc(e.name)}</h3><p>${e.sets||'—'} serie · ${esc(e.reps||'—')} rip${!partner?' · '+(e.rest===null?'—':formatTime(e.rest))+' rec':''}</p>${partner?`<h3 class="paired-name">+ ${esc(partner.name)}</h3><p>${partner.sets||'—'} serie · ${esc(partner.reps||'—')} rip · Recupero coppia ${formatTime(Math.max(e.rest||0,partner.rest||0))}</p>`:e.technique!=='Normale'?`<span class="badge">${esc(techniqueLabel(e))}</span>`:''}${done?` <small class="success">${done}/${e.sets} completate</small>`:''}${blockRecordBadge(s,block)}${!valid(e)||partner&&!valid(partner)?' <span class="badge">Da configurare</span>':''}</span><span>›</span>`,'exercise',`data-id="${e.id}"`,'exercise '+(s&&block.some(item=>recordFor(s,item.id))?'is-record':''))}${editing?`<div class="editrow">${btn('↑','move-up',`data-id="${e.id}" aria-label="Sposta su"`)}${btn('↓','move-down',`data-id="${e.id}" aria-label="Sposta giù"`)}${btn('Configura','edit-exercise',`data-id="${e.id}"`)}${btn('Elimina','delete-exercise',`data-id="${e.id}"`,'danger')}</div>`:''}</div>`;}).join('')}</div>${!d.exercises.length?(editing?btn('<span class="plus">+</span><h3>Aggiungi esercizio</h3>','choose-muscles','','tile add empire-add-exercise'): '<p class="empty">Aggiungi gli esercizi di questo giorno.</p>'):''}${editing&&d.exercises.length?'<div class="day-add-footer">'+btn('+ Aggiungi esercizio','choose-muscles','','primary full')+'</div>':''}${!editing&&s&&!sessionProgress(d,s).complete?sessionFooter(d,s):''}</div>`;}
function muscleView(){const d=data.days.find(x=>x.id===selectDay);return header('Aggiungi esercizi',d?.name||'')+`<div class="grid">${DISPLAY_MUSCLES.filter(([id])=>muscleGroups(d?.muscles).includes(id)).map(([id,name])=>btn(`${bodyMap([id])}<h3>${name}</h3>`,'catalog',`data-id="${id}"`,'tile')).join('')}</div><div class="sticky row between"><span><strong>${selection.size}</strong> aggiunti</span>${btn('Torna al giorno','commit-selection','','primary')}</div>`;}
function catalogItems(){const d=data.days.find(x=>x.id===selectDay);return [...CATALOG,...data.custom].filter(e=>muscleGroup(e.muscle)===muscleGroup(route.muscle)&&!selection.has(e.id)&&!d?.exercises.some(x=>x.catalogId===e.id)&&C.norm(e.name).includes(C.norm(search)));}
function catalogResults(){return catalogItems().map(e=>btn(`${exerciseVisual(e)}<span class="text"><h3>${esc(e.name)}</h3></span><span class="orange">＋</span>`,'select-exercise',`data-id="${e.id}"`,'exercise')).join('')||'<div class="empty">Nessun altro esercizio in questo gruppo.</div>';}
function refreshCatalog(){if($('#catalog-results'))$('#catalog-results').innerHTML=catalogResults();const clear=$('[data-action="clear-search"]');if(clear)clear.hidden=!search;}
function clearSearch(){search='';window.EmpireKeyboard?.close();const input=$('#search');if(input){input.value='';input.blur();}refreshCatalog();}
function catalogView(){return header(MUSCLES.find(m=>m[0]===route.muscle)?.[1]||'Esercizi','Tocca per aggiungere · Scorri a destra per tornare')+`<div class="searchbox"><input class="catalogsearch" id="search" placeholder="Cerca esercizio…" value="${esc(search)}" aria-label="Cerca esercizio">${btn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>','clear-search' ,`aria-label="Cancella ricerca" ${search?'':'hidden'}`,'search-clear')}</div><div id="catalog-results">${catalogResults()}</div>${btn('+ Crea esercizio personalizzato','custom-exercise','','outline full')}<div class="sticky catalog-footer"><span class="selection-count">${selection.size} aggiunti</span><div class="catalog-buttons">${btn('Esercizi selezionati','review-selection','','primary')}${btn('← Torna ai gruppi','selection-groups','','primary')}${btn('OK','commit-selection','','primary')}</div></div>`;}
function recordFor(s,id){return s?R.progress(activePlan(),s.dayId,id).records.get(s.id):null;}
function recordBadge(s,id,name=''){const record=recordFor(s,id);return record?`<span class="record-badge">🏆 Nuovo record${name?' · '+esc(name):''} · ${esc(String(record.load).replace('.',','))} kg</span>`:'';}
function blockRecordBadge(s,block){return block.map(e=>recordBadge(s,e.id,block.length>1?e.name:'')).join('');}
function updateRecordIndicators(){const s=currentSession(day());if(!s)return;document.querySelectorAll('[data-record-entry]').forEach(card=>{const id=card.dataset.recordEntry;card.classList.toggle('is-record',!!recordFor(s,id));const badge=card.querySelector('[data-record-status]');if(badge)badge.innerHTML=recordBadge(s,id);});}
function getEntry(s,e){if(!s.entries[e.id])s.entries[e.id]={exerciseId:e.id,snapshot:JSON.parse(JSON.stringify(e)),startedAt:new Date().toISOString(),series:Array.from({length:e.sets},()=>({load:'',reps:'',done:false,steps:[]}))};return s.entries[e.id];}
function workout(){const d=day(),e=d?.exercises.find(x=>x.id===route.exerciseId);if(!e)return '<p>Esercizio non disponibile.</p>';if(!valid(e)){setTimeout(()=>editExercise(e.id),0);return header(e.name)+'<div class="empty">Completa le impostazioni per allenarti.</div>';}
 const s=currentSession(d,true),en=getEntry(s,e),partner=e.pairId?d.exercises.find(x=>x.id===e.pairId):null;save();const remaining=en.series.filter(x=>!x.done).length;const completed=remaining===0&&(!partner||getEntry(s,partner).series.every(x=>x.done));const recovering=completed&&data.timer?.planId===data.activePlanId&&[e.id,e.pairId].includes(data.timer.exerciseId)&&(data.timer.running||data.timer.paused);let html=header(partner?e.name+' + '+partner.name:e.name,'',btn(uiIcon('edit'),'edit-exercise',`data-id="${e.id}" aria-label="Modifica esercizio"`,'iconbtn orange'))+`<div class="stats"><div class="stat"><small>SERIE</small><strong>${e.sets}</strong></div><div class="stat"><small>${/sec|second|min/.test(C.norm(e.reps))?'DURATA':'RIPETIZIONI'}</small><strong class="${String(e.reps).length>7?'long-value':''}">${esc(e.reps)}</strong></div></div><div class="center">${btn(esc(techniqueLabel(e))+(e.notes?' · Dettagli':''),'tech-info',`data-id="${e.id}"`,'outline compact')}</div>${partner?`<div class="panel"><span class="badge">SUPERSET</span><p style="margin-bottom:0">${esc(e.name)} + ${esc(partner.name)}</p><small>${esc(e.reps)} rip + ${esc(partner.reps)} rip · ${e.sets} giri. Premi Play dopo entrambi. Recupero: ${formatTime(Math.max(e.rest,partner.rest||0))}.</small></div>`:''}<div class="timer" id="timer-ring"><div class="timerinside"><small>RECUPERO</small><div class="clock" id="clock">${formatTime(Math.max(e.rest,partner?.rest||0))}</div>${btn('▶ Play','play','','primary')}<small id="timer-status"></small></div></div><div class="center"><span class="orange">${uiIcon('bell')}</span> <small>${data.settings.sound||data.settings.vibration?'Avviso a 20 secondi e a fine recupero':'Avvisi disattivati'}</small><div class="timer-controls">${btn('Pausa','pause','','compact')}${btn('Reimposta timer','reset-timer','','compact')}</div>${completed?btn('<span>✓ Completato</span><span>Torna agli esercizi ›</span>','finish-exercise','','exercise-completed'):'<div class="remaining">Serie rimanenti: <strong>'+remaining+' / '+e.sets+'</strong></div>'}</div>${seriesTable(en,e,s)}${partner?seriesTable(getEntry(s,partner),partner,s):''}<div class="sessionbar">${btn('Nuova sessione','new-session','','outline')}${btn('Ricomincia esercizio','restart-exercise',`data-id="${e.id}"`)}</div>${historyTable(e)}${partner?historyTable(partner):''}<details class="workout-help"><summary>Come registrare le serie</summary><p class="footnote">I carichi si salvano automaticamente. Puoi lasciare un carico vuoto per esercizi a corpo libero. Il carico è quello che scegli di registrare: mantieni la stessa convenzione (per manubrio o totale).</p></details>`;return html;}
// Weight editing stays in the current session; proposals become actual loads only on edit.
let weightEditor=null;
function weightControl(value,entry,series,step,label){
 const increment=exerciseWeightStep(day()?.exercises.find(e=>e.id===entry));
 const attrs=`data-entry="${esc(entry)}" data-series="${series}"${step===undefined?'':` data-step="${step}"`}`;
 return `<div class="weight-control"><input type="text" inputmode="none" readonly placeholder="—" value="${esc(String(value??'').replace('.',','))}" data-field="load" ${attrs} data-action="edit-weight" aria-label="${esc(label)}" aria-controls="weight-pad" aria-expanded="false"><div class="weight-arrows">${btn('↑','weight-up',`${attrs} aria-label="Aumenta di ${String(increment).replace('.',',')} kg · ${esc(label)}"`)}${btn('↓','weight-down',`${attrs} aria-label="Diminuisci di ${String(increment).replace('.',',')} kg · ${esc(label)}"`)}</div></div>`;
}
function exerciseWeightStep(e){const n=e?.weightStep;return Number.isFinite(n)&&n>0&&n<=1000?n:e?.equipment==='dumbbell'?2:['barbell','machine','cable'].includes(e?.equipment)?5:2;}
function adjustWeightStep(el,direction){const input=loadInput(el),e=day()?.exercises.find(e=>e.id===input?.dataset.entry);if(input)adjustWeight(input,direction*exerciseWeightStep(e));}
function editWeightStep(id){const e=day()?.exercises.find(e=>e.id===id);if(!e)return;showModal('Passo peso',`<p>${esc(e.name)}</p><div class="weight-step-presets">${[2,2.5,5].map(n=>btn(String(n).replace('.',',')+' kg','weight-step-preset',`type="button" data-value="${n}"`,'outline')).join('')}</div><label>Incremento delle frecce, in kg<input name="weight-step" type="text" inputmode="decimal" value="${String(exerciseWeightStep(e)).replace('.',',')}" required></label><p class="footnote">Vale solo per questo esercizio. Se registri il totale del bilanciere, 2,5 kg per lato corrispondono a un incremento di 5 kg. Il tastierino resta sempre disponibile.</p>`,f=>{const n=Number(String(f.get('weight-step')).trim().replace(',','.'));if(!Number.isFinite(n)||n<.001||n>1000)throw Error('Inserisci un passo tra 0,001 e 1000 kg.');e.weightStep=Math.round(n*1e6)/1e6;save();render();},'Salva passo');}
function loadInput(el){return el.matches?.('input[data-field="load"]')?el:el.closest('.weight-control')?.querySelector('input');}
function storeWeight(input,value){
 const en=currentSession(day())?.entries[input.dataset.entry];let series=en?.series[+input.dataset.series];if(!series)return;
 if(input.dataset.step!==undefined)series=series.steps[+input.dataset.step];if(!series)return;
 const normalized=String(value).replace(',','.');const weight=R.weight(normalized);if(normalized!==''&&weight===null)return;
 series.load=normalized===''?'':String(weight);if(input.dataset.step===undefined)series.loadTouched=true;
 input.value=String(value).replace('.',',');save();updateRecordIndicators();
}
function closeWeightPad(){
 if(!weightEditor)return;const input=weightEditor.input;weightEditor=null;
 input.setAttribute('aria-expanded','false');const value=R.weight(input.value);input.value=value===null?'':String(value).replace('.',',');
 const pad=$('#weight-pad');pad.hidden=true;pad.innerHTML='';document.body.classList.remove('weight-pad-open');document.documentElement.style.removeProperty('--weight-pad-height');
}
function keepWeightVisible(){
 if(!weightEditor)return;const pad=$('#weight-pad'),input=weightEditor.input;
 document.documentElement.style.setProperty('--weight-pad-height',pad.getBoundingClientRect().height+'px');
 const box=input.getBoundingClientRect(),limit=pad.getBoundingClientRect().top-12;
 if(box.bottom>limit)window.scrollBy({top:box.bottom-limit,behavior:'auto'});else if(box.top<12)window.scrollBy({top:box.top-12,behavior:'auto'});
}
function openWeightPad(el){
 const input=loadInput(el);if(!input)return;window.EmpireKeyboard?.close();if(weightEditor?.input===input)return;closeWeightPad();
 weightEditor={input,draft:input.value.replace('.',','),replace:true};input.setAttribute('aria-expanded','true');
 const pad=$('#weight-pad'),exercise=day()?.exercises.find(e=>e.id===input.dataset.entry);
 pad.innerHTML=`<div class="weight-pad-head"><div><small>${esc(exercise?.name||'Carico')} · serie ${+input.dataset.series+1}${input.dataset.step===undefined?'':' · blocco '+(+input.dataset.step+1)}</small><div><output id="weight-value" aria-live="polite">${esc(weightEditor.draft||'—')}</output> <span>kg</span></div></div>${btn('Fatto','weight-done','','primary')}</div><div class="weight-keys">${['1','2','3','4','5','6','7','8','9',',','0','⌫'].map(key=>btn(key,'weight-key',`data-key="${key}" aria-label="${key==='⌫'?'Cancella ultima cifra':key===','?'Virgola':key}"`)).join('')}</div>`;
 pad.hidden=false;document.body.classList.add('weight-pad-open');requestAnimationFrame(keepWeightVisible);
}
function weightKey(key){
 if(!weightEditor)return;const edit=weightEditor;let value=edit.draft;
 if(key==='⌫')value=edit.replace?'':value.slice(0,-1);
 else if(key===','){if(edit.replace)value='';if(value.includes(','))return;value=(value||'0')+',';}
 else if(/^\d$/.test(key)){if(edit.replace)value='';value=value==='0'?key:value+key;}
 else return;
 if(!/^\d{0,9}(,\d{0,6})?$/.test(value))return;
 edit.replace=false;edit.draft=value;storeWeight(edit.input,value);$('#weight-value').textContent=value||'—';
}
function adjustWeight(el,delta){
 const input=loadInput(el);if(!input)return;const value=Math.max(0,Math.round(((R.weight(input.value)??0)+delta)*1e6)/1e6);
 storeWeight(input,String(value));if(weightEditor?.input===input){weightEditor.draft=input.value;weightEditor.replace=true;$('#weight-value').textContent=input.value;}input.classList.add('weight-updated');setTimeout(()=>input.classList.remove('weight-updated'),180);
}
function finishExercise(){
 const d=day();if(!d)return;const e=d.exercises.find(e=>e.id===route.exerciseId),s=currentSession(d);if(!e||!s)return;
 const ids=[e.id,...(e.pairId?[e.pairId]:[])];if(ids.some(id=>!s.entries[id]?.series.length||!s.entries[id].series.every(v=>v.done)))return;
 // Replace this workout in navigation, keeping the day and the live session intact.
 // La navigazione non modifica mai il recupero attivo.
 if(data.timer?.planId===data.activePlanId&&ids.includes(data.timer.exerciseId))data.timer.returnToDay=false;
 if(sessionProgress(d,s).complete&&!s.closed)stampSession(s,d);
 const target={page:'day',planId:data.activePlanId,dayId:d.id,sessionId:s.id};
 const previous=stack[stack.length-1];if(previous?.page==='day'&&previous.dayId===d.id)stack.pop();
 route=target;data.lastView={...route};editing=false;save();render();window.scrollTo(0,0);
}
document.addEventListener('keydown',ev=>{
 const field=ev.target.closest?.('input[data-field="load"][readonly]');
 if(!weightEditor&&field&&['Enter',' '].includes(ev.key)){ev.preventDefault();openWeightPad(field);return;}
 if(!weightEditor)return;
 if(/^\d$/.test(ev.key)||ev.key===','||ev.key==='.'){ev.preventDefault();weightKey(ev.key==='.'?',':ev.key);}
 else if(ev.key==='Backspace'){ev.preventDefault();weightKey('⌫');}
 else if(ev.key==='Enter'||ev.key==='Escape'){ev.preventDefault();closeWeightPad();}
 else if(field&&['ArrowUp','ArrowDown'].includes(ev.key)){ev.preventDefault();adjustWeightStep(field,ev.key==='ArrowUp'?1:-1);}
});
window.addEventListener?.('resize',()=>{if(weightEditor)requestAnimationFrame(keepWeightVisible);});

function seriesTable(en,e,s){return `<section class="panel series-card ${recordFor(s,e.id)?'is-record':''}" data-record-entry="${e.id}"><div class="row between"><h2>${esc(e.name)}</h2><small>${dateLabel(s.started,true)}</small></div><div class="weight-step-row">${btn('Passo peso: ±'+String(exerciseWeightStep(e)).replace('.',',')+' kg','weight-step',`data-id="${esc(e.id)}"`,'weight-step-button')}</div><div data-record-status="${e.id}" aria-live="polite">${recordBadge(s,e.id)}</div><div class="table-scroll"><table><thead><tr><th>Serie</th><th>${/sec|second|min/.test(C.norm(e.reps))?'Durata':'Rip.'}</th><th>Carico kg</th><th>Fatta</th></tr></thead><tbody>${en.series.map((v,i)=>`<tr><td>${i+1}</td><td><input type="text" inputmode="decimal" placeholder="${esc(e.reps)}" value="${esc(v.reps)}" data-field="reps" data-entry="${e.id}" data-series="${i}" aria-label="${e.id===route.exerciseId?'Ripetizioni':'Ripetizioni '+esc(e.name)} serie ${i+1}"></td><td>${weightControl(v.load!==''&&v.load!==undefined?v.load:(R.suggestion(activePlan(),s,e.id,i)??''),e.id,i,undefined,(e.id===route.exerciseId?'Carico':'Carico '+e.name)+' serie '+(i+1))}${i>0&&R.suggestion(activePlan(),s,e.id,i)!==null?'<small class="load-proposal">Peso precedente proposto</small>':''}</td><td>${btn(v.done?uiIcon('check'):'','toggle-series',`data-entry="${e.id}" data-series="${i}" aria-label="Segna ${e.id===route.exerciseId?'':esc(e.name)+' '}serie ${i+1}"`,'check '+(v.done?'done':''))}</td></tr>${/drop|rest pause/i.test(e.technique)&&(!/ultima serie/i.test(e.notes)||i===e.sets-1)?`<tr class="subrow"><td colspan="4"><details><summary>Dettagli ${esc(e.technique)} · serie ${i+1}</summary>${v.steps.map((t,j)=>`<div class="row">${weightControl(t.load,e.id,i,j,'Carico blocco '+(j+1))}<input placeholder="rip." value="${esc(t.reps)}" data-field="reps" data-entry="${e.id}" data-series="${i}" data-step="${j}" aria-label="Ripetizioni blocco ${j+1}">${btn('×','remove-step',`data-entry="${e.id}" data-series="${i}" data-step="${j}" aria-label="Elimina blocco"`,'compact')}</div>`).join('')}${btn('+ Blocco','add-step',`data-entry="${e.id}" data-series="${i}"`,'compact')}${/rest pause/i.test(e.technique)?' '+btn('Pausa interna','internal-pause',`data-entry="${e.id}"`,'compact'):''}</details></td></tr>`:''}`).join('')}</tbody></table></div></section>`;}
function historyTable(e){const all=data.sessions.filter(s=>s.entries[e.id]?.series.some(C.hasSeriesData)).sort((a,b)=>b.started.localeCompare(a.started));const cutoff=Date.now()-21*86400000;const recent=all.filter(s=>new Date(s.started).getTime()>=cutoff);function table(list){return `<div class="table-scroll"><table class="history"><thead><tr><th>Data</th>${Array.from({length:Math.max(e.sets,...list.map(s=>s.entries[e.id].series.length))},(_,i)=>`<th>S${i+1}</th>`).join('')}</tr></thead><tbody>${list.map(s=>`<tr><td>${dateLabel(s.started,true)}${recordBadge(s,e.id)}${all.filter(x=>x.date===s.date).length>1?' '+new Date(s.started).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):''}</td>${s.entries[e.id].series.map(v=>`<td title="${esc((v.reps||'—')+' ripetizioni')}">${v.load!==''?esc(v.load):'—'}${v.steps?.length?' + '+v.steps.map(t=>esc(t.load||'—')).join(' + '):''}${v.done?'':' *'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}return `<section class="panel history-card"><h2>Storico · ${esc(e.name)}</h2><p class="footnote">Ultime 3 settimane</p><small>Carichi in kg · * serie non completata</small>${recent.length?table(recent):'<p class="muted">Nessun carico registrato nelle ultime tre settimane.</p>'}<details><summary style="padding:15px 0;color:#ff8a30;cursor:pointer">Mostra tutto lo storico (${all.length} sessioni)</summary>${table(all)}</details></section>`;}
function recordedEntries(s){return Object.values(s.entries).filter(en=>en.series.some(C.hasSeriesData));}
function resumeProblem(s){
 if(!s||s.closed)return 'Sessione archiviata.';
 const d=data.days.find(d=>d.id===s.dayId);
 if(!d)return 'Giornata rimossa: i dati restano consultabili qui e nel backup.';
 if(!recordedEntries(s).length)return 'Nessuna serie registrata.';
 for(const en of Object.values(s.entries)){
  const e=d.exercises.find(e=>e.id===en.exerciseId);
  if(!e||!valid(e)||en.series.length!==e.sets||['sets','reps','rest','pairId','technique'].some(k=>(e[k]??null)!==(en.snapshot[k]??null)))return 'Scheda modificata: conserva questa sessione nello storico e avviane una nuova.';
 }
 return '';
}
function resumeBanner(){
 for(const old of data.sessions){if(old.closed)continue;const oldDay=data.days.find(d=>d.id===old.dayId);if(oldDay&&old.recoveryStarted&&sessionProgress(oldDay,old).complete)stampSession(old,oldDay);}
 const s=[...data.sessions].reverse().find(s=>s.recoveryStarted&&!resumeProblem(s));
 return s?`<section class="panel resume-banner"><div><strong>Allenamento incompleto</strong><small>${esc(s.dayName)} · ${dateLabel(s.started,true)}</small></div>${btn('Riprendi','resume-session',`data-id="${s.id}"`,'primary compact')}</section>`:'';
}
function resumeSession(id){
 const s=data.sessions.find(s=>s.id===id),problem=resumeProblem(s);
 if(problem){toast(problem);return;}
 if(data.timer?.running||data.timer?.paused){toast('Termina o reimposta il recupero attivo prima di riprendere una sessione.');return;}
 const d=data.days.find(d=>d.id===s.dayId);
 const e=d.exercises.find(e=>!s.entries[e.id]||s.entries[e.id].series.some(v=>!v.done))||d.exercises[0];
 if(!e){toast('Nessun esercizio disponibile.');return;}
 stack=[{page:'home'},{page:'plan',planId:data.activePlanId},{page:'history',range:'all',planId:data.activePlanId},{page:'day',dayId:d.id,sessionId:s.id,planId:data.activePlanId}];
 route={page:'workout',dayId:d.id,exerciseId:e.id,sessionId:s.id,planId:data.activePlanId};data.lastView={...route};save();editing=false;render();window.scrollTo(0,0);
}
function historyView(){
 const all=route.range==='all',cutoff=Date.now()-21*86400000;
 const sessions=data.sessions.filter(s=>recordedEntries(s).length&&(all||new Date(s.started).getTime()>=cutoff)).slice().sort((a,b)=>b.started.localeCompare(a.started));
 return header('Storico allenamenti',activePlan().name+' · Anche giorni ed esercizi rimossi')+`<div class="toolbar history-filters">${btn('Ultime 3 settimane','history-range',`data-range="recent" aria-pressed="${!all}"`,!all?'primary':'')}${btn('Tutto lo storico','history-range',`data-range="all" aria-pressed="${all}"`,all?'primary':'')}</div><p class="muted">${sessions.length} sessioni nel periodo</p>`+(sessions.map(s=>{
  const entries=recordedEntries(s),series=entries.flatMap(en=>en.series).filter(C.hasSeriesData),done=series.filter(v=>v.done).length,problem=resumeProblem(s);
  const status=s.closed?(sessionWasCompleted(activePlan(),s)?'Completata':'Conclusa in anticipo'):problem?'Non riprendibile':'Incompleta';
  return `<section class="panel session-history"><div class="row between"><div><h2>${esc(s.dayName)}</h2><small>${new Date(s.started).toLocaleString('it-IT')}</small></div><span class="badge">${status}</span></div><p class="footnote">${entries.length} esercizi · ${done} serie completate · ${series.length-done} parziali</p><details><summary>Mostra esercizi e carichi</summary>${entries.map(en=>`<div class="history-exercise"><h3>${esc(en.snapshot.name)}</h3>${recordBadge(s,en.exerciseId||en.snapshot.id)}<p class="footnote">${esc(en.snapshot.technique)}${en.snapshot.notes?' · '+esc(en.snapshot.notes):''}</p><ul>${en.series.map((v,i)=>C.hasSeriesData(v)?`<li>Serie ${i+1}: ${esc(v.load!==''&&v.load!==undefined?v.load+' kg':'carico —')} × ${esc(v.reps||'—')} · ${v.done?'completata':'parziale'}${(v.steps||[]).filter(C.hasSeriesData).map((t,j)=>`<div class="history-block">Blocco ${j+1}: ${esc(t.load||'—')} kg × ${esc(t.reps||'—')}</div>`).join('')}</li>`:'').join('')}</ul></div>`).join('')}</details>${!problem?btn('Riprendi allenamento','resume-session',`data-id="${s.id}"`,'outline full'):!s.closed?`<p class="footnote">${esc(problem)}</p>`:''}</section>`;
 }).join('')||'<div class="panel empty">Nessun allenamento registrato nel periodo.</div>');
}

function settingsView(){return header('Impostazioni')+`<section class="panel"><h2>Profilo utente</h2><p>${esc([data.profile.firstName,data.profile.lastName].filter(Boolean).join(' ')||'Nome e cognome non ancora inseriti')}</p>${btn('Modifica profilo','profile','','primary full')}</section><section class="panel">${[['sound','Avvisi sonori'],['vibration','Vibrazione']].map(([id,label])=>`<div class="settingsrow"><label for="setting-${id}">${label}</label><input type="checkbox" id="setting-${id}" data-setting="${id}" ${data.settings[id]?'checked':''}></div>`).join('')}<label for="warning-sound">Suono: mancano 20 secondi</label><div class="recovery-sound-choice"><select id="warning-sound">${RECOVERY_SOUNDS.map(([id,label])=>`<option value="${id}" ${warningSound()===id?'selected':''}>${label}</option>`).join('')}</select>${btn('▷ Ascolta','preview-warning','','outline')}</div>${window.Android?btn('Permessi notifiche e timer','permissions','','outline full'):'<p class="warning">Anteprima browser: gli avvisi richiedono la pagina aperta. Nell’APK sono disponibili anche gli avvisi Android.</p>'}</section><section class="panel"><h2>Dati e backup</h2><p class="footnote">Il backup comprende tutte le schede, ciascuna con i propri carichi e lo storico.</p>${btn('Esporta backup completo','backup','','outline full')}${btn('Ripristina backup','restore','','full')}<p class="footnote">Scambio SYNC (sperimentale): unione manuale di schede e sessioni mancanti. I dati in conflitto restano locali; Wi-Fi e iPhone non sono ancora collegati.</p>${btn('Esporta copia per SYNC APP','sync-export','','outline full')}${btn('Unisci copia SYNC APP','sync-import','','outline full')}<p class="footnote">Il backup JSON conserva schede, storico e impostazioni. L’Excel serve per consultare gli allenamenti e importare la struttura della scheda.</p></section><section class="panel"><h2>Empire 1.5.25</h2><p class="footnote">Animazioni a fotogrammi: <a href="https://github.com/bryllim/workout-guide" target="_blank" rel="noopener">Workout Guide · Bryl Lim / Everkinetic</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Altri fotogrammi: <a href="https://github.com/ozansozuozgit/flow-exercise-dataset" target="_blank" rel="noopener">Flow Exercise Dataset</a> · CC0 per la grafica, MIT per i dati. Fonti, licenze e provenienza incluse nel progetto. Empire ha aggiunto il colore arancione; sequenza 1–2–3–2.</p><p class="muted">${CATALOG.length} esercizi nel catalogo, più quelli personalizzati. Funziona offline. Nessun account richiesto.</p>${activePlan()?btn('Carica scheda di esempio','sample','','outline full'):''}</section>`;}
function render(){window.EmpireKeyboard?.close();closeWeightPad();if(route.page==='plan')editing=!!activePlan()?.preparing;else if(route.page==='day')editing=!!day()?.preparing;if(route.page!=='weigh')EmpireWeighUI.leave();if(!['home','settings','weigh','received'].includes(route.page)&&(!activePlan()||(route.planId&&route.planId!==data.activePlanId)))route={page:'home'};let html;try{html=({home,received:EmpireOnlineUI.page,plan:planHome,day:dayView,muscles:muscleView,catalog:catalogView,workout,history:historyView,settings:settingsView,weigh:EmpireWeighUI.page}[route.page]||home)();}catch(e){console.error(e);html=header('Empire')+'<div class="warning">Impossibile mostrare questa pagina. Torna indietro ed esporta un backup.</div>';}$('#app').innerHTML='<div class="wrap page-'+route.page+'">'+recoveryBanner()+html+'</div>';updateTimer();schedulePageHelp();if(route.page==='weigh')EmpireWeighUI.afterRender();}
function showModal(title,content,onSave,saveLabel='Salva',options={}){window.EmpireKeyboard?.close();const modal=$('#modal');modal.innerHTML=`<form id="modal-form"${options.guide?' class="page-guide-form"':''} novalidate><h2>${esc(title)}</h2>${content}<div class="actions">${options.guide||options.singleClose?'':btn('Annulla','close-modal','type="button"')}<button class="primary" type="submit">${esc(saveLabel)}</button></div></form>`;$('#modal-form').onsubmit=ev=>{ev.preventDefault();try{validateItalianForm(ev.target);if(onSave(new FormData(ev.target))!==false){window.EmpireKeyboard?.close();modal.close();schedulePageHelp();}}catch(e){let error=document.getElementById('form-error');if(!error){error=document.createElement('p');error.id='form-error';error.className='formerror';error.setAttribute('role','alert');const anchor=e.message==='Seleziona almeno un gruppo muscolare.'?ev.target.querySelector('#muscle-message'):null;if(anchor){const hint=anchor.querySelector('small');if(hint)hint.hidden=true;anchor.append(error);}else ev.target.querySelector('.actions').before(error);}error.textContent=e.message;}};if(!modal.open)modal.showModal();}
function ask(title,text,fn){showModal(title,`<p>${esc(text)}</p>`,()=>{fn();},'Conferma');}
function editDay(id){const d=data.days.find(x=>x.id===id),color=dayColor(d||{},d?data.days.indexOf(d):data.days.length);showModal(d?'Modifica giorno':'Nuovo giorno',`<label>Nome del giorno<input name="name" required maxlength="70" value="${esc(d?.name||'')}" placeholder="Es. Giorno A"></label><fieldset class="color-field"><legend>Colore del giorno · proposta iniziale modificabile</legend><div class="color-options">${DAY_COLORS.map((c,i)=>`<label title="Colore ${i+1}"><input type="radio" name="color" value="${c}" ${c===color?'checked':''} aria-label="Colore ${i+1}"><span style="background:${c}"></span></label>`).join('')}</div></fieldset><label>Gruppi muscolari</label><div id="muscle-message" aria-live="polite"><small>Seleziona almeno un gruppo muscolare.</small></div><div class="preview-body" id="muscle-preview">${bodyMap(d?.muscles||[])}</div><div class="toolbar">${btn('Seleziona tutti','all-muscles','type="button"')}${btn('Deseleziona tutti','no-muscles','type="button"')}</div><div class="muscles">${DISPLAY_MUSCLES.map(([m,n])=>`<label><input type="checkbox" name="muscles" value="${m}" ${muscleGroups(d?.muscles).includes(m)?'checked':''}>${n}</label>`).join('')}</div>`,f=>{const name=f.get('name').trim();if(!name)throw Error('Inserisci un nome.');if(!f.getAll('muscles').length)throw Error('Seleziona almeno un gruppo muscolare.');const fields={name,muscles:f.getAll('muscles'),color:DAY_COLORS.includes(f.get('color'))?f.get('color'):color};if(d){Object.assign(d,fields);save();render();}else{const created={id:C.uid(),...fields,preparing:true,exercises:[]};data.days.push(created);save();openDay(created.id);}});}
function editExercise(id){const d=day(),e=d?.exercises.find(x=>x.id===id);if(e)configureExercise(e,d,false);}
function formatTime(sec){sec=Math.max(0,Math.ceil(sec||0));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
function notifyNative(){if(window.Android){if(data.timer?.running)Android.scheduleTimer(data.timer.end,data.timer.label,!!data.settings.sound,!!data.settings.vibration,warningSound());else Android.cancelTimer();}}
let audioContext;
function unlockAudio(){try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();}catch{}}
const RECOVERY_SOUNDS=[['beep','Segnale breve'],['double','Doppio segnale'],['chime','Campanella'],['go-baby','Go baby · voce generica']];
function warningSound(){return RECOVERY_SOUNDS.some(([id])=>id===data.settings.warningSound)?data.settings.warningSound:'beep';}
let warningAudio=null;
function playWarningSound(){if(window.Android?.previewWarningSound){Android.previewWarningSound(warningSound());return;}try{warningAudio?.pause();warningAudio=new Audio('sounds/'+warningSound()+'.wav');warningAudio.play().catch(()=>toast('Audio non disponibile.'));}catch{toast('Audio non disponibile.');}}
function alertUser(final=false){toast(final?'Recupero terminato':'Mancano 20 secondi');if(window.Android)return;if(data.settings.sound&&!final)playWarningSound();if(data.settings.sound&&final){try{unlockAudio();const o=audioContext.createOscillator(),g=audioContext.createGain();o.connect(g);g.connect(audioContext.destination);g.gain.value=.15;o.frequency.value=final?850:550;o.start();o.stop(audioContext.currentTime+.35);}catch{}}if(data.settings.vibration)navigator.vibrate?.(final?[250,100,250]:180);toast(final?'Recupero terminato':'Mancano 20 secondi');}
function recoveryContext(t=data.timer){const plan=t&&data.plans.find(p=>p.id===t.planId),d=plan?.days.find(d=>d.exercises.some(e=>e.id===t.exerciseId)),e=d?.exercises.find(e=>e.id===t.exerciseId);return plan&&d&&e?{plan,d,e}:null;}
function recoveryInDay(d){const ctx=recoveryContext();return !!(ctx&&ctx.plan.id===data.activePlanId&&ctx.d.id===d?.id&&(data.timer.running||data.timer.paused));}
function recoveryBanner(){const t=data.timer,c=recoveryContext(t);if(!c||!(t.running||t.paused)||route.page==='workout'&&route.planId===t.planId&&[c.e.id,c.e.pairId].includes(route.exerciseId))return '';return `<aside id="global-recovery" class="global-recovery" role="status"><span><strong>${t.running?'Recupero in corso':'Recupero in pausa'} · <span id="global-recovery-clock">${formatTime(t.running?Math.max(0,(t.end-Date.now())/1000):t.paused)}</span></strong><small>${esc(c.e.name)}</small></span>${btn('Torna al timer','return-recovery','','compact')}</aside>`;}
function returnToRecovery(){const c=recoveryContext();if(!c)return;const t=data.timer;openPlan(c.plan.id);openDay(c.d.id);go({page:'workout',planId:c.plan.id,dayId:c.d.id,exerciseId:c.e.id,sessionId:t.sessionId});}
function applyRecoveryReturn(){const t=data.timer;if(!t||t.running||t.paused||!t.returnToDay||$('#modal').open)return false;const c=recoveryContext(t);if(!c||route.page!=='workout'||route.planId!==t.planId||![c.e.id,c.e.pairId].includes(route.exerciseId))return false;t.returnToDay=false;save();finishExercise();return true;}
function startTimer(seconds,label,eid){unlockAudio();if(label==='Recupero'){const ss=day()&&currentSession(day());if(ss)ss.recoveryStarted=true;}if(data.timer?.running&&data.timer.exerciseId!==eid){toast('È già attivo un recupero. Mettilo in pausa o reimpostalo.');return false;}data.timer={planId:data.activePlanId,exerciseId:eid,label,total:seconds,end:Date.now()+seconds*1000,running:seconds>0,paused:0,warned:false,dayId:day()?.id,sessionId:day()?currentSession(day())?.id:undefined};save();notifyNative();updateTimer();return true;}
function updateTimer(){const t=data.timer;if(t?.running){const left=Math.max(0,(t.end-Date.now())/1000);if(t.total>20&&left>0&&left<=20&&!t.warned){t.warned=true;save();alertUser();}if(left<=0){t.running=false;t.paused=0;save();alertUser(true);if(window.Android)setTimeout(()=>{if(!data.timer?.running)Android.keepAwake(false);},10000);}}
 if(applyRecoveryReturn())return;const banner=$('#global-recovery');if(banner){banner.hidden=!(t?.running||t?.paused);const clock=$('#global-recovery-clock');if(clock)clock.textContent=formatTime(t?.running?Math.max(0,(t.end-Date.now())/1000):t?.paused||0);}const finish=$('[data-action="finish-session"]');if(finish){finish.disabled=false;finish.textContent='✓ Termina allenamento';}
 if(route.page!=='workout'||!$('#clock'))return;const e=day()?.exercises.find(x=>x.id===route.exerciseId);if(!e)return;const relevant=t&&t.planId===data.activePlanId&&(t.exerciseId===e.id||t.exerciseId===e.pairId);const sec=relevant&&(t.running||t.paused)?(t.running?Math.max(0,(t.end-Date.now())/1000):t.paused):Math.max(e.rest,day().exercises.find(x=>x.id===e.pairId)?.rest||0);$('#clock').textContent=formatTime(sec);$('#timer-ring').style.setProperty('--progress',relevant&&(t.running||t.paused)?Math.min(1,sec/(t.total||1)):1);$('#timer-status').textContent=t?.running&&!relevant?'Timer attivo su altro esercizio':relevant&&t.running?t.label:relevant&&t.paused?'In pausa':'';const b=$('[data-action="play"]');if(b){b.disabled=!!(t?.running);b.textContent=relevant&&t.paused?'▶ Riprendi':'▶ Play';}}
function play(){const d=day(),e=d.exercises.find(x=>x.id===route.exerciseId),s=currentSession(d,true),en=getEntry(s,e);if(data.timer?.running){toast('Il timer è già in corso.');return;}if(data.timer?.paused&&(data.timer.exerciseId===e.id||data.timer.exerciseId===e.pairId)){data.timer.end=Date.now()+data.timer.paused*1000;data.timer.paused=0;data.timer.running=true;save();notifyNative();updateTimer();return;}const idx=en.series.findIndex(v=>!v.done);if(idx<0){toast('Esercizio completato. Avvia una nuova sessione per ricominciare.');return;}let p=e.pairId?d.exercises.find(x=>x.id===e.pairId):null;if(p&&!valid(p)){toast('Completa prima la configurazione del secondo esercizio.');return;}if(data.timer?.paused&&data.timer.exerciseId!==e.id){toast('Reimposta prima il timer dell’altro esercizio.');return;}R.complete(activePlan(),s,e.id,idx);if(p){getEntry(s,p);R.complete(activePlan(),s,p.id,idx);}startTimer(Math.max(e.rest,p?.rest||0),'Recupero',e.id);if(en.series.every(v=>v.done)&&(!p||getEntry(s,p).series.every(v=>v.done)))data.timer.returnToDay=true;if(window.Android&&data.timer?.running)Android.keepAwake(true);save();render();}
function cancelTimer(){data.timer=null;notifyNative();save();if(window.Android)Android.keepAwake(false);updateTimer();}
function download(bytes,name,mime){if(window.Android){const arr=new Uint8Array(bytes);let b='';for(let i=0;i<arr.length;i+=8192)b+=String.fromCharCode(...arr.subarray(i,i+8192));Android.saveFile(btoa(b),name,mime);return;}const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportExcel(){const p=activePlan();if(!p){toast('Apri prima una scheda per esportarla.');return;}const wb=C.exportWorkbook(P.scope(data),XLSX);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Scheda',p.name],['Data inizio',P.dateIT(p.startDate)],['Data fine',P.dateIT(p.endDate)]]),'Informazioni scheda');const snapshot={format:'EMPIRE_EXCEL_DATI_V1',plan:{name:p.name,startDate:p.startDate,endDate:p.endDate},scope:P.scope(data)};const parts=JSON.stringify(snapshot).match(/[\s\S]{1,30000}/g)||[];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Formato','EMPIRE_EXCEL_DATI_V1'],...parts.map((chunk,i)=>['JSON '+(i+1),chunk])]),'Dati EMPIRE');download(C.writeWorkbook(wb,XLSX),'Empire_'+p.name.replace(/[^a-z0-9_-]/gi,'_').slice(0,50)+'_'+localDate()+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');toast('Excel esportato con carichi e storico delle serie.');}
// SYNC Fase 2: unione conservativa, senza risolvere automaticamente i conflitti.
// Oggetti già esistenti con ID uguale vengono mantenuti intatti.
function mergeSyncArchive(local,remote){
 const copy=x=>JSON.parse(JSON.stringify(x));
 const merged=copy(local),stats={plans:0,sessions:0,conflicts:0};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const getId=x=>typeof x?.id==='string'&&x.id.length>0?x.id:null;
 if(!Array.isArray(merged.plans)||!Array.isArray(remote.plans))throw Error('Archivio schede non valido.');
 const planMap=new Map(merged.plans.map(p=>[getId(p),p]));
 for(const rp of remote.plans){
  const id=getId(rp);if(!id)throw Error('Scheda senza ID.');
  const lp=planMap.get(id);
  if(!lp){const added=copy(rp);merged.plans.push(added);planMap.set(id,added);stats.plans++;stats.sessions+=(added.sessions||[]).length;continue;}
  // Mantiene nome, date, giorni, esercizi e configurazione locali quando differiscono.
  for(const key of ['name','startDate','endDate','days','definitions','preparing']){
   if(!equal(lp[key],rp[key]))stats.conflicts++;
  }
  if(!Array.isArray(lp.sessions)||!Array.isArray(rp.sessions))throw Error('Sessioni non valide.');
  const existing=new Map(lp.sessions.map(s=>[getId(s),s]));
  for(const rs of rp.sessions){
   const sid=getId(rs);if(!sid)throw Error('Sessione senza ID.');
   if(!existing.has(sid)){
    // Senza il giorno originale non si importa la sessione: resterebbe orfana.
    if(!lp.days.some(d=>d.id===rs.dayId)){stats.conflicts++;continue;}
    const added=copy(rs);lp.sessions.push(added);existing.set(sid,added);stats.sessions++;
   }else if(!equal(existing.get(sid),rs))stats.conflicts++;
  }
 }
 // Esercizi personalizzati: aggiungi gli ID nuovi senza eliminare quelli locali.
 const customIds=new Map((merged.custom||[]).map(e=>[getId(e),e]));
 for(const e of remote.custom||[]){const id=getId(e);if(!id)continue;if(!customIds.has(id)){merged.custom.push(copy(e));customIds.set(id,e);}else if(!equal(customIds.get(id),e))stats.conflicts++;}
 // Profilo, pesate, opzioni, timer e vista attiva restano locali.
 return {merged,stats};
}
let fileMode='import',filePlanId=null,fileCreatesPlan=false;function chooseFile(mode,createPlan=false){if(mode!=='restore'&&mode!=='sync-import'&&!createPlan&&!activePlan()){toast('Crea o apri prima una scheda.');return;}fileMode=mode;filePlanId=data.activePlanId;fileCreatesPlan=mode==='import';if(mode==='import')importPending=null;if(window.Android){Android.pickFile(mode==='restore'?'application/json':'*/*');return;}const input=$('#file');input.accept=(mode==='restore'||mode==='sync-import')?'.json':'.xlsx,.xls,.csv';input.value='';input.click();}
async function readFile(bytes){try{if(fileMode==='empire'){previewReceived(bytes);return;} if(fileMode==='sync-import'){
 const packageData=JSON.parse(new TextDecoder().decode(bytes));
 if(packageData?.format!=='EMPIRE_SYNC_SNAPSHOT_V1'||!packageData.payload||typeof packageData.createdAt!=='string')throw Error('File SYNC APP non valido.');
 validateBackup(packageData.payload);
 if(damagedArchive)throw Error('Archivio locale danneggiato: recupera prima il backup.');
 const incoming=P.prepare(packageData.payload,validateLegacyBackup);
 const result=mergeSyncArchive(data,incoming);
 ask('Unisci copia EMPIRE',`Aggiungerò ${result.stats.plans} nuove schede e ${result.stats.sessions} nuove sessioni. ${result.stats.conflicts} elementi con lo stesso ID ma dati diversi resteranno invariati sul telefono. Nessun dato esistente sarà sostituito. Continuare?`,()=>{
  try{
   // Copia di ripristino interna, prima di ogni modifica. Nessun JSON supplementare in Download.
   const previous=JSON.stringify(data);
   localStorage.setItem('empire-sync-rollback-v1',previous);
   const check=localStorage.getItem('empire-sync-rollback-v1');
   if(check!==previous)throw Error('Impossibile verificare la copia di sicurezza interna.');
   cancelTimer();EmpireWeighUI.leave();
   const old=data;data=P.prepare(result.merged,validateLegacyBackup);data.timer=null;
   stack=[];route={page:'home'};data.lastView={...route};
   if(!save()){data=old;throw Error('Salvataggio non riuscito');}
   render();toast('Unione completata: '+result.stats.sessions+' sessioni nuove. Conflitti: '+result.stats.conflicts);
  }catch(err){toast('Unione annullata: '+err.message);}
 });return;
} if(fileMode==='restore'){let obj=JSON.parse(new TextDecoder().decode(bytes));validateBackup(obj);ask('Ripristina backup','Il backup sostituirà i dati presenti. Esporta prima un backup se vuoi conservarli.',()=>{cancelTimer();EmpireWeighUI.leave();damagedArchive=null;data=P.prepare(obj,validateLegacyBackup);data.timer=null;stack=[];route={page:'home'};data.lastView={...route};save();render();toast('Backup ripristinato.');});return;}const wb=XLSX.read(bytes,{type:'array',cellDates:false,cellNF:true,cellText:true});if(!fileCreatesPlan&&filePlanId!==data.activePlanId)throw Error('La scheda selezionata è cambiata. Riapri l’importazione dalla scheda desiderata.');importPending=C.importWorkbook(wb,XLSX);
// Un file esportato da EMPIRE incorpora una copia esatta dei dati della scheda.
// La normale anteprima resta modificabile, ma lo storico viene ricollegato per indice.
const internal=wb.Sheets['Dati EMPIRE'];
if(internal){try{const meta=XLSX.utils.sheet_to_json(internal,{header:1,defval:''});const chunks=meta.filter(r=>/^JSON \d+$/.test(String(r[0]))).sort((a,b)=>Number(a[0].slice(5))-Number(b[0].slice(5)));const exact=JSON.parse(chunks.map(r=>String(r[1])).join('')||'null');if(exact?.format==='EMPIRE_EXCEL_DATI_V1'&&Array.isArray(exact.scope?.days)&&Array.isArray(exact.scope?.sessions)){importPending.empireSnapshot=exact;}}catch(err){console.warn('Metadati Excel EMPIRE non validi',err);}}
importPending.planId=filePlanId;importPending.createPlan=fileCreatesPlan;showImport();}catch(e){toast('Importazione: '+e.message);}}
function validateSessionCompletion(s){
 if(s.completion===undefined)return;const p=s.completion;
 if(!s.closed||!Number.isFinite(Date.parse(s.finished))||!p||!['complete','partial'].includes(p.status)||!Number.isInteger(p.total)||p.total<0||!Number.isInteger(p.done)||p.done<0||p.done>p.total||!Number.isInteger(p.totalSets)||p.totalSets<0||!Number.isInteger(p.doneSets)||p.doneSets<0||p.doneSets>p.totalSets||p.complete!==(p.status==='complete')||!Array.isArray(s.targets)||s.targets.length!==p.total)throw Error('Conclusione allenamento non valida nel backup.');
 if(p.status==='complete'&&(p.total===0||p.done!==p.total||p.doneSets!==p.totalSets||new Set(s.targets.map(t=>t.id)).size!==p.total||!s.targets.every(t=>typeof t.id==='string'&&Number.isInteger(t.sets)&&t.sets>0&&s.entries[t.id]?.series?.length>=t.sets&&s.entries[t.id].series.slice(0,t.sets).every(v=>v.done===true))))throw Error('Serie concluse non coerenti nel backup.');
}
function validateLegacyBackup(d){if(!d||d.schema!==1||!Array.isArray(d.days)||!Array.isArray(d.sessions)||!Array.isArray(d.custom)||!d.settings||!d.definitions)throw Error('Backup Empire non valido.');const ids=new Set();for(const day of d.days){if(typeof day.id!=='string'||typeof day.name!=='string'||!Array.isArray(day.muscles)||!Array.isArray(day.exercises)||ids.has(day.id))throw Error('Giorno non valido nel backup.');ids.add(day.id);if(day.manualCompletion!==undefined){const m=day.manualCompletion;if(!m||typeof m!=='object'||!P.validDate(m.date)||typeof m.markedAt!=='string'||!Number.isFinite(Date.parse(m.markedAt)))throw Error('Marcatura manuale non valida nel backup.');}for(const e of day.exercises){if(typeof e.id!=='string'||typeof e.name!=='string'||!('sets'in e)||!('rest'in e))throw Error('Esercizio non valido nel backup.');}}for(const s of d.sessions){if(!s.entries||typeof s.started!=='string'||isNaN(Date.parse(s.started)))throw Error('Sessione non valida.');validateSessionCompletion(s);for(const en of Object.values(s.entries)){if(!en.snapshot||!Array.isArray(en.series)||en.series.some(v=>!Array.isArray(v.steps)))throw Error('Serie non valide.');}}}
function validateBackup(d){EmpireWeigh.validate(d.weighing,d.profile);P.validate(d,validateLegacyBackup);}
window.empireImport=(base64)=>{const str=atob(base64),bytes=Uint8Array.from(str,c=>c.charCodeAt(0));readFile(bytes);};window.empireMessage=toast;
function focusImportCorrections(p){
 const modal=document.getElementById('modal');
 if(!modal?.open||!p)return;
 const form=modal.querySelector('#modal-form');
 const preview=modal.querySelector('.filepreview');
 if(!form||!preview)return;
 const warnings=Array.isArray(p.warnings)?p.warnings:[];
 const candidates=[];
 const add=(name,reason,di,ei)=>{
  const el=Array.from(form.querySelectorAll('input,select,textarea')).find(x=>x.name===name);
  if(el&&!candidates.some(x=>x.el===el))candidates.push({el,reason,di,ei});
 };
 // Mostra errori soltanto per valori effettivamente invalidi.
 // Una nota sul file Excel o la parola "Superset" non sono errori di serie.
 p.days.forEach((d,di)=>{
  d.exercises.forEach((e,ei)=>{
   const sets=Number(e.sets);
   if(!Number.isInteger(sets)||sets<1||sets>30)add(`s-${di}-${ei}`,'Serie',di,ei);
   if(!String(e.reps??'').trim())add(`r-${di}-${ei}`,'Ripetizioni',di,ei);
   if(e.rest==null||!Number.isFinite(Number(e.rest))||Number(e.rest)<0||Number(e.rest)>3600)add(`p-${di}-${ei}`,'Recupero',di,ei);
   if(/superset|superserie/i.test(String(e.technique||''))){
    const partner=d.exercises.find(x=>x.id===e.pairId);
    if(!partner||Number(partner.sets)!==sets)add(`pair-${di}-${ei}`,'Secondo esercizio superserie',di,ei);
   }
  });
 });
 // Nessun riquadro descrittivo sotto il conteggio; solo i pulsanti degli errori.
 const summary=Array.from(form.querySelectorAll('p')).find(el=>el.querySelector('strong')?.textContent?.includes(' giorni · '));
 if(summary){const small=summary.querySelector('small');if(small)small.remove();summary.querySelector('br')?.remove();}
 const warningsBox=Array.from(form.querySelectorAll('.warning')).find(el=>el!==preview&&warnings.some(w=>el.textContent.includes(String(w))));
 if(warningsBox)warningsBox.remove();
 if(!candidates.length)return;
 const buttons=document.createElement('div');buttons.id='empire-import-errors';buttons.style.cssText='display:grid;gap:10px;margin:12px 0 16px';
 const controls=[];
 const clear=(item)=>{
  if(item.resolved)return;
  item.resolved=true;
  item.el.style.removeProperty('outline');
  item.el.style.removeProperty('border-color');
  item.el.style.removeProperty('box-shadow');
  item.button?.remove();
  if(!buttons.children.length)buttons.remove();
 };
 // Durante la correzione la tastiera occupa il fondo dello schermo: mantieni visibile il campo.
 const visibilityStyle=document.createElement('style');
 visibilityStyle.textContent=`#modal.empire-import-editing{max-height:calc(100dvh - 12px)!important;overflow-y:auto!important;padding-bottom:0!important}#modal.empire-import-editing .filepreview{max-height:32dvh!important;overflow-y:auto!important;overscroll-behavior:contain!important}#modal.empire-import-editing #modal-form{padding-bottom:0!important}#modal.empire-import-editing .empire-keyboard{position:fixed!important;bottom:0!important;z-index:10000!important}`;
 document.head.append(visibilityStyle);
 let correctionActive=null;
 const ensureVisible=()=>{
  if(!correctionActive || !correctionActive.el.isConnected || !modal.open)return;
  const keyboard=document.getElementById('empire-keyboard');
  if(!keyboard||keyboard.hidden)return;
  const field=correctionActive.el;
  const keyTop=keyboard.getBoundingClientRect().top;
  // Posiziona la casella nella zona libera sopra la tastiera, anziché dietro di essa.
  let rect=field.getBoundingClientRect();
  const desiredTop=Math.max(58,Math.min(keyTop-100,window.innerHeight*.22));
  preview.scrollTop+=rect.top-desiredTop;
  rect=field.getBoundingClientRect();
  if(rect.bottom>keyTop-18 || rect.top<32){
   modal.scrollTop+=rect.top-desiredTop;
   rect=field.getBoundingClientRect();
  }
  if(rect.bottom>keyTop-12){
   preview.scrollTop+=rect.bottom-keyTop+28;
  }
 };
 const scheduleVisible=()=>{requestAnimationFrame(()=>{ensureVisible();requestAnimationFrame(ensureVisible)});setTimeout(ensureVisible,100);setTimeout(ensureVisible,260)};
 const navigate=(item)=>{
  if(item.resolved)return;
  controls.forEach(other=>other.el.style.outline=other===item?'3px solid #ffb536':'');
  // Scorri il contenitore interno prima di aprire la tastiera.
  const align=()=>{
   const scrollable=preview;
   const er=item.el.getBoundingClientRect(),sr=scrollable.getBoundingClientRect();
   scrollable.scrollTop+=er.top-sr.top-sr.height*.35;
   modal.scrollTop+=Math.max(0,item.el.getBoundingClientRect().bottom-modal.getBoundingClientRect().bottom+85);
  };
  correctionActive=item;modal.classList.add("empire-import-editing");
  align();
  item.el.focus({preventScroll:true});
  if(item.el.matches('input,textarea')&&window.EmpireKeyboard?.open)window.EmpireKeyboard.open(item.el);
  if(item.el.matches('select'))try{item.el.showPicker?.();}catch(_){}
  requestAnimationFrame(align);scheduleVisible();
 };
 for(const item of candidates){
  item.el.style.borderColor='#ff992c';
  item.el.style.boxShadow='0 0 0 2px #ff992c77';
  const b=document.createElement('button');b.type='button';b.className='primary';
  b.style.cssText='background:#ff8422;color:white;text-align:left;white-space:normal;padding:13px 15px;border-radius:13px;width:100%;font-weight:700';
  const d=p.days[item.di];const e=item.ei>=0?d?.exercises[item.ei]:null;
  b.textContent=[d?.name,e?.name,item.reason].filter(Boolean).join(' / ');
  b.addEventListener('click',()=>navigate(item));item.button=b;buttons.appendChild(b);controls.push(item);
  // Il selettore della superserie non usa la tastiera personalizzata.
  if(item.el.matches('select'))item.el.addEventListener('change',()=>clear(item));
 }
 preview.before(buttons);
 // Il tasto «Fatto» della tastiera EMPIRE è quello che conclude la correzione.
 // Intercetta soltanto il Fatto quando è stato aperto un errore di questa importazione.
 let selected=null;
 for(const item of controls)item.button.addEventListener('click',()=>{selected=item;});
 const done=ev=>{
  const key=ev.target.closest?.('#empire-keyboard button[data-key="done"]');
  if(!key||!selected||selected.resolved||!form.isConnected)return;
  ev.preventDefault();ev.stopImmediatePropagation();
  const item=selected;selected=null;
  window.EmpireKeyboard?.close();
  clear(item);correctionActive=null;modal.classList.remove("empire-import-editing");
 };
 document.addEventListener('click',done,true);
 const observer=new MutationObserver(()=>{if(!form.isConnected||!modal.open){document.removeEventListener('click',done,true);modal.classList.remove('empire-import-editing');visibilityStyle.remove();observer.disconnect();}});
 observer.observe(document.body,{childList:true,subtree:true});
}

function showImport(){const p=importPending,targets=C.historyTargets(data.days,p.days),canRecover=!p.createPlan&&targets.every(Boolean)&&p.days.some(d=>d.importedColumns?.length);showModal(p.createPlan?'Importa una nuova scheda':'Importa in '+activePlan().name,`${p.createPlan?`<label>Nome della scheda<input name="import-plan-name" value="Scheda importata" required maxlength="80"></label><div class="formgrid">${dateField('plan-start','Data di inizio',localDate())}${dateField('plan-end','Data di fine','')}</div><div id="date-calendar" class="date-calendar" hidden></div>`:''}${canRecover?'<label class="recover-history"><input type="checkbox" name="recover-history"> Recupera solo date e carichi nei giorni corrispondenti, mantenendo esercizi e allenamenti presenti.</label>':''}<p><strong>${p.days.length} giorni · ${p.count} esercizi</strong><br><small>Le date e i carichi originali vengono conservati nell’esportazione. I valori ambigui restano segnalati, senza diventare record o suggerimenti. ${p.createPlan?'La nuova scheda viene creata solo quando confermi l’importazione.':'I giorni si aggiungono a quelli presenti.'}</small></p>${p.warnings.length?`<div class="warning">${p.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:''}<div class="filepreview">${p.days.map((d,di)=>`<section class="panel"><label>Giorno<input name="day-${di}" value="${esc(d.name)}" required></label>${d.exercises.map((e,ei)=>`<label>Nome esercizio<input name="n-${di}-${ei}" value="${esc(e.name)}" required></label><div class="formgrid"><label>Serie<input type="number" min="1" max="30" name="s-${di}-${ei}" value="${e.sets||''}" required></label><label>Ripetizioni<input name="r-${di}-${ei}" value="${esc(e.reps)}" required></label><label>Recupero<input name="p-${di}-${ei}" value="${e.rest===null?'':formatTime(e.rest)}" required placeholder="mm:ss"></label><label>Tecnica<input name="t-${di}-${ei}" value="${esc(e.technique)}" required></label></div><label>Secondo esercizio (superserie)<select name="pair-${di}-${ei}"><option value="">Nessuno</option>${d.exercises.filter(x=>x.id!==e.id).map(x=>`<option value="${x.id}" ${e.pairId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Indicazioni / note<input name="note-${di}-${ei}" value="${esc(e.notes)}"></label>`).join('')}</section>`).join('')}</div>`,f=>{if(!p.createPlan&&p.planId!==data.activePlanId)throw Error('Riapri l’importazione nella scheda corretta.');if(canRecover&&f.get('recover-history')){let n=0;for(let i=0;i<p.days.length;i++)n+=C.mergeImportedHistory(targets[i],p.days[i]);save();render();toast('Storico recuperato: '+n+' colonne aggiunte.');importPending=null;return;}const newMeta=p.createPlan?P.metadata({name:f.get('import-plan-name'),startDate:P.dateToISO(f.get('plan-start')),endDate:String(f.get('plan-end')||'').trim()?P.dateToISO(f.get('plan-end')):''}):null;for(let di=0;di<p.days.length;di++){const d=p.days[di];d.name=f.get('day-'+di).trim();for(let ei=0;ei<d.exercises.length;ei++){const e=d.exercises[ei];e.name=f.get(`n-${di}-${ei}`).trim();e.notes=f.get(`note-${di}-${ei}`).trim();e.sets=+f.get(`s-${di}-${ei}`);e.reps=f.get(`r-${di}-${ei}`).trim();e.rest=C.parseRest(f.get(`p-${di}-${ei}`));e.technique=f.get(`t-${di}-${ei}`).trim();e.pairId=f.get(`pair-${di}-${ei}`)||null;if(!e.name||!valid(e))throw Error('Completa tutti gli esercizi prima di importare.');const match=CATALOG.find(x=>C.norm(x.name)===C.norm(e.name));if(match){e.catalogId=match.id;e.equipment=match.equipment;if(!d.muscles.includes(match.muscle))d.muscles.push(match.muscle);}else{const n=C.norm(e.name);e.equipment=/manubr|dumbbell/.test(n)?'dumbbell':/bilanciere|barbell/.test(n)?'barbell':/cavi.*macchina|macchina.*cavi/.test(n)?'neutral':/cavo|cavi|cable/.test(n)?'cable':/machine|macchina|pressa|leg press|pulley|leg curl|leg extension|smith/.test(n)?'machine':'neutral';}}for(const e of d.exercises){if(/super.?set|superserie/i.test(e.technique)&&!e.pairId)throw Error(d.name+' / '+e.name+': scegli il secondo esercizio della superserie.');if(e.pairId){const partner=d.exercises.find(x=>x.id===e.pairId);if(!partner||partner.sets!==e.sets||(partner.pairId&&partner.pairId!==e.id))throw Error('Superserie ambigua: controlla gli abbinamenti e il numero di serie.');partner.pairId=e.id;partner.technique='Superset';e.technique='Superset';}}}if(p.createPlan){const created=P.create(data,newMeta,TECH_HELP);data.activePlanId=created.id;}
// Ripristina serie, carichi e storico per i fogli esportati da EMPIRE.
// Le schede già presenti NON vengono modificate.
if(p.createPlan&&p.empireSnapshot){
 const old=p.empireSnapshot.scope, index=new Map(), dayIds=new Map();
 for(let i=0;i<Math.min(old.days.length,p.days.length);i++){
  const oldDay=old.days[i],newDay=p.days[i];dayIds.set(oldDay.id,newDay.id);
  for(let j=0;j<Math.min(oldDay.exercises.length,newDay.exercises.length);j++){
   const before=oldDay.exercises[j],after=newDay.exercises[j];index.set(before.id,after.id);
  }
 }
 const restored=(old.sessions||[]).filter(x=>dayIds.has(x.dayId)).map(source=>{
  const session=JSON.parse(JSON.stringify(source));session.id=uid();session.dayId=dayIds.get(source.dayId);
  session.entries=Object.fromEntries(Object.entries(source.entries||{}).filter(([k])=>index.has(k)).map(([k,v])=>[index.get(k),v]));
  if(Array.isArray(session.targets))session.targets=session.targets.filter(t=>index.has(t.id)).map(t=>({...t,id:index.get(t.id)}));
  return session;
 });
 data.sessions.push(...restored);
}
data.days.push(...p.days);Object.assign(data.definitions,p.definitions);route={page:'plan',planId:data.activePlanId};stack=[{page:'home'}];data.lastView={...route};save();render();toast('Scheda importata: '+p.count+' esercizi.');importPending=null;},'Importa scheda');queueMicrotask(()=>focusImportCorrections(p));}
function customExercise(){showModal('Crea esercizio personalizzato',`<label>Nome<input name="name" required maxlength="120"></label><label>Gruppo muscolare<select name="muscle">${DISPLAY_MUSCLES.map(([m,n])=>`<option value="${m}" ${route.muscle===m?'selected':''}>${n}</option>`).join('')}</select></label>`,f=>{const name=f.get('name').trim();if(!name)throw Error('Inserisci il nome.');const c={id:C.uid(),name,muscle:f.get('muscle'),equipment:'neutral'};data.custom.push(c);save();addCatalogExercise(c.id);return false;});}
function sample(){if(!activePlan()){toast('Crea prima una scheda.');return;}if(data.days.some(d=>d.sample)){toast('L’esempio è già presente.');return;}const byName=n=>CATALOG.find(e=>e.name===n);for(const [name,muscles,names] of [['Giorno A',['petto','dorso','tricipiti'],['Panca inclinata bilanciere','Lat machine presa neutra','Pushdown al cavo']],['Giorno B',['quadricipiti','femorali','spalle'],['Hack squat','Leg curl seduto','Shoulder press manubri']]]){data.days.push({id:C.uid(),name,muscles,sample:true,exercises:names.map((n,i)=>{const c=byName(n);return {id:C.uid(),catalogId:c.id,name:n,equipment:c.equipment,sets:i?3:4,reps:i?'10–12':'6–8',rest:i?90:150,technique:i===2?'Rest pause':i===0?'Eccentrica':'Normale',notes:i===0?'Eccentrica 3 secondi':i===2?'Solo ultima serie. Pause interne secondo la scheda.':'',pairId:null};})});}save();render();}
function sharePlan(){if(!activePlan())return;showModal('Condividi scheda',`<div class="sharing-plan-name">${esc(activePlan().name)}</div><div class="share-options">${btn('<strong>Invia con Empire</strong><small>A un altro utente, con codice o QR · Internet</small>','online-send','type="button"','primary share-choice')}${btn('<strong>Condividi file Empire</strong><small>Invia tramite altre app oppure salva sul telefono</small>','share-file-options','type="button"','primary share-choice')}${btn('<strong>Condividi PDF</strong><small>Una copia da leggere e stampare</small>','share-pdf','type="button"','primary share-choice')}${btn('Il mio codice / QR','online-account','type="button"','primary full')}</div><p class="footnote">Condividi giorni, esercizi e indicazioni. I dati personali rimangono sul tuo telefono.</p>`,()=>{},'Chiudi',{singleClose:true});}
function shareFileOptions(){showModal('File Empire',`<p class="sharing-plan-name">${esc(activePlan().name)}</p><p>Chi riceve il file può consultarlo con Empire e aggiungerlo come nuova scheda.</p><div class="share-options">${btn('Condividi con un’altra app','share-file','type="button"','primary full')}${btn('Salva sul telefono','save-plan-file','type="button"','primary full')}</div>`,()=>{},'Chiudi',{singleClose:true});}
function programBytes(){const p=activePlan();if(!p||p.days.some(d=>!d.exercises.length||d.exercises.some(e=>!valid(e))))throw Error('Completa la scheda prima di condividerla.');return new TextEncoder().encode(JSON.stringify(EmpireShare.packagePlan(p)));}
function sharePlanFile(saveOnly=false){const bytes=programBytes(),name=activePlan().name.replace(/[^a-z0-9_-]/gi,'_').slice(0,50)+'.empire';if(window.Android?.shareFile&&!saveOnly){let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));Android.shareFile(btoa(str),name,'application/vnd.empire.plan+json');}else download(bytes,name,'application/vnd.empire.plan+json');}
function previewReceived(bytes){try{if(bytes.length>2*1024*1024)throw Error('File troppo grande.');const p=EmpireShare.parse(new TextDecoder().decode(bytes));P.metadata(p);showModal('Scheda ricevuta',`<h3>${esc(p.name)}</h3><p>${p.days.length} giorni · ${p.days.reduce((n,d)=>n+d.exercises.length,0)} esercizi</p><div class="received-preview">${p.days.map(d=>'<section><h3>'+esc(d.name)+'</h3>'+dayOverviewTable(d)+'</section>').join('')}</div><p class="footnote">Verrà aggiunta come nuova scheda. Le tue schede e i tuoi carichi restano conservati.</p>`,()=>{const copy=EmpireShare.cloneForImport(p,C.uid);const created=P.create(data,{name:copy.name,startDate:copy.startDate,endDate:copy.endDate},copy.definitions);created.days=copy.days;save();openPlan(created.id);toast('Scheda ricevuta aggiunta.');},'Aggiungi alle mie schede');}catch(e){toast('Scheda ricevuta: '+e.message);}}
window.empireReceive=(base64)=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));previewReceived(bytes);};
function sharePlanPDF(){const p=activePlan();programBytes();if(!window.Android?.sharePlanPdf){toast('Il PDF è disponibile nell’APK Android.');return;}const doc={name:p.name,period:planPeriod(p),days:p.days.map(d=>({name:d.name,exercises:d.exercises.map(e=>({name:e.name,sets:String(e.sets),reps:e.reps,rest:formatTime(e.rest),technique:e.technique,notes:e.notes||'',pair:e.pairId?'Superset':''}))}))};Android.sharePlanPdf(JSON.stringify(doc));}
function startPlanPreparation(id){const p=data.plans.find(p=>p.id===id);if(!p)return;p.preparing=true;openPlan(id);}
function confirmPlan(){const p=activePlan();if(!p?.days.length){toast('Aggiungi almeno un giorno.');return;}if(p.days.some(d=>!d.exercises.length||d.exercises.some(e=>!valid(e)))){toast('Completa gli esercizi di ogni giorno prima di confermare.');return;}p.preparing=false;for(const d of p.days)d.preparing=false;save();render();toast('Scheda confermata. Pronta per allenarti.');}
function confirmDay(){const d=day();if(!d?.exercises.length||d.exercises.some(e=>!valid(e))){toast('Aggiungi e configura almeno un esercizio.');return;}d.preparing=false;save();if(activePlan()?.preparing){const index=stack.map(r=>r.page).lastIndexOf('plan');if(index>=0)stack=stack.slice(0,index);route={page:'plan',planId:data.activePlanId};data.lastView={...route};save();render();window.scrollTo(0,0);}else render();toast('Giorno confermato.');}
function manageDay(id){const d=data.days.find(d=>d.id===id),i=data.days.indexOf(d);if(!d||!editing)return;const modal=$('#modal');modal.innerHTML=`<section class="manage-day-menu"><h2>${esc(d.name)}</h2>${btn('✎ Modifica giorno','edit-day',`data-id="${id}"`,'primary full')}${btn('Duplica giorno','duplicate-day',`data-id="${id}"`,'primary full')}${btn('↑ Sposta prima','move-day-up',`data-id="${id}" ${i===0?'disabled':''}`,'primary full')}${btn('↓ Sposta dopo','move-day-down',`data-id="${id}" ${i===data.days.length-1?'disabled':''}`,'primary full')}${btn('Elimina giorno','delete-day',`data-id="${id}"`,'danger full')}<div class="actions">${btn('Chiudi','close-modal','type="button"')}</div></section>`;for(const button of modal.querySelectorAll('[data-id]'))button.addEventListener('click',()=>modal.close(),{once:true});if(!modal.open)modal.showModal();}
function moveDay(id,offset){const list=data.days,i=list.findIndex(d=>d.id===id),j=i+offset;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];save();render();}
const actions={'preview-warning':()=>playWarningSound(),'manage-day':el=>manageDay(el.dataset.id),'move-day-up':el=>moveDay(el.dataset.id,-1),'move-day-down':el=>moveDay(el.dataset.id,1),...EmpireOnlineUI.actions,'share-plan':sharePlan,'share-file-options':shareFileOptions,'share-file':()=>sharePlanFile(),'save-plan-file':()=>sharePlanFile(true),'share-pdf':sharePlanPDF,'receive-file':()=>{fileMode='empire';if(window.Android)Android.pickFile('*/*');else{const input=$('#file');input.accept='.empire';input.value='';input.click();}},'confirm-plan':confirmPlan,'confirm-day':confirmDay,'plan-metadata':()=>editPlan(data.activePlanId),'day-metadata':()=>editDay(route.dayId),'clear-search':clearSearch,...EmpireWeighUI.actions,'page-tutorial':()=>showPageTutorial(),back,'finish-exercise':finishExercise,'edit-weight':openWeightPad,'weight-up':el=>adjustWeightStep(el,1),'weight-down':el=>adjustWeightStep(el,-1),'weight-step':el=>editWeightStep(el.dataset.id),'weight-step-preset':el=>{const input=$('#modal [name="weight-step"]');if(input){input.value=el.dataset.value.replace('.',',');input.dispatchEvent(new Event('input',{bubbles:true}));}},'return-recovery':returnToRecovery,'weight-key':el=>weightKey(el.dataset.key),'weight-done':()=>{const el=weightEditor?.input;closeWeightPad();if(el)window.EmpireKeyboard?.advance(el);},'toggle-plan':el=>togglePlanCard(el.dataset.id),'day-overview':el=>showDayOverview(el.dataset.plan,el.dataset.id),'open-home-day':el=>openHomeDay(el.dataset.plan,el.dataset.id),'mark-day-done':markDayDone,'unmark-day-done':unmarkDayDone,'delete-plan':el=>deletePlan(el.dataset.id),profile:editProfile,'date-calendar':el=>openCalendar(el.dataset.target),'calendar-clear':clearEndDate,'calendar-prev':()=>calendarMonth(-1),'calendar-next':()=>calendarMonth(1),'calendar-pick':el=>pickCalendarDate(el.dataset.date),'new-plan':()=>editPlan(),'edit-plan':el=>startPlanPreparation(el.dataset.id),'open-plan':el=>openPlan(el.dataset.id),'all-plans':allPlans, 'close-modal':()=>{if(!EmpireWeighUI.finishGuide())$('#modal').close();schedulePageHelp();},settings:()=>go({page:'settings'}),history:()=>go({page:'history'}),'history-range':el=>{route.range=el.dataset.range;data.lastView={...route};save();render();},'resume-session':el=>resumeSession(el.dataset.id),'edit-days':()=>startPlanPreparation(data.activePlanId),'new-day':()=>editDay(),day:el=>openDay(el.dataset.id),'edit-day':el=>editDay(el.dataset.id),sample,
 'duplicate-day':el=>{const src=data.days.find(x=>x.id===el.dataset.id),copy=JSON.parse(JSON.stringify(src)),map={};copy.id=C.uid();copy.name+=' (copia)';delete copy.sample;delete copy.manualCompletion;delete copy.importedColumns;delete copy.importedDetails;delete copy.archivedImportedExercises;for(const e of copy.exercises)delete e.importedHistory;for(const e of copy.exercises){map[e.id]=C.uid();}for(const e of copy.exercises){e.id=map[e.id];e.pairId=map[e.pairId]||null;}data.days.push(copy);save();render();},
 'delete-day':el=>ask('Elimina giorno','La scheda verrà rimossa. Gli allenamenti registrati restano nello storico esportabile e nel backup.',()=>{if(data.days.find(d=>d.id===el.dataset.id)?.exercises.some(e=>e.id===data.timer?.exerciseId))cancelTimer();const removed=data.days.find(d=>d.id===el.dataset.id);if(removed?.importedColumns?.length)(activePlan().importedArchive||(activePlan().importedArchive=[])).push(JSON.parse(JSON.stringify(removed)));data.days=data.days.filter(d=>d.id!==el.dataset.id);save();render();}),
 'edit-exercises':()=>{day().preparing=true;save();render();},'exercise':el=>{const e=day().exercises.find(e=>e.id===el.dataset.id);if(day().preparing||!valid(e))editExercise(e.id);else go({page:'workout',dayId:route.dayId,exerciseId:e.id,sessionId:route.sessionId});},'edit-exercise':el=>editExercise(el.dataset.id),
 'delete-exercise':el=>removeExerciseBlock(el.dataset.id),
 'move-up':el=>move(el.dataset.id,-1),'move-down':el=>move(el.dataset.id,1),
 'choose-muscles':()=>{selectDay=route.dayId;selection=new Set();go({page:'muscles',dayId:route.dayId});},catalog:el=>go({page:'catalog',dayId:selectDay,muscle:el.dataset.id}),
 'select-exercise':el=>addCatalogExercise(el.dataset.id),'custom-exercise':customExercise,
 'selection-groups':selectionGroups,'review-selection':reviewSelection,'commit-selection':finishSelection,
 'all-muscles':()=>setMuscles(true),'no-muscles':()=>setMuscles(false),play,
 pause:()=>{if(data.timer?.running){data.timer.paused=Math.max(0,(data.timer.end-Date.now())/1000);data.timer.running=false;notifyNative();save();updateTimer();}},'reset-timer':cancelTimer,
 'toggle-series':el=>{const d=day(),s=currentSession(d,true),e=d.exercises.find(e=>e.id===el.dataset.entry),en=getEntry(s,e),i=+el.dataset.series,done=!en.series[i].done,p=d.exercises.find(x=>x.id===e.pairId);for(const item of [e,...(p?[p]:[])]){getEntry(s,item);if(done)R.complete(activePlan(),s,item.id,i);else R.uncomplete(s,item.id,i);}save();render();},
 'add-step':el=>{const en=currentSession(day()).entries[el.dataset.entry];en.series[+el.dataset.series].steps.push({load:'',reps:''});save();render();document.querySelector(`[data-entry="${el.dataset.entry}"][data-series="${el.dataset.series}"][data-action="add-step"]`).closest('details').open=true;},'remove-step':el=>{currentSession(day()).entries[el.dataset.entry].series[+el.dataset.series].steps.splice(+el.dataset.step,1);save();render();},
 'internal-pause':()=>showModal('Pausa interna rest pause','<label>Secondi<input name="seconds" type="number" min="1" max="300" required placeholder="Secondi previsti nella scheda"></label><p class="muted">Questo timer non scala le serie.</p>',f=>{if(data.timer?.running||data.timer?.paused)throw Error('Termina o reimposta il timer attivo.');startTimer(+f.get('seconds'),'Pausa interna',route.exerciseId);},'Avvia pausa'),
 'tech-info':el=>{const e=day().exercises.find(x=>x.id===el.dataset.id);showModal(e.technique,`<p class="techinfo">${esc(e.notes||data.definitions[e.technique]||TECH_HELP[e.technique]||'Nessuna indicazione aggiuntiva.')}</p>`,()=>{},'Chiudi');},
 'close-session':endSessionEarly,'finish-session':finishSession,'end-session-early':endSessionEarly,
 'new-session':()=>ask('Nuova sessione','I dati attuali restano nello storico. Vuoi iniziare una nuova sessione? La prima serie proporrà il carico migliore di questo esercizio in questo giorno.',()=>{const s=currentSession(day());if(s)stampSession(s,day());cancelTimer();save();render();}),
 'restart-exercise':el=>ask('Ricomincia esercizio','Il tentativo attuale verrà conservato in una sessione archiviata. Gli altri esercizi restano nella sessione corrente.',()=>{const d=day(),s=currentSession(d),e=d.exercises.find(x=>x.id===el.dataset.id),ids=[e.id,...(e.pairId?[e.pairId]:[])],entries={};for(const id of ids){if(s.entries[id]){entries[id]=s.entries[id];delete s.entries[id];}}data.sessions.push({id:C.uid(),dayId:d.id,dayName:d.name,date:s.date,started:s.started,finished:new Date().toISOString(),closed:true,archiveReason:'exercise-restart',entries});cancelTimer();save();render();}),
 import:()=>chooseExcelTarget('import'),export:()=>route.page==='home'?chooseExcelTarget('export'):exportExcel(),'sync-export':()=>{if(damagedArchive){toast('Archivio danneggiato: esporta il backup originale.');return;}const pkg={format:'EMPIRE_SYNC_SNAPSHOT_V1',createdAt:new Date().toISOString(),payload:data};download(new TextEncoder().encode(JSON.stringify(pkg)),'Empire_SYNC_'+localDate()+'.json','application/json');toast('Copia SYNC esportata.');},'sync-import':()=>chooseFile('sync-import'),backup:()=>download(new TextEncoder().encode(damagedArchive||JSON.stringify(data,null,2)),'Empire_backup_'+localDate()+'.json','application/json'),restore:()=>chooseFile('restore'),permissions:()=>Android.requestTimerPermissions()
};
function move(id,offset){const d=day(),blocks=dayBlocks(d),i=blocks.findIndex(b=>b.some(e=>e.id===id)),j=i+offset;if(i<0||j<0||j>=blocks.length)return;[blocks[i],blocks[j]]=[blocks[j],blocks[i]];d.exercises=blocks.flat();save();render();}
function setMuscles(value){document.querySelectorAll('input[name="muscles"]').forEach(x=>x.checked=value);updateBodyPreview();}
function updateBodyPreview(){const message=$('#muscle-message');if(message){message.hidden=!!document.querySelector('input[name="muscles"]:checked');}if($('#muscle-preview'))$('#muscle-preview').innerHTML=bodyMap([...document.querySelectorAll('input[name="muscles"]:checked')].map(x=>x.value));}
// Home day tiles: scrolling cancels the hold; the release click cannot open the day.
let homeDayPress=null,homeDayBlocked=null;
function blockHomeDayClick(el){homeDayBlocked={plan:el.dataset.plan,id:el.dataset.id,until:Date.now()+1600};}
function cancelHomeDayPress(block=false){const press=homeDayPress;if(!press)return;clearTimeout(press.timer);if(block||press.fired)blockHomeDayClick(press.el);homeDayPress=null;}
function startHomeDayPress(ev){
 cancelHomeDayPress(true);
 const el=ev.target.closest?.('[data-hold-action="day-overview"]');
 if(!el||!['home','plan'].includes(route.page)||$('#modal').open||ev.button>0||ev.isPrimary===false)return;
 if(ev.touches&&ev.touches.length!==1)return;
 homeDayBlocked=null;const point=ev.touches?ev.touches[0]:ev;
 const press={el,x:point.clientX,y:point.clientY,pointerId:ev.pointerId,fired:false};homeDayPress=press;
 press.timer=setTimeout(()=>{if(homeDayPress!==press||!['home','plan'].includes(route.page)||$('#modal').open||el.isConnected===false)return;press.fired=true;blockHomeDayClick(el);showDayOverview(el.dataset.plan,el.dataset.id);},550);
}
function moveHomeDayPress(ev){const press=homeDayPress;if(!press||(ev.pointerId!==undefined&&ev.pointerId!==press.pointerId))return;const point=ev.touches?ev.touches[0]:ev;if(!point||Math.hypot(point.clientX-press.x,point.clientY-press.y)>12)cancelHomeDayPress(true);}
function endHomeDayPress(ev){if(homeDayPress&&ev.pointerId!==undefined&&ev.pointerId!==homeDayPress.pointerId)return;cancelHomeDayPress();}
function suppressHomeDayClick(el){if(el.dataset.holdAction!=='day-overview')return false;const b=homeDayBlocked;if(!b||b.plan!==el.dataset.plan||b.id!==el.dataset.id||Date.now()>b.until)return false;homeDayBlocked=null;return true;}
if(window.PointerEvent){document.addEventListener('pointerdown',startHomeDayPress,{passive:true});document.addEventListener('pointermove',moveHomeDayPress,{passive:true});document.addEventListener('pointerup',endHomeDayPress,{passive:true});document.addEventListener('pointercancel',()=>cancelHomeDayPress(true),{passive:true});}
else{document.addEventListener('touchstart',startHomeDayPress,{passive:true});document.addEventListener('touchmove',moveHomeDayPress,{passive:true});document.addEventListener('touchend',endHomeDayPress,{passive:true});document.addEventListener('touchcancel',()=>cancelHomeDayPress(true),{passive:true});document.addEventListener('mousedown',startHomeDayPress);document.addEventListener('mousemove',moveHomeDayPress);document.addEventListener('mouseup',endHomeDayPress);}
document.addEventListener('scroll',()=>{if(homeDayPress&&!homeDayPress.fired)cancelHomeDayPress(true);},true);
document.addEventListener('contextmenu',ev=>{if(ev.target.closest?.('[data-hold-action="day-overview"]'))ev.preventDefault();});
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){cancelHomeDayPress();homeDayBlocked=null;}});
document.addEventListener('click',ev=>{if(weightEditor&&!ev.target.closest('#weight-pad,.weight-control'))closeWeightPad();const el=ev.target.closest('[data-action]');if(!el)return;ev.preventDefault();if(suppressHomeDayClick(el))return;try{actions[el.dataset.action]?.(el);}catch(e){console.error(e);toast(e.message||'Operazione non riuscita.');}});
document.addEventListener('input',ev=>{const el=ev.target;if(el.name==='plan-start'||el.name==='plan-end')formatDateTyping(el);if(el.id==='search'){search=el.value;refreshCatalog();return;}if(el.dataset.field){if(el.type==='number'&&el.value!==''&&Number(el.value)<0){el.value='';return;}const en=currentSession(day())?.entries[el.dataset.entry];if(!en)return;let v=en.series[+el.dataset.series];if(el.dataset.step!==undefined)v=v.steps[+el.dataset.step];v[el.dataset.field]=el.value;if(el.dataset.field==='load'&&el.dataset.step===undefined)v.loadTouched=true;save();updateRecordIndicators();}});
document.addEventListener('change',ev=>{const el=ev.target;if(el.dataset.recovery)syncRecoveryField(el.dataset.recovery,!el.disabled);if(el.name==='muscles')updateBodyPreview();if(el.name==='technique')syncSupersetFields();if(el.name==='pair')fillPartnerFields();if(el.dataset.calendar&&calendarState){calendarState[el.dataset.calendar]=Number(el.value);drawCalendar();}if(el.id==='warning-sound'){data.settings.warningSound=el.value;save();notifyNative();}if(el.dataset.setting){data.settings[el.dataset.setting]=el.checked;save();notifyNative();}if(el.id==='file'&&el.files[0])el.files[0].arrayBuffer().then(b=>readFile(new Uint8Array(b)));});
document.addEventListener('dragstart',ev=>{dragId=ev.target.closest('[data-drag]')?.dataset.drag;});document.addEventListener('dragover',ev=>{if(editing)ev.preventDefault();});document.addEventListener('drop',ev=>{ev.preventDefault();const target=ev.target.closest('[data-drag]')?.dataset.drag;if(!editing||!target||!dragId||!day())return;moveBlockTo(dragId,target);});
let touch;document.addEventListener('touchstart',ev=>{if(route.page==='catalog'&&!ev.target.closest('input'))touch={x:ev.touches[0].clientX,y:ev.touches[0].clientY};else touch=null;},{passive:true});document.addEventListener('touchend',ev=>{if(touch&&route.page==='catalog'&&ev.changedTouches[0].clientX-touch.x>90&&Math.abs(ev.changedTouches[0].clientY-touch.y)<65)back();touch=null;},{passive:true});
function reconcileNativeTimer(){if(!window.Android?.nativeTimerStatus||!data.timer?.running)return;try{const native=JSON.parse(Android.nativeTimerStatus());if(native.active===false&&data.timer.end>Date.now()){if(native.cancelledEnd===data.timer.end||native.cancelledEnd===undefined){data.timer.running=false;data.timer.paused=0;data.timer.returnToDay=false;save();window.Android.keepAwake?.(false);}else notifyNative();}}catch(e){console.error('Stato timer Android non disponibile',e);}}
window.empireReconcileTimer=()=>{reconcileNativeTimer();updateTimer();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.empireReconcileTimer();});reconcileNativeTimer();setInterval(updateTimer,250);render();
function finishStartup(){pageHelpReady=true;const splash=document.getElementById('startup-splash');if(splash)splash.hidden=true;$('#app')?.removeAttribute?.('aria-busy');maybeShowIntro();}
document.addEventListener('close',ev=>{if(ev.target.id==='modal')schedulePageHelp();},true);
function queueStartupReady(){if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(()=>window.requestAnimationFrame(finishStartup));else setTimeout(finishStartup,0);}
if(document.readyState==='complete'||!window.addEventListener)queueStartupReady();else window.addEventListener('load',queueStartupReady,{once:true});
