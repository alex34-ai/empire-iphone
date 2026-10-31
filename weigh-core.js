/* Stable weight is retained independently of workout plans.
   Empire estimates use documented anthropometric equations; raw QN impedance is preserved,
   not treated as calibrated whole-body resistance or reactance. */
(function(root){'use strict';
const metrics=[['weight','Peso','kg',2,500],['bmi','BMI','',1,100],['bodyFat','Grasso corporeo','%',1,100],['subcutaneousFat','Grasso sottocutaneo','%',1,100],['visceralFat','Grasso viscerale','',0,100],['bodyWater','Acqua corporea','%',1,100],['muscleMass','Massa muscolare','kg',2,500],['boneMass','Massa ossea','kg',2,100],['bmr','BMR','kcal',0,20000],['metabolicAge','Età metabolica','anni',0,150]];
const methods={
 bodyFat:{id:'rfm-2018-v1',name:'RFM · Woolcott e Bergman (2018)',url:'https://doi.org/10.1038/s41598-018-29362-1',inputs:['height','waist','sex']},
 bodyWater:{id:'watson-1980-v1',name:'Watson et al. (1980)',url:'https://doi.org/10.1093/ajcn/33.1.27',inputs:['weight','height','age','sex']},
 bmr:{id:'mifflin-1990-v1',name:'Mifflin–St Jeor (1990)',url:'https://doi.org/10.1093/ajcn/51.2.241',inputs:['weight','height','age','sex']}
};
function number(x){if(x===null||x===undefined||!['number','string'].includes(typeof x)||String(x).trim()==='')return null;const n=Number(String(x).replace(',','.'));return Number.isFinite(n)?n:null;}
function profile(input){
 const firstName=String(input?.firstName||'').trim(),lastName=String(input?.lastName||'').trim(),height=number(input?.height),age=number(input?.age),sex=String(input?.sex||''),waist=number(input?.waist);
 if(!firstName||firstName.length>60||!lastName||lastName.length>60||height===null||height<50||height>260||!Number.isInteger(age)||age<1||age>120)throw Error('Inserisci nome, cognome, altezza tra 50 e 260 cm ed età tra 1 e 120 anni.');
 if(sex&&!['male','female'].includes(sex))throw Error('Scegli il sesso da utilizzare nelle formule oppure lascia il campo vuoto.');
 if(input?.waist!==undefined&&input?.waist!==null&&String(input.waist).trim()!==''&&(waist===null||waist<40||waist>250))throw Error('Inserisci una circonferenza vita tra 40 e 250 cm oppure lascia il campo vuoto.');
 return {firstName,lastName,height,age,...(input?.sex!==undefined?{sex}:{}),...(input?.waist!==undefined?{waist}: {})};
}
function ready(p){try{profile(p);return true;}catch{return false;}}
function clean(values){const result={};for(const [key,,,precision,max] of metrics){const n=number(values?.[key]);if(n!==null&&n>=0&&n<=max&&(key!=='weight'||n>0))result[key]=Math.round(n*1e6)/1e6;}return result;}
function state(d){if(!d.weighing)d.weighing={records:[],guideSeen:false,device:null};return d.weighing;}
function inputs(p,weight){return {weight:number(weight),height:number(p?.height),age:number(p?.age),sex:p?.sex,waist:number(p?.waist)};}
function eligible(p){return ['male','female'].includes(p.sex)&&Number.isInteger(p.age)&&p.age>=20&&p.age<=78&&p.height>=120&&p.height<=220&&p.weight>=35&&p.weight<=250;}
function calculate(key,p){
 if(!eligible(p))return null;let n;
 if(key==='bodyFat'){if(p.waist===null||p.waist<40||p.waist>250)return null;n=64-20*p.height/p.waist+(p.sex==='female'?12:0);if(n<2||n>70)return null;}
 else if(key==='bodyWater'){const liters=p.sex==='male'?2.447-.09516*p.age+.1074*p.height+.3362*p.weight:-2.097+.1069*p.height+.2466*p.weight;n=liters/p.weight*100;if(n<20||n>85)return null;}
 else if(key==='bmr'){n=10*p.weight+6.25*p.height-5*p.age+(p.sex==='male'?5:-161);if(n<600||n>5000)return null;}
 else return null;
 return Math.round(n*(key==='bmr'?1:10))/(key==='bmr'?1:10);
}
function estimateMissing(record,p,at=new Date().toISOString()){
 if(!record?.metrics?.weight||!ready(p)||!Number.isFinite(Date.parse(at)))return false;
 const values=inputs(p,record.metrics.weight);let changed=false;
 for(const [key,m] of Object.entries(methods)){
  if(record.metrics[key]!==undefined)continue;const value=calculate(key,values);if(value===null)continue;
  record.metrics[key]=value;record.estimates||={};record.estimates[key]={method:m.id,inputs:{...values},at};changed=true;
 }
 return changed;
}
function today(at){const d=new Date(at);return Number.isFinite(d.getTime())?d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate():'';}
function estimateLatest(d,now=new Date().toISOString()){
 const w=state(d);if(w.estimatesEnabled===false)return false;
 const record=[...w.records].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
 // An explicitly saved profile can fill missing estimates on today's latest measurement.
 // Existing estimates and earlier dates are never rewritten with a current waist or age.
 return record&&today(record.at)===today(now)?estimateMissing(record,d.profile,now):false;
}
function validate(w,p){
 if(p&&(p.height!==undefined||p.age!==undefined))profile(p);if(w===undefined)return;
 if(!w||!Array.isArray(w.records)||typeof w.guideSeen!=='boolean'||w.estimatesEnabled!==undefined&&typeof w.estimatesEnabled!=='boolean'||w.device!==null&&(!w.device||typeof w.device.id!=='string'||typeof w.device.name!=='string'))throw Error('Archivio Pesati non valido.');
 const ids=new Set();for(const r of w.records){
  if(!r||typeof r.id!=='string'||ids.has(r.id)||!Number.isFinite(Date.parse(r.at))||!Array.isArray(r.eventIds)||!r.eventIds.every(x=>typeof x==='string')||typeof r.stream!=='string'||typeof r.source!=='string'||!r.metrics||typeof r.metrics!=='object'||r.metrics.weight===undefined||Object.keys(clean(r.metrics)).length!==Object.keys(r.metrics).length||Object.keys(r.metrics).some(k=>clean(r.metrics)[k]!==r.metrics[k]))throw Error('Pesata non valida nel backup.');
  if(r.estimates!==undefined){if(!r.estimates||typeof r.estimates!=='object'||Array.isArray(r.estimates))throw Error('Stime Pesati non valide.');for(const [key,e] of Object.entries(r.estimates)){if(!methods[key]||!e||e.method!==methods[key].id||!Number.isFinite(Date.parse(e.at))||!e.inputs||e.inputs.weight!==r.metrics.weight||calculate(key,e.inputs)!==r.metrics[key])throw Error('Stima Empire non valida nel backup.');}}
  if(r.comparisons!==undefined){if(!Array.isArray(r.comparisons)||r.comparisons.length>30)throw Error('Confronti non validi.');for(const x of r.comparisons){if(!x||x.source!=='Goodvibes'||x.confirmedSameMeasurement!==true||!Number.isFinite(Date.parse(x.enteredAt))||!x.metrics||!x.metrics.weight||Math.abs(x.metrics.weight-r.metrics.weight)>.051||Object.keys(clean(x.metrics)).length!==Object.keys(x.metrics).length||Object.keys(x.metrics).some(k=>clean(x.metrics)[k]!==x.metrics[k]))throw Error('Confronto Goodvibes non valido.');}}
  ids.add(r.id);
 }
}
function ingest(d,event){
 const w=state(d);if(!event||typeof event.id!=='string'||typeof event.stream!=='string'||!Number.isFinite(Date.parse(event.at)))return null;
 if(w.records.some(r=>r.eventIds.includes(event.id)))return null;const incoming=clean(event.metrics);if(!Object.keys(incoming).length&&!(number(event.waterMass)>0))return null;
 const last=w.records.at(-1),gap=last?Math.abs(Date.parse(event.at)-Date.parse(last.at)):Infinity;let record;
 if(last&&last.stream===event.stream&&gap<=10000&&(incoming.weight===undefined||incoming.weight===last.metrics.weight)){
  Object.assign(last.metrics,incoming);for(const key of Object.keys(incoming))if(last.estimates)delete last.estimates[key];if(last.estimates&&!Object.keys(last.estimates).length)delete last.estimates;
  if(incoming.bmi!==undefined)delete last.bmiCalculated;if(incoming.bodyWater!==undefined)delete last.bodyWaterCalculated;last.eventIds.push(event.id);record=last;
 }else{if(incoming.weight===undefined)return null;record={id:event.id,at:event.at,stream:event.stream,source:String(event.source||'Bilancia Bluetooth').slice(0,120),eventIds:[event.id],metrics:incoming};if(ready(d.profile))record.profileAtCapture=inputs(d.profile,incoming.weight);w.records.push(record);}
 if(typeof event.protocol==='string'){record.sensor={...record.sensor,protocol:event.protocol.slice(0,50)};for(const key of ['resistanceRaw1','resistanceRaw2'])if(Number.isFinite(event[key])&&event[key]>=0&&event[key]<=65535)record.sensor[key]=event[key];if(typeof event.rawPacket==='string'&&/^[a-f0-9 ]{8,256}$/i.test(event.rawPacket))record.sensor.rawPacket=event.rawPacket;}
 if(record.metrics.bmi===undefined&&ready(d.profile)){const bmi=Math.round(record.metrics.weight/((d.profile.height/100)**2)*10)/10;if(bmi<=100){record.metrics.bmi=bmi;record.bmiCalculated=true;}}
 if((record.metrics.bodyWater===undefined||record.estimates?.bodyWater)&&number(event.waterMass)>0&&record.metrics.weight>0){const percent=number(event.waterMass)/record.metrics.weight*100;if(percent>=0&&percent<=100){record.metrics.bodyWater=Math.round(percent*10)/10;record.bodyWaterCalculated=true;if(record.estimates)delete record.estimates.bodyWater;}}
 if(w.estimatesEnabled!==false)estimateMissing(record,d.profile,event.at);
 if(record.estimates&&!Object.keys(record.estimates).length)delete record.estimates;
 return record;
}
// Manual reference readings never overwrite native metrics or estimation provenance.
function pairGoodvibes(record,values,p,confirmed,at=new Date().toISOString()){
 if(!record||!confirmed)throw Error('Conferma che i valori si riferiscono alla stessa pesata e allo stesso profilo.');
 const ref=clean(values);if(!ref.weight||Math.abs(ref.weight-record.metrics.weight)>.051)throw Error('Il peso Goodvibes deve corrispondere alla pesata selezionata (tolleranza 0,05 kg).');
 if(Object.keys(ref).length<2)throw Error('Inserisci almeno un parametro oltre al peso.');
 if(!Number.isFinite(Date.parse(at)))throw Error('Data del confronto non valida.');
 const savedProfile=record.profileAtCapture||Object.values(record.estimates||{})[0]?.inputs||inputs(p,record.metrics.weight);
 const item={source:'Goodvibes',enteredAt:at,confirmedSameMeasurement:true,profile:{...savedProfile},metrics:ref};
 record.comparisons||=[];if(record.comparisons.length>=30)throw Error('Questa pesata ha già 30 confronti.');record.comparisons.push(item);return item;
}
function comparisonReport(d){return {format:'Empire Goodvibes comparisons v1',appVersion:'1.5.19',records:state(d).records.filter(r=>r.comparisons?.length).map(r=>JSON.parse(JSON.stringify({id:r.id,at:r.at,source:r.source,metrics:r.metrics,sensor:r.sensor,profile:r.profileAtCapture,estimates:r.estimates,comparisons:r.comparisons}))) };}
function series(w,key,period='month',now=Date.now()){const count={week:7,month:31,year:366,all:Infinity}[period]||31,limit=now-count*86400000;return (w?.records||[]).filter(r=>Date.parse(r.at)>=limit&&Date.parse(r.at)<=now&&number(r.metrics[key])!==null).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));}
function origin(r,key){return r?.metrics?.[key]===undefined?'Non disponibile':r.estimates?.[key]?'Stima Empire · '+methods[key].name:key==='bmi'&&r.bmiCalculated?'Calcolo da peso e altezza':key==='bodyWater'&&r.bodyWaterCalculated?'Calcolo dalla massa d’acqua ricevuta':'Bilancia';}
function csv(w){const quote=x=>'"'+(typeof x==='string'&&/^[=+@-]/.test(x)?"'"+x:String(x??'')).replace(/"/g,'""')+'"';return '\ufeff'+[['Data e ora','Bilancia',...metrics.map(m=>m[1]+(m[2]?' ('+m[2]+')':'')),...metrics.map(m=>'Origine '+m[1]),'Formule e dati di ingresso'],...(w?.records||[]).map(r=>[r.at,r.source,...metrics.map(m=>r.metrics[m[0]]??''),...metrics.map(m=>origin(r,m[0])),r.estimates?JSON.stringify(r.estimates):''])].map(row=>row.map(quote).join(';')).join('\r\n');}
const api={metrics,methods,number,profile,ready,clean,state,validate,ingest,series,csv,calculate,eligible,estimateMissing,estimateLatest,origin,pairGoodvibes,comparisonReport};root.EmpireWeigh=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
