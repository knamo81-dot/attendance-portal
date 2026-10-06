const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

function portalSession(){
  try{if(parent&&parent!==window&&typeof parent.getPortalSession==='function')return parent.getPortalSession()||{}}catch(e){}
  try{if(parent&&parent!==window&&parent.portalSession)return parent.portalSession||{}}catch(e){}
  return window.portalSession||window.currentPortalSession||{};
}
function companyId(){const s=portalSession(),c=s.activeCompany||s.active_company||s.selectedCompany||s.company||{};return String(s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||'').trim()}
function userEmail(){const s=portalSession();return String(s.email||s.user?.email||s.profile?.email||'').trim()}
function portalRole(){const s=portalSession(),r=(s.appRoles||s.app_roles||{}).wastewater||{};let v=typeof r==='string'?r:(r.role||r.role_key||'user');v=String(v).trim().toLowerCase();if(['관리자','administrator'].includes(v))v='admin';if(['운영자','manager'].includes(v))v='operator';return v}
function canManage(){return ['admin','operator'].includes(portalRole()) || (portalSession()?.mode==='service'&&portalSession()?.isServiceAdmin===true)}
function rawClient(){const s=portalSession();if(s?.supabase)return s.supabase;try{if(parent&&parent!==window&&parent.portalSupabase)return parent.portalSupabase}catch(e){}if(window.portalSupabase)return window.portalSupabase;window.portalSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return window.portalSupabase}
const DB=rawClient();
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const num=(v,d=2)=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'-'};
const dateKey=v=>String(v||'').slice(0,10);
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function q(table){let x=DB.from(table).select('*');const c=companyId();if(c)x=x.eq('company_id',c);return x}
function notice(msg,type='ok'){const e=$('#notice');if(!e)return;e.textContent=msg;e.className='notice show '+type;setTimeout(()=>e.classList.remove('show'),3500)}
function errorView(msg){$('#app').innerHTML=`<div class="notice show err">${esc(msg)}</div>`}

const DEFAULT_SETTINGS={facility_name:'폐수배출시설',measurement_mode:'height',volume_unit:'m3',tank_height_cm:154,tank_capacity_m3:7,ton_to_cm:22,active:true};
let mode='status',settingsTab='facility';
let settings={...DEFAULT_SETTINGS},daily=[],pickups=[],vendors=[],locations=[],units=[],openings=[],refCats=[],docTypes=[];
let editId=null;
let statusYear=String(new Date().getFullYear());

