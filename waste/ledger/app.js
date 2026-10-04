const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcHNvdmx3dmVkd3J0YmJhdWoiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3NTgxMjY1OSwiZXhwIjoyMDkxMzg4NjU5fQ.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

(function(){
  function portalSession(){
    try{
      if(window.parent && window.parent!==window && typeof window.parent.getPortalSession==='function'){
        return window.parent.getPortalSession()||{};
      }
    }catch(e){}
    try{
      if(window.parent && window.parent!==window && window.parent.portalSession){
        return window.parent.portalSession||{};
      }
    }catch(e){}
    return window.portalSession||window.currentPortalSession||{};
  }

  function rawClient(){
    const s=portalSession();
    if(s && s.supabase) return s.supabase;
    try{
      if(window.parent && window.parent!==window && window.parent.portalSupabase){
        return window.parent.portalSupabase;
      }
    }catch(e){}
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
    const v=s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||
      c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||window.currentCompanyId||'';

    if(v) return String(v).trim();

    try{
      const p=new URLSearchParams(location.search);
      return String(p.get('company_id')||p.get('companyId')||'').trim();
    }catch(e){
      return '';
    }
  }

  const sb=rawClient();

  async function list(table,select='*',orderCol='created_at',ascending=false){
    let q=sb.from(table).select(select);
    const cid=companyId();
    if(cid) q=q.eq('company_id',cid);
    if(orderCol) q=q.order(orderCol,{ascending});
    return q;
  }

  window.wasteApi={sb,portalSession,companyId,list};
})();

const A=window.wasteApi;
const $=(s)=>document.querySelector(s);

const esc=(v)=>String(v??'').replace(/[&<>'"]/g,m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[m]));

const num=(v,d=2)=>Number(v||0).toLocaleString('ko-KR',{
  minimumFractionDigits:d,
  maximumFractionDigits:d
});

function typeName(r){
  return r.display_name||
    `${r.legal_name||''}${r.physical_state==='liquid'?'(액상)':r.physical_state==='solid'?'(고상)':''}`;
}

function stateName(r){
  if(r.physical_state==='liquid') return '액상';
  if(r.physical_state==='solid') return '고상';
  if(r.physical_state==='mixed') return '혼합';
  if(r.physical_state==='other') return '기타';
  return '';
}

const today=new Date();
let year=String(today.getFullYear());
let month=String(today.getMonth()+1).padStart(2,'0');
let typeId=''; // 빈 값 = 전체 폐기물

let types=[];
let daily=[];
let openings=[];
let collections=[];

async function load(){
  const [t,d,o,c]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_daily_entries','*,waste_types(*)','entry_date',true),
    A.list('waste_opening_balances','*,waste_types(*)','balance_date',true),
    A.list(
      'waste_collections',
      '*,waste_collection_items(*,waste_types(*),processor:waste_vendors!waste_collection_items_processor_vendor_id_fkey(*),transporter:waste_vendors!waste_collection_items_transporter_vendor_id_fkey(*),treatment_method:waste_vendor_treatment_methods!waste_collection_items_treatment_method_id_fkey(*))',
      'collection_date',
      true
    )
  ]);

  types=(t.data||[]).filter(x=>x.active);
  daily=d.data||[];
  openings=o.data||[];
  collections=c.data||[];

  render();
}

function selectedTypeIds(){
  return typeId ? [typeId] : types.map(t=>t.id);
}

function typeById(id){
  return types.find(t=>t.id===id)||{};
}

function monthPrefix(){
  return `${year}-${month}`;
}

function monthStart(){
  return `${year}-${month}-01`;
}

function nextMonthStart(){
  const y=Number(year);
  const m=Number(month);
  if(m===12) return `${y+1}-01-01`;
  return `${y}-${String(m+1).padStart(2,'0')}-01`;
}

function selectedTypeLabel(){
  if(!typeId) return '전체 폐기물';
  return typeName(typeById(typeId));
}

function inSelectedType(wasteTypeId){
  return !typeId || wasteTypeId===typeId;
}

