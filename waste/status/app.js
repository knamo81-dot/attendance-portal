const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXJhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

(function(){
  function portalSession(){
    try{ if(window.parent && window.parent!==window && typeof window.parent.getPortalSession==='function') return window.parent.getPortalSession()||{}; }catch(e){}
    try{ if(window.parent && window.parent!==window && window.parent.portalSession) return window.parent.portalSession||{}; }catch(e){}
    return window.portalSession||window.currentPortalSession||{};
  }
  function rawClient(){
    const s=portalSession();
    if(s && s.supabase) return s.supabase;
    try{ if(window.parent && window.parent!==window && window.parent.portalSupabase) return window.parent.portalSupabase; }catch(e){}
    if(window.portalSupabase) return window.portalSupabase;
    if(window.supabase && typeof window.supabase.createClient==='function'){
      window.portalSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      return window.portalSupabase;
    }
    throw new Error('Supabase client 초기화 실패');
  }
  function companyId(){
    const s=portalSession();
    const c=s.activeCompany||s.active_company||s.selectedCompany||s.company||{};
    const v=s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||window.currentCompanyId||'';
    if(v) return String(v).trim();
    try{const p=new URLSearchParams(location.search);return String(p.get('company_id')||p.get('companyId')||'').trim();}catch(e){return '';}
  }
  function userEmail(){const s=portalSession();return String(s.email||s.user?.email||s.profile?.email||'').trim();}
  const sb=rawClient();
  async function list(table,select='*',orderCol='created_at',ascending=false){
    let q=sb.from(table).select(select);const cid=companyId();if(cid)q=q.eq('company_id',cid);if(orderCol)q=q.order(orderCol,{ascending});return q;
  }
  async function insert(table,payload){
    const cid=companyId();const row={...payload,company_id:payload.company_id||cid,created_by:payload.created_by||userEmail()||null};
    return sb.from(table).insert([row]).select('*').single();
  }
  async function update(table,id,payload){
    let q=sb.from(table).update(payload).eq('id',id);const cid=companyId();if(cid)q=q.eq('company_id',cid);return q.select('*').single();
  }
  async function remove(table,id){
    let q=sb.from(table).delete().eq('id',id);const cid=companyId();if(cid)q=q.eq('company_id',cid);return q;
  }
  window.wasteApi={sb,portalSession,companyId,userEmail,list,insert,update,remove};
})();

const A=window.wasteApi;
const $=(s)=>document.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const num=(v,d=2)=>Number(v||0).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
function typeName(r){return r.display_name||`${r.legal_name||''}${r.physical_state==='liquid'?'(액상)':r.physical_state==='solid'?'(고상)':''}`}
function dateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function notice(msg,type='ok'){const el=$('#notice');if(!el)return;el.textContent=msg;el.className='notice show '+type;setTimeout(()=>el.classList.remove('show'),3500)}


function getWasteAppRole(){
  const s=A.portalSession()||{};
  const roles=s.appRoles||s.app_roles||{};
  const row=roles.waste||{};
  const raw=typeof row==='string'
    ? row
    : (row.role||row.role_key||row.permission||row.permission_key||'user');
  const role=String(raw||'user').trim().toLowerCase();
  if(['관리자','administrator'].includes(role))return 'admin';
  if(['운영자','manager'].includes(role))return 'operator';
  return role||'user';
}
function canManageWaste(){
  const role=getWasteAppRole();
  return role==='admin'||role==='operator';
}

let year=String(new Date().getFullYear());
let typeFilter='';
let settingsTab='types';
let vendorMethodsDraft=[];