function measurementMode(){return settings?.measurement_mode==='volume'?'volume':'height'}
function volumeUnit(){return String(settings?.volume_unit||'m3').toUpperCase()==='L'?'L':'m3'}
function toM3(v,unit){const n=Number(v||0);return String(unit||'m3').toUpperCase()==='L'?n/1000:n}
function cmToM3(cm){const h=Number(settings?.tank_height_cm||154),cap=Number(settings?.tank_capacity_m3||7);return h>0?Number(cm||0)/h*cap:0}
function rowStorage(row){
  if(!row||row.is_holiday)return {main:0,external:0,total:0,over:false,display:'휴일'};
  const rm=row.measurement_mode==='volume'?'volume':(row.measurement_mode==='height'?'height':'height');
  if(rm==='volume' && row.volume_value!==null && row.volume_value!==undefined){
    const main=toM3(row.volume_value,row.volume_unit||settings.volume_unit);
    const ext=row.has_external?toM3(row.external_volume_value||0,row.external_volume_unit||row.volume_unit||settings.volume_unit):0;
    const total=main+ext,cap=Number(settings?.tank_capacity_m3||0);
    return {main,external:ext,total,over:cap>0&&main>cap,display:`${num(total,2)} m³`};
  }
  const mainCm=Number(row.height||0);
  const extCm=row.has_external?Number(row.external_cm||0):0;
  const totalCm=mainCm+extCm,total=cmToM3(totalCm),limit=Number(settings?.tank_height_cm||154);
  return {main:cmToM3(mainCm),external:cmToM3(extCm),total,over:mainCm>limit,totalCm,display:`${num(totalCm,1)} cm / ${num(total,2)} m³`};
}
function openingSeed(){
  return [...openings]
    .sort((a,b)=>String(a.balance_date||'').localeCompare(String(b.balance_date||'')))[0]||null;
}
function pickupAfterM3(p){
  if(!p)return null;
  if(p.after_pickup_volume_value!==null&&p.after_pickup_volume_value!==undefined){
    return toM3(p.after_pickup_volume_value,p.after_pickup_volume_unit||settings.volume_unit);
  }
  if(p.after_pickup_cm!==null&&p.after_pickup_cm!==undefined)return cmToM3(p.after_pickup_cm);
  return null;
}
function groupedPickups(){
  const map=new Map();
  for(const p of pickups){
    if((p.pickup_type||'폐수')!=='폐수')continue;
    const k=dateKey(p.pickup_date);
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(p);
  }
  for(const rows of map.values()){
    rows.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  }
  return map;
}
function derive(){
  const seed=openingSeed();
  let prevMeter=Number(seed?.prev_usage||0);
  let prevStore=Number(seed?.storage_m3||0)+Number(seed?.external_m3||0);
  let water=0,generated=0;
  const pickupMap=groupedPickups();
  const rows=[];

  for(const r of [...daily].sort((a,b)=>dateKey(a.date).localeCompare(dateKey(b.date))||String(a.created_at||'').localeCompare(String(b.created_at||'')))){
    const holiday=!!r.is_holiday;
    const meter=holiday?prevMeter:Number(r.usage||0);
    const used=holiday?0:Math.max(0,meter-prevMeter);
    if(!holiday)prevMeter=meter;

    const st=holiday?{total:prevStore,over:false}:rowStorage(r);

    // 운영일지의 '총 발생량' 계산과 동일:
    // 당일 폐수량(금일지침) - 직전 기준 폐수량
    const rawGen=holiday?0:(st.over?null:(st.total-prevStore));
    const gen=rawGen===null?null:Math.round((Number(rawGen)+Number.EPSILON)*100)/100;
    water+=used;
    if(gen!==null)generated+=gen;

    const dayPickups=pickupMap.get(dateKey(r.date))||[];
    const lastWithAfter=[...dayPickups].reverse().find(x=>pickupAfterM3(x)!==null);
    const after=pickupAfterM3(lastWithAfter);
    const treated=dayPickups.reduce((s,x)=>s+Number(x.entrusted_amount||0),0);

    // 운영일지와 동일하게 수거 후 계측값이 있으면 다음 계산 기준으로 사용.
    // 수거 후 계측값이 없으면 당일 금일지침(폐수량)을 다음 기준으로 사용.
    if(!holiday){
      if(after!==null)prevStore=Math.max(0,after);
      else if(!st.over)prevStore=Math.max(0,st.total);
    }

    rows.push({...r,used,store:st.total,gen,storageInfo:st,treated,closingStore:prevStore});
  }
  return {rows,water,generated,currentStore:prevStore};
}
function availableYears(){
  const ys=new Set([String(new Date().getFullYear())]);
  daily.forEach(r=>{const y=dateKey(r.date).slice(0,4);if(y)ys.add(y)});
  pickups.forEach(r=>{const y=dateKey(r.pickup_date).slice(0,4);if(y)ys.add(y)});
  openings.forEach(r=>{const y=dateKey(r.balance_date).slice(0,4);if(y)ys.add(y)});
  return [...ys].filter(Boolean).sort((a,b)=>Number(b)-Number(a));
}
function yearMetrics(year){
  const d=derive();
  const yrRows=d.rows.filter(r=>dateKey(r.date).startsWith(year));
  const yrPickups=pickups.filter(r=>(r.pickup_type||'폐수')==='폐수'&&dateKey(r.pickup_date).startsWith(year));
  const water=yrRows.reduce((s,r)=>s+Number(r.used||0),0);
  const generated=yrRows.reduce((s,r)=>s+Number(r.gen||0),0);
  const treated=yrPickups.reduce((s,r)=>s+Number(r.entrusted_amount||0),0);

  const cutoff=`${year}-12-31`;
  const before=d.rows.filter(r=>dateKey(r.date)<=cutoff);
  let currentStore=Number(openingSeed()?.storage_m3||0)+Number(openingSeed()?.external_m3||0);
  if(before.length)currentStore=Number(before[before.length-1].closingStore||0);

  let cumGen=0,cumTreat=0;
  const months=Array.from({length:12},(_,i)=>{
    const mm=String(i+1).padStart(2,'0');
    const monthRows=yrRows.filter(r=>dateKey(r.date).slice(5,7)===mm);
    const monthPickups=yrPickups.filter(r=>dateKey(r.pickup_date).slice(5,7)===mm);
    const gen=monthRows.reduce((s,r)=>s+Number(r.gen||0),0);
    const treat=monthPickups.reduce((s,r)=>s+Number(r.entrusted_amount||0),0);
    cumGen+=gen;
    cumTreat+=treat;
    return {
      month:i+1,
      label:`${i+1}월`,
      gen,
      treat,
      count:monthPickups.length,
      cumGen,
      cumTreat
    };
  });

  // 연도 필터만 유지하므로 누적발생량 그래프는 '해당월' 1개만 표시한다.
  // 현재 연도는 현재월, 과거 연도는 운영일지 데이터가 있는 가장 최근 월을 사용한다.
  const now=new Date();
  const currentYear=String(now.getFullYear());
  let focusMonth=year===currentYear ? now.getMonth()+1 : 0;
  if(year!==currentYear){
    const monthsWithData=yrRows
      .map(r=>Number(dateKey(r.date).slice(5,7)))
      .filter(m=>m>=1&&m<=12);
    focusMonth=monthsWithData.length?Math.max(...monthsWithData):12;
  }
  const focusDays=new Date(Number(year),focusMonth,0).getDate();
  const perDay=Array.from({length:focusDays},()=>0);
  yrRows.filter(r=>Number(dateKey(r.date).slice(5,7))===focusMonth).forEach(r=>{
    const day=Number(dateKey(r.date).slice(8,10));
    if(day>=1&&day<=focusDays && r.gen!==null && r.gen!==undefined){
      perDay[day-1]+=Number(r.gen||0);
    }
  });
  let running=0;
  const cumulative=perDay.map(v=>{
    running=Math.round((running+Number(v||0)+Number.EPSILON)*100)/100;
    return running;
  });
  const focusMonthData={
    month:focusMonth,
    label:`${focusMonth}월`,
    days:focusDays,
    daily:perDay,
    cumulative,
    total:running
  };

  return {rows:yrRows,pickups:yrPickups,water,generated,treated,currentStore,months,focusMonthData};
}

