/* Empire data and Excel engine. Original dated load cells are retained separately from live sessions and records. */
(function(root){'use strict';
const uid=()=>globalThis.crypto?.randomUUID?.()||'e'+Date.now().toString(36)+Math.random().toString(36).slice(2);
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function parseSets(value){const s=String(value??'').trim();const m=s.match(/^(\d+)\s*(?:[x×*\/]|serie\s*(?:da|di))\s*(.+)/i);return m?{sets:+m[1],reps:m[2].trim().replace(/\s+(?:drop[ -]*set|rest[ -]*pause|super[ -]*set|superserie|eccentric[a-z]*).*$/i,'').trim()}:{sets:null,reps:s};}
function parseRest(v){
 if(v===null||v===undefined||String(v).trim()==='')return null;
 if(typeof v==='number'&&v>0&&v<1)return Math.round(v*86400);
 const s=norm(v).replace(/[’′]/g,"'").replace(/[”″]/g,'"');if(/^[—–-]$/.test(s))return 0;
 let m=s.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\s|$)/);if(m)return +m[2]<60&&+m[3]<60?+m[1]*3600+(+m[2])*60+(+m[3]):null;
 m=s.match(/^(\d+)\s*:\s*(\d{1,2})(?:\s|$)/);if(m)return +m[2]<60?+m[1]*60+(+m[2]):null;
 m=s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min(?:uti|utes?)?|m(?=\d|\s|$)|')\s*(?:(\d+)\s*(?:sec(?:ondi|onds?)?|s|"))?/);if(m)return Math.round(+m[1].replace(',','.')*60)+Number(m[2]||0);
 m=s.match(/^(\d+)\s*(?:sec(?:ondi|onds?)?|s\b|")/);if(m)return +m[1];return /^\d+$/.test(s)?+s:null;
}
function hasSeriesData(v){return !!v.done||v.load!==''&&v.load!==undefined||v.reps!==''&&v.reps!==undefined||(v.steps||[]).some(t=>t.load!==''||t.reps!=='');}
function detectTechnique(text){let s=norm(text);let types=[];if(/super\s*set|superserie|super serie/.test(s))types.push('Superset');if(/drop[ -]*set|stripping|serie a scalare/.test(s))types.push('Drop set');if(/rest[ -]*pause/.test(s))types.push('Rest pause');if(/eccentric/.test(s))types.push('Eccentrica');if(/contrazion/.test(s))types.push('Pausa in contrazione');if(/allungament/.test(s))types.push('Pausa in allungamento');return types.length?types.join(' + '):'Normale';}
function headerKey(value){
 const s=norm(value).replace(/[\n\r_.:()\[\]]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:esercizi?o?|nome esercizio|nome esercizi|esercizio nome|exercise(?: name)?|movement|movimento|attivita|nome movimento)$/.test(s))return 'name';
 if(/^(?:serie|sets?|n(?:r)?[°º]? serie|numero (?:di )?serie|series)(?: n[°º]?)?$/.test(s))return 'series';
 if(/^(?:(?:serie|sets?)\s*[/x×*+-]\s*(?:rip(?:etizioni)?|reps?)|serie rip(?:etizioni)?|sets reps)$/.test(s))return 'sets';
 if(/^(?:rip(?:etizioni)?|reps?|ripetizioni durata|ripetizioni o durata|durata|repetitions|ripetizioni per serie|n[°º]? ripetizioni)$/.test(s))return 'reps';
 if(/^(?:(?:rec(?:upero)?|rest|recovery|pausa)(?:\s+(?:time|sec(?:ondi|onds?)?|s|min(?:uti|utes?)?|mm\s*:\s*ss|mm ss))?|tempo di recupero)$/.test(s))return 'rest';
 if(/^(?:tecnica|tecniche|technique|metodo|intensificazione|esecuzione)$/.test(s))return 'tech';
 if(/^(?:note|notes|indicazioni|istruzioni|descrizione tecnica|tempo|tempo esecuzione)$/.test(s))return 'notes';
 if(/^(?:giorno|giornata|day|workout|sessione|allenamento|training day)$/.test(s))return 'day';
 if(/^(?:coppia|superset|gruppo superset|abbinamento|superset id|pair)$/.test(s))return 'pair';
 return null;
}
function importWorkbook(wb,XLSX){
 const days=[],warnings=[],definitions={};let count=0;
 for(const sheetName of wb.SheetNames){
  if(/^(informazioni scheda|storico dettagliato|date giorni|dati empire|carichi per serie)$/i.test(sheetName))continue;
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:true});
  if(rows.some(r=>r.some(x=>norm(x)==='id sessione')&&r.some(x=>norm(x)==='carico kg')))continue;
  let current=null,headers=null,legend=false,loadColumns=[],loadHeaders=[],restMinutes=false;
  const makeDay=name=>{const d={id:uid(),name,muscles:[],exercises:[]};days.push(d);return d;};
  for(let ri=0;ri<rows.length;ri++){
   const row=rows[ri],texts=row.map(x=>String(x??'').trim()),nonempty=texts.filter(Boolean);if(!nonempty.length)continue;
   const first=nonempty[0],a=norm(first);
   if(/^tecniche(?:\s|$)/.test(a)&&!texts.some(x=>headerKey(x)==='name')){legend=true;continue;}
   if(legend){if(texts[0]&&texts[1]&&!/^(tecnica|come eseguirla)$/.test(a))definitions[texts[0]]=texts[1];continue;}
   let keys=texts.map(headerKey);
   if(keys.includes('name')){
    // Two-line headings: use the second header row only when it has labels,
    // never when it contains the first exercise and its prescriptions.
    const next=rows[ri+1]||[],nextKeys=next.map(headerKey);
    const twoLine=!next.some(x=>typeof x==='number')&&next.filter(x=>String(x).trim()).length>0&&next.filter(x=>String(x).trim()).every((x,i)=>headerKey(x)||/^(?:n[°º]?|numero)$/i.test(String(x).trim().replace(/\./g,'')));
    if(twoLine&&nextKeys.some(k=>['reps','series','rest'].includes(k))){
     keys=Array.from({length:Math.max(keys.length,nextKeys.length)},(_,i)=>nextKeys[i]||keys[i]);ri++;
    }
    headers={};keys.forEach((key,i)=>{if(key){if(headers[key]!==undefined)warnings.push(sheetName+': intestazione '+key+' ripetuta, controlla l’anteprima.');else headers[key]=i;}});
    restMinutes=headers.rest!==undefined&&/\bmin(?:uti|utes?)?\b/i.test(String(row[headers.rest]));
    loadColumns=row.map((v,i)=>excelDate(v,XLSX)?i:-1).filter(i=>i>=0);
    loadHeaders=loadColumns.map(i=>{const cell=wb.Sheets[sheetName][XLSX.utils.encode_cell({r:ri,c:i})];return {key:uid(),date:excelDate(row[i],XLSX),label:cell?.w||String(row[i]),status:cell?.c?.map(c=>c.t).join(' ')||'Importato'};});
    continue;
   }
   const following=rows.slice(ri+1).find(r=>r.some(x=>String(x??'').trim()))||[];
   if((/^(?:g\d+\b|giorno\b|giornata\b|day\b|lunedi\b|martedi\b|mercoledi\b|giovedi\b|venerdi\b|sabato\b|domenica\b)/i.test(a)&&nonempty.length<=2)||(nonempty.length===1&&(following.some(x=>headerKey(x)==='name')||!headers))){current=makeDay(first);continue;}
   if(!headers)continue;
   const val=key=>headers[key]===undefined?'':texts[headers[key]]||'';
   let name=val('name');if(!name)continue;
   const dn=val('day');if(dn){if(!current||current.name!==dn)current=days.find(d=>d._sheet===sheetName&&d.name===dn)||makeDay(dn);}
   if(!current)current=makeDay(sheetName);current._sheet=sheetName;
   let spec=headers.sets!==undefined?parseSets(val('sets')):{sets:headers.series!==undefined?Number(val('series'))||null:null,reps:val('reps')};
   if(!spec.reps&&val('reps'))spec.reps=val('reps');
   if(!spec.sets&&headers.series!==undefined)spec.sets=Number(val('series'))||null;
   const rv=headers.rest!==undefined?row[headers.rest]:null,rest=headers.rest!==undefined?(restMinutes&&/^\d+(?:[.,]\d+)?$/.test(String(rv).trim())?Math.round(Number(String(rv).replace(',','.'))*60):parseRest(rv)):null,notes=val('notes'),techText=val('tech');
   const inline=texts.filter((text,i)=>!loadColumns.includes(i)&&![headers.name,headers.tech,headers.notes,headers.pair].includes(i)&&detectTechnique(text)!=='Normale');
   let technique=detectTechnique([name,techText,notes,...inline].join(' '));if(technique==='Normale'&&techText&&norm(techText)!=='normale')technique=techText;
   const e={id:uid(),catalogId:null,name,sets:spec.sets,reps:spec.reps,rest,technique,notes:[techText&&norm(techText)!=='normale'?techText:'',notes,...inline].filter(Boolean).join('\n'),equipment:'neutral',pairId:null,_pair:val('pair')};
   if(e._pair&&!/^(?:[-—–]|no|nessuno)$/i.test(e._pair))e.technique='Superset';else e._pair='';
   if(!Number.isInteger(e.sets)||e.sets<1||e.sets>30||!e.reps||rest===null||rest>3600)warnings.push(current.name+' / '+name+': completa '+[!Number.isInteger(e.sets)||e.sets<1||e.sets>30?'serie':'',!e.reps?'ripetizioni':'',rest===null||rest>3600?'recupero':''].filter(Boolean).join(', '));
   if(loadColumns.length){
    const existing=current.importedColumns||(current.importedColumns=[]);for(const col of loadHeaders)if(!existing.some(c=>c.key===col.key))existing.push(col);
    e.importedHistory=loadColumns.map((ci,j)=>{const cell=wb.Sheets[sheetName][XLSX.utils.encode_cell({r:ri,c:ci})];let raw=originalCell(cell),ambiguous=raw.t==='d'||raw.t==='n'&&(XLSX.SSF.is_date(raw.z||'')||/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(raw.w||''));
     const saved=cell?.c?.find(c=>c.t?.startsWith('EmpireOriginal:'));if(saved)try{const obj=JSON.parse(saved.t.slice(15));raw=obj.raw;ambiguous=!!obj.ambiguous;}catch(_){}
     if(ambiguous)warnings.push(current.name+' / '+name+': carico del '+loadHeaders[j].date.split('-').reverse().join('/')+' convertito in data nel file originale; conservato da verificare.');
     return {column:loadHeaders[j].key,raw,ambiguous};});
   }
   if(!e._pair){const tag=techText.match(/\[SS ([^\]]+)\]/i);if(tag)e._pair=tag[1];}
   current.exercises.push(e);count++;
  }
 }
 for(const d of days){
  const groups=new Map();for(const e of d.exercises)if(e._pair){const key=norm(e._pair);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
  for(const [key,es] of groups){if(es.length===2&&es[0].sets===es[1].sets){es[0].pairId=es[1].id;es[1].pairId=es[0].id;es.forEach(e=>e.technique='Superset');}else warnings.push(d.name+': coppia '+key+' ambigua, verifica esercizi e serie.');}
  for(let i=0;i<d.exercises.length-1;i++){const e=d.exercises[i],next=d.exercises[i+1];if(!e.pairId&&!next.pairId&&/superset/i.test(e.technique)&&/successiv|seguente|next/i.test(e.notes)&&/superset/i.test(next.technique)){e.pairId=next.id;next.pairId=e.id;}}
  for(const e of d.exercises){if(/superset/i.test(e.technique)&&!e.pairId)warnings.push(d.name+' / '+e.name+': scegli il secondo esercizio della superserie.');delete e._pair;}delete d._sheet;
 }
 const manualSheet=wb.Sheets['Date giorni'];if(manualSheet){const manualRows=XLSX.utils.sheet_to_json(manualSheet,{header:1,defval:'',raw:true});for(const row of manualRows.slice(1)){const d=days.find(d=>norm(d.name)===norm(row[0])),date=excelDate(row[1],XLSX);if(d&&date){const cols=d.importedColumns||(d.importedColumns=[]);if(!cols.some(c=>c.date===date&&c.status.startsWith('Marcatura manuale')))cols.push({key:uid(),date,label:date,status:'Marcatura manuale, senza carichi attribuiti'});}}}
 const detailSheet=wb.Sheets['Storico dettagliato'];if(detailSheet){const detailRows=XLSX.utils.sheet_to_json(detailSheet,{header:1,defval:'',raw:true});for(const d of days){d.importedDetails=detailRows.slice(1).map((r,idx)=>({r,idx:idx+1})).filter(x=>norm(x.r[2])===norm(d.name)).map(x=>Array.from({length:12},(_,c)=>originalCell(detailSheet[XLSX.utils.encode_cell({r:x.idx,c})])));}}
 if(!count)throw Error('Nessun esercizio riconosciuto. Usa una colonna Esercizio/Exercise/Movimento e Serie + Ripetizioni oppure Serie/Rip.');
 return {days:days.filter(d=>d.exercises.length),warnings,definitions,count};
}
// Match by unique names only. Imported evidence never creates completed sessions.
function historyTargets(days,incoming){return incoming.map(src=>{const matches=days.filter(d=>norm(d.name)===norm(src.name));const target=matches.length===1?matches[0]:null;if(!target||new Set(src.exercises.map(e=>norm(e.name))).size!==src.exercises.length||src.exercises.some(e=>target.exercises.filter(t=>norm(t.name)===norm(e.name)).length!==1))return null;return target;});}
function mergeImportedHistory(target,source){const columns=target.importedColumns||(target.importedColumns=[]),names=new Set(source.exercises.map(e=>norm(e.name))),fingerprint=(d,c)=>JSON.stringify([c.date,c.status||'',d.exercises.filter(e=>names.has(norm(e.name))).map(e=>[norm(e.name),e.importedHistory?.find(h=>h.column===c.key)?.raw||null]).sort((a,b)=>a[0].localeCompare(b[0]))]);let added=0;
 for(const col of source.importedColumns||[]){const key=fingerprint(source,col);if(columns.some(c=>fingerprint(target,c)===key))continue;const copy={...col,key:uid()};columns.push(copy);for(const e of source.exercises){const t=target.exercises.find(t=>norm(t.name)===norm(e.name)),h=e.importedHistory?.find(h=>h.column===col.key);if(t&&h)(t.importedHistory||(t.importedHistory=[])).push(JSON.parse(JSON.stringify({...h,column:copy.key})));}added++;}
 const rows=target.importedDetails||(target.importedDetails=[]);for(const row of source.importedDetails||[])if(!rows.some(r=>JSON.stringify(r)===JSON.stringify(row)))rows.push(JSON.parse(JSON.stringify(row)));return added;
}
function exportNumber(value){if(value===''||value==null)return '';const number=Number(String(value).trim().replace(',','.'));return Number.isFinite(number)?number:String(value);}
function durationUnit(e){const n=norm(e?.reps||'');return /second|\bsec\b|\bs$/.test(n)?'sec':/minut|\bmin\b/.test(n)?'min':'rip';}
function seriesLabel(v,e,index){const load=v.load!==''&&v.load!=null?String(v.load)+' kg':'carico —',reps=v.reps===''||v.reps==null?'—':v.reps;return 'S'+(index+1)+': '+load+' × '+reps+' '+durationUnit(e)+(v.done?'':' (parziale)')+(v.steps||[]).filter(hasSeriesData).map((t,j)=>'\n  Blocco '+(j+1)+': '+(t.load===''||t.load==null?'—':t.load)+' kg × '+(t.reps||'—')+' '+durationUnit(e)).join('');}
function italianDateCells(sheet){for(const [key,cell] of Object.entries(sheet))if(!key.startsWith('!')&&cell.t==='d')cell.z='dd/mm/yyyy hh:mm';}
function excelDate(v,XLSX){
 let y,m,d;if(v instanceof Date&&Number.isFinite(+v)){y=v.getFullYear();m=v.getMonth()+1;d=v.getDate();}else if(typeof v==='number'&&v>20000&&v<100000){const p=XLSX.SSF.parse_date_code(v);if(!p)return null;({y,m,d}=p);}else{const p=String(v??'').match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);if(!p)return null;d=+p[1];m=+p[2];y=+p[3];if(y<100)y+=2000;}
 const value=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');const check=new Date(value+'T12:00:00Z');return Number.isFinite(+check)&&check.toISOString().slice(0,10)===value?value:null;
}
function originalCell(cell){if(!cell)return {t:'s',v:''};const r={t:cell.t,v:cell.v instanceof Date?cell.v.toISOString():cell.v??''};for(const k of ['z','w','f'])if(cell[k]!=null)r[k]=cell[k];return r;}
function originalText(raw){if(raw.t==='d')return raw.w||String(raw.v).slice(0,10).split('-').reverse().join('/');return raw.w??String(raw.v??'');}
function compactLoads(series){const values=series.map(v=>v.load===''||v.load==null?'—':String(v.load).replace('.',','));const groups=[];for(const v of values){const last=groups[groups.length-1];if(last&&last.v===v)last.n++;else groups.push({v,n:1});}return values.every(v=>v==='—')?'':groups.map(g=>g.v+(g.n>1?'('+g.n+')':'')).join('/');}
function dateSerial(iso){return Math.round((Date.parse(iso+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);}
function exportWorkbook(data,XLSX){const rows=[],used=new Set(),history=[],annotations=[],dateHeaders=[];
 const days=[...data.days,...(data.importedArchive||[]).map(d=>({...d,name:d.name+' (archiviato)'}))].map(d=>({...d,exercises:[...d.exercises,...(d.archivedImportedExercises||[])]}));
 for(const s of data.sessions)for(const en of Object.values(s.entries||{})){if(!en.series.some(hasSeriesData))continue;let d=days.find(d=>d.id===s.dayId);if(!d){d={id:s.dayId,name:s.dayName+' (archiviato)',exercises:[]};days.push(d);}if(!d.exercises.some(e=>e.id===en.exerciseId))d.exercises.push(en.snapshot);}
 let maxColumns=0;const heights=[];
 for(const day of days){rows.push([day.name]);heights.push({hpt:25});
  const originals=day.importedColumns||[],sessions=data.sessions.filter(s=>s.dayId===day.id&&Object.values(s.entries||{}).some(e=>e.series.some(hasSeriesData))).sort((a,b)=>a.started.localeCompare(b.started));
  const cols=[...originals.map(c=>({kind:'original',...c})),...sessions.map(s=>({kind:'session',s,date:/^\d{4}-\d{2}-\d{2}$/.test(s.date||'')?s.date:new Date(s.started).toLocaleDateString('en-CA'),status:s.closed&&s.completion?.status==='complete'?'Completato':'Parziale'}))];
  if(day.manualCompletion)cols.push({kind:'manual',date:day.manualCompletion.date,status:'Marcatura manuale, senza carichi attribuiti'});
  maxColumns=Math.max(maxColumns,cols.length);const headerRow=rows.length;rows.push(['Esercizio','Serie/Rip','Recupero','Tecnica',...cols.map(c=>dateSerial(c.date))]);heights.push({hpt:30});
  cols.forEach((c,i)=>dateHeaders.push({r:headerRow,c:i+4,status:c.status||'Importato'}));
  const pairLabels=new Map();for(const e of day.exercises)if(e.pairId&&!pairLabels.has(e.id)){const label='SS '+(pairLabels.size/2+1);pairLabels.set(e.id,label);pairLabels.set(e.pairId,label);}
  for(const e of day.exercises){used.add(e.technique);const ri=rows.length;const cells=cols.map((c,i)=>{
   if(c.kind==='manual')return '';
   if(c.kind==='original'){const item=e.importedHistory?.find(h=>h.column===c.key);if(!item)return '';annotations.push({r:ri,c:i+4,text:'EmpireOriginal:'+JSON.stringify({raw:item.raw,ambiguous:item.ambiguous})+(item.ambiguous?'':'')});return originalText(item.raw);}
   const en=c.s.entries[e.id];if(!en)return '';const partial=en.series.some(v=>!v.done)||!c.s.closed||c.s.completion?.status!=='complete';annotations.push({r:ri,c:i+4,text:(partial?'Parziale':'Completato')+' · '+en.series.map((v,j)=>seriesLabel(v,en.snapshot||e,j)).join('\n')});return compactLoads(en.series);
  });
  const technique=[e.technique,pairLabels.has(e.id)?'['+pairLabels.get(e.id)+']':'',e.notes].filter(Boolean).join(' — ');rows.push([e.name,e.sets+'x'+e.reps,e.rest===0?'—':Math.floor(e.rest/60)+':'+String(e.rest%60).padStart(2,'0'),technique,...cells]);
  heights.push({hpt:Math.min(160,Math.max(2,Math.ceil(e.name.length/34),Math.ceil(technique.length/43),...cells.map(c=>Math.ceil(String(c).length/20)))*15+8)});
  }
  rows.push([]);heights.push({hpt:12});
 }
 rows.push(['TECNICHE'],['Tecnica','Come eseguirla']);for(const t of used)rows.push([t,data.definitions[t]||'Vedi le indicazioni riportate accanto all’esercizio.']);
 for(const s of data.sessions)for(const en of Object.values(s.entries||{}))en.series.forEach((v,i)=>{if(hasSeriesData(v))history.push([s.id,new Date(s.started),s.dayName,en.snapshot.name,i+1,exportNumber(v.load),v.reps||'',v.done?'Completata':'Parziale',en.snapshot.technique,en.snapshot.notes||'',(v.steps||[]).map((t,j)=>'Blocco '+(j+1)+': '+(t.load===''||t.load==null?'—':t.load)+' kg × '+(t.reps||'—')+' '+durationUnit(en.snapshot)).join('\n'),durationUnit(en.snapshot)]);});
 const importedDetail=[];for(const day of days)for(const row of day.importedDetails||[])importedDetail.push(row);
 const wb=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=[{wch:39},{wch:18},{wch:13},{wch:46},...Array.from({length:Math.max(1,maxColumns)},()=>({wch:22}))];sheet['!rows']=heights;
 for(const h of dateHeaders){const cell=sheet[XLSX.utils.encode_cell(h)];cell.z='dd/mm/yyyy';cell.c=[{a:'Empire',t:h.status}];}
 for(const a of annotations){const key=XLSX.utils.encode_cell(a);sheet[key]=sheet[key]||{t:'s',v:''};sheet[key].t='s';sheet[key].z='@';sheet[key].c=[{a:'Empire',t:a.text}];}
 // All dated load cells are text, including blank cells and numeric-looking strings.
 for(const h of dateHeaders){for(let r=h.r+1;r<rows.length&&rows[r].length;r++){const key=XLSX.utils.encode_cell({r,c:h.c});if(sheet[key]){sheet[key].t='s';sheet[key].z='@';sheet[key].v=String(sheet[key].v??'');}}}
 XLSX.utils.book_append_sheet(wb,sheet,'Scheda e allenamenti');
 const detail=XLSX.utils.aoa_to_sheet([['ID sessione','Data e ora','Giorno','Esercizio','Serie','Carico kg','Ripetizioni / durata effettiva','Stato','Tecnica','Note','Dettagli drop-rest pause','Unità effettiva'],...importedDetail.map(r=>r.map(c=>c.t==='d'?new Date(c.v):c.v)),...history],{cellDates:true});
 importedDetail.forEach((row,r)=>row.forEach((raw,c)=>{const cell=detail[XLSX.utils.encode_cell({r:r+1,c})];if(cell&&raw.z)cell.z=raw.z;}));
 detail['!cols']=[{wch:38},{wch:24},{wch:25},{wch:40},{wch:9},{wch:12},{wch:22},{wch:15},{wch:25},{wch:50},{wch:55},{wch:16}];detail['!rows']=[{hpt:32},...importedDetail.map(()=>({hpt:32})),...history.map(r=>({hpt:Math.max(32,r[10].split('\n').length*16+8)}))];detail['!autofilter']={ref:detail['!ref']};italianDateCells(detail);XLSX.utils.book_append_sheet(wb,detail,'Storico dettagliato');
 // Foglio aggiuntivo, ben visibile, con un carico per ogni serie registrata.
 const loadRows=[['Data e ora','Giorno','Esercizio','Serie','Carico kg','Ripetizioni','Stato','Tecnica','Note'],...history.map(r=>[r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9]])];
 const loadSheet=XLSX.utils.aoa_to_sheet(loadRows,{cellDates:true});
 loadSheet['!cols']=[{wch:23},{wch:27},{wch:38},{wch:10},{wch:15},{wch:18},{wch:16},{wch:25},{wch:42}];
 loadSheet['!autofilter']={ref:loadSheet['!ref']};italianDateCells(loadSheet);
 XLSX.utils.book_append_sheet(wb,loadSheet,'Carichi per serie');
 const manual=data.days.filter(d=>d.manualCompletion).map(d=>[d.name,d.manualCompletion.date.split('-').reverse().join('/'),new Date(d.manualCompletion.markedAt),'Marcatura manuale']);if(manual.length){const dates=XLSX.utils.aoa_to_sheet([['Giorno','Data svolgimento','Registrata il','Tipo'],...manual],{cellDates:true});dates['!cols']=[{wch:32},{wch:22},{wch:25},{wch:24}];italianDateCells(dates);XLSX.utils.book_append_sheet(wb,dates,'Date giorni');}return wb;}
// SheetJS CE writes dimensions and number formats; apply wrapping to the generated OOXML.
function writeWorkbook(wb,XLSX){const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array',cellDates:true});const zip=XLSX.CFB.read(new Uint8Array(bytes),{type:'buffer'}),enc=new TextEncoder(),dec=new TextDecoder();let styleEntry=zip.FileIndex.find((e,i)=>zip.FullPaths[i].endsWith('/xl/styles.xml'));if(!styleEntry)return bytes;let styles=dec.decode(styleEntry.content);const match=styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);if(!match)return bytes;const xfs=match[2].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)||[];if(xfs.length!==Number(match[1]))return bytes;const wrapped=xfs.map(xf=>{let x=xf.replace(/ applyAlignment="[^"]*"/g,'').replace('<xf ','<xf applyAlignment="1" ');if(x.endsWith('/>'))x=x.slice(0,-2)+'><alignment wrapText="1" vertical="top"/></xf>';else{x=x.replace(/<alignment[^>]*\/>/g,'');x=x.replace('</xf>','<alignment wrapText="1" vertical="top"/></xf>');}return x;}).join('');styles=styles.replace(match[0],'<cellXfs count="'+(xfs.length*2)+'">'+match[2]+wrapped+'</cellXfs>');XLSX.CFB.utils.cfb_add(zip,'xl/styles.xml',enc.encode(styles));const sheetFiles=zip.FullPaths.map((name,i)=>({name,content:zip.FileIndex[i].content})).filter(f=>/\/xl\/worksheets\/sheet\d+\.xml$/.test(f.name));for(const file of sheetFiles){const name=file.name;if(!/\/xl\/worksheets\/sheet\d+\.xml$/.test(name))continue;const xml=dec.decode(file.content).replace(/<c\b([^>]*)>/g,(_,attrs)=>{const old=attrs.match(/ s="(\d+)"/),n=old?Number(old[1]):0;return '<c'+attrs.replace(/ s="\d+"/,'')+' s="'+(n+xfs.length)+'">';});XLSX.CFB.utils.cfb_add(zip,name.replace(/^[^/]+\//,''),enc.encode(xml));}return XLSX.CFB.write(zip,{fileType:'zip',type:'array'});}
const api={uid,norm,parseSets,parseRest,headerKey,hasSeriesData,compactLoads,historyTargets,mergeImportedHistory,detectTechnique,importWorkbook,exportWorkbook,writeWorkbook};if(typeof module!=='undefined')module.exports=api;root.EmpireCore=api;
})(globalThis);
