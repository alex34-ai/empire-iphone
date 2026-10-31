/* Independent workout plans. Each plan owns its days, sessions and definitions. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=()=>root.EmpireCore.uid();
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function dateToISO(value){const raw=String(value??'').trim();if(validDate(raw))return raw;const m=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return null;const iso=m[3]+'-'+m[2]+'-'+m[1];return validDate(iso)?iso:null;}
function dateIT(value){return validDate(value)?value.split('-').reverse().join('/'):'';}
function metadata(input,allowEmptyDates=false){
 const name=String(input.name??'').trim(),startDate=input.startDate??'',endDate=input.endDate??'';
 if(!name||name.length>80)throw Error('Inserisci un nome per la scheda (massimo 80 caratteri).');
 if(!(allowEmptyDates&&startDate===''&&endDate==='')){
  if(!validDate(startDate))throw Error('Inserisci una data di inizio valida.');
  if(endDate!==''&&!validDate(endDate))throw Error('Inserisci una data di fine valida oppure lasciala vuota.');
  if(endDate&&endDate<startDate)throw Error('La fine della scheda non può precedere l’inizio.');
 }
 return {name,startDate,endDate};
}
function active(d){return d.plans.find(p=>p.id===d.activePlanId)||null;}
function bind(d){
 for(const key of ['days','sessions','definitions'])Object.defineProperty(d,key,{
  configurable:true,enumerable:false,
  get(){return active(d)?.[key]||(key==='definitions'?{}:[]);},
  set(value){const p=active(d);if(!p)throw Error('Apri prima una scheda.');p[key]=value;}
 });
 return d;
}
function fresh(definitions={}){
 return bind({schema:2,plans:[],activePlanId:null,custom:[],settings:{sound:true,vibration:true,warningSound:'beep'},profile:{firstName:'',lastName:''},onboardingSeen:false,timer:null,lastQuote:-1});
}
function create(d,input,definitions={}){
 const meta=metadata(input),p={id:uid(),...meta,days:[],sessions:[],definitions:clone(definitions)};
 d.plans.push(p);return p;
}
function update(d,id,input){
 const p=d.plans.find(p=>p.id===id);if(!p)throw Error('Scheda non trovata.');
 const meta=metadata(input);Object.assign(p,meta);return p;
}
function validate(d,legacyValidator){
 if(d?.schema===1){legacyValidator(d);return;}
 if(!d||d.schema!==2||!Array.isArray(d.plans)||!Array.isArray(d.custom)||!d.settings)throw Error('Backup Empire non valido.');
 if(d.profile&&(typeof d.profile.firstName!=='string'||typeof d.profile.lastName!=='string'||d.profile.firstName.length>60||d.profile.lastName.length>60))throw Error('Profilo utente non valido.');
 const plans=new Set();
 for(const p of d.plans){
  if(typeof p.id!=='string'||!p.id||plans.has(p.id))throw Error('Identificativo scheda non valido.');
  plans.add(p.id);metadata(p,true);
  legacyValidator({schema:1,days:p.days,sessions:p.sessions,definitions:p.definitions,custom:d.custom,settings:d.settings});
  const exercises=new Set(),sessions=new Set();
  for(const day of p.days)for(const e of day.exercises){if(exercises.has(e.id))throw Error('Esercizio duplicato nella scheda.');exercises.add(e.id);}
  for(const s of p.sessions){
   if(typeof s.id!=='string'||!s.id||sessions.has(s.id)||typeof s.dayId!=='string')throw Error('Identificativo sessione non valido.');
   sessions.add(s.id);
  }
 }
 if(d.activePlanId!==null&&d.activePlanId!==undefined&&!plans.has(d.activePlanId))throw Error('Scheda selezionata non trovata nel backup.');
}
function prepare(input,legacyValidator){
 validate(input,legacyValidator);let d=input;
 if(input.schema===1){
  const populated=input.days.length||input.sessions.length;
  const p=populated?{id:uid(),name:'Scheda precedente',startDate:'',endDate:'',days:input.days,sessions:input.sessions,definitions:input.definitions}:null;
  d={schema:2,plans:p?[p]:[],activePlanId:p?.id||null,custom:input.custom,settings:input.settings,timer:input.timer||null,lastQuote:input.lastQuote??-1,lastView:input.lastView?{...input.lastView,planId:p?.id}:undefined};
  if(d.lastView?.page==='home')d.lastView.page='plan';
  if(d.timer)d.timer.planId=p?.id;
 }
 delete d.settings.quotes;delete d.lastQuote;if(!['beep','double','chime','go-baby'].includes(d.settings.warningSound))d.settings.warningSound='beep';
 d.profile=d.profile||{firstName:'',lastName:''};d.onboardingSeen=!!d.onboardingSeen;
 if(d.timer&&!d.plans.some(p=>p.id===d.timer.planId))d.timer=null;
 return bind(d);
}
function scope(d){const p=active(d);if(!p)throw Error('Apri prima una scheda.');return {days:p.days,sessions:p.sessions,definitions:p.definitions,importedArchive:p.importedArchive||[]};}
const api={validDate,dateToISO,dateIT,metadata,active,bind,fresh,create,update,validate,prepare,scope};
root.EmpirePlans=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
