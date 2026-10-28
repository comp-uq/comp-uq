'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const data = window.COMP_DATA;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  let support = .30, supportTarget = .30, solverPosition = 0;
  let selectedTask = 0, selectedWording = 0, time = 0, lastFrame = 0;
  const heroVideo = $('hero-video');
  let heroWording='specific', heroTask=0, heroUserPaused=false, heroLoading=false, heroArm='ukf10';
  const rolloutVideo = $('rollout-video');
  const canvases = new Map();
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
  }, {rootMargin:'120px'});
  ['intuition-canvas','collapse-canvas'].forEach(id => {
    const el = $(id), ctx = el.getContext('2d');
    canvases.set(id, {el, ctx, w:0, h:0}); observer.observe(el);
  });
  function resize() {
    for (const c of canvases.values()) {
      const r = c.el.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      c.w = r.width; c.h = r.height;
      c.el.width = Math.round(r.width*dpr); c.el.height = Math.round(r.height*dpr);
      c.ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    render();
  }
  const ro = new ResizeObserver(resize);
  canvases.forEach(c => ro.observe(c.el));
  function dot(ctx,x,y,r,color) {
    ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();
  }
  function text(ctx,txt,x,y,color='#708078',size=10,align='left') {
    ctx.font=`500 ${size}px Manrope, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(txt,x,y);
  }
  function ellipse(ctx,x,y,rx,ry,color,fill,angle=0) {
    ctx.beginPath();ctx.ellipse(x,y,Math.max(rx,.1),Math.max(ry,.1),angle,0,2*Math.PI);
    if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();
  }
  // Representative fixed weight offsets inside the displayed contour.
  // Every path and its contour use this same affine map at every time.
  const heroWeights = Array.from({length:24}, (_,j) => {
    const r=.86*Math.sqrt((j+.5)/24), angle=j*Math.PI*(3-Math.sqrt(5));
    return [r*Math.cos(angle),r*Math.sin(angle)];
  });
  function heroGeometry(w,h,q,t,theta=[0,0]) {
    const cx=w*.11+w*.71*t, cy=h*.53-Math.sin(Math.PI*t)*h*.12;
    const rx=(9+q*14)*t, ry=(13+q*h*.24)*t;
    return {cx,cy,rx,ry,x:cx+rx*theta[0],y:cy+ry*theta[1]};
  }
  function hero() {
    const {ctx:c,w,h} = canvases.get('intuition-canvas');if(!w)return;
    c.clearRect(0,0,w,h);
    const q=support, phase=(time*.125+.44)%1, at=Math.min(1,phase/.80);
    const fade=phase>.94?(1-phase)/.06:Math.min(1,phase/.06);
    const rgb=q<.55?[149,220,184]:[Math.round(149+96*(q-.55)/.45),Math.round(220-107*(q-.55)/.45),Math.round(184-73*(q-.55)/.45)];
    const color=alpha=>`rgba(${rgb.join(',')},${alpha})`;
    for(let x=28;x<w;x+=28)for(let y=20;y<h-20;y+=28)dot(c,x,y,.65,'#345048');
    const end=heroGeometry(w,h,q,1);
    c.setLineDash([3,5]);ellipse(c,end.cx,end.cy,end.rx,end.ry,color(.25),null);c.setLineDash([]);
    // The visible cloud advances together: all endpoints lie inside its ellipse.
    c.save();c.globalAlpha=fade;
    heroWeights.forEach((theta,j)=>{
      c.beginPath();
      for(let k=0;k<=80;k++){
        const p=heroGeometry(w,h,q,at*k/80,theta);
        if(!k)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);
      }
      c.strokeStyle=color(j%4===0?.62:.26);c.lineWidth=j%4===0?1.2:.8;c.stroke();
    });
    const current=heroGeometry(w,h,q,at);
    ellipse(c,current.cx,current.cy,current.rx,current.ry,color(.95),color(.06));
    heroWeights.forEach((theta,j)=>{
      const p=heroGeometry(w,h,q,at,theta);
      dot(c,p.x,p.y,j%4===0?2.3:1.65,color(j%4===0?1:.7));
    });
    c.beginPath();for(let k=0;k<=80;k++){const p=heroGeometry(w,h,q,at*k/80);if(!k)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.strokeStyle='#e2f5de';c.lineWidth=1.8;c.stroke();
    dot(c,current.cx,current.cy,3,'#effbe1');c.restore();
    const start=heroGeometry(w,h,q,0);dot(c,start.x,start.y,4,'#e4f7d7');
    text(c,'One initial noise',start.x,h-16,'#a6c5b3',9,'center');
    text(c,'Possible actions',end.x,h-16,'#a6c5b3',9,'center');
    text(c,'Each path keeps one weight draw through ODE integration.',w/2,26,'#c6e2ca',w<450?9:10,'center');
  }
  function solverState() {
    const source=window.COMP_SOLVER, i=Math.min(Math.floor(solverPosition),source.grids.length-2);
    const a=source.grids[i],b=source.grids[i+1],f=solverPosition-i;
    const mix=(x,y)=>Array.isArray(x)?x.map((v,j)=>mix(v,y[j])):x+(y-x)*f;
    const methods={};
    for(const name of ['truth','bayesdiff','ukf'])methods[name]={mean:mix(a.methods[name].mean,b.methods[name].mean),cov:mix(a.methods[name].cov,b.methods[name].cov),trace:mix(a.methods[name].trace,b.methods[name].trace)};
    return {steps:mix(a.steps,b.steps),methods,cloud:mix(a.cloud,b.cloud),measured:Math.abs(solverPosition-Math.round(solverPosition))<1e-7};
  }
  function collapse() {
    const {ctx:c,w,h}=canvases.get('collapse-canvas');if(!w)return;
    const state=solverState(), source=window.COMP_SOLVER, reference=state.methods.truth;
    c.clearRect(0,0,w,h);
    const gap=w<500?20:42,pw=(w-gap)/2;
    const [lo,hi]=source.bounds,scale=Math.min((pw-12)/(hi[0]-lo[0]),(h-18)/(hi[1]-lo[1]));
    for(let side=0;side<2;side++){
      const key=side?'ukf':'bayesdiff',m=state.methods[key],color=side?'#007a69':'#b96742';
      const offset=side*(pw+gap),cx=offset+pw/2,cy=h/2;
      const xy=p=>[cx+(p[0]-(lo[0]+hi[0])/2)*scale,cy-(p[1]-(lo[1]+hi[1])/2)*scale];
      const contour=(mean,cov,stroke,fill)=>{
        const a=cov[0][0],d=cov[1][1],b=(cov[0][1]+cov[1][0])/2,r=Math.hypot(a-d,2*b);
        const p=xy(mean),angle=-Math.atan2(2*b,a-d)/2;
        ellipse(c,...p,source.sigma*Math.sqrt(Math.max(0,(a+d+r)/2))*scale,source.sigma*Math.sqrt(Math.max(0,(a+d-r)/2))*scale,stroke,fill,angle);
      };
      // Draw the measured mean trajectories.
      for(let x=offset+12;x<offset+pw;x+=24)for(let y=16;y<h;y+=24)dot(c,x,y,.6,'#dce4db');
      state.cloud.forEach(p=>dot(c,...xy(p),w<500?.7:1,'#697c7529'));
      for(let j=10;j<80;j+=10)contour(m.mean[j],m.cov[j],color+'48',color+'06');
      c.beginPath();m.mean.forEach((p,j)=>{const q=xy(p);j?c.lineTo(...q):c.moveTo(...q);});c.strokeStyle=color;c.lineWidth=1.8;c.stroke();
      c.setLineDash([4,4]);contour(reference.mean[80],reference.cov[80],'#697c75',null);c.setLineDash([]);
      contour(m.mean[80],m.cov[80],color,color+'12');dot(c,...xy(m.mean[80]),2.5,color);
      const start=xy(m.mean[0]);dot(c,...start,3,'#51685b');text(c,'Initial noise',start[0]+7,start[1]+4,'#708078',w<500?8:10);
    }
    const stepLabel=state.measured?String(Math.round(state.steps)):'≈ '+Math.round(state.steps);
    $('steps-value').textContent=stepLabel;
    $('steps-slider').setAttribute('aria-valuetext',`${stepLabel} Euler steps, ${state.measured?'measured':'interpolated'}`);
    for(const [prefix,key] of [['bd','bayesdiff'],['ukf','ukf']]){
      $(prefix+'-variance').textContent=state.methods[key].trace.toFixed(6);
      $(prefix+'-ratio').textContent=(100*state.methods[key].trace/reference.trace).toFixed(2)+'% of ground-truth reference';
      $(prefix+'-variance').dataset.value=state.methods[key].trace;
    }
    $('reference-variance').textContent=reference.trace.toFixed(6);
    document.querySelectorAll('[data-grid]').forEach(el=>el.setAttribute('aria-pressed',String(Math.abs(Number(el.dataset.grid)-solverPosition)<1e-7)));
  }
  function failure() { window.COMP_FAILURE?.render(); }
  function render(){hero();collapse();failure();}
  function frame(now){
    const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
    if(!paused&&!document.hidden)time+=dt;
    support += (supportTarget-support)*(paused?1:Math.min(1,dt*9));
    if(visible.has('intuition-canvas')&&(!paused||Math.abs(support-supportTarget)>.001))hero();
    requestAnimationFrame(frame);
  }
  $('support-slider').addEventListener('input',e=>{
    supportTarget=Number(e.target.value)/100;
    $('support-label').textContent=supportTarget<.34?'Mostly familiar':supportTarget<.7?'Less familiar':'Weakly supported';
    if(paused){support=supportTarget;hero();}
  });
  $('steps-slider').addEventListener('input',e=>{solverPosition=Number(e.target.value);collapse();});
  document.querySelectorAll('[data-grid]').forEach(el=>el.addEventListener('click',()=>{solverPosition=Number(el.dataset.grid);$('steps-slider').value=solverPosition;collapse();}));
  function motion(){
    document.body.classList.toggle('motion-paused',paused);
    $('motion-toggle').textContent=paused?'Resume motion':'Pause motion';
    $('motion-toggle').setAttribute('aria-pressed',String(paused));
    if(paused){heroVideo.pause();rolloutVideo.pause();}else if(heroVisible&&!heroUserPaused){heroVideo.play().catch(()=>{});}
  }
  $('motion-toggle').addEventListener('click',()=>{paused=!paused;motion();render();});
  let heroVisible=true;
  new IntersectionObserver(es=>{heroVisible=es[0].isIntersecting;if(heroVisible&&!paused&&!heroUserPaused)heroVideo.play().catch(()=>{});else heroVideo.pause();}).observe($('robot-stage'));
  reduced.addEventListener('change',e=>{paused=e.matches;motion();render();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)heroVideo.pause();else if(heroVisible&&!paused&&!heroUserPaused)heroVideo.play().catch(()=>{});});
  const heroArmInfo={
    ukf10:{label:'CoMP-UKF',color:'#89dfbb'},
    bd10:{label:'BayesDiff, 10 integration steps',name:'BayesDiff',steps:'10 integration steps',color:'#e1bc91'},
    bd50:{label:'BayesDiff, 50 integration steps',name:'BayesDiff',steps:'50 integration steps',color:'#9abfea'}
  };
  const heroArms=['ukf10','bd10','bd50'];
  const heroNumber=v=>v>=10?v.toFixed(1):v>=1?v.toFixed(2):v===0?'0':v.toPrecision(3);
  const allHeroScores=arms=>window.COMP_HERO.tasks.flatMap(t=>Object.values(t.clips).flatMap(c=>arms.flatMap(a=>c.scores[a])));
  // Fixed raw axes across clips; both BayesDiff grids share one range.
  const heroUKFScores=allHeroScores(['ukf10']),heroBDScores=allHeroScores(['bd10','bd50']);
  const heroAxis=(scores,unit)=>({max:Math.ceil(Math.max(...scores)/unit)*unit});
  const heroUKFAxis=heroAxis(heroUKFScores,50),heroBDAxis=heroAxis(heroBDScores,.2);
  const heroAxes={ukf10:heroUKFAxis,bd10:heroBDAxis,bd50:heroBDAxis};
  // Fixed per-estimator color ranges across all tasks and wordings.
  const heroColorMaxima=Object.fromEntries(heroArms.map(arm=>[arm,Math.max(...allHeroScores([arm]))]));
  function heroScores(clip,arm){return clip.scores[arm];}
  heroArms.forEach(arm=>{
    const info=heroArmInfo[arm],button=document.createElement('button');
    button.dataset.heroArm=arm;button.setAttribute('aria-pressed',String(arm===heroArm));
    button.title=arm==='ukf10'?'CoMP-UKF, 10 integration steps':info.label;
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-controls','hero-trace hero-score hero-video-method');
    button.style.setProperty('--method-color',info.color);
    button.innerHTML=`<span><i></i>${info.name||info.label}</span>${info.steps?`<small>${info.steps}</small>`:''}`;
    button.addEventListener('click',()=>{heroArm=arm;heroReadout();});
    $('hero-methods').append(button);
  });
  function heroReadout() {
    const source=window.COMP_HERO;if(!source)return;
    const clip=source.tasks[heroTask].clips[heroWording],step=Math.min(clip.frames,heroLoading?0:heroVideo.currentTime*clip.fps);
    let index=0;for(let j=1;j<clip.decisionSteps.length;j++)if(step>=clip.decisionSteps[j])index=j;
    const info=heroArmInfo[heroArm],axis=heroAxes[heroArm],heroColorMax=heroColorMaxima[heroArm];
    const score=heroScores(clip,heroArm)[index],level=Math.max(0,Math.min(1,score/heroColorMax));
    const stops=[[108,212,169],[224,200,121],[241,113,104]];
    const colorLevel=level;
    const segment=colorLevel<.5?0:1,blend=(colorLevel-segment*.5)*2;
    const color=stops[segment].map((v,i)=>Math.round(v+(stops[segment+1][i]-v)*blend));
    $('robot-stage').style.setProperty('--uq-color',color.join(','));
    $('hero-video-method').textContent=info.label;
    $('hero-score').dataset.method=heroArm;
    $('hero-score').dataset.axisMax=axis.max;
    $('hero-score').dataset.colorMax=heroColorMax;
    $('hero-color-max').textContent=heroNumber(heroColorMax);
    $('hero-color-max').title=`Maximum recorded ${info.label} score: ${heroColorMax.toPrecision(6)}`;
    $('hero-status').textContent=heroLoading?'Loading video…':level<1/3?'Lower uncertainty':level<2/3?'Moderate uncertainty':'Higher uncertainty';
    $('hero-score').textContent=heroNumber(score);
    $('hero-score').title=`Raw score: ${score.toPrecision(6)}`;
    $('hero-score').dataset.raw=score;
    $('hero-score-label').textContent='Epistemic uncertainty';
    $('hero-decision').textContent=`Decision ${index+1} / ${clip.decisionSteps.length}`;
    $('hero-instruction').textContent=`“${clip.instruction}”`;
    heroArms.forEach(arm=>document.querySelector(`[data-hero-arm="${arm}"]`).setAttribute('aria-pressed',String(arm===heroArm)));
    const xx=t=>34+362*t/clip.frames;
    const yy=v=>77-66*v/axis.max;
    function path(values,end){
      let d=`M${xx(0)},${yy(values[0])}`;
      for(let j=0;j<values.length;j++){
        const start=clip.decisionSteps[j],stop=clip.decisionSteps[j+1]??clip.frames;
        if(start>end)break;
        if(j)d+=`V${yy(values[j])}`;
        d+=`H${xx(Math.min(end,stop))}`;
      }
      return d;
    }
    let svg='';
    const divisions=heroArm==='ukf10'?3:4;
    const ticks=Array.from({length:divisions+1},(_,i)=>i*axis.max/divisions);
    ticks.forEach(v=>{
      const label=Number(v.toPrecision(3)).toString();
      svg+=`<path d="M34 ${yy(v)}H396" stroke="#ffffff12"/><text x="29" y="${yy(v)+3}" text-anchor="end" fill="#9ab3a7" font-size="8">${label}</text>`;
    });
    const values=heroScores(clip,heroArm);
    svg+=`<path data-score-history="${heroArm}" d="${path(values,clip.frames)}" stroke="${info.color}" stroke-opacity=".45" stroke-width="1.4" fill="none"/>`;
    svg+=`<path data-score-trace="${heroArm}" d="${path(values,step)}" stroke="${info.color}" stroke-width="2.2" fill="none"/>`;
    svg+=`<circle cx="${xx(step)}" cy="${yy(values[index])}" r="3" fill="${info.color}"/>`;
    $('hero-trace').innerHTML=svg;
    $('hero-trace').setAttribute('aria-label',`Measured ${info.label} raw epistemic uncertainty, linear vertical scale, across policy decisions`);
    $('hero-seek').value=String(Math.min(1,step/clip.frames));
    const stamp=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
    $('hero-time').textContent=`${stamp(step/clip.fps)} / ${stamp(clip.frames/clip.fps)}`;
    $('hero-play').textContent=heroVideo.paused?'▶':'Ⅱ';
    $('hero-play').setAttribute('aria-label',heroVideo.paused?'Play RoboLab video':'Pause RoboLab video');
  }
  function setHeroClip() {
    const source=window.COMP_HERO,task=source.tasks[heroTask],clip=task.clips[heroWording];
    const videoSrc=`static/media/${clip.media}.mp4?v=20261015-c23`;
    if (heroVideo.getAttribute('src') !== videoSrc) {
      heroLoading=true;heroVideo.pause();
      heroVideo.poster=`static/media/${clip.media}.webp`;
      heroVideo.src=videoSrc;heroVideo.load();
    } else heroLoading=heroVideo.readyState<2;
    heroVideo.setAttribute('aria-label',`${task.label}, ${heroWording} instruction, with measured CoMP-UKF and BayesDiff uncertainty`);
    $('hero-task-select').value=String(heroTask);
    $('hero-task-count').textContent=`${String(heroTask+1).padStart(2,'0')} / ${source.tasks.length}`;
    document.querySelectorAll('[data-hero-wording]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.heroWording===heroWording)));
    heroReadout();if(!paused&&!heroUserPaused&&heroVisible)heroVideo.play().catch(()=>{});
  }
  window.COMP_HERO.tasks.forEach((task,i)=>{
    const option=document.createElement('option');option.value=i;option.textContent=task.label;$('hero-task-select').append(option);
  });
  $('hero-task-select').addEventListener('change',e=>{heroTask=Number(e.target.value);setHeroClip();});
  $('hero-prev').addEventListener('click',()=>{heroTask=(heroTask+window.COMP_HERO.tasks.length-1)%window.COMP_HERO.tasks.length;setHeroClip();});
  $('hero-next').addEventListener('click',()=>{heroTask=(heroTask+1)%window.COMP_HERO.tasks.length;setHeroClip();});
  document.querySelectorAll('[data-hero-wording]').forEach(button=>button.addEventListener('click',()=>{
    heroWording=button.dataset.heroWording;setHeroClip();
  }));
  heroVideo.addEventListener('loadeddata',()=>{heroLoading=false;heroReadout();});
  $('hero-play').addEventListener('click',()=>{
    heroUserPaused=!heroVideo.paused;
    if(heroUserPaused)heroVideo.pause();
    else {if(paused){paused=false;motion();}heroVideo.play().catch(()=>{});}
    heroReadout();
  });
  $('hero-expand').addEventListener('click',async()=>{
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else if($('robot-stage').requestFullscreen)await $('robot-stage').requestFullscreen();
      else if(heroVideo.webkitEnterFullscreen)heroVideo.webkitEnterFullscreen();
    } catch (_) {}
  });
  $('hero-seek').addEventListener('input',e=>{
    const clip=window.COMP_HERO.tasks[heroTask].clips[heroWording];
    heroVideo.currentTime=Math.min(Number(e.target.value)*clip.frames/clip.fps,clip.frames/clip.fps-.01);
    heroReadout();
  });
  ['timeupdate','seeked','loadedmetadata','play','pause'].forEach(event=>heroVideo.addEventListener(event,heroReadout));
  setHeroClip();
  const methodSteps=[
    {
        "tag": "1. Fit Laplace posterior",
        "title": "Fit uncertainty around the pre-trained weights",
        "copy": "Fit a last-layer Laplace posterior on a subset of data. Its center is the pre-trained maximum a posteriori (MAP) estimate. The rest of the network stays frozen, and the fitted weight covariance stays fixed throughout integration.",
        "equation": "θ ∼ N(θ<sub>MAP</sub>, Σ<sub>θ</sub>)",
        "note": "N denotes a Gaussian distribution. <var>θ<sub>MAP</sub></var> is its center and <var>Σ<sub>θ</sub></var> is the weight covariance. Our augmented posterior adds existing observation embeddings with zero output weights, preserving the MAP predictions."
    },
    {
        "tag": "2. Initialize",
        "title": "Fix the noise so the spread comes from the weights",
        "copy": "Draw one initial noise sample and hold it fixed for this uncertainty estimate. Initialize the state mean at that sample, with zero state covariance and zero state-weight cross-covariance. For a robot policy, the observation also stays fixed during integration.",
        "equation": "m<sub>0</sub> = x<sub>0</sub>, &nbsp; P<sub>0</sub> = 0, &nbsp; C<sub>0</sub> = 0",
        "note": "<var>x<sub>0</sub></var> is the fixed initial noise sample. The subscript 0 denotes initialization, before uncertainty in the weights has affected the state."
    },
    {
        "tag": "3. Propagate",
        "title": "Map weight uncertainty to state uncertainty",
        "copy": "Update the state mean, covariance and state-weight cross-covariance together. CoMP-EKF uses a local linearization; CoMP-UKF passes deterministic sigma points through the nonlinear Euler map. Both retain the dependence on the same uncertain weights across steps.",
        "equation": "C<sub>i+1</sub> = A<sub>i</sub> C<sub>i</sub> + B<sub>i</sub> Σ<sub>θ</sub>",
        "note": "At step <var>i</var>, <var>A<sub>i</sub></var> is the local affine state map and <var>B<sub>i</sub></var> is the Euler step’s weight Jacobian. <var>A<sub>i</sub></var> transports the existing cross-covariance <var>C<sub>i</sub></var>; <var>B<sub>i</sub>Σ<sub>θ</sub></var> adds the dependence created by this step."
    },
    {
        "tag": "4. Final uncertainty",
        "title": "Use the final state covariance to quantify epistemic spread",
        "copy": "After integration, CoMP gives a Gaussian approximation to the generated sample. Its total variance is the trace of the final state covariance. For robot action chunks, we can also score the covariance of the accumulated actions, including correlations across the chunk.",
        "equation": "U<sub>chunk</sub> = tr(P<sub>T</sub>)",
        "note": "<var>T</var> is the number of Euler steps; <var>P<sub>T</sub></var> is the final state covariance. The trace sums its diagonal entries to give <var>U<sub>chunk</sub></var>. The robot applications use the accumulated-action score (paper, Appendix A.5)."
    }
];
  document.querySelectorAll('[data-method-step]').forEach(button=>button.addEventListener('click',()=>{
    const selected=Number(button.dataset.methodStep),step=methodSteps[selected];
    for(const [id,key] of [['method-detail-tag','tag'],['method-detail-title','title'],['method-detail-copy','copy']])$(id).textContent=step[key];
    $('method-equation').innerHTML=step.equation;
    $('method-equation-note').innerHTML=step.note;
    document.querySelectorAll('[data-method-step]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    $('method-detail').dataset.step=selected;
  }));
  const taskImages = new Map();
  const taskSceneFiles = {OneBottleInSquarePailTask: 'OneBottleInSquarePailTask-raised.webp'};
  let taskSelection = 0;
  function loadTaskImage(index, priority = 'low') {
    let entry = taskImages.get(index);
    if (!entry) {
      const task = data.language[index], image = new Image(3840, 2160);
      image.id = 'task-image'; image.alt = `RoboLab task view: ${task.label}`;
      image.decoding = 'async'; image.fetchPriority = priority;
      const ready = new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => { taskImages.delete(index); reject(new Error('Scene image could not load')); };
      });
      entry = {image, ready}; taskImages.set(index, entry);
      image.src = `static/media/language-scenes/${taskSceneFiles[task.id] || task.id + '.webp'}`;
    } else if (priority === 'high') entry.image.fetchPriority = 'high';
    return entry.ready;
  }
  function preloadTaskImages() {
    data.language.forEach((_, index) => { loadTaskImage(index).catch(() => {}); });
  }
  async function selectLanguageTask(index) {
    const selection = ++taskSelection, status = $('scene-status');
    const panel = $('task-select').closest('.language-demo');
    panel.setAttribute('aria-busy', 'true'); status.hidden = true;
    const pending = setTimeout(() => {
      if (selection === taskSelection) { status.textContent = 'Loading scene…'; status.hidden = false; }
    }, 120);
    try {
      const image = await loadTaskImage(index, 'high');
      await image.decode();
      if (selection !== taskSelection) return;
      // Swap the decoded image and its measurements together; ignore stale selections.
      $('task-image').replaceWith(image);
      selectedTask = index; $('task-select').value = String(index);
      language(); status.hidden = true;
    } catch {
      if (selection !== taskSelection) return;
      $('task-select').value = String(selectedTask);
      status.textContent = 'Could not load the scene. Please try again.'; status.hidden = false;
    } finally {
      clearTimeout(pending);
      if (selection === taskSelection) panel.setAttribute('aria-busy', 'false');
    }
  }
  function language(){
    const t=data.language[selectedTask];
    $('instruction-text').textContent=`“${t.instructions[selectedWording]}”`;
    $('plain-value').textContent=t.plain[selectedWording].toFixed(2);
    $('aug-value').textContent=t.augmented[selectedWording].toFixed(2);
    function response(id, values, color) {
      const x=[12,180,348], y=values.map(v=>44-v*36);
      const labels=['Specific','Default','Vague'];
      $(id).innerHTML = `<path d="M12 44H348" stroke="#e5ebe2" fill="none"/>`+
        `<path d="M${x.map((v,i)=>v+','+y[i]).join(' L')}" fill="none" stroke="${color}" stroke-width="2"/>`+
        x.map((v,i)=>`<circle cx="${v}" cy="${y[i]}" r="${i===selectedWording?4:2}" fill="${color}"/>`+
          `<text x="${v}" y="59" text-anchor="${i===0?'start':i===2?'end':'middle'}" fill="${i===selectedWording?color:'#87958a'}" font-size="9">${labels[i]}</text>`).join('');
    }
    response('plain-response',t.plain,'#8a9e92');
    response('aug-response',t.augmented,'#007a69');
    $('success-value').textContent=`${t.success[selectedWording].toFixed(1)}%`;
    document.querySelectorAll('[data-wording]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.wording)===selectedWording)));
  }
  if(data){
    data.language.forEach((t,i)=>{const o=document.createElement('option');o.value=i;o.textContent=t.label;$('task-select').append(o);});
    $('task-select').addEventListener('change',e=>{selectLanguageTask(Number(e.target.value));});
    $('task-select').addEventListener('pointerenter',preloadTaskImages,{once:true});
    $('task-select').addEventListener('focus',preloadTaskImages,{once:true});
    document.querySelectorAll('[data-wording]').forEach(b=>b.addEventListener('click',()=>{selectedWording=Number(b.dataset.wording);language();}));
    language();
    // Warm the task gallery ahead of scrolling into it, without competing with the banner.
    const taskPreloader = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        preloadTaskImages(); taskPreloader.disconnect();
      }
    }, {rootMargin:'1200px 0px'});
    taskPreloader.observe($('observation'));
    // The failure gallery owns its media loading and synchronized charts.

  }
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{
    const target=document.getElementById(a.getAttribute('href').slice(1));
    if(target?.tagName==='DETAILS')target.open=true;
  }));
  motion();resize();document.fonts.ready.then(render);requestAnimationFrame(frame);
})();