function kpiIconSvg(kind){
  const icons={
    water:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5S5.5 9.2 5.5 14.5a6.5 6.5 0 1 0 13 0C18.5 9.2 12 2.5 12 2.5Zm0 16.3a4.3 4.3 0 0 1-4.3-4.3c0-2.8 2.8-6.6 4.3-8.4 1.5 1.8 4.3 5.6 4.3 8.4a4.3 4.3 0 0 1-4.3 4.3Z" fill="currentColor"/></svg>`,
    generated:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16v2H4v-2Zm1-3 4-4 3 3 5-6 2 1.5-6.5 8-3.5-3.5-2.5 2.5L5 15Z" fill="currentColor"/></svg>`,
    treated:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v8h2.4l2.1-3H22l-1.5 5H19a2.5 2.5 0 0 1-4.9.5H8.9A2.5 2.5 0 0 1 4 16.5 2.5 2.5 0 0 1 6.4 14H5V8H3V6Zm3.5 9.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm10 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" fill="currentColor"/></svg>`,
    storage:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 6.5v11L12 22l8-4.5v-11L12 2Zm0 2.3 5.5 3.1L12 10.5 6.5 7.4 12 4.3Zm-6 4.8 5 2.8v6L6 15V9.1Zm7 8.7v-6l5-2.8V15l-5 2.8Z" fill="currentColor"/></svg>`
  };
  return icons[kind]||icons.water;
}
function axisLabelsHtml(unitLabel){return `<div class="chart-axis-label">${unitLabel}</div>`}
function monthlyTrendChartHtml(months,year){
  const max=Math.max(0,...months.map(x=>x.gen),...months.map(x=>x.treat));
  const scale=v=>max<=0?0:Math.max(v>0?6:0,(v/max)*100);
  return `<div class="chart-card-body">
    <div class="chart-head-row">
      <strong class="mini-title">월별 발생량 vs 처리량 추이 (${year}년)</strong>
      <div class="spacer"></div>
      <div class="chart-legend">
        <span><i class="legend-swatch gen"></i>폐수발생량(m³)</span>
        <span><i class="legend-swatch col"></i>처리량(m³)</span>
      </div>
    </div>
    ${axisLabelsHtml('발생·처리량 (m³)')}
    <div class="month-chart ${max<=0?'is-empty':''}">
      ${max<=0?'<div class="chart-empty-note">데이터가 입력되면 월별 추이가 표시됩니다.</div>':''}
      ${months.map(x=>`<div class="month-col">
        <div class="month-bars">
          <div class="month-bar gen" style="height:${scale(x.gen)}%" title="${x.label} 폐수발생량 ${num(x.gen,2)} m³"></div>
          <div class="month-bar col" style="height:${scale(x.treat)}%" title="${x.label} 처리량 ${num(x.treat,2)} m³"></div>
        </div>
        <div class="month-label">${x.label}</div>
      </div>`).join('')}
    </div>
  </div>`;
}
function buildSharedLinePoints(valuesA,valuesB,width,height,padding){
  const innerW=width-padding.left-padding.right;
  const innerH=height-padding.top-padding.bottom;
  const max=Math.max(0,...valuesA,...valuesB);
  const xStep=valuesA.length>1?innerW/(valuesA.length-1):0;
  const y=v=>padding.top+innerH-(max<=0?0:(v/max)*innerH);
  const pts=valuesA.map((v,i)=>({x:padding.left+i*xStep,y:y(v),v}));
  const ptsB=valuesB.map((v,i)=>({x:padding.left+i*xStep,y:y(v),v}));
  const path=arr=>arr.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');
  return {max,pts,ptsB,pathA:path(pts),pathB:path(ptsB)};
}
function cumulativeYearChartHtml(months,year){
  const w=760,h=220,p={left:38,right:12,top:18,bottom:34};
  const a=months.map(x=>x.cumGen),b=months.map(x=>x.cumTreat);
  const line=buildSharedLinePoints(a,b,w,h,p);
  return `<div class="chart-card-body">
    <div class="chart-head-row">
      <strong class="mini-title">누적 발생량 vs 누적 처리량 (${year}년)</strong>
      <div class="spacer"></div>
      <div class="chart-legend">
        <span><i class="legend-line gen"></i>발생 누계(m³)</span>
        <span><i class="legend-line col"></i>처리 누계(m³)</span>
      </div>
    </div>
    ${axisLabelsHtml('누적량 (m³)')}
    <div class="line-chart-wrap ${line.max<=0?'is-empty':''}">
      ${line.max<=0?'<div class="chart-empty-note">데이터가 입력되면 누적 추이가 표시됩니다.</div>':''}
      <svg class="line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <g class="grid">${[0.25,0.5,0.75,1].map(r=>`<line x1="${p.left}" y1="${p.top+(h-p.top-p.bottom)*r}" x2="${w-p.right}" y2="${p.top+(h-p.top-p.bottom)*r}"></line>`).join('')}</g>
        <path class="line gen" d="${line.pathA}"></path>
        <path class="line col" d="${line.pathB}"></path>
        ${line.pts.map(pt=>`<circle class="point gen" cx="${pt.x}" cy="${pt.y}" r="4"></circle>`).join('')}
        ${line.ptsB.map(pt=>`<circle class="point col" cx="${pt.x}" cy="${pt.y}" r="4"></circle>`).join('')}
      </svg>
      <div class="line-chart-labels">${months.map(x=>`<span>${x.label}</span>`).join('')}</div>
    </div>
  </div>`;
}
function collectionCountChartHtml(months,year){
  const max=Math.max(0,...months.map(x=>x.count));
  const scale=v=>max<=0?0:Math.max(v>0?8:0,(v/max)*100);
  return `<div class="chart-card-body">
    <div class="chart-head-row"><strong class="mini-title">월별 수거횟수 (${year}년)</strong></div>
    ${axisLabelsHtml('수거 횟수 (건)')}
    <div class="count-chart ${max<=0?'is-empty':''}">
      ${max<=0?'<div class="chart-empty-note">수거등록 데이터가 입력되면 수거횟수가 표시됩니다.</div>':''}
      ${months.map(x=>`<div class="count-col">
        <div class="count-value">${x.count||''}</div>
        <div class="count-bar-wrap"><div class="count-bar" style="height:${scale(x.count)}%" title="${x.label} ${x.count}건"></div></div>
        <div class="month-label">${x.label}</div>
      </div>`).join('')}
    </div>
  </div>`;
}
function monthlyLedgerCumulativeChartHtml(data,year){
  const values=data?.cumulative||[];
  const daily=data?.daily||[];
  const days=Number(data?.days||values.length||31);
  const month=Number(data?.month||1);
  const w=760,h=230,p={left:44,right:14,top:22,bottom:38};
  const innerW=w-p.left-p.right,innerH=h-p.top-p.bottom;

  const allValues=values.length?values:[0];
  const min=Math.min(0,...allValues);
  const max=Math.max(0,...allValues);
  const span=Math.max(1,max-min);
  const x=i=>p.left+(days<=1?0:(i/(days-1))*innerW);
  const y=v=>p.top+innerH-((Number(v||0)-min)/span)*innerH;

  const points=values.map((v,i)=>({x:x(i),y:y(v),v}));
  const path=points.map((pt,i)=>`${i?'L':'M'} ${pt.x} ${pt.y}`).join(' ');
  const tickDays=[1,5,10,15,20,25,days].filter((v,i,a)=>v<=days&&a.indexOf(v)===i);

  const grid=[0,.25,.5,.75,1].map(r=>{
    const yy=p.top+innerH*r;
    return `<line x1="${p.left}" y1="${yy}" x2="${w-p.right}" y2="${yy}" class="month-ledger-grid"></line>`;
  }).join('');

  const ticks=tickDays.map(d=>`<text x="${x(d-1)}" y="${h-12}" text-anchor="middle" class="month-ledger-tick">${d}일</text>`).join('');
  const pointHtml=points.map((pt,i)=>{
    const day=i+1;
    const title=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} / 당일 발생 ${num(daily[i]||0,2)} m³ / 누적 ${num(pt.v,2)} m³`;
    return `<circle cx="${pt.x}" cy="${pt.y}" r="3.6" class="month-ledger-point"><title>${title}</title></circle>`;
  }).join('');

  return `<div class="chart-card-body">
    <div class="chart-head-row">
      <strong class="mini-title">폐수 누적발생량 (${year}년 ${month}월)</strong>
      <div class="spacer"></div>
      <span class="hint">운영일지 '총 발생량' 기준</span>
    </div>
    <div class="current-month-summary">
      <span>당월 누적</span><strong>${num(data?.total||0,2)} m³</strong>
    </div>
    <div class="month-ledger-line-wrap ${max===0&&min===0?'is-empty':''}">
      ${max===0&&min===0?'<div class="chart-empty-note">해당월 운영일지 발생량이 입력되면 표시됩니다.</div>':''}
      <svg class="month-ledger-line" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        ${grid}
        <line x1="${p.left}" y1="${y(0)}" x2="${w-p.right}" y2="${y(0)}" class="month-ledger-zero"></line>
        <path d="${path}" class="month-ledger-path"></path>
        ${pointHtml}
        ${ticks}
      </svg>
    </div>
  </div>`;
}

async function safeList(table,order='created_at',ascending=true){try{let x=q(table);if(order)x=x.order(order,{ascending});const r=await x;return r.error?[]:(r.data||[])}catch(e){return []}}
async function load(){
  try{
    const cid=companyId();if(!cid)return errorView('회사 정보를 확인할 수 없습니다. 포탈에서 다시 접속해 주세요.');
    const [s,d,p,v,l,u,o,rc,dt]=await Promise.all([
      q('wastewater_settings').maybeSingle(),
      q('wastewater').order('date',{ascending:true}),
      q('wastewater_pickups').eq('pickup_type','폐수').order('pickup_date',{ascending:true}),
      safeList('wastewater_vendors','sort_order',true),
      safeList('wastewater_storage_locations','sort_order',true),
      safeList('wastewater_container_units','sort_order',true),
      safeList('wastewater_opening_balances','balance_date',true),
      safeList('wastewater_reference_categories','sort_order',true),
      safeList('wastewater_document_types','sort_order',true)
    ]);
    if(s.error&&s.error.code!=='PGRST116')throw s.error;
    settings={...DEFAULT_SETTINGS,...(s.data||{})};
    daily=d.data||[];pickups=p.data||[];vendors=v;locations=l;units=u;openings=o;refCats=rc;docTypes=dt;
    const ys=availableYears();if(!ys.includes(statusYear))statusYear=ys[0]||String(new Date().getFullYear());
    render();
  }catch(e){errorView(e?.message||String(e))}
}

function renderStatus(){
  const metrics=yearMetrics(statusYear);
  const years=availableYears();
  const kpis=[
    {key:'water',label:'용수사용량',value:`${num(metrics.water,2)} m³`,note:`${statusYear}년 당일 사용량 합계`},
    {key:'generated',label:'폐수발생량',value:`${num(metrics.generated,2)} m³`,note:`${statusYear}년 폐수 발생량 합계`},
    {key:'treated',label:'처리량',value:`${num(metrics.treated,2)} m³`,note:`${statusYear}년 수거·처리량 합계`},
    {key:'storage',label:'현재보관량',value:`${num(metrics.currentStore,2)} m³`,note:`${statusYear}년 말 기준 보관량`}
  ];

  $('#app').innerHTML=`<div id="notice" class="notice"></div>
    <div class="toolbar status-toolbar">
      <select id="status-year" class="btn year-filter">
        ${years.map(y=>`<option value="${y}" ${y===statusYear?'selected':''}>${y}년</option>`).join('')}
      </select>
      <div class="spacer"></div>
      ${canManage()?'<button class="btn" id="open-settings">⚙ 설정</button>':''}
    </div>

    <div class="kpis kpis-rich">
      ${kpis.map(k=>`<div class="kpi rich ${k.key}">
        <div class="kpi-main">
          <div class="kpi-icon ${k.key}">${kpiIconSvg(k.key)}</div>
          <div class="kpi-copy">
            <div class="label">${k.label}</div>
            <div class="value">${k.value}</div>
            <div class="meta">${k.note}</div>
          </div>
        </div>
        <div class="kpi-side-icon ${k.key}">${kpiIconSvg(k.key)}</div>
      </div>`).join('')}
    </div>

    <div class="dashboard-charts preview-grid status-top">
      <div class="card chart-card large">${monthlyTrendChartHtml(metrics.months,statusYear)}</div>
      <div class="card chart-card side">${monthlyLedgerCumulativeChartHtml(metrics.focusMonthData,statusYear)}</div>
    </div>

    <div class="dashboard-charts preview-grid bottom">
      <div class="card chart-card large">${cumulativeYearChartHtml(metrics.months,statusYear)}</div>
      <div class="card chart-card side">${collectionCountChartHtml(metrics.months,statusYear)}</div>
    </div>`;

  $('#status-year').onchange=e=>{statusYear=e.target.value;renderStatus()};
  if($('#open-settings'))$('#open-settings').onclick=()=>{mode='settings';settingsTab='facility';editId=null;render()};
}

const tabs=[['facility','시설기준'],['vendors','업체'],['locations','보관장소'],['units','용기·단위'],['opening','기초·이월량'],['reference','관련자료 종류'],['documents','관련서류 종류']];
function tabsHtml(){return tabs.map(([k,t])=>`<button class="subtab ${settingsTab===k?'active':''}" data-tab="${k}">${t}</button>`).join('')}
function currentCriteria(){
  if(measurementMode()==='height')return `<div class="criteria-grid"><div><span>계측방식</span><strong>높이 기준형</strong></div><div><span>저장고 전체높이</span><strong>${num(settings.tank_height_cm,1)} cm</strong></div><div><span>저장용량</span><strong>${num(settings.tank_capacity_m3,2)} m³</strong></div><div><span>환산식</span><strong>현재높이 × 용량 ÷ 전체높이</strong></div></div>`;
  return `<div class="criteria-grid"><div><span>계측방식</span><strong>볼륨 기준형</strong></div><div><span>현장 입력단위</span><strong>${volumeUnit()==='L'?'L':'m³'}</strong></div><div><span>저장고 최대용량</span><strong>${volumeUnit()==='L'?num(Number(settings.tank_capacity_m3||0)*1000,0)+' L':num(settings.tank_capacity_m3,2)+' m³'}</strong></div><div><span>내부 계산기준</span><strong>m³</strong></div></div>`;
}
function facilityForm(){const vm=volumeUnit();return `<div class="grid two settings-grid"><div class="card"><div class="card-title">시설기준</div>
  <div class="field"><label>시설명</label><input id="facility_name" value="${esc(settings.facility_name)}"></div>
  <div class="field"><label>계측방식</label><select id="measurement_mode"><option value="height" ${measurementMode()==='height'?'selected':''}>높이 기준형</option><option value="volume" ${measurementMode()==='volume'?'selected':''}>볼륨 기준형</option></select></div>
  <div id="height-settings" style="display:${measurementMode()==='height'?'block':'none'}"><div class="field"><label>저장고 전체높이 (cm)</label><input id="tank_height_cm" type="number" step="0.1" value="${Number(settings.tank_height_cm||154)}"></div><div class="field"><label>저장용량 (m³)</label><input id="tank_capacity_m3_h" type="number" step="0.01" value="${Number(settings.tank_capacity_m3||7)}"></div></div>
  <div id="volume-settings" style="display:${measurementMode()==='volume'?'block':'none'}"><div class="field"><label>현장 표시단위</label><select id="volume_unit"><option value="m3" ${vm==='m3'?'selected':''}>m³</option><option value="L" ${vm==='L'?'selected':''}>L</option></select></div><div class="field"><label>저장고 최대용량 (<span id="capacity-unit-label">${vm==='L'?'L':'m³'}</span>)</label><input id="tank_capacity_volume" type="number" step="0.01" value="${vm==='L'?Number(settings.tank_capacity_m3||7)*1000:Number(settings.tank_capacity_m3||7)}"></div></div>
  <div class="hint-box">시설기준은 폐수 프로그램의 공통 원본입니다. 폐수 일일입력·수거등록·운영일지와 추후 폐기물의 폐수배출시설 운영일지가 동일 기준을 사용합니다.</div>
  <button class="btn primary" id="save-facility">저장</button></div>
  <div class="card"><div class="card-title">현재 기준</div>${currentCriteria()}<div class="hint" style="margin-top:12px">저장 후 이 영역은 DB의 실제 저장값으로 즉시 갱신됩니다.</div></div></div>`}

const configs={
  vendors:{table:'wastewater_vendors',title:'업체',name:'vendor_name',fields:[['vendor_name','업체명','text'],['business_no','사업자번호','text'],['permit_no','허가번호','text'],['contact_name','담당자','text'],['phone','연락처','text'],['note','비고','text'],['sort_order','순서','number']]},
  locations:{table:'wastewater_storage_locations',title:'보관장소',name:'location_name',fields:[['location_name','보관장소명','text'],['description','설명','text'],['max_volume_m3','최대보관량(m³)','number'],['sort_order','순서','number']]},
  units:{table:'wastewater_container_units',title:'용기·단위',name:'unit_name',fields:[['unit_name','용기명','text'],['quantity_unit','수량단위','text'],['capacity_l','용량(L)','number'],['sort_order','순서','number']]},
  reference:{table:'wastewater_reference_categories',title:'관련자료 종류',name:'category_name',fields:[['category_name','종류명','text'],['description','설명','text'],['sort_order','순서','number']]},
  documents:{table:'wastewater_document_types',title:'관련서류 종류',name:'type_name',fields:[['type_name','종류명','text'],['description','설명','text'],['sort_order','순서','number']]}
};
function listFor(k){return k==='vendors'?vendors:k==='locations'?locations:k==='units'?units:k==='reference'?refCats:docTypes}
function genericSettings(k){const c=configs[k],list=listFor(k),editing=list.find(x=>String(x.id)===String(editId))||{};return `<div class="grid two settings-grid"><div class="card"><div class="card-title">${c.title} ${editId?'수정':'추가'}</div>${c.fields.map(([f,l,t])=>`<div class="field"><label>${l}</label><input id="f-${f}" type="${t}" value="${esc(editId ? (editing[f]??'') : '')}"></div>`).join('')}<div class="inline-actions"><button class="btn primary" id="save-generic">${editId?'수정 저장':'추가'}</button>${editId?'<button class="btn" id="cancel-edit">취소</button>':''}</div></div><div class="card"><div class="card-title">${c.title} 목록</div><div class="table-wrap"><table><thead><tr><th>명칭</th><th>상세</th><th>관리</th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${esc(x[c.name]||'')}</b></td><td>${esc(x.description||x.note||x.memo||x.quantity_unit||'')}</td><td><div class="row-actions"><button class="btn small" data-edit="${x.id}">수정</button><button class="btn small danger" data-del="${x.id}">삭제</button></div></td></tr>`).join('')||'<tr><td colspan="3" class="empty">등록 없음</td></tr>'}</tbody></table></div></div></div>`}
function openingForm(){const op=[...openings].sort((a,b)=>String(b.balance_date).localeCompare(String(a.balance_date)));const unit=volumeUnit();return `<div class="grid two settings-grid"><div class="card"><div class="card-title">기초·이월량 등록</div><div class="field"><label>기준일</label><input id="op-date" type="date" value="${todayKey()}"></div><div class="field"><label>용수 전일 지침 (m³)</label><input id="op-prev-usage" type="number" step="0.01"></div>${measurementMode()==='height'?`<div class="field"><label>폐수 기초높이 (cm)</label><input id="op-storage" type="number" step="0.1"></div><div class="field"><label>외부보관 높이 (cm)</label><input id="op-external" type="number" step="0.1" value="0"></div>`:`<div class="field"><label>폐수 기초량 (${unit==='L'?'L':'m³'})</label><input id="op-storage" type="number" step="0.01"></div><div class="field"><label>외부보관량 (${unit==='L'?'L':'m³'})</label><input id="op-external" type="number" step="0.01" value="0"></div>`}<div class="field"><label>보관장소</label><select id="op-location"><option value="">선택안함</option>${locations.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.location_name)}</option>`).join('')}</select></div><div class="field"><label>비고</label><textarea id="op-note"></textarea></div><button class="btn primary" id="save-opening">저장</button><div class="hint-box">기초·이월량은 최초 계산 시작값으로 사용하며, 이후 실제 일일입력 값이 계속 이어집니다.</div></div><div class="card"><div class="card-title">기초·이월량 목록</div><div class="table-wrap"><table><thead><tr><th>기준일</th><th>용수 전일</th><th>기초 저장량</th><th>비고</th><th>관리</th></tr></thead><tbody>${op.map(x=>`<tr><td>${esc(x.balance_date)}</td><td class="num">${num(x.prev_usage,2)}</td><td>${num(x.storage_m3,2)} m³${Number(x.external_m3||0)>0?` + 외부 ${num(x.external_m3,2)} m³`:''}</td><td>${esc(x.note||'')}</td><td><button class="btn small danger" data-op-del="${x.id}">삭제</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">등록 없음</td></tr>'}</tbody></table></div></div></div>`}

function renderSettings(){if(!canManage()){mode='status';return renderStatus()}let body=settingsTab==='facility'?facilityForm():settingsTab==='opening'?openingForm():genericSettings(settingsTab);$('#app').innerHTML=`<div id="notice" class="notice"></div><div class="toolbar"><div><div class="page-title">폐수현황 설정</div><div class="hint">폐기물 설정과 동일한 규격으로 구성</div></div><div class="spacer"></div><button class="btn" id="back-status">현황으로</button></div><div class="subtabs">${tabsHtml()}</div>${body}`;$('#back-status').onclick=()=>{mode='status';editId=null;render()};document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.tab;editId=null;render()});if(settingsTab==='facility')bindFacility();else if(settingsTab==='opening')bindOpening();else bindGeneric(settingsTab)}
function render(){mode==='settings'?renderSettings():renderStatus()}

