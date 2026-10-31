/* A record belongs to one exercise instance in one day in one plan.
   Proposals never enter load/history until the user confirms a completed set. */
(function(root){'use strict';
function weight(raw){if(raw===null||raw===undefined||String(raw).trim()==='')return null;const value=Number(String(raw).trim().replace(',','.'));return Number.isFinite(value)&&value>=0?value:null;}
function seriesWeight(series){const values=[series.load,...(series.steps||[]).map(step=>step.load)].map(weight).filter(value=>value!==null);return values.length?Math.max(...values):null;}
function progress(plan,dayId,exerciseId){
 const records=new Map(),events=[];let best=null;
 for(const [sessionIndex,session] of (plan?.sessions||[]).entries()){
  if(session.dayId!==dayId)continue;const entry=session.entries?.[exerciseId];if(!entry)continue;
  for(const [seriesIndex,series] of entry.series.entries()){
   if(series.done!==true)continue;const load=seriesWeight(series);if(load===null)continue;
   const time=[series.completedAt,entry.startedAt,session.started].map(value=>Date.parse(value)).find(value=>Number.isFinite(value));events.push({sessionId:session.id,sessionIndex,seriesIndex,load,time:Number.isFinite(time)?time:0});
  }
 }
 events.sort((a,b)=>a.time-b.time||a.sessionIndex-b.sessionIndex||a.seriesIndex-b.seriesIndex);
 for(const event of events){if(best!==null&&event.load>best)records.set(event.sessionId,{load:event.load,previous:best,seriesIndex:event.seriesIndex});best=best===null?event.load:Math.max(best,event.load);}
 return {best,records};
}
function suggestion(plan,session,exerciseId,index){const v=session.entries?.[exerciseId]?.series[index];if(!v||v.done||v.loadTouched||v.load!==''&&v.load!==undefined)return null;if(index===0)return progress(plan,session.dayId,exerciseId).best;const previous=session.entries[exerciseId].series[index-1];return previous?.done===true?weight(previous.load):null;}
function complete(plan,session,exerciseId,index){const v=session.entries?.[exerciseId]?.series[index];if(!v)return;const proposed=suggestion(plan,session,exerciseId,index);if(proposed!==null)v.load=String(proposed);v.done=true;v.completedAt=new Date().toISOString();}
function uncomplete(session,exerciseId,index){const v=session.entries?.[exerciseId]?.series[index];if(v){v.done=false;delete v.completedAt;}}
const api={weight,seriesWeight,progress,suggestion,complete,uncomplete};root.EmpireRecords=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
