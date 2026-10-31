/* A deliberate left swipe requests confirmation; never deletes directly. */
(function(){'use strict';let start=null,suppressUntil=0;
function begin(ev){start=null;const card=ev.target.closest?.('.home-plan');if(!card||ev.button>0||ev.isPrimary===false||document.querySelector('#modal')?.open||ev.target.closest?.('button,input,select,a'))return;if(ev.touches?.length>1)return;const p=ev.touches?ev.touches[0]:ev;start={card,x:p.clientX,y:p.clientY,id:ev.pointerId};}
function move(ev){if(!start)return;const p=ev.touches?ev.touches[0]:ev;if(!p||ev.touches?.length>1||Math.abs(p.clientY-start.y)>45)start=null;}
function finish(ev){if(!start)return;const s=start;start=null;if(ev.pointerId!==undefined&&ev.pointerId!==s.id)return;const p=ev.changedTouches?ev.changedTouches[0]:ev;if(!p)return;const dx=p.clientX-s.x,dy=p.clientY-s.y;if(dx>-80||Math.abs(dy)>45||Math.abs(dx)<Math.abs(dy)*1.8)return;suppressUntil=Date.now()+500;deletePlan(s.card.dataset.planCard);}
if(window.PointerEvent){document.addEventListener('pointerdown',begin,{passive:true});document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerup',finish,{passive:true});document.addEventListener('pointercancel',()=>{start=null;},{passive:true});}else{document.addEventListener('touchstart',begin,{passive:true});document.addEventListener('touchmove',move,{passive:true});document.addEventListener('touchend',finish,{passive:true});document.addEventListener('touchcancel',()=>{start=null;},{passive:true});}
document.addEventListener('scroll',()=>{start=null;},true);
document.addEventListener('click',ev=>{if(Date.now()<suppressUntil&&ev.target.closest?.('.home-plan')){ev.preventDefault();ev.stopImmediatePropagation();}},true);
})();
