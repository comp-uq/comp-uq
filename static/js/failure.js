'use strict';
(() => {
  const data=window.COMP_FAILURE_DATA;
  if(!data?.tasks?.length)return;
  const $=id=>document.getElementById(id), video=$('rollout-video');
  const taskSelect=$('failure-task'), baselineSelect=$('failure-baseline');
  let task=data.tasks.find(t=>t.id==='libero-70')||data.tasks[0], outcome='failure', baseline='bayesdiff', loading=false, loadTimer;
  const colors={comp_ukf:'#007a69',comp_ekf:'#62b6a3',bayesdiff:'#c8774e',deua:'#9795b3',gu:'#637ca3',decu:'#c8a95b',vfd:'#7d9a65'};
  const charts=['ours','baseline'].map(name=>({name,el:$(`failure-${name}-chart`),ctx:$(`failure-${name}-chart`).getContext('2d'),w:0,h:0}));
  function clip(){return task.clips[outcome];}
  function format(v){if(!Number.isFinite(v))return '—';if(v===0)return '0';return new Intl.NumberFormat('en-US',{maximumSignificantDigits:3,notation:Math.abs(v)<.001||Math.abs(v)>=10000?'scientific':'standard'}).format(v);}
  function scale(method){const threshold=clip().methods[method].threshold,spread=task.displayScales[method].spread;return v=>{const z=(v-threshold)/spread;return .5+.5*z/(1+Math.abs(z));};}
  function relative(v){return v.toFixed(3);}
  function decision(){const c=clip();return Math.max(0,Math.min(c.methods.comp_ukf.score.length-1,Math.floor((loading?0:video.currentTime)*c.fps/c.actionsPerDecision+1e-7)));}
  function draw(chart,method){
    const {ctx:c,w,h}=chart;if(!w||!h)return;c.clearRect(0,0,w,h);
    const sample=clip(),series=sample.methods[method],current=decision(),color=colors[method];
    const normalized=scale(method);
    const l=57,r=w-10,t=14,b=h-25,duration=sample.frames/sample.fps;
    const xx=i=>l+(r-l)*(i*sample.actionsPerDecision/sample.fps)/duration;
    const yy=v=>b-normalized(v)*(b-t);
    c.font='9px Manrope, Arial';c.lineWidth=1;c.textAlign='right';
    for(let j=0;j<=4;j++){
      const val=j/4,y=b-val*(b-t);c.strokeStyle='#e1e7df';c.beginPath();c.moveTo(l,y);c.lineTo(r,y);c.stroke();c.fillStyle='#738277';c.fillText(val.toFixed(2),l-7,y+3);
    }
    const thresholdY=yy(series.threshold);
    c.setLineDash([5,4]);c.lineWidth=1.5;c.strokeStyle='#9c6b47';c.beginPath();c.moveTo(l,thresholdY);c.lineTo(r,thresholdY);c.stroke();c.setLineDash([]);
    function curve(end,col,width){c.beginPath();for(let i=0;i<=end;i++){const x=xx(i),y=yy(series.score[i]);if(!i)c.moveTo(x,y);else{c.lineTo(x,yy(series.score[i-1]));c.lineTo(x,y);}}const endX=end===series.score.length-1?r:l+(r-l)*Math.min(duration,loading?0:video.currentTime)/duration;c.lineTo(endX,yy(series.score[end]));c.strokeStyle=col;c.lineWidth=width;c.stroke();}
    curve(series.score.length-1,color+'35',1.5);curve(current,color,2);
    const nowX=l+(r-l)*Math.min(duration,loading?0:video.currentTime)/duration;
    c.strokeStyle='#9aaba0';c.lineWidth=1;c.setLineDash([2,3]);c.beginPath();c.moveTo(nowX,t);c.lineTo(nowX,b);c.stroke();c.setLineDash([]);
    c.fillStyle=color;c.beginPath();c.arc(nowX,yy(series.score[current]),3.5,0,Math.PI*2);c.fill();
    const thresholdLabel='Threshold 0.5';c.font='9px Manrope, Arial';
    const labelWidth=c.measureText(thresholdLabel).width+10,labelY=thresholdY-6;
    c.fillStyle='#fffffff2';c.fillRect(r-labelWidth-2,labelY-10,labelWidth+4,14);c.fillStyle='#865638';c.textAlign='right';c.fillText(thresholdLabel,r-4,labelY);
    c.fillStyle='#738277';c.font='9px Manrope, Arial';c.textAlign='left';c.fillText('0',l,h-6);c.textAlign='center';c.fillText('Time (s)',(l+r)/2,h-6);c.textAlign='right';c.fillText(format(duration),r,h-6);
    const key=chart.name,status=$(`failure-${key}-status`),alarm=series.alarmDecision;
    const flagged=alarm!==null&&current>=alarm;
    $(`failure-${key}-value`).textContent=relative(normalized(series.score[current]));
    $(`failure-${key}-value`).dataset.normalized=normalized(series.score[current]);
    $(`failure-${key}-value`).dataset.value=series.score[current];
    $(`failure-${key}-value`).title=`Raw score: ${series.score[current]}. Scaled relative to this estimator’s calibrated threshold; not a failure probability.`;
    $(`failure-${key}-threshold`).textContent='Threshold 0.5';
    $(`failure-${key}-threshold`).dataset.normalized=normalized(series.threshold);
    $(`failure-${key}-threshold`).title=`Raw threshold: ${series.threshold}. Mapped to 0.5 using the same calibration-based scale as the scores.`;
    chart.el.dataset.thresholdY=thresholdY;chart.el.dataset.plotTop=t;chart.el.dataset.plotBottom=b;
    status.textContent=loading?'Loading':flagged?`Alarm at ${format(alarm*sample.actionsPerDecision/sample.fps)} s`:'No alarm';
    status.classList.toggle('triggered',flagged&&!loading);
    chart.el.dataset.currentDecision=current;chart.el.dataset.alarm=String(flagged);chart.el.dataset.method=method;
  }
  function render(){draw(charts[0],'comp_ukf');draw(charts[1],baseline);$('decision-label').textContent=`Decision ${decision()+1} / ${clip().methods.comp_ukf.score.length}`;}
  function resize(){for(const chart of charts){const rect=chart.el.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);chart.w=rect.width;chart.h=rect.height;chart.el.width=Math.round(rect.width*dpr);chart.el.height=Math.round(rect.height*dpr);chart.ctx.setTransform(dpr,0,0,dpr,0,0);}render();}
  function setBaseline(value){baseline=value;baselineSelect.value=value;const name=$('failure-baseline-name');name.replaceChildren();const dot=document.createElement('i');dot.className='dot';dot.style.background=colors[value];name.append(dot,document.createTextNode(data.methods[value]));$('failure-baseline-chart').setAttribute('aria-label',`${data.methods[value]} uncertainty and its calibrated failure threshold`);render();}
  function selectClip(){
    if(!task.clips[outcome])outcome=Object.keys(task.clips)[0];
    const single=Object.keys(task.clips).length===1;
    $('failure-outcome-controls').hidden=single;$('failure-recording-kind').hidden=!single;
    $('failure-recording-kind').textContent=outcome==='success'?'Successful rollout':'Failed rollout';
    const sample=clip(),src=`static/media/failure/${sample.id}.mp4?v=20261015-c23`;
    loading=true;clearTimeout(loadTimer);$('failure-loading').hidden=true;$('failure-loading').textContent='Loading video…';
    video.pause();video.poster=`static/media/failure/${sample.id}.webp`;
    if(video.getAttribute('src')!==src){video.src=src;video.load();}
    else if(video.readyState>=2)loading=false;
    $('rollout-task').textContent=task.instruction;
    $('failure-outcome').textContent=sample.success?'The policy completes the task.':'The policy reaches the episode limit without completing the task.';
    video.setAttribute('aria-label',`${task.suite}: ${task.instruction}. ${sample.success?'Successful':'Failed'} rollout.`);
    document.querySelectorAll('[data-outcome]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.outcome===outcome)));
    loadTimer=setTimeout(()=>{if(loading)$('failure-loading').hidden=false;},350);
    render();
  }
  for(const t of data.tasks){const opt=document.createElement('option');opt.value=t.id;opt.textContent=`${t.suite} · ${t.label}`;taskSelect.append(opt);}
  for(const key of ['bayesdiff','deua','gu','decu','vfd','comp_ekf']){const opt=document.createElement('option');opt.value=key;opt.textContent=data.methods[key];baselineSelect.append(opt);}
  taskSelect.addEventListener('change',()=>{task=data.tasks.find(t=>t.id===taskSelect.value);selectClip();});
  baselineSelect.addEventListener('change',()=>setBaseline(baselineSelect.value));
  document.querySelectorAll('[data-outcome]').forEach(b=>b.addEventListener('click',()=>{if(outcome!==b.dataset.outcome){outcome=b.dataset.outcome;selectClip();}}));
  video.addEventListener('loadeddata',()=>{loading=false;clearTimeout(loadTimer);$('failure-loading').hidden=true;render();});
  video.addEventListener('error',()=>{clearTimeout(loadTimer);$('failure-loading').hidden=false;$('failure-loading').textContent='Video could not load. Select another rollout to retry.';});
  ['timeupdate','seeked','pause','ended','loadedmetadata'].forEach(e=>video.addEventListener(e,render));
  if('requestVideoFrameCallback' in video){const tick=()=>{render();video.requestVideoFrameCallback(tick);};video.requestVideoFrameCallback(tick);}
  const observer=new ResizeObserver(resize);charts.forEach(c=>observer.observe(c.el));
  const warm=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){video.preload='auto';if(video.readyState<2)video.load();warm.disconnect();}},{rootMargin:'800px 0px'});warm.observe($('failure'));
  window.COMP_FAILURE={render,getState:()=>({task:task.id,outcome,baseline,decision:decision(),loading})};
  taskSelect.value=task.id;setBaseline(baseline);selectClip();resize();document.fonts.ready.then(resize);
})();