const settingsConfigs={
  types:{table:'waste_types',title:'폐기물 종류',fields:[
    ['legal_name','폐기물명','text'],
    ['physical_state','성상','select',['liquid:액상','solid:고상','mixed:혼합','other:기타']],
    ['legal_code','법정코드','text'],
    ['default_quantity_unit','기본 수량단위','text'],
    ['sort_order','순서','number']
  ]},
  vendors:{table:'waste_vendors',title:'업체',fields:[
    ['vendor_name','업체명','text'],
    ['business_no','사업자번호','text'],
    ['permit_no','허가번호','text'],
    ['contact_name','담당자','text'],
    ['phone','연락처','text']
  ]},
  locations:{table:'waste_storage_locations',title:'보관장소',fields:[
    ['location_name','보관장소명','text'],
    ['description','설명','text'],
    ['max_weight_kg','최대보관량(kg)','number'],
    ['sort_order','순서','number']
  ]},
  units:{table:'waste_container_units',title:'용기·단위',fields:[
    ['unit_name','용기명','text'],
    ['quantity_unit','수량단위','text'],
    ['capacity_l','용량(L)','number'],
    ['sort_order','순서','number']
  ]},
  referenceCategories:{table:'waste_reference_categories',title:'관련자료 종류',fields:[
    ['category_name','관련자료 종류명','text'],
    ['description','설명','text'],
    ['sort_order','순서','number']
  ]},
  documentTypes:{table:'waste_document_types',title:'관련서류 종류',fields:[
    ['type_name','관련서류 종류명','text'],
    ['description','설명','text'],
    ['sort_order','순서','number']
  ]},
  opening:{table:'waste_opening_balances',title:'기초·이월량',fields:[]}
};



function kpiIconSvg(kind){
  const icons={
    generated:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2h-1l-1.1 11.1A3 3 0 0 1 14.9 21H9.1a3 3 0 0 1-2.99-2.9L5 7H4V5h4l1-2Zm1.2 2-.5 1h4.6l-.5-1h-3.6ZM8 9h2v8H8V9Zm6 0h2v8h-2V9Zm-3 0h2v8h-2V9Z" fill="currentColor"/></svg>`,
    collected:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v8h2.4l2.1-3H22l-1.5 5H19a2.5 2.5 0 0 1-4.9.5H8.9A2.5 2.5 0 0 1 4 16.5 2.5 2.5 0 0 1 6.4 14H5V8H3V6Zm3.5 9.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm10 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" fill="currentColor"/></svg>`,
    storage:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 6.5v11L12 22l8-4.5v-11L12 2Zm0 2.3 5.5 3.1L12 10.5 6.5 7.4 12 4.3Zm-6 4.8 5 2.8v6L6 15V9.1Zm7 8.7v-6l5-2.8V15l-5 2.8Z" fill="currentColor"/></svg>`,
    warning:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3v8h-2V3h2Zm0 12v-2h-2v2h2Zm-1 7a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" fill="currentColor"/></svg>`
  };
  return icons[kind] || icons.generated;
}

function axisLabelsHtml(unitLabel){
  return `<div class="chart-axis-label">${unitLabel}</div>`;
}