function openingBalanceKg(){
  const start=monthStart();

  const openingKg=openings
    .filter(r=>inSelectedType(r.waste_type_id))
    .filter(r=>String(r.balance_date||'')<=start)
    .reduce((s,r)=>s+Number(r.weight_kg||0),0);

  const priorGeneratedKg=daily
    .filter(r=>inSelectedType(r.waste_type_id))
    .filter(r=>String(r.entry_date||'')<start)
    .filter(r=>r.weight_status==='confirmed')
    .reduce((s,r)=>s+Number(r.weight_kg||0),0);

  const priorCollectedKg=collections
    .filter(h=>String(h.collection_date||'')<start)
    .flatMap(h=>(h.waste_collection_items||[]))
    .filter(i=>inSelectedType(i.waste_type_id))
    .reduce((s,i)=>s+Number(i.weight_kg||0),0);

  return openingKg+priorGeneratedKg-priorCollectedKg;
}

function monthlyEvents(){
  const prefix=monthPrefix();
  const events=[];

  daily
    .filter(r=>String(r.entry_date||'').startsWith(prefix))
    .filter(r=>inSelectedType(r.waste_type_id))
    .forEach(r=>{
      events.push({
        kind:'generation',
        date:r.entry_date,
        waste_type_id:r.waste_type_id,
        waste_type:r.waste_types||typeById(r.waste_type_id),
        weight_kg:Number(r.weight_kg||0),
        confirmed:r.weight_status==='confirmed',
        row:r
      });
    });

  collections
    .filter(h=>String(h.collection_date||'').startsWith(prefix))
    .forEach(h=>{
      (h.waste_collection_items||[])
        .filter(i=>inSelectedType(i.waste_type_id))
        .forEach(i=>{
          events.push({
            kind:'collection',
            date:h.collection_date,
            waste_type_id:i.waste_type_id,
            waste_type:i.waste_types||typeById(i.waste_type_id),
            weight_kg:Number(i.weight_kg||0),
            treatment_type:i.treatment_type||'outsourced',
            processor:i.processor||null,
            transporter:i.transporter||null,
            method:i.treatment_method||null,
            header:h,
            row:i
          });
        });
    });

  events.sort((a,b)=>{
    const d=String(a.date).localeCompare(String(b.date));
    if(d!==0) return d;

    // 같은 날에는 발생을 먼저, 처리를 뒤에 반영
    if(a.kind!==b.kind) return a.kind==='generation' ? -1 : 1;

    const ta=typeName(a.waste_type);
    const tb=typeName(b.waste_type);
    return ta.localeCompare(tb,'ko');
  });

  return events;
}

function ledgerRows(){
  const events=monthlyEvents();
  let genCum=0;
  let outsourcedCum=0;
  let balance=openingBalanceKg();
  let hasUnknown=false;

  return events.map(ev=>{
    let generationKg=0;
    let selfKg=0;
    let outsourcedKg=0;

    if(ev.kind==='generation'){
      if(ev.confirmed){
        generationKg=ev.weight_kg;
        genCum+=generationKg;
        balance+=generationKg;
      }else{
        hasUnknown=true;
      }
    }

    if(ev.kind==='collection'){
      if(ev.treatment_type==='self'){
        selfKg=ev.weight_kg;
      }else{
        outsourcedKg=ev.weight_kg;
        outsourcedCum+=outsourcedKg;
      }
      balance-=ev.weight_kg;
    }

    return {
      ...ev,
      generationKg,
      selfKg,
      outsourcedKg,
      genCum,
      outsourcedCum,
      balance,
      hasUnknown
    };
  });
}

function natureCell(ev){
  const t=ev.waste_type||{};
  if(!typeId){
    return `${esc(typeName(t))}<br><span class="muted">${esc(stateName(t))}</span>`;
  }
  return esc(stateName(t)||'-');
}