function bindFacility(){
  const modeEl=$('#measurement_mode'),vunit=$('#volume_unit');
  function sync(){const isH=modeEl.value==='height';$('#height-settings').style.display=isH?'block':'none';$('#volume-settings').style.display=isH?'none':'block'}
  modeEl.onchange=sync;if(vunit)vunit.onchange=()=>{$('#capacity-unit-label').textContent=vunit.value==='L'?'L':'m³';const cap=$('#tank_capacity_volume');if(cap&&cap.dataset.lastUnit){const n=Number(cap.value||0);cap.value=vunit.value==='L'&&cap.dataset.lastUnit==='m3'?n*1000:vunit.value==='m3'&&cap.dataset.lastUnit==='L'?n/1000:n}cap.dataset.lastUnit=vunit.value};if(vunit){$('#tank_capacity_volume').dataset.lastUnit=vunit.value}
  $('#save-facility').onclick=saveFacility;
}
async function saveFacility(){const mm=$('#measurement_mode').value,vu=$('#volume_unit')?.value||'m3';let cap=mm==='height'?Number($('#tank_capacity_m3_h').value||0):Number($('#tank_capacity_volume').value||0);if(mm==='volume'&&vu==='L')cap/=1000;const row={company_id:companyId(),facility_name:$('#facility_name').value.trim()||'폐수배출시설',measurement_mode:mm,volume_unit:vu,tank_height_cm:mm==='height'?Number($('#tank_height_cm').value||154):Number(settings.tank_height_cm||154),tank_capacity_m3:cap||7,ton_to_cm:Number(settings.ton_to_cm||22),updated_by:userEmail(),active:true};const x=await DB.from('wastewater_settings').upsert([row],{onConflict:'company_id'}).select('*').single();if(x.error)return notice(x.error.message,'err');settings={...DEFAULT_SETTINGS,...x.data};notice('시설기준이 저장되었습니다.');renderSettings()}