function monthlyTrendChartHtml(months){
  const maxT=Math.max(0,...months.map(x=>x.genT),...months.map(x=>x.colT));
  const scale=v=>maxT<=0?0:Math.max(v>0?6:0,(v/maxT)*100);

  return `
    <div class="chart-card-body">
      <div class="chart-head-row">
        <strong class="mini-title">월별 발생량 vs 처리량 추이 (${year}년)</strong>
        <div class="spacer"></div>
        <div class="chart-legend">
          <span><i class="legend-swatch gen"></i>발생량(T)</span>
          <span><i class="legend-swatch col"></i>처리량(T)</span>
        </div>
      </div>
      ${axisLabelsHtml('처리량 (T)')}
      <div class="month-chart ${maxT<=0?'is-empty':''}">
        ${maxT<=0?'<div class="chart-empty-note">데이터가 입력되면 월별 추이가 표시됩니다.</div>':''}
        ${months.map(x=>`
          <div class="month-col">
            <div class="month-bars">
              <div class="month-bar gen" style="height:${scale(x.genT)}%" title="${x.monthLabel} 발생량 ${num(x.genT,4)} T"></div>
              <div class="month-bar col" style="height:${scale(x.colT)}%" title="${x.monthLabel} 처리량 ${num(x.colT,4)} T"></div>
            </div>
            <div class="month-label">${x.monthLabel}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function typeStorageChartHtml(typeStats){
  if(!typeStats.length){
    return `<div class="chart-card-body"><div class="empty">표시할 폐기물 종류가 없습니다.</div></div>`;
  }
  const palette=['#F29AA8','#8FC4E8','#F4BF86','#BA96E6','#7ED2AE','#D9E1E7'];
  const maxT=Math.max(0,...typeStats.map(x=>Math.max(0,x.currentT)));

  return `
    <div class="chart-card-body">
      <div class="chart-head-row">
        <strong class="mini-title">폐기물 종류별 현재 보관량 (${year}년 기준)</strong>
        <div class="spacer"></div>
        <span class="hint">단위: T</span>
      </div>
      <div class="type-chart">
        ${typeStats.map((x,i)=>{
          const pct=maxT<=0?0:Math.min(100,(Math.max(0,x.currentT)/maxT)*100);
          return `
            <div class="type-bar-row">
              <div class="type-bar-name" title="${esc(x.name)}">${esc(x.name)}</div>
              <div class="type-track">
                <div class="type-fill ${x.currentT<0?'negative':''}" style="width:${pct}%;background:${x.currentT<0?'#F79009':palette[i%palette.length]}"></div>
              </div>
              <div class="type-bar-value ${x.currentT<0?'warning':''}">
                ${num(x.currentT,4)}
                ${x.unknown?`<span class="mini-badge">${x.unknown}건 미확정</span>`:''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function buildLinePath(values, width, height, padding){
  const innerW=width-padding.left-padding.right;
  const innerH=height-padding.top-padding.bottom;
  const max=Math.max(0,...values);
  const min=0;
  const xStep=values.length>1?innerW/(values.length-1):0;
  const yPos=(v)=>padding.top + innerH - (max===min?0:(v-min)/(max-min))*innerH;
  return values.map((v,i)=>`${i===0?'M':'L'} ${padding.left + i*xStep} ${yPos(v)}`).join(' ');
}
function buildPoints(values, width, height, padding){
  const innerW=width-padding.left-padding.right;
  const innerH=height-padding.top-padding.bottom;
  const max=Math.max(0,...values);
  const min=0;
  const xStep=values.length>1?innerW/(values.length-1):0;
  const yPos=(v)=>padding.top + innerH - (max===min?0:(v-min)/(max-min))*innerH;
  return values.map((v,i)=>({x:padding.left + i*xStep,y:yPos(v),v}));
}
function cumulativeLineChartHtml(months){
  const w=760,h=220,p={left:38,right:12,top:18,bottom:34};
  const gen=months.map(x=>x.cumGenT);
  const col=months.map(x=>x.cumColT);
  const max=Math.max(0,...gen,...col);
  const pointsGen=buildPoints(gen,w,h,p);
  const pointsCol=buildPoints(col,w,h,p);

  return `
    <div class="chart-card-body">
      <div class="chart-head-row">
        <strong class="mini-title">누적 발생량 vs 누적 처리량 (${year}년)</strong>
        <div class="spacer"></div>
        <div class="chart-legend">
          <span><i class="legend-line gen"></i>발생 누계(T)</span>
          <span><i class="legend-line col"></i>처리 누계(T)</span>
        </div>
      </div>
      ${axisLabelsHtml('누적량 (T)')}
      <div class="line-chart-wrap ${max<=0?'is-empty':''}">
        ${max<=0?'<div class="chart-empty-note">데이터가 입력되면 누적 추이가 표시됩니다.</div>':''}
        <svg class="line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
          <g class="grid">
            ${[0.25,0.5,0.75,1].map(r=>`<line x1="${p.left}" y1="${p.top+(h-p.top-p.bottom)*r}" x2="${w-p.right}" y2="${p.top+(h-p.top-p.bottom)*r}"></line>`).join('')}
          </g>
          <path class="line gen" d="${buildLinePath(gen,w,h,p)}"></path>
          <path class="line col" d="${buildLinePath(col,w,h,p)}"></path>
          ${pointsGen.map(pt=>`<circle class="point gen" cx="${pt.x}" cy="${pt.y}" r="4"></circle>`).join('')}
          ${pointsCol.map(pt=>`<circle class="point col" cx="${pt.x}" cy="${pt.y}" r="4"></circle>`).join('')}
        </svg>
        <div class="line-chart-labels">
          ${months.map(x=>`<span>${x.monthLabel}</span>`).join('')}
        </div>
      </div>
    </div>`;
}

function collectionCountChartHtml(months){
  const max=Math.max(0,...months.map(x=>x.count));
  const scale=v=>max<=0?0:Math.max(v>0?8:0,(v/max)*100);

  return `
    <div class="chart-card-body">
      <div class="chart-head-row">
        <strong class="mini-title">월별 수거 횟수 (${year}년)</strong>
      </div>
      ${axisLabelsHtml('수거 횟수 (건)')}
      <div class="count-chart ${max<=0?'is-empty':''}">
        ${max<=0?'<div class="chart-empty-note">수거등록 데이터가 입력되면 수거 횟수가 표시됩니다.</div>':''}
        ${months.map(x=>`
          <div class="count-col">
            <div class="count-value">${x.count||''}</div>
            <div class="count-bar-wrap">
              <div class="count-bar" style="height:${scale(x.count)}%" title="${x.monthLabel} 수거 ${x.count}건"></div>
            </div>
            <div class="month-label">${x.monthLabel}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

async function renderStatus(){
  const [types,daily,cols,opening]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_daily_entries','*,waste_types(*)','entry_date',false),
    A.list('waste_collections','*,waste_collection_items(*,waste_types(*))','collection_date',false),
    A.list('waste_opening_balances','*,waste_types(*)','balance_date',false)
  ]);

  const activeTypes=(types.data||[]).filter(x=>x.active);
  const yf=r=>String(r.entry_date||r.collection_date||r.balance_date||'').startsWith(year);

  const allDailyYear=(daily.data||[]).filter(yf);
  const allCollectionsYear=(cols.data||[]).filter(yf);
  const allOpening=(opening.data||[]);

  const d=allDailyYear.filter(r=>!typeFilter||r.waste_type_id===typeFilter);
  const c=allCollectionsYear
    .map(h=>({
      ...h,
      waste_collection_items:(h.waste_collection_items||[])
        .filter(i=>!typeFilter||i.waste_type_id===typeFilter)
    }))
    .filter(h=>h.waste_collection_items.length);

  const o=allOpening.filter(r=>!typeFilter||r.waste_type_id===typeFilter);

  const genConfirmedKg=d
    .filter(r=>r.weight_status==='confirmed')
    .reduce((s,r)=>s+Number(r.weight_kg||0),0);

  const genUnknown=d.filter(r=>r.weight_status!=='confirmed').length;

  const collectedKg=c
    .flatMap(x=>x.waste_collection_items)
    .reduce((s,x)=>s+Number(x.weight_kg||0),0);

  const openingKg=o.reduce((s,x)=>s+Number(x.weight_kg||0),0);
  const currentKg=openingKg+genConfirmedKg-collectedKg;

  let runningGenT=0;
  let runningColT=0;
  const months=Array.from({length:12},(_,i)=>{
    const m=String(i+1).padStart(2,'0');
    const md=d.filter(r=>String(r.entry_date).slice(5,7)===m);
    const mc=c.filter(r=>String(r.collection_date).slice(5,7)===m);

    const genKg=md.filter(r=>r.weight_status==='confirmed').reduce((s,r)=>s+Number(r.weight_kg||0),0);
    const colKg=mc.flatMap(x=>x.waste_collection_items).reduce((s,x)=>s+Number(x.weight_kg||0),0);
    const genT=genKg/1000;
    const colT=colKg/1000;
    runningGenT += genT;
    runningColT += colT;

    return {
      m,
      monthLabel:`${Number(m)}월`,
      genKg,
      genT,
      unknown:md.filter(r=>r.weight_status!=='confirmed').length,
      colKg,
      colT,
      count:mc.length,
      cumGenT:runningGenT,
      cumColT:runningColT,
      currentT:(openingKg + monthsPlaceholderBefore(i, d, c, o, typeFilter))/1000
    };
  });

  // recompute current-by-month using cumulative values
  const openingT=openingKg/1000;
  months.forEach((x,idx)=>{
    x.currentT = openingT + x.cumGenT - x.cumColT;
  });

  const visibleTypes=activeTypes.filter(t=>!typeFilter||t.id===typeFilter);
  const typeStats=visibleTypes.map(t=>{
    const td=allDailyYear.filter(r=>r.waste_type_id===t.id);
    const tc=allCollectionsYear.flatMap(h=>h.waste_collection_items||[]).filter(i=>i.waste_type_id===t.id);
    const to=allOpening.filter(r=>r.waste_type_id===t.id);
    const genKg=td.filter(r=>r.weight_status==='confirmed').reduce((s,r)=>s+Number(r.weight_kg||0),0);
    const colKg=tc.reduce((s,r)=>s+Number(r.weight_kg||0),0);
    const opKg=to.reduce((s,r)=>s+Number(r.weight_kg||0),0);
    return {
      id:t.id,
      name:typeName(t),
      currentT:(opKg+genKg-colKg)/1000,
      generatedT:genKg/1000,
      collectedT:colKg/1000,
      unknown:td.filter(r=>r.weight_status!=='confirmed').length
    };
  }).sort((a,b)=>Math.abs(b.currentT)-Math.abs(a.currentT));

  const kpis=[
    {key:'generated', label:'확정 발생량', value:`${num(genConfirmedKg/1000,4)} T`, note:'일일입력 확정 중량 합계'},
    {key:'collected', label:'처리량', value:`${num(collectedKg/1000,4)} T`, note:'수거등록 처리 중량 합계'},
    {key:'storage', label:'현재 보관량', value:`${num(currentKg/1000,4)} T`, note:'기초·이월량 + 발생 - 처리'},
    {key:'warning', label:'중량 미확정 발생건', value:`${genUnknown}건`, note:'무게 미입력/미확정 건수', warning:genUnknown>0}
  ];

  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>

    <div class="toolbar">
      <select id="year" class="btn">
        ${[Number(year)-2,Number(year)-1,Number(year),Number(year)+1]
          .map(y=>`<option ${String(y)===year?'selected':''}>${y}</option>`).join('')}
      </select>

      <select id="type" class="btn">
        <option value="">전체 폐기물</option>
        ${activeTypes.map(t=>`
          <option value="${t.id}" ${t.id===typeFilter?'selected':''}>
            ${esc(typeName(t))}
          </option>`).join('')}
      </select>

      <span class="spacer"></span>
      ${canManageWaste()?'<button id="open-settings" class="btn">⚙ 설정</button>':''}
    </div>

    <div class="kpis kpis-rich">
      ${kpis.map(k=>`
        <div class="kpi rich ${k.key}">
          <div class="kpi-main">
            <div class="kpi-icon ${k.key}">${kpiIconSvg(k.key)}</div>
            <div class="kpi-copy">
              <div class="label">${k.label}</div>
              <div class="value ${k.warning?'warning':''}">${k.value}</div>
              <div class="meta ${k.warning?'warning':''}">${k.note}</div>
            </div>
          </div>
          <div class="kpi-side-icon ${k.key}">${kpiIconSvg(k.key)}</div>
        </div>`).join('')}
    </div>

    <div class="dashboard-charts preview-grid top">
      <div class="card chart-card large">${monthlyTrendChartHtml(months)}</div>
      <div class="card chart-card side">${typeStorageChartHtml(typeStats)}</div>
    </div>

    <div class="dashboard-charts preview-grid bottom">
      <div class="card chart-card large">${cumulativeLineChartHtml(months)}</div>
      <div class="card chart-card side">${collectionCountChartHtml(months)}</div>
    </div>

    <div class="card">
      <div class="section-head detail-head">
        <h2>📊 ${year}년 월별 상세 현황</h2>
        <div class="spacer"></div>
        <span class="hint">그래프 하단 상세 데이터</span>
      </div>
      <div class="hint">
        중량 미확정 일일입력은 무게 합계에서 제외됩니다. 따라서 현재 보관량은 확정 중량 기준입니다.
      </div>
      <br>
      <div class="table-wrap detail-table-wrap">
        <table class="detail-table">
          <colgroup>
            <col style="width:110px">
            <col style="width:18%">
            <col style="width:18%">
            <col style="width:18%">
            <col style="width:18%">
            <col style="width:18%">
          </colgroup>
          <thead>
            <tr>
              <th>월</th>
              <th class="num">확정 발생량(T)</th>
              <th class="num">중량 미확정(건)</th>
              <th class="num">수거횟수</th>
              <th class="num">처리량(T)</th>
              <th class="num">현재 보관량(T)</th>
            </tr>
          </thead>
          <tbody>
            ${months.map(x=>`
              <tr>
                <td>${x.monthLabel}</td>
                <td class="num">${num(x.genT,4)}</td>
                <td class="num">${x.unknown}</td>
                <td class="num">${x.count}</td>
                <td class="num">${num(x.colT,4)}</td>
                <td class="num">${num(x.currentT,4)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  $('#year').onchange=e=>{
    year=e.target.value;
    renderStatus();
  };

  $('#type').onchange=e=>{
    typeFilter=e.target.value;
    renderStatus();
  };

  if($('#open-settings'))$('#open-settings').onclick=()=>renderSettings();
}

// helper used only for build-time compatibility; value replaced later
function monthsPlaceholderBefore(){ return 0; }

function settingsFieldHtml(f){
  const [id,label,type,opts]=f;
  if(type==='select'){
    return `<div class="field"><label>${label}</label><select id="${id}">${opts.map(x=>{const [v,t]=x.split(':');return `<option value="${v}">${t}</option>`}).join('')}</select></div>`;
  }
  return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" ${['legal_name','vendor_name','location_name','unit_name','category_name','type_name'].includes(id)?'required':''}></div>`;
}

function vendorMethodsEditorHtml(){
  return `
    <div class="field">
      <label>처리방법</label>
      <div class="method-add-row">
        <input id="new-method-name" type="text" placeholder="예: 중화, 고온소각, 소각, 증발">
        <button type="button" class="btn" id="add-method">+ 추가</button>
      </div>
      <div class="hint">같은 업체에 처리방법을 여러 개 등록할 수 있습니다.</div>
      <div id="method-list" class="method-list"></div>
    </div>`;
}

function renderMethodDraft(){
  const box=$('#method-list');
  if(!box)return;
  box.innerHTML=vendorMethodsDraft.length
    ? vendorMethodsDraft.map((m,i)=>`
      <div class="method-row">
        <label class="check-option">
          <input type="checkbox" data-method-active="${i}" ${m.active!==false?'checked':''}>
          <span>${esc(m.method_name)}</span>
        </label>
        <button type="button" class="btn small danger" data-method-remove="${i}">${m.id?'미사용':'삭제'}</button>
      </div>`).join('')
    : `<div class="empty method-empty">등록된 처리방법이 없습니다.</div>`;

  document.querySelectorAll('[data-method-active]').forEach(ch=>{
    ch.onchange=()=>{vendorMethodsDraft[Number(ch.dataset.methodActive)].active=ch.checked;};
  });
  document.querySelectorAll('[data-method-remove]').forEach(btn=>{
    btn.onclick=()=>{
      const i=Number(btn.dataset.methodRemove);
      if(vendorMethodsDraft[i]?.id){
        vendorMethodsDraft[i].active=false;
      }else{
        vendorMethodsDraft.splice(i,1);
      }
      renderMethodDraft();
    };
  });
}

function addVendorMethod(){
  const input=$('#new-method-name');
  const name=String(input?.value||'').trim();
  if(!name)return;
  const exists=vendorMethodsDraft.some(m=>String(m.method_name).trim().toLowerCase()===name.toLowerCase());
  if(exists)return notice('이미 추가된 처리방법입니다.','err');
  vendorMethodsDraft.push({id:null,method_name:name,active:true,sort_order:vendorMethodsDraft.length+1});
  input.value='';
  renderMethodDraft();
}

async function renderSettings(){
  if(!canManageWaste()){
    await renderStatus();
    return;
  }
  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>
    <div class="toolbar"><button id="back-status" class="btn">← 폐기물현황</button><span class="spacer"></span></div>
    <div class="subtabs">${Object.entries(settingsConfigs).map(([k,v])=>`<button data-setting-tab="${k}" class="${k===settingsTab?'active':''}">${v.title}</button>`).join('')}</div>
    <div id="settings-body"></div>`;

  $('#back-status').onclick=()=>renderStatus();
  document.querySelectorAll('[data-setting-tab]').forEach(b=>b.onclick=()=>{
    settingsTab=b.dataset.settingTab;
    vendorMethodsDraft=[];
    renderSettings();
  });

  if(settingsTab==='opening')return renderOpeningSettings();

  const c=settingsConfigs[settingsTab];
  const ordered=['types','locations','units','referenceCategories','documentTypes'].includes(settingsTab);

  let rows=[];
  let allMethods=[];
  if(settingsTab==='vendors'){
    const [vendorsRes,methodsRes]=await Promise.all([
      A.list(c.table,'*','vendor_name',true),
      A.list('waste_vendor_treatment_methods','*','sort_order',true)
    ]);
    rows=vendorsRes.data||[];
    allMethods=methodsRes.data||[];
  }else{
    const res=await A.list(c.table,'*',ordered?'sort_order':'created_at',ordered);
    rows=res.data||[];
  }

  $('#settings-body').innerHTML=`
    <div class="grid two">
      <div class="card">
        <div class="card-title">⚙ ${c.title} 설정</div>
        <form id="settings-form">
          <input type="hidden" id="edit-id">
          ${c.fields.map(settingsFieldHtml).join('')}
          ${settingsTab==='vendors'?`
            <div class="field">
              <label>역할</label>
              <div class="check-row">
                <label class="check-option"><input type="checkbox" id="is_transporter"><span>운반업체</span></label>
                <label class="check-option"><input type="checkbox" id="is_processor" checked><span>처리업체</span></label>
              </div>
            </div>
            ${vendorMethodsEditorHtml()}
          `:''}
          <div class="field">
            <label>사용 여부</label>
            <label class="check-option single"><input type="checkbox" id="active" checked><span>사용</span></label>
          </div>
          <button class="btn primary" type="submit">저장</button>
          <button class="btn" type="button" id="reset-settings">신규</button>
        </form>
      </div>

      <div class="card">
        <div class="card-title">등록 목록</div>
        <div class="table-wrap"><table><thead><tr><th>명칭</th><th>상세</th><th>사용</th><th>관리</th></tr></thead><tbody>
          ${rows.length?rows.map(r=>settingsRowHtml(r,allMethods)).join(''):`<tr><td colspan="4" class="empty">등록된 데이터가 없습니다.</td></tr>`}
        </tbody></table></div>
      </div>
    </div>`;

  $('#settings-form').onsubmit=saveSetting;
  $('#reset-settings').onclick=()=>{vendorMethodsDraft=[];renderSettings();};

  if(settingsTab==='vendors'){
    $('#add-method').onclick=addVendorMethod;
    $('#new-method-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addVendorMethod();}};
    renderMethodDraft();
  }

  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editSetting(rows.find(r=>r.id===b.dataset.edit),allMethods));
}

function settingsRowHtml(r,allMethods=[]){
  let name='',detail='';
  if(settingsTab==='types'){
    name=typeName(r);
    detail=[r.legal_code,r.default_quantity_unit].filter(Boolean).join(' · ');
  }
  if(settingsTab==='vendors'){
    name=r.vendor_name;
    const roles=[r.is_transporter?'운반':'',r.is_processor?'처리':''].filter(Boolean).join('/');
    const methods=allMethods.filter(m=>m.vendor_id===r.id&&m.active).map(m=>m.method_name).join(', ');
    detail=[roles,r.permit_no,methods?`처리방법: ${methods}`:''].filter(Boolean).join(' · ');
  }
  if(settingsTab==='locations'){name=r.location_name;detail=r.description||''}
  if(settingsTab==='units'){name=r.unit_name;detail=[r.capacity_l?`${r.capacity_l}L`:'',r.quantity_unit].filter(Boolean).join(' · ')}
  if(settingsTab==='referenceCategories'){name=r.category_name;detail=r.description||''}
  if(settingsTab==='documentTypes'){name=r.type_name;detail=r.description||''}
  return `<tr><td>${esc(name)}</td><td>${esc(detail)}</td><td>${r.active?'사용':'미사용'}</td><td><button class="btn small" data-edit="${r.id}">수정</button></td></tr>`;
}

function editSetting(r,allMethods=[]){
  if(!r)return;
  $('#edit-id').value=r.id;
  const c=settingsConfigs[settingsTab];
  c.fields.forEach(([id])=>{const e=$('#'+id);if(e)e.value=r[id]??''});
  $('#active').checked=r.active!==false;

  if(settingsTab==='vendors'){
    $('#is_transporter').checked=!!r.is_transporter;
    $('#is_processor').checked=!!r.is_processor;
    vendorMethodsDraft=allMethods.filter(m=>m.vendor_id===r.id).map(m=>({...m}));
    renderMethodDraft();
  }
}

async function syncVendorMethods(vendorId){
  for(let i=0;i<vendorMethodsDraft.length;i++){
    const m=vendorMethodsDraft[i];
    if(m.id){
      const x=await A.update('waste_vendor_treatment_methods',m.id,{
        method_name:m.method_name,
        active:m.active!==false,
        sort_order:i+1,
        vendor_id:vendorId
      });
      if(x.error)throw x.error;
    }else{
      const x=await A.insert('waste_vendor_treatment_methods',{
        vendor_id:vendorId,
        method_name:m.method_name,
        active:m.active!==false,
        sort_order:i+1
      });
      if(x.error)throw x.error;
    }
  }
}

async function saveSetting(e){
  e.preventDefault();
  const c=settingsConfigs[settingsTab];
  const id=$('#edit-id').value;
  const p={};

  c.fields.forEach(([fid,,type])=>{
    let v=$('#'+fid).value;
    if(type==='number')v=v===''?null:Number(v);
    p[fid]=v;
  });

  p.active=$('#active').checked;
  if(settingsTab==='types')p.display_name=null;
  if(settingsTab==='vendors'){
    p.is_transporter=$('#is_transporter').checked;
    p.is_processor=$('#is_processor').checked;
  }

  const res=id?await A.update(c.table,id,p):await A.insert(c.table,p);
  if(res.error)return notice(res.error.message,'err');

  if(settingsTab==='vendors'){
    try{
      await syncVendorMethods(res.data.id);
    }catch(err){
      return notice('업체는 저장되었지만 처리방법 저장 중 오류: '+(err.message||err),'err');
    }
    vendorMethodsDraft=[];
  }

  notice('저장되었습니다.');
  renderSettings();
}

async function loadSettingsBase(){
  const [types,locs,units]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_storage_locations','*','sort_order',true),
    A.list('waste_container_units','*','sort_order',true)
  ]);
  return {types:types.data||[],locs:locs.data||[],units:units.data||[]};
}

async function renderOpeningSettings(){
  const base=await loadSettingsBase();
  const res=await A.list('waste_opening_balances','*,waste_types(*),waste_storage_locations(*),waste_container_units(*)','balance_date',false);
  const rows=res.data||[];

  $('#settings-body').innerHTML=`
    <div class="grid two">
      <div class="card">
        <div class="card-title">📦 기초·이월량</div>
        <form id="open-form">
          <div class="field"><label>기준일</label><input id="balance_date" type="date" value="${dateKey()}" required></div>
          <div class="field"><label>폐기물 종류</label><select id="waste_type_id" required>${base.types.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(typeName(x))}</option>`).join('')}</select></div>
          <div class="field"><label>보관장소</label><select id="storage_location_id"><option value="">선택 안함</option>${base.locs.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.location_name)}</option>`).join('')}</select></div>
          <div class="field"><label>용기·단위</label><select id="container_unit_id"><option value="">선택 안함</option>${base.units.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.unit_name)}</option>`).join('')}</select></div>
          <div class="inline">
            <div class="field"><label>기초수량</label><input id="quantity" type="number" min="0" step="0.001" value="0"></div>
            <div class="field"><label>기초중량(kg, 모르면 공란)</label><input id="weight_kg" type="number" min="0" step="0.001"></div>
          </div>
          <div class="field"><label>비고</label><textarea id="note"></textarea></div>
          <button class="btn primary" type="submit">저장</button>
        </form>
      </div>
      <div class="card">
        <div class="card-title">기초·이월량 목록</div>
        <div class="table-wrap"><table><thead><tr><th>기준일</th><th>폐기물</th><th>수량</th><th>중량</th><th></th></tr></thead><tbody>
          ${rows.length?rows.map(r=>`<tr><td>${r.balance_date}</td><td>${esc(typeName(r.waste_types||{}))}</td><td>${num(r.quantity,0)}</td><td>${r.weight_kg==null?'-':num(r.weight_kg,3)+' kg'}</td><td><button class="btn small danger" data-del="${r.id}">삭제</button></td></tr>`).join(''):`<tr><td colspan="5" class="empty">데이터 없음</td></tr>`}
        </tbody></table></div>
      </div>
    </div>`;

  $('#open-form').onsubmit=async(e)=>{
    e.preventDefault();
    const p={
      balance_date:$('#balance_date').value,
      waste_type_id:$('#waste_type_id').value,
      storage_location_id:$('#storage_location_id').value||null,
      container_unit_id:$('#container_unit_id').value||null,
      quantity:Number($('#quantity').value||0),
      weight_kg:$('#weight_kg').value===''?null:Number($('#weight_kg').value),
      note:$('#note').value
    };
    const x=await A.insert('waste_opening_balances',p);
    if(x.error)return notice(x.error.message,'err');
    notice('기초량을 저장했습니다.');
    renderOpeningSettings();
  };

  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    if(!confirm('삭제하시겠습니까?'))return;
    const x=await A.remove('waste_opening_balances',b.dataset.del);
    if(x.error)return notice(x.error.message,'err');
    renderOpeningSettings();
  });
}

renderStatus();
