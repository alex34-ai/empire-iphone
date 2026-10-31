'use strict';
const DAY_COLORS=['#ff8426','#69a9ff','#b69aff','#59d6a0','#f18aab','#eec45c'];
function dayColor(d,i=0){return DAY_COLORS.includes(d.color)?d.color:DAY_COLORS[(Math.max(i,0))%DAY_COLORS.length];}
function dayBlocks(d){const seen=new Set(),blocks=[];for(const e of d.exercises){if(seen.has(e.id))continue;seen.add(e.id);const p=d.exercises.find(x=>x.id===e.pairId&&x.pairId===e.id);if(p&&!seen.has(p.id)){seen.add(p.id);blocks.push([e,p]);}else blocks.push([e]);}return blocks;}
function removeExerciseBlock(id){const d=day(),block=dayBlocks(d).find(b=>b.some(e=>e.id===id));if(!block)return;ask('Rimuovi '+(block.length===2?'superset':'esercizio'),'Rimuovere '+block.map(e=>e.name).join(' + ')+'? Lo storico registrato viene conservato.',()=>{const ids=new Set(block.map(e=>e.id));for(const e of block)if(e.importedHistory?.length)(d.archivedImportedExercises||(d.archivedImportedExercises=[])).push(JSON.parse(JSON.stringify(e)));if(ids.has(data.timer?.exerciseId))cancelTimer();d.exercises=d.exercises.filter(e=>!ids.has(e.id));for(const e of d.exercises)if(ids.has(e.pairId)){e.pairId=null;e.technique='Normale';}save();render();});}
function moveBlockTo(fromId,toId){const d=day(),blocks=dayBlocks(d),from=blocks.findIndex(b=>b.some(e=>e.id===fromId)),to=blocks.findIndex(b=>b.some(e=>e.id===toId));if(from<0||to<0||from===to)return;blocks.splice(to,0,blocks.splice(from,1)[0]);d.exercises=blocks.flat();save();render();}
function newExercise(c){return {id:C.uid(),catalogId:c.id,name:c.name,muscle:c.muscle,equipment:c.equipment,animationId:c.animationId||null,sets:null,reps:'',rest:null,technique:'Normale',notes:'',pairId:null};}
function addCatalogExercise(id){const d=data.days.find(x=>x.id===selectDay),c=[...CATALOG,...data.custom].find(x=>x.id===id);if(!d||!c)throw Error('Esercizio o giorno non disponibile.');if(d.exercises.some(e=>e.catalogId===id)){toast('Questo esercizio è già nel giorno.');return;}configureExercise(newExercise(c),d,true);}
let configurationDayId=null;
function configureExercise(e,d,isNew){
 configurationDayId=d.id;
 const session=currentSession(d),started=session?.entries[e.id]?.series.some(C.hasSeriesData),partner=d.exercises.find(x=>x.id===e.pairId);
 const available=[...CATALOG,...data.custom].filter(c=>c.id!==e.catalogId&&!d.exercises.some(x=>x.catalogId===c.id));
 const choices=`<option value="">Scegli il secondo esercizio</option><optgroup label="Già nel giorno">${d.exercises.filter(x=>x.id!==e.id&&(!x.pairId||x.pairId===e.id)).map(x=>`<option value="day:${x.id}" ${x.id===partner?.id?'selected':''}>${esc(x.name)}</option>`).join('')}</optgroup>${DISPLAY_MUSCLES.map(([m,label])=>`<optgroup label="${esc(label)} · Catalogo">${available.filter(c=>muscleGroup(c.muscle)===m).map(c=>`<option value="catalog:${c.id}">${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}`;
 showModal(isNew?'Configura e aggiungi esercizio':'Configura esercizio',`<label>Nome<input name="name" value="${esc(e.name)}" required maxlength="120"></label><div class="formgrid"><label>Serie / giri<input type="number" name="sets" value="${e.sets||''}" min="1" max="30" required></label><label>Ripetizioni o durata<input inputmode="numeric" data-keyboard="numeric" name="reps" value="${esc(e.reps)}" placeholder="6–8 oppure 30 sec" required></label>${recoveryField('rest','Recupero (mm:ss)',e.rest,'exercise-rest')}<label>Tecnica<select name="technique" id="exercise-technique">${[...new Set([...TECHNIQUES,e.technique])].map(t=>`<option ${t===e.technique?'selected':''}>${esc(t)}</option>`).join('')}</select></label></div><section id="pair-config" class="pair-config" ${/superset|superserie/i.test(e.technique)?'':'hidden'}><h3>Secondo esercizio del superset</h3><label>Scegli dal giorno o dal catalogo<select name="pair" id="exercise-pair">${choices}</select></label><div class="formgrid"><label>Ripetizioni o durata<input inputmode="numeric" data-keyboard="numeric" id="pair-reps" name="pair-reps" value="${esc(partner?.reps||'')}" placeholder="Es. 10–12"></label>${recoveryField('pair-rest','Recupero dopo coppia (mm:ss)',partner?.rest??null,'pair-rest')}</div><label>Note secondo esercizio<textarea name="pair-notes" id="pair-notes" rows="2">${esc(partner?.notes||'')}</textarea></label><p class="footnote">Stesso numero di giri, ripetizioni e carichi distinti. Esegui entrambi, poi parte un unico recupero: il maggiore dei due valori impostati.</p></section><label>Indicazioni della tecnica / note<textarea name="notes" rows="3" placeholder="Es. ultima serie; eccentrica 3 sec; per gamba…">${esc(e.notes)}</textarea></label>${started?'<p class="warning">Sessione iniziata: serie e abbinamento restano fissi fino alla nuova sessione.</p>':''}`,f=>{
  const sets=Number(f.get('sets')),reps=String(f.get('reps')||'').trim(),rest=readRecovery(f,'rest'),technique=f.get('technique')||'Normale',name=String(f.get('name')||'').trim(),notes=String(f.get('notes')||'').trim(),wantsPair=/superset|superserie/i.test(technique);
  if(!name||!Number.isInteger(sets)||sets<1||sets>30||!reps||rest===null||rest>3600)throw Error('Controlla nome, serie, ripetizioni e recupero (massimo 60 minuti).');
  if(technique==='Personalizzata'&&!notes)throw Error('Descrivi la tecnica nelle note.');
  let p=null,newPartner=false,pValues=null;
  if(wantsPair){const raw=String(f.get('pair')||'');if(raw.startsWith('catalog:')){const c=[...CATALOG,...data.custom].find(c=>c.id===raw.slice(8));if(!c||c.id===e.catalogId||d.exercises.some(x=>x.catalogId===c.id))throw Error('Scegli un altro esercizio del catalogo.');p=newExercise(c);newPartner=true;}else p=d.exercises.find(x=>x.id===(raw.startsWith('day:')?raw.slice(4):raw));
   if(!p||p.id===e.id)throw Error('Scegli il secondo esercizio del superset.');
   if(p.pairId&&p.pairId!==e.id)throw Error('Questo esercizio è già abbinato.');
   const pStarted=session?.entries[p.id]?.series.some(C.hasSeriesData);
   if(pStarted&&(p.pairId!==e.id||p.sets!==sets))throw Error('Il secondo esercizio è già iniziato. Chiudi la sessione prima di cambiare la coppia.');
   const pr=String(f.get('pair-reps')??p.reps??'').trim(),pt=readRecovery(f,'pair-rest',p.rest);
   if(!pr||pt===null||pt>3600)throw Error('Completa ripetizioni e recupero del secondo esercizio.');
   pValues={sets,reps:pr,rest:pt,notes:String(f.get('pair-notes')??p.notes??'').trim(),pairId:e.id,technique:'Superset'};
  }
  if(started&&(sets!==e.sets||(p?.id||null)!==(e.pairId||null)))throw Error('Chiudi la sessione prima di cambiare serie o superset.');
  // Validation above completes before either exercise is inserted or modified.
  const old=d.exercises.find(x=>x.id===e.pairId);if(old&&old.id!==p?.id){old.pairId=null;if(old.technique==='Superset')old.technique='Normale';}
  const animationId=null;
  Object.assign(e,{name,animationId:animationId||null,sets,reps,rest,technique:p?'Superset':technique,notes,pairId:p?.id||null});if(p)Object.assign(p,pValues);
  if(isNew){d.exercises.push(e);selection.add(e.catalogId);}
  if(newPartner){d.exercises.push(p);selection.add(p.catalogId);}
  if(p){d.exercises=d.exercises.filter(x=>x.id!==p.id);d.exercises.splice(d.exercises.findIndex(x=>x.id===e.id)+1,0,p);}
  for(const item of [e,p].filter(Boolean)){if(item.muscle&&!d.muscles.includes(item.muscle))d.muscles.push(item.muscle);if(session?.entries[item.id]&&!session.entries[item.id].series.some(C.hasSeriesData))delete session.entries[item.id];}
  save();render();toast(isNew?'Esercizio aggiunto al giorno con i parametri scelti.':'Esercizio aggiornato.');
 });
 syncRecoveryField('exercise-rest');syncSupersetFields();
}
function syncSupersetFields(){const enabled=/superset|superserie/i.test($('#exercise-technique')?.value||''),box=$('#pair-config');if(box)box.hidden=!enabled;for(const id of ['pair-reps','pair-rest','exercise-pair']){const input=$('#'+id);if(input){input.required=enabled;input.disabled=!enabled;}}syncRecoveryField('pair-rest',enabled);}
function fillPartnerFields(){const raw=$('#exercise-pair')?.value||'',d=data.days.find(x=>x.id===configurationDayId)||day(),e=d?.exercises.find(e=>e.id===(raw.startsWith('day:')?raw.slice(4):raw));for(const [id,value] of [['pair-reps',e?.reps||''],['pair-notes',e?.notes||'']]){const el=$('#'+id);if(el)el.value=value;}setRecoveryValue('pair-rest',e?.rest??null);}
function selectionGroups(){const d=data.days.find(d=>d.id===selectDay);if(!d)return;route={page:'muscles',dayId:d.id,planId:data.activePlanId};data.lastView={...route};search='';save();render();}
function finishSelection(){const d=data.days.find(d=>d.id===selectDay);if(!d)return;selection.clear();d.preparing=true;route={page:'day',dayId:d.id,planId:data.activePlanId};stack=[{page:'home'},{page:'plan',planId:data.activePlanId}];data.lastView={...route};save();render();}
function reviewSelection(){const d=data.days.find(d=>d.id===selectDay),items=d.exercises.filter(e=>selection.has(e.catalogId));showModal('Esercizi aggiunti al giorno',`<p class="footnote">Sono già salvati. Deseleziona quelli da rimuovere.</p>${items.map(e=>`<label><input type="checkbox" name="selected" value="${e.id}" checked> ${esc(e.name)}</label>`).join('')||'<p>Nessun esercizio aggiunto in questa selezione.</p>'}`,f=>{const kept=new Set(f.getAll('selected')),remove=new Set(items.filter(e=>!kept.has(e.id)).map(e=>e.id));for(const e of items)if(remove.has(e.id)&&e.pairId)remove.add(e.pairId);d.exercises=d.exercises.filter(e=>!remove.has(e.id));selection=new Set(d.exercises.filter(e=>selection.has(e.catalogId)).map(e=>e.catalogId));save();render();},'Aggiorna selezione');}
function chooseExcelTarget(mode){if(mode==='import'){chooseFile('import',true);return;}if(!data.plans.length){toast('Non ci sono schede da esportare.');return;}showModal('Esporta Excel',`<label>Scheda<select name="target-plan">${data.plans.map(p=>`<option value="${p.id}" ${p.id===data.activePlanId?'selected':''}>${esc(p.name)} · ${esc(planPeriod(p))}</option>`).join('')}</select></label><p class="footnote">Verranno esportati soltanto questa scheda e il suo storico.</p>`,f=>{const id=f.get('target-plan');if(!data.plans.some(p=>p.id===id))throw Error('Scegli una scheda.');if(data.timer&&data.timer.planId!==id)cancelTimer();data.activePlanId=id;save();$('#modal').close();exportExcel();},'Esporta');}
function editProfile(){showModal('Profilo utente',`<label>Nome<input name="first-name" value="${esc(data.profile.firstName)}" required maxlength="60" autocomplete="given-name"></label><label>Cognome<input name="last-name" value="${esc(data.profile.lastName)}" required maxlength="60" autocomplete="family-name"></label>`,f=>{const firstName=String(f.get('first-name')||'').trim(),lastName=String(f.get('last-name')||'').trim();if(!firstName||!lastName||firstName.length>60||lastName.length>60)throw Error('Inserisci nome e cognome (massimo 60 caratteri ciascuno).');data.profile={...data.profile,firstName,lastName};save();render();});}
// One introduction for each page, shared by all plans and retained in backups.
const PAGE_HELP_KEY='empire-page-help-v7';let pageHelpReady=false;
const PAGE_HELP={
 "home": [
  "Le tue schede",
  "",
  [
   [
    "Crea scheda",
    "Premi Crea scheda. Inserisci nome e date con il calendario; la fine è facoltativa."
   ],
   [
    "Apri o richiudi i dettagli",
    "La freccia arancione verso il basso mostra i giorni; verso l’alto li nasconde. La freccia verso destra apre la scheda completa, dove trovi Modifica scheda."
   ],
   [
    "Tocca un giorno",
    "Tocca il giorno per allenarti. Tieni premuto per il riepilogo degli esercizi, senza iniziare una sessione."
   ],
   [
    "Comandi con scorrimento",
    "Scorri la scheda verso sinistra per eliminarla: si apre una richiesta di conferma. Solo Conferma cancella; Annulla conserva tutti i dati."
   ],
   [
    "Importa Excel o CSV",
    "Scegli la scheda di destinazione e il file. Controlla nomi, serie, ripetizioni e recuperi nell’anteprima; poi conferma."
   ],
   [
    "Recupera lo storico originale",
    "Se giorni ed esercizi corrispondono, puoi scegliere Recupera solo date e carichi. Mantieni gli allenamenti presenti senza aggiungere giorni duplicati."
   ],
   [
    "Esporta Excel",
    "Scegli la scheda: il file contiene i giorni, le date, i carichi importati e nuovi e il foglio con i dettagli."
   ],
   [
    "Ricevi schede · QR",
    "Apri Ricevi schede · QR. Il pulsante Il mio QR e codice mostra i tuoi dati per ricevere schede; sotto trovi quelle ricevute e Apri file ricevuto."
   ],
   [
    "Pesati e Tutorial",
    "Pesati apre bilancia, profilo e progressi. Il pulsante blu Tutorial riapre la guida della schermata in qualsiasi momento."
   ]
  ]
 ],
 "plan": [
  "Giorni della scheda",
  "",
  [
   [
    "Modifica nome e date",
    "Il pulsante a sinistra cambia nome, inizio e fine della scheda. I carichi e lo storico restano associati."
   ],
   [
    "Prepara la scheda",
    "Modifica scheda apre la preparazione. Aggiungi e organizza i giorni; Conferma scheda torna alla consultazione."
   ],
   [
    "Aggiungi giorno",
    "Inserisci un nome, almeno un gruppo muscolare e il colore. Salva apre il nuovo giorno."
   ],
   [
    "Comandi dentro il giorno",
    "Solo in modifica scheda trovi nella cornice le frecce per ordinare e i tasti Modifica, Duplica ed Elimina. Toccare un comando esegue solo quella azione."
   ],
   [
    "Duplica o elimina",
    "La copia conserva gli esercizi senza copiare i carichi. Elimina chiede conferma; lo storico registrato resta esportabile."
   ],
   [
    "Riprendi un allenamento",
    "Il riquadro Allenamento incompleto riapre una sessione ancora aperta con i dati già inseriti."
   ],
   [
    "Condividi scheda",
    "Invia con Empire usa Internet e il codice del destinatario. Puoi leggerne il QR con la fotocamera o da una foto."
   ],
   [
    "File, PDF e mio QR",
    "Condividi file Empire invia o salva un file da importare. Il PDF è da consultare. Il mio codice / QR serve a ricevere schede."
   ],
   [
    "Dati personali e Storico",
    "La condivisione del programma esclude carichi, pesate e profilo. Storico mostra gli allenamenti della sola scheda aperta."
   ]
  ]
 ],
 "day": [
  "Esercizi del giorno",
  "",
  [
   [
    "Modifica il giorno",
    "Apri Modifica scheda e tocca un giorno: si apre direttamente in modifica. Conferma giorno torna alla scheda ancora in modifica; solo Conferma scheda conclude la preparazione."
   ],
   [
    "Aggiungi esercizio",
    "In preparazione usa il tasto fisso in basso. Scegli gruppo ed esercizio; configura i parametri e salva."
   ],
   [
    "Ordina e configura",
    "Le frecce spostano i blocchi. Configura cambia i parametri. Elimina richiede conferma e conserva lo storico già registrato."
   ],
   [
    "Tocca un esercizio",
    "In consultazione apri timer, serie e carichi. In preparazione apri la configurazione."
   ],
   [
    "Segna come svolto",
    "Scegli la data effettiva anche senza registrare serie. Modifica data e Annulla marcatura cambiano solo il segno manuale."
   ],
   [
    "Ultimo giorno svolto",
    "Home e Ultimo svolto seguono la data effettiva. Una marcatura manuale non inventa carichi né completa le serie."
   ],
   [
    "Interrompi e riprendi",
    "Puoi tornare indietro: i carichi e le serie già inseriti restano salvati. Usa Riprendi per continuare la sessione aperta."
   ],
   [
    "Termina allenamento",
    "Dopo tutte le serie, in alto al posto di Segna come svolto compaiono riepilogo, barra verde e Termina allenamento. Solo premendo il tasto confermi la conclusione; non c’è un secondo blocco in basso."
   ]
  ]
 ],
 "muscles": [
  "Scegli il gruppo muscolare",
  "",
  [
   [
    "Tocca un gruppo",
    "Apri l’elenco dei suoi esercizi. Vedi soltanto i gruppi selezionati per questo giorno."
   ],
   [
    "Unico gruppo Gambe",
    "Gambe contiene quadricipiti, femorali, glutei, polpacci, adduttori e abduttori. Trovi tutti i relativi esercizi nello stesso elenco."
   ],
   [
    "Cambia i gruppi",
    "Torna al giorno e usa Nome e gruppi muscolari durante la preparazione. I carichi già registrati restano conservati."
   ]
  ]
 ],
 "catalog": [
  "Aggiungi gli esercizi",
  "",
  [
   [
    "Cerca e seleziona",
    "Cerca per nome e tocca un esercizio. La X cancella ricerca e tastiera senza perdere gli esercizi selezionati."
   ],
   [
    "Configura i parametri",
    "Inserisci nome, serie, ripetizioni o durata, recupero e tecnica. Puoi scegliere un recupero predefinito oppure Personalizza."
   ],
   [
    "Usa il tastierino",
    "Serie e ripetizioni aprono i numeri. Fatto passa al campo successivo; dopo l’ultimo chiude la tastiera. Salva conferma il modulo."
   ],
   [
    "Tecniche e Superset",
    "Scegli la tecnica e aggiungi le note. Per un Superset scegli il secondo esercizio e i suoi parametri: restano un unico blocco."
   ],
   [
    "Esercizio personalizzato",
    "Se manca nel catalogo, premi Crea esercizio personalizzato e scegli nome e gruppo. Poi configura i parametri."
   ],
   [
    "Controlla la selezione",
    "Esercizi selezionati permette di rivedere e rimuovere quelli appena aggiunti. Torna ai gruppi mantiene la selezione."
   ],
   [
    "Conferma il giorno",
    "OK torna al giorno in preparazione. Quando hai finito premi Conferma giorno."
   ]
  ]
 ],
 "workout": [
  "Registra le serie",
  "",
  [
   [
    "Ripetizioni e carichi reali",
    "Inserisci i valori eseguiti nelle righe. Le ripetizioni indicate dalla scheda sono un riferimento; un campo vuoto resta vuoto."
   ],
   [
    "Tastierino del peso",
    "Tocca il carico per numeri, virgola, cancella e Fatto. Le frecce usano il Passo peso scelto per questo esercizio; il peso non scende sotto zero."
   ],
   [
    "Passo peso",
    "Premi Passo peso sopra la tabella: scegli 2, 2,5 o 5 kg, oppure un valore personalizzato. Se registri il totale del bilanciere, 2,5 kg per lato significa un passo di 5 kg."
   ],
   [
    "Peso della serie precedente",
    "Dopo Play, la serie successiva propone il carico appena usato. Puoi cambiarlo con le frecce o il tastierino. La proposta non segna la serie fatta e non entra nello storico finché non la usi."
   ],
   [
    "Record del giorno",
    "La prima serie può proporre il record di questo esercizio nello stesso giorno e scheda. La proposta si registra solo quando la usi."
   ],
   [
    "Segna la serie e recupera",
    "Dopo la serie premi Play: segni la serie fatta e avvii il recupero. Puoi anche correggere il segno con il pulsante Fatta."
   ],
   [
    "Superset",
    "Completa entrambi gli esercizi prima di Play. I carichi restano distinti e il recupero della coppia è il maggiore dei due valori impostati."
   ],
   [
    "Drop set e Rest pause",
    "Apri Dettagli sotto la serie per aggiungere i blocchi con carichi e ripetizioni. La Pausa interna non scala altre serie."
   ],
   [
    "Timer e avvisi",
    "Il recupero continua cambiando pagina o tornando all’elenco. Torna al timer mostra il tempo rimasto. Pausa lo ferma temporaneamente; Reimposta lo interrompe. Gli avvisi restano a 20 secondi e a fine recupero."
   ],
   [
    "Nuovo record",
    "Il bordo dorato segnala un nuovo record dopo una serie completata. Lo storico resta separato per esercizio, giorno e scheda."
   ],
   [
    "Concludi o riprendi",
    "Dopo l’ultima serie il recupero continua. Alla fine torni automaticamente agli esercizi, se sei ancora nell’esercizio. Puoi tornare indietro prima senza fermare il timer. Poi conferma Termina allenamento."
   ],
   [
    "Nuova sessione e ricomincia",
    "Nuova sessione avvia un nuovo allenamento. Ricomincia esercizio conserva il tentativo precedente nello storico e riapre le sue serie."
   ]
  ]
 ],
 "history": [
  "I tuoi allenamenti",
  "",
  [
   [
    "Scegli il periodo",
    "Consulta gli allenamenti e i carichi registrati nel periodo scelto. Ogni scheda ha uno storico indipendente."
   ],
   [
    "Allenamento incompleto",
    "Puoi riprendere una sessione ancora aperta. Le serie parziali restano distinte da quelle completate."
   ],
   [
    "Leggi l’Excel",
    "Ogni giorno ha esercizi sulle righe e date sopra i carichi. 40(4) significa quattro serie consecutive a 40; 80/90(2)/100 conserva quell’ordine."
   ],
   [
    "Dettagli e date manuali",
    "Il foglio Storico dettagliato conserva serie, ripetizioni e blocchi. Le marcature manuali hanno una data distinta, senza carichi attribuiti."
   ],
   [
    "Storico importato",
    "I carichi originali restano nel file esportato. Una cella ambigua viene segnalata e conservata; non diventa un record o un carico suggerito."
   ]
  ]
 ],
 "received": [
  "Ricevi schede · QR", "", [
   ["Il mio QR e codice", "Premi il pulsante arancione con l’icona QR. Se il servizio non è attivo, conferma la prima attivazione con Internet; poi si apre il tuo riquadro personale."],
   ["Ricevi una scheda", "Per ricevere una scheda, comunica il tuo codice personale oppure fai scansionare questo QR alla persona che deve inviartela."],
   ["Copia codice", "Nel riquadro personale premi Copia codice per copiarlo. Schede ricevute chiude il riquadro e mostra l’elenco. Chiudi torna alla pagina precedente."],
   ["Apri file ricevuto", "Il collegamento sotto il pulsante QR apre un file .empire ricevuto con un’altra app. Un PDF serve solo per consultare la scheda."],
   ["Aggiungi alle mie schede", "Apri una scheda ricevuta, controlla gli esercizi e premi Aggiungi alle mie schede. Le schede, i carichi e lo storico già presenti restano conservati."],
   ["Aggiornamento delle ricevute", "Aprendo questa pagina le ricevute si aggiornano con Internet. Puoi usare anche il piccolo collegamento Aggiorna ricevute. Il controllo in background è periodico e il risparmio energetico può ritardare le notifiche."],
   ["Disattiva il servizio", "Nel riquadro personale trovi Disattiva e rimuovi dati online, con conferma. Le schede aggiunte, i carichi e le pesate rimangono sul telefono. Una nuova installazione su un altro telefono crea un nuovo codice."]
  ]
 ],
 "settings": [
  "Impostazioni",
  "",
  [
   [
    "Modifica profilo",
    "Inserisci o cambia nome e cognome. I dati del profilo della bilancia si gestiscono in Pesati, Il mio account."
   ],
   [
    "Avvisi del recupero",
    "Attiva o disattiva separatamente suono e vibrazione. La scelta del suono riguarda l’avviso Mancano 20 secondi."
   ],
   [
    "Scegli e ascolta il suono",
    "Scegli Segnale breve, Doppio segnale, Campanella o Go baby con voce generica. Premi Ascolta per sentirlo. La scelta viene salvata anche per gli avvisi Android."
   ],
   [
    "Esporta backup completo",
    "Salva una copia di tutte le schede, carichi, storico e dati Pesati. Il file del solo programma condiviso non sostituisce il backup."
   ],
   [
    "Ripristina backup",
    "Il ripristino sostituisce i dati presenti. Prima salva un backup dell’archivio che vuoi conservare."
   ],
   [
    "Riapri il Tutorial",
    "Il pulsante blu Tutorial mostra la guida della schermata. Puoi chiuderla, tornare indietro e rivederla senza modificare i dati."
   ]
  ]
 ]
};
for(const help of Object.values(PAGE_HELP))help[1]=help[2].map(row=>row.join(': ')).join(' ');

function schedulePageHelp(){if(pageHelpReady)setTimeout(maybeShowIntro,0);}
function maybeShowIntro(){
 if(!pageHelpReady||damagedArchive||$('#modal').open)return;
 const page=route.page,help=PAGE_HELP[page];if(!help)return;
 if(data.pageHelpRevision!==4){data.pageHelpSeen={};data.pageHelpRevision=4;}
 const seen={};
 for(const source of [data.pageHelpSeen,readPageHelpSeen()])if(source&&typeof source==='object')for(const key of Object.keys(PAGE_HELP))if(source[key]===true)seen[key]=true;
 data.pageHelpSeen=seen;if(seen[page])return;
 seen[page]=true;data.onboardingSeen=true;
 try{localStorage.setItem(PAGE_HELP_KEY,JSON.stringify(seen));}catch{}
 save();
 showPageTutorial(page);
}
function showPageTutorial(page=route.page){const help=PAGE_HELP[page];if(!help)return;const icons={home:'scale',plan:'clock',day:'muscleMass',muscles:'person',catalog:'muscleMass',workout:'clock',history:'chart',settings:'person'};EmpireWeighUI.showGuide('EMPIRE · '+help[0].toLocaleUpperCase('it-IT'),help[2].map(([label,text])=>[esc(label),esc(text),icons[page]]));}
function tutorialButton(){return PAGE_HELP[route.page]?btn('<svg class="tutorial-book" viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 5C8 2 5 2 2 3v13c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-6-1-10 2v13"/><text x="16" y="12" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">?</text></svg><span>Tutorial</span>','page-tutorial' ,'aria-label="Tutorial di questa schermata"','iconbtn tutorial-help'):'';}
function readPageHelpSeen(){try{return JSON.parse(localStorage.getItem(PAGE_HELP_KEY)||'{}');}catch{return {};}}
function validateItalianForm(form){
 for(const input of Array.from(form.elements||[])){
  if(input.disabled||(input.willValidate===false&&input.dataset?.empireKeyboard!=='true'))continue;
  input.removeAttribute?.('aria-invalid');
  const value=String(input.value||'');let message='';const wasReadonly=input.readOnly;if(input.dataset?.empireKeyboard==='true')input.readOnly=false;const v=input.validity||{};const missing=v.valueMissing,bad=v.badInput,under=v.rangeUnderflow,over=v.rangeOverflow,step=v.stepMismatch,tooLong=v.tooLong,tooShort=v.tooShort,pattern=v.patternMismatch,type=v.typeMismatch,valid=v.valid;input.readOnly=wasReadonly;const numeric=input.dataset?.numeric==='true';if(numeric&&value!==''&&(!Number.isFinite(Number(value))||(input.min!==''&&Number(value)<Number(input.min))||(input.max!==''&&Number(value)>Number(input.max)))){input.setAttribute('aria-invalid','true');input.focus();throw Error('Inserisci un numero nell’intervallo '+(input.min||'—')+' – '+(input.max||'—')+'.');}
  if(missing||(input.required&&!['checkbox','radio'].includes(input.type)&&!value.trim()))message='Compila questo campo.';
  else if(bad)message='Inserisci un numero valido.';
  else if(under)message='Inserisci un valore maggiore o uguale a '+input.min+'.';
  else if(over)message='Inserisci un valore minore o uguale a '+input.max+'.';
  else if(step)message='Inserisci un valore compatibile con l’intervallo richiesto.';
  else if(tooLong)message='Inserisci al massimo '+input.maxLength+' caratteri.';
  else if(tooShort)message='Inserisci almeno '+input.minLength+' caratteri.';
  else if(pattern)message=input.name==='plan-start'||input.name==='plan-end'?'Inserisci la data nel formato gg/mm/aaaa.':'Rispetta il formato richiesto per questo campo.';
  else if(type)message=input.type==='email'?'Inserisci un indirizzo email valido.':'Inserisci un valore nel formato richiesto.';
  else if(valid===false)message='Controlla il valore inserito in questo campo.';
  if(message){input.setAttribute?.('aria-invalid','true');input.focus?.();throw Error(message);}
 }
}
let calendarState=null;
function dateField(name,label,value){return `<label>${label}${name==='plan-end'?' (facoltativa)':''}<span class="date-control"><input name="${name}" id="${name}" value="${P.dateIT(value)}" placeholder="gg/mm/aaaa" readonly inputmode="none" data-action="date-calendar" data-target="${name}" aria-haspopup="dialog" ${name==='plan-start'?'required':''} aria-label="${label}">${btn('▦','date-calendar',`type="button" data-target="${name}" aria-label="Apri calendario ${label.toLowerCase()}"`,'calendar-button')}</span></label>`;}
function openCalendar(target){const input=$('#'+target);input?.blur?.();const iso=P.dateToISO(input?.value)||localDate();calendarState={target,year:Number(iso.slice(0,4)),month:Number(iso.slice(5,7))-1,selected:P.dateToISO(input?.value)};drawCalendar();}
function calendarMonth(delta){if(!calendarState)return;const d=new Date(Date.UTC(calendarState.year,calendarState.month+delta,1));calendarState.year=d.getUTCFullYear();calendarState.month=d.getUTCMonth();drawCalendar();}
function drawCalendar(){const c=calendarState,box=$('#date-calendar');if(!c||!box)return;const months=Array.from({length:12},(_,i)=>new Date(Date.UTC(2026,i,1)).toLocaleDateString('it-IT',{month:'long',timeZone:'UTC'}));const first=(new Date(Date.UTC(c.year,c.month,1)).getUTCDay()+6)%7,count=new Date(Date.UTC(c.year,c.month+1,0)).getUTCDate();box.hidden=false;box.innerHTML=`<div class="calendar-nav">${btn('‹','calendar-prev','type="button" aria-label="Mese precedente"','compact')}<select data-calendar="month" aria-label="Mese">${months.map((m,i)=>`<option value="${i}" ${c.month===i?'selected':''}>${m}</option>`).join('')}</select><select data-calendar="year" aria-label="Anno">${Array.from({length:Math.max(2100,c.year)-Math.min(1900,c.year)+1},(_,i)=>i+Math.min(1900,c.year)).map(y=>`<option ${c.year===y?'selected':''}>${y}</option>`).join('')}</select>${btn('›','calendar-next','type="button" aria-label="Mese successivo"','compact')}</div><div class="calendar-grid">${['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(x=>`<small>${x}</small>`).join('')}${'<span></span>'.repeat(first)}${Array.from({length:count},(_,i)=>{const iso=c.year+'-'+String(c.month+1).padStart(2,'0')+'-'+String(i+1).padStart(2,'0');return btn(String(i+1),'calendar-pick',`type="button" data-date="${iso}" aria-label="${P.dateIT(iso)}" aria-pressed="${iso===c.selected}"`,iso===c.selected?'selected':'');}).join('')}</div>${c.target==='plan-end'?btn('Nessuna data di fine','calendar-clear','type="button"','compact full'):''}`;}
function clearEndDate(){const input=$('#plan-end');if(input)input.value='';$('#date-calendar').hidden=true;calendarState=null;}
function pickCalendarDate(iso){if(!calendarState||!P.validDate(iso))return;const input=$('#'+calendarState.target);input.value=P.dateIT(iso);$('#date-calendar').hidden=true;calendarState=null;}
function formatDateTyping(input){const raw=input.value;if(/^\d{4}-\d{2}-\d{2}$/.test(raw)&&P.validDate(raw)){input.value=P.dateIT(raw);return;}const caret=input.selectionStart??raw.length,digitsBefore=raw.slice(0,caret).replace(/\D/g,'').length,digits=raw.replace(/\D/g,'').slice(0,8);input.value=digits.slice(0,2)+(digits.length>2?'/'+digits.slice(2,4):'')+(digits.length>4?'/'+digits.slice(4):'');let count=0,pos=0;while(pos<input.value.length&&count<digitsBefore){if(/\d/.test(input.value[pos]))count++;pos++;}input.setSelectionRange?.(pos,pos);}

const RECOVERY_PRESETS=[60,90,120,150,180];
function recoveryField(name,label,seconds,id){
 const hasValue=seconds!==null&&seconds!==undefined,custom=hasValue&&!RECOVERY_PRESETS.includes(seconds);
 return `<label>${label}<select name="${name}" id="${id}" data-recovery="${id}" required><option value="" ${!hasValue?'selected':''}>Scegli recupero</option>${RECOVERY_PRESETS.map(t=>`<option value="${formatTime(t)}" ${seconds===t?'selected':''}>${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}</option>`).join('')}<option value="custom" ${custom?'selected':''}>Personalizza</option></select><input id="${id}-custom" name="${name}-custom" value="${custom?formatTime(seconds):''}" placeholder="mm:ss" aria-label="${label} personalizzato" inputmode="numeric" ${custom?'required':'hidden disabled'}></label>`;
}
function syncRecoveryField(id,enabled=true){
 const select=$('#'+id),input=$('#'+id+'-custom');if(!select||!input)return;
 const custom=enabled&&select.value==='custom';input.hidden=!custom;input.disabled=!custom;input.required=custom;
}
function setRecoveryValue(id,seconds){
 const select=$('#'+id),input=$('#'+id+'-custom');if(!select||!input)return;
 const hasValue=seconds!==null&&seconds!==undefined,custom=hasValue&&!RECOVERY_PRESETS.includes(seconds);
 select.value=custom?'custom':hasValue?formatTime(seconds):'';input.value=custom?formatTime(seconds):'';
 syncRecoveryField(id,!select.disabled);
}
function readRecovery(form,name,fallback=null){const selected=form.get(name);return C.parseRest(selected==='custom'?form.get(name+'-custom'):selected??fallback);}