function render(){
  const rows=ledgerRows();
  const titleLabel=`${year}년 ${Number(month)}월 사업장 폐기물 관리대장`;

  $('#app').innerHTML=`
    <div class="toolbar">
      <select id="year" class="btn">
        ${[Number(year)-2,Number(year)-1,Number(year),Number(year)+1].map(y=>
          `<option value="${y}" ${String(y)===year?'selected':''}>${y}년</option>`
        ).join('')}
      </select>

      <select id="month" class="btn">
        ${Array.from({length:12},(_,i)=>{
          const m=String(i+1).padStart(2,'0');
          return `<option value="${m}" ${m===month?'selected':''}>${i+1}월</option>`;
        }).join('')}
      </select>

      <select id="type" class="btn">
        <option value="" ${typeId===''?'selected':''}>전체 폐기물</option>
        ${types.map(x=>
          `<option value="${x.id}" ${x.id===typeId?'selected':''}>${esc(typeName(x))}</option>`
        ).join('')}
      </select>

      <div class="spacer"></div>
      <button class="btn primary" id="print">인쇄</button>
    </div>

    <div class="card">
      <div class="section-head">
        <h2>${titleLabel}</h2>
        <div class="spacer"></div>
        <span class="hint">단위: 톤(T)</span>
      </div>

      <div class="hint">
        ① 폐기물의 종류: <b>${esc(selectedTypeLabel())}</b>
        · ${year}년 ${Number(month)}월 일일입력 및 수거등록 데이터를 기반으로 자동 작성
      </div>

      <br>

      <div class="table-wrap">
        <table style="min-width:1250px">
          <thead>
            <tr>
              <th colspan="4">② 발생내용</th>
              <th colspan="3">③ 자가 처리내용</th>
              <th colspan="6">④ 위탁 처리내용</th>
              <th rowspan="2">⑤ 보관량(T)</th>
            </tr>
            <tr>
              <th>연월일</th>
              <th>성질·상태</th>
              <th>발생량(T)</th>
              <th>발생량 누계(T)</th>

              <th>연월일</th>
              <th>처리량(T)</th>
              <th>처리방법</th>

              <th>연월일</th>
              <th>위탁 처리량(T)</th>
              <th>운반자</th>
              <th>처리자</th>
              <th>처리방법</th>
              <th>위탁 누계(T)</th>
            </tr>
          </thead>

          <tbody>
            ${rows.length ? rows.map(r=>{
              const isGeneration=r.kind==='generation';
              const isSelf=r.kind==='collection'&&r.treatment_type==='self';
              const isOut=r.kind==='collection'&&r.treatment_type!=='self';

              return `
                <tr>
                  <td>${isGeneration?r.date:'-'}</td>
                  <td>${natureCell(r)}</td>
                  <td class="num">
                    ${isGeneration
                      ? (r.confirmed
                          ? num(r.generationKg/1000,4)
                          : '<span class="pill amber">미확정</span>')
                      : '-'}
                  </td>
                  <td class="num">${num(r.genCum/1000,4)}</td>

                  <td>${isSelf?r.date:'-'}</td>
                  <td class="num">${isSelf?num(r.selfKg/1000,4):'-'}</td>
                  <td>${isSelf?esc(r.method?.method_name||'-'):'-'}</td>

                  <td>${isOut?r.date:'-'}</td>
                  <td class="num">${isOut?num(r.outsourcedKg/1000,4):'-'}</td>
                  <td>${isOut?esc(r.transporter?.vendor_name||'-'):'-'}</td>
                  <td>${isOut?esc(r.processor?.vendor_name||'-'):'-'}</td>
                  <td>${isOut?esc(r.method?.method_name||'-'):'-'}</td>
                  <td class="num">${num(r.outsourcedCum/1000,4)}</td>

                  <td class="num">
                    ${num(r.balance/1000,4)}${r.hasUnknown?' *':''}
                  </td>
                </tr>`;
            }).join('') : `
              <tr>
                <td colspan="14" class="empty">
                  ${year}년 ${Number(month)}월 해당 데이터가 없습니다.
                </td>
              </tr>`
            }
          </tbody>
        </table>
      </div>

      <br>

      <div class="hint">
        월 시작 확정 기준 이월 보관량:
        <b>${num(openingBalanceKg()/1000,4)} T</b>
      </div>

      <div class="hint warning" style="margin-top:6px;">
        ※ 발생 시 중량 미확정 건은 관리대장 발생량을 확정할 수 없어 '미확정'으로 표시합니다.
        미확정 발생건이 포함된 이후 보관량에는 * 표시가 붙으며 확정 중량 기준입니다.
      </div>
    </div>`;

  $('#year').onchange=e=>{
    year=e.target.value;
    render();
  };

  $('#month').onchange=e=>{
    month=e.target.value;
    render();
  };

  $('#type').onchange=e=>{
    typeId=e.target.value;
    render();
  };

  $('#print').onclick=()=>window.print();
}

load();