function bindGeneric(k){const c=configs[k];$('#save-generic').onclick=()=>saveGeneric(k);if($('#cancel-edit'))$('#cancel-edit').onclick=()=>{editId=null;renderSettings()};document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editId=b.dataset.edit;renderSettings()});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteGeneric(k,b.dataset.del))}
async function saveGeneric(k){const c=configs[k],list=listFor(k),editing=list.find(x=>String(x.id)===String(editId))||{},row={company_id:companyId(),active:true,updated_by:userEmail()};for(const [f,,t] of c.fields){let v=$(`#f-${f}`).value.trim();if(f==='sort_order'){if(v===''){if(editId)continue;const maxSort=list.reduce((m,item)=>Math.max(m,Number(item.sort_order)||0),0);row[f]=maxSort+1}else row[f]=Number(v);continue}row[f]=t==='number'?(v===''?null:Number(v)):v||null}let x;if(editId)x=await DB.from(c.table).update(row).eq('id',editId).eq('company_id',companyId()).select('*').single();else{x=await DB.from(c.table).insert([{...row,created_by:userEmail()}]).select('*').single()}if(x.error)return notice(x.error.message,'err');editId=null;await load();mode='settings';settingsTab=k;notice('저장되었습니다.');renderSettings()}
async function deleteGeneric(k,id){if(!confirm('삭제하시겠습니까?'))return;const c=configs[k],x=await DB.from(c.table).delete().eq('id',id).eq('company_id',companyId());if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab=k;renderSettings()}

