// Presentation only: the router supplies every score, delta, and accepted ride.
export function createRewards(planner,svg){
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let phase='idle',frame=0,timers=[],animations=[],finishCount=()=>{};
  function reset(){
    cancelAnimationFrame(frame);finishCount();finishCount=()=>{};
    timers.forEach(clearTimeout);timers=[];animations.forEach(a=>a.cancel());animations=[];
    planner.querySelectorAll('.reward-gain,.reward-ripple').forEach(n=>n.remove());
    planner.querySelectorAll('.reward-accepted').forEach(n=>n.classList.remove('reward-accepted'));
    phase='idle';planner.dataset.rewardPhase=phase;
  }
  function decorate({score,valid,assisted=false}){
    planner.dataset.scoreTier=!assisted&&valid?(score===100?'perfect':score>=90?'great':'neutral'):'neutral';
  }
  function animate(node,frames,options){
    const animation=node.animate(frames,options);animations.push(animation);
    animation.finished.then(()=>animation.cancel(),()=>{});return animation;
  }
  function show({previous=0,result,assisted=false}){
    if(assisted)return;
    const target=planner.querySelector(result.valid?'.result-score':'#guess-feedback-title .partial-score');
    if(!target)return;
    const score=result.score??0,delta=score-previous;
    const text=[...target.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&/^\d+/.test(n.textContent));
    if(!text)return;
    target.setAttribute('aria-label',target.textContent);
    const number=document.createElement('span');number.className='reward-number';number.setAttribute('aria-hidden','true');number.textContent=score;
    const remainder=document.createTextNode(text.textContent.replace(/^\d+/,''));text.replaceWith(number,remainder);
    phase='playing';planner.dataset.rewardPhase=phase;
    if(delta>0){
      const gain=document.createElement('span');gain.className='reward-gain';gain.setAttribute('aria-hidden','true');gain.textContent=`+${delta} points`;
      const row=planner.querySelector('.sequence-row');
      if(result.valid)target.parentElement.append(gain);else row.insertBefore(gain,row.querySelector('button'));
      timers.push(setTimeout(()=>gain.remove(),3000));
      const accepted=planner.querySelectorAll('.train-sequence li')[result.legs.length-1];
      if(accepted&&result.legs.length){
        accepted.classList.add('reward-accepted');
        if(!motion.matches)animate(accepted.querySelector('.train-badge'),[{transform:'scale(1)'},{transform:'scale(1.14)',offset:.45},{transform:'scale(1)'}],{duration:380,easing:'ease-out'});
      }
    }
    const routeDelay=result.valid&&!motion.matches?360:0;
    if(routeDelay){
      const paths=[...svg.querySelectorAll('[data-route-layer=yours] .route-path')];
      paths.forEach((path,index)=>{
        path.setAttribute('pathLength','1');
        animate(path,[{strokeDasharray:'1',strokeDashoffset:'1'},{strokeDasharray:'1',strokeDashoffset:'0'}],{duration:360/paths.length,delay:index*360/paths.length,fill:'both',easing:'ease-out'});
      });
    }
    if(score===100&&result.valid&&!motion.matches){
      const ripple=document.createElement('span');ripple.className='reward-ripple';ripple.setAttribute('aria-hidden','true');target.append(ripple);
      animate(ripple,[{opacity:.65,transform:'scale(.96)'},{opacity:0,transform:'scale(1.2)'}],{duration:520,delay:routeDelay+300,fill:'both',easing:'ease-out'});
      timers.push(setTimeout(()=>ripple.remove(),routeDelay+820));
    }
    if(delta>0&&!motion.matches){
      number.textContent=previous;
      finishCount=()=>{number.textContent=score;};
      const started=performance.now()+routeDelay;
      function count(now){
        if(!number.isConnected)return;
        const progress=Math.max(0,Math.min(1,(now-started)/460));
        number.textContent=Math.round(previous+delta*(1-(1-progress)**3));
        if(progress<1)frame=requestAnimationFrame(count);else finishCount=()=>{};
      }
      frame=requestAnimationFrame(count);
    }
    const duration=motion.matches?0:routeDelay+(score===100&&result.valid?820:delta>0?460:0);
    if(duration)timers.push(setTimeout(()=>{phase='idle';planner.dataset.rewardPhase=phase;},duration));
    else{phase='idle';planner.dataset.rewardPhase=phase;}
  }
  motion.addEventListener('change',reset);
  reset();
  return {reset,decorate,show};
}