function bindOpening(){$('#save-opening').onclick=saveOpening;document.querySelectorAll('[data-op-del]').forEach(b=>b.onclick=()=>deleteOpening(b.dataset.opDel))}
async function saveOpening(){const date=$('#op-date').value,prev=Number($('#op-prev-usage').value||0),value=Number($('#op-storage').value||0),external=Number($('#op-external').value||0),unit=measurementMode()==='height'?'cm':volumeUnit();if(!date)return notice('기준일을 입력하세요.','err');let storageM3=0,externalM3=0;if(measurementMode()==='height'){storageM3=cmToM3(value);externalM3=cmToM3(external)}else{storageM3=toM3(value,unit);externalM3=toM3(external,unit)}const row={company_id:companyId(),balance_date:date,prev_usage:prev,measurement_mode:measurementMode(),storage_value:value,storage_unit:unit,storage_m3:storageM3,external_value:external,external_unit:unit,external_m3:externalM3,storage_location_id:$('#op-location').value||null,note:$('#op-note').value.trim()||null,created_by:userEmail(),updated_by:userEmail()};const x=await DB.from('wastewater_opening_balances').insert([row]);if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab='opening';notice('기초·이월량이 저장되었습니다.');renderSettings()}
async function deleteOpening(id){if(!confirm('삭제하시겠습니까?'))return;const x=await DB.from('wastewater_opening_balances').delete().eq('id',id).eq('company_id',companyId());if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab='opening';renderSettings()}

load();
