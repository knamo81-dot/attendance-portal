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

  async function insert(table,payload){
    const cid=companyId();
    const row={...payload};
    if(cid && row.company_id==null) row.company_id=cid;
    return sb.from(table).insert([row]).select('*').single();
  }

  async function update(table,id,payload){
    let q=sb.from(table).update(payload).eq('id',id);
    const cid=companyId();
    if(cid) q=q.eq('company_id',cid);
    return q.select('*').single();
  }

  window.wasteApi={sb,portalSession,companyId,list,insert,update};
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

const round2=(v)=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

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

const CM_LIMIT=154;
const TON_TO_CM=22;
const MAX_TON_M3=7;

function cmToM3(cm){
  return round2((Number(cm||0)/CM_LIMIT)*MAX_TON_M3);
}

function parseAfterCm(value){
  const raw=String(value??'').trim();
  if(!raw) return null;
  const normalized=raw.toLowerCase().replace(/\s+/g,'');
  if(normalized.startsWith('over')) return CM_LIMIT;
  const n=Number(raw);
  return Number.isFinite(n)?n:null;
}

function guidelineText(totalCm){
  return totalCm>CM_LIMIT ? `OVER ${CM_LIMIT}` : `${num(cmToM3(totalCm),2)} m³`;
}

const today=new Date();
let year=String(today.getFullYear());
let month=String(today.getMonth()+1).padStart(2,'0');
let typeId='';
let viewMode='legal'; // legal | facility

let types=[];
let daily=[];
let openings=[];
let collections=[];
let facilityDaily=[];
let approvalRoles=[];
let approvals=[];
let authUser=null;

async function load(){
  const [t,d,o,c,f,s,a]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_daily_entries','*,waste_types(*)','entry_date',true),
    A.list('waste_opening_balances','*,waste_types(*)','balance_date',true),
    A.list(
      'waste_collections',
      '*,waste_collection_items(*,waste_types(*),processor:waste_vendors!waste_collection_items_processor_vendor_id_fkey(*),transporter:waste_vendors!waste_collection_items_transporter_vendor_id_fkey(*),treatment_method:waste_vendor_treatment_methods!waste_collection_items_treatment_method_id_fkey(*))',
      'collection_date',
      true
    ),
    A.list(
      'waste_facility_daily_logs',
      '*,waste_types(*)',
      'entry_date',
      true
    ),
    A.list('user_app_roles','*','created_at',true),
    A.list('waste_ledger_approvals','*','approval_year',false)
  ]);

  types=(t.data||[]).filter(x=>x.active);
  daily=d.data||[];
  openings=o.data||[];
  collections=c.data||[];
  facilityDaily=f.data||[];
  approvalRoles=(s.data||[]).filter(x=>x.is_active!==false && String(x.app_key||'').toLowerCase()==='waste');
  approvals=a.data||[];

  try{
    const u=await A.sb.auth.getUser();
    authUser=u.data?.user||null;
  }catch(e){}

  render();
}

function typeById(id){
  return types.find(t=>t.id===id)||{};
}

function monthPrefix(){
  return month==='all' ? `${year}-` : `${year}-${month}`;
}

function monthStart(){
  return month==='all' ? `${year}-01-01` : `${year}-${month}-01`;
}

function periodLabel(){
  return month==='all' ? `${year}년 전체` : `${year}년 ${Number(month)}월`;
}

function weekendInfo(date){
  const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return {isWeekend:false,reason:null,dow:null};
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  const dow=d.getDay();
  return {
    isWeekend:dow===0||dow===6,
    reason:dow===0?'일요일':dow===6?'토요일':null,
    dow
  };
}

function effectiveFacilityHoliday(row){
  const w=weekendInfo(row?.entry_date);
  return {
    isHoliday:w.isWeekend||!!row?.is_holiday,
    reason:w.reason||String(row?.holiday_reason||'').trim()||null,
    isWeekend:w.isWeekend
  };
}

function selectedPeriodBounds(){
  const y=Number(year);
  const now=new Date();
  const todayKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  let start;
  let end;

  if(month==='all'){
    start=`${year}-01-01`;
    end=`${year}-12-31`;
  }else{
    const mm=String(month).padStart(2,'0');
    start=`${year}-${mm}-01`;
    const last=new Date(y,Number(month),0).getDate();
    end=`${year}-${mm}-${String(last).padStart(2,'0')}`;
  }

  // 현재 또는 미래 기간은 오늘까지만 자동 행을 만든다.
  if(end>todayKey)end=todayKey;

  return {start,end};
}

function weekendDatesInSelectedPeriod(){
  const {start,end}=selectedPeriodBounds();
  if(!start||!end||start>end)return [];

  const sm=start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const em=end.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!sm||!em)return [];

  const d=new Date(Number(sm[1]),Number(sm[2])-1,Number(sm[3]));
  const e=new Date(Number(em[1]),Number(em[2])-1,Number(em[3]));
  const out=[];

  while(d<=e){
    const dow=d.getDay();
    if(dow===0||dow===6){
      out.push(
        `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      );
    }
    d.setDate(d.getDate()+1);
  }
  return out;
}

function selectedTypeLabel(){
  if(!typeId) return '전체 폐기물';
  return typeName(typeById(typeId));
}

function inSelectedType(wasteTypeId){
  return !typeId || wasteTypeId===typeId;
}

/* =========================================================
   사업장 폐기물 관리대장
========================================================= */
function openingBalanceKg(){
  const start=monthStart();

  const openingKg=openings
    .filter(r=>r.is_facility_log!==true)
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
    if(a.kind!==b.kind) return a.kind==='generation' ? -1 : 1;
    return typeName(a.waste_type).localeCompare(typeName(b.waste_type),'ko');
  });

  return events;
}

function legalLedgerRows(){
  /*
    사업장 폐기물 관리대장은 같은 날짜 + 같은 폐기물 종류를 한 행으로 묶습니다.

    예)
      2026-01-28 발생 0.1500T
      2026-01-28 위탁 0.1500T
      -> 발생내용과 위탁 처리내용을 동일 행에 표시

    누계/보관량은 날짜 오름차순으로 먼저 계산한 뒤,
    화면에서는 최신 날짜가 위로 오도록 내림차순으로 표시합니다.
  */
  const events=monthlyEvents();
  const groups=new Map();

  events.forEach(ev=>{
    const key=`${ev.date}|${ev.waste_type_id}`;

    if(!groups.has(key)){
      groups.set(key,{
        date:ev.date,
        waste_type_id:ev.waste_type_id,
        waste_type:ev.waste_type||typeById(ev.waste_type_id),

        hasGeneration:false,
        generationKg:0,
        hasUnknownGeneration:false,

        hasSelf:false,
        selfKg:0,
        selfMethods:new Set(),

        hasOut:false,
        outsourcedKg:0,
        outTransporters:new Set(),
        outProcessors:new Set(),
        outMethods:new Set()
      });
    }

    const g=groups.get(key);
    if(!g.waste_type && ev.waste_type) g.waste_type=ev.waste_type;

    if(ev.kind==='generation'){
      g.hasGeneration=true;
      if(ev.confirmed){
        g.generationKg+=Number(ev.weight_kg||0);
      }else{
        g.hasUnknownGeneration=true;
      }
      return;
    }

    if(ev.kind==='collection'){
      const method=String(ev.method?.method_name||'').trim();

      if(ev.treatment_type==='self'){
        g.hasSelf=true;
        g.selfKg+=Number(ev.weight_kg||0);
        if(method) g.selfMethods.add(method);
      }else{
        g.hasOut=true;
        g.outsourcedKg+=Number(ev.weight_kg||0);

        const transporter=String(ev.transporter?.vendor_name||'').trim();
        const processor=String(ev.processor?.vendor_name||'').trim();

        if(transporter) g.outTransporters.add(transporter);
        if(processor) g.outProcessors.add(processor);
        if(method) g.outMethods.add(method);
      }
    }
  });

  const ordered=[...groups.values()].sort((a,b)=>{
    const d=String(a.date).localeCompare(String(b.date));
    if(d!==0)return d;
    return typeName(a.waste_type).localeCompare(typeName(b.waste_type),'ko');
  });

  let genCum=0;
  let outsourcedCum=0;
  let balance=openingBalanceKg();
  let hasUnknown=false;

  const calculated=ordered.map(g=>{
    if(g.hasGeneration){
      genCum+=g.generationKg;
      balance+=g.generationKg;
      if(g.hasUnknownGeneration)hasUnknown=true;
    }

    if(g.hasSelf){
      balance-=g.selfKg;
    }

    if(g.hasOut){
      outsourcedCum+=g.outsourcedKg;
      balance-=g.outsourcedKg;
    }

    return {
      ...g,
      selfMethods:[...g.selfMethods],
      outTransporters:[...g.outTransporters],
      outProcessors:[...g.outProcessors],
      outMethods:[...g.outMethods],
      genCum,
      outsourcedCum,
      balance,
      hasUnknown
    };
  });

  return calculated.sort((a,b)=>{
    const d=String(b.date).localeCompare(String(a.date));
    if(d!==0)return d;
    return typeName(a.waste_type).localeCompare(typeName(b.waste_type),'ko');
  });
}

function natureCell(ev){
  const t=ev.waste_type||{};
  if(!typeId){
    return `${esc(typeName(t))}<br><span class="muted">${esc(stateName(t))}</span>`;
  }
  return esc(stateName(t)||'-');
}

/* =========================================================
   폐수배출시설 운영일지
   - waste_facility_daily_logs
   - waste_collections.is_facility_log = true
========================================================= */
function facilityPickupGroups(){
  const map=new Map();

  collections
    .filter(h=>h.is_facility_log===true)
    .forEach(h=>{
      const items=(h.waste_collection_items||[]).filter(i=>inSelectedType(i.waste_type_id));

      items.forEach(i=>{
        const key=`${h.collection_date}|${i.waste_type_id}`;
        if(!map.has(key)){
          map.set(key,{
            date:h.collection_date,
            waste_type_id:i.waste_type_id,
            waste_type:i.waste_types||typeById(i.waste_type_id),
            weight_kg:0,
            processors:new Set(),
            transporters:new Set(),
            certificates:new Set(),
            methods:new Set(),
            afterValues:[],
            notes:new Set(),
            created_at:h.created_at||''
          });
        }

        const g=map.get(key);
        g.weight_kg+=Number(i.weight_kg||0);

        if(i.processor?.vendor_name) g.processors.add(i.processor.vendor_name);
        if(i.transporter?.vendor_name) g.transporters.add(i.transporter.vendor_name);
        if(i.treatment_method?.method_name) g.methods.add(i.treatment_method.method_name);
        if(h.certificate_no) g.certificates.add(h.certificate_no);
        if(h.note) g.notes.add(h.note);
        if(h.facility_after_cm!=null && String(h.facility_after_cm).trim()!==''){
          g.afterValues.push(String(h.facility_after_cm).trim());
        }
        if(String(h.created_at||'')>String(g.created_at||'')) g.created_at=h.created_at||g.created_at;
      });
    });

  return [...map.values()].map(g=>({
    ...g,
    processors:[...g.processors],
    transporters:[...g.transporters],
    certificates:[...g.certificates],
    methods:[...g.methods],
    notes:[...g.notes],
    after_cm:g.afterValues.length?g.afterValues[g.afterValues.length-1]:null
  }));
}

function facilityOpeningRowsForType(wasteTypeId){
  return openings
    .filter(r=>r.is_facility_log===true)
    .filter(r=>r.waste_type_id===wasteTypeId)
    .sort((a,b)=>{
      const d=String(a.balance_date||'').localeCompare(String(b.balance_date||''));
      if(d!==0)return d;
      return String(a.created_at||'').localeCompare(String(b.created_at||''));
    });
}

function facilityOpeningState(row){
  if(!row)return {prevUsage:0,prevGuideline:0,totalCm:0};

  const h=Number(row.facility_height_cm||0);
  const ext=row.facility_has_external===true
    ? Number(row.facility_external_cm || (Number(row.facility_external_ton||0)*TON_TO_CM))
    : 0;
  const total=Math.max(0,round2(h+ext));

  return {
    prevUsage:Number(row.facility_prev_usage||0),
    prevGuideline:total>CM_LIMIT ? 0 : cmToM3(total),
    totalCm:total
  };
}

function buildFacilityDerived(){
  const pickups=facilityPickupGroups();
  const pickupMap=new Map();

  pickups.forEach(p=>{
    const key=`${p.date}|${p.waste_type_id}`;
    pickupMap.set(key,p);
  });

  const byType=new Map();

  facilityDaily
    .filter(r=>inSelectedType(r.waste_type_id))
    .forEach(r=>{
      if(!byType.has(r.waste_type_id)) byType.set(r.waste_type_id,[]);
      byType.get(r.waste_type_id).push(r);
    });

  // 수거만 있는 폐기물 종류도 운영일지 대상에 포함
  pickups.forEach(p=>{
    if(!byType.has(p.waste_type_id))byType.set(p.waste_type_id,[]);
  });

  const autoWeekendDates=weekendDatesInSelectedPeriod();
  const enriched=[];

  byType.forEach((rows,wasteTypeId)=>{
    const actualByDate=new Map(
      rows.map(r=>[String(r.entry_date||''),r])
    );

    // 토·일요일에 일일입력이 없어도 운영일지에는 자동 휴일 행 생성
    const virtualWeekends=autoWeekendDates
      .filter(date=>!actualByDate.has(date))
      .map(date=>({
        id:null,
        company_id:A.companyId(),
        waste_type_id:wasteTypeId,
        entry_date:date,
        usage:null,
        height:null,
        is_holiday:true,
        holiday_reason:weekendInfo(date).reason,
        note:'',
        has_external:false,
        external_ton:null,
        external_cm:null,
        created_by:null,
        created_at:null,
        virtual_weekend:true
      }));

    const ordered=[...rows,...virtualWeekends]
      .sort((a,b)=>String(a.entry_date).localeCompare(String(b.entry_date)));
    const baselines=facilityOpeningRowsForType(wasteTypeId);

    let prevMeter=0;
    let prevGuideline=0;
    let appliedOpeningId='';

    ordered.forEach((row)=>{
      // 현재 일자까지 등록된 가장 최근 운영일지용 기초값을 적용한다.
      // 같은 기준일이면 일일입력 계산 전에 기초값을 사용한다.
      const applicable=baselines
        .filter(x=>String(x.balance_date||'')<=String(row.entry_date||''))
        .slice(-1)[0]||null;

      if(applicable && applicable.id!==appliedOpeningId){
        const state=facilityOpeningState(applicable);
        prevMeter=state.prevUsage;
        prevGuideline=state.prevGuideline;
        appliedOpeningId=applicable.id;
      }

      const holiday=effectiveFacilityHoliday(row);
      const isHoliday=holiday.isHoliday;
      const meter=isHoliday ? prevMeter : Number(row.usage||0);
      const waterUsed=isHoliday
        ? 0
        : round2(meter-prevMeter);

      const externalCm=isHoliday
        ? 0
        : (row.has_external
            ? Number(row.external_cm || (Number(row.external_ton||0)*TON_TO_CM))
            : 0);

      const totalCm=isHoliday
        ? 0
        : round2(Number(row.height||0)+externalCm);

      const guidelineValue=isHoliday
        ? prevGuideline
        : (totalCm>CM_LIMIT ? null : cmToM3(totalCm));

      const generated=isHoliday
        ? 0
        : (guidelineValue===null ? null : round2(guidelineValue-prevGuideline));

      const pickup=pickupMap.get(`${row.entry_date}|${wasteTypeId}`)||null;

      enriched.push({
        ...row,
        is_holiday:isHoliday,
        holiday_reason:isHoliday?(holiday.reason||'휴일'):null,
        waste_type:row.waste_types||typeById(wasteTypeId),
        water_prev:prevMeter,
        water_used:waterUsed,
        external_cm_calc:externalCm,
        total_cm:totalCm,
        guideline_text:isHoliday?'휴일':guidelineText(totalCm),
        generated_text:isHoliday?'휴일':(generated===null?'Unverified':`${num(generated,2)} m³`),
        pickup
      });

      prevMeter=meter;

      if(!isHoliday){
        if(pickup?.after_cm!=null){
          const parsed=parseAfterCm(pickup.after_cm);
          prevGuideline=parsed==null
            ? (guidelineValue??prevGuideline)
            : cmToM3(parsed);
        }else{
          prevGuideline=guidelineValue??prevGuideline;
        }
      }
    });
  });

  // 수거만 있고 일일입력이 없는 날짜도 운영일지에 표시
  const dailyKeys=new Set(enriched.map(r=>`${r.entry_date}|${r.waste_type_id}`));
  pickups.forEach(p=>{
    const key=`${p.date}|${p.waste_type_id}`;
    if(!dailyKeys.has(key)){
      const weekend=weekendInfo(p.date);
      enriched.push({
        id:null,
        entry_date:p.date,
        waste_type_id:p.waste_type_id,
        waste_type:p.waste_type||typeById(p.waste_type_id),
        usage:null,
        height:null,
        is_holiday:weekend.isWeekend,
        holiday_reason:weekend.reason,
        note:'',
        has_external:false,
        external_ton:null,
        external_cm:null,
        water_prev:null,
        water_used:null,
        external_cm_calc:null,
        total_cm:null,
        guideline_text:'-',
        generated_text:'-',
        pickup:p,
        pickup_only:true
      });
    }
  });

  enriched.sort((a,b)=>{
    const d=String(a.entry_date).localeCompare(String(b.entry_date));
    if(d!==0)return d;
    return typeName(a.waste_type).localeCompare(typeName(b.waste_type),'ko');
  });

  return enriched;
}

function facilityRowsForPeriod(){
  const prefix=monthPrefix();
  return buildFacilityDerived()
    .filter(r=>String(r.entry_date||'').startsWith(prefix))
    .sort((a,b)=>{
      const d=String(b.entry_date||'').localeCompare(String(a.entry_date||''));
      if(d!==0)return d;
      return typeName(a.waste_type||{}).localeCompare(typeName(b.waste_type||{}),'ko');
    });
}

function facilityWasteCell(row){
  if(typeId) return '';
  return `<br><span class="muted">${esc(typeName(row.waste_type||{}))}</span>`;
}

function facilityPickupInfo(p){
  if(!p) return '-';

  const weightT=Number(p.weight_kg||0)/1000;
  const after=p.after_cm!=null && String(p.after_cm).trim()!==''
    ? `<br>후높이 ${esc(p.after_cm)} cm`
    : '';

  return `수거 ${num(weightT,4)} T${after}`;
}

function facilityContractor(p){
  if(!p || !p.processors?.length) return '-';
  return p.processors.map(esc).join('<br>');
}

function facilityCertificates(p){
  if(!p || !p.certificates?.length) return '-';
  return p.certificates.map(esc).join('<br>');
}

/* =========================================================
   렌더링
========================================================= */

function currentUserIdentity(){
  const s=A.portalSession()||{};
  const p=s.profile||{};
  const u=s.user||{};
  const emp=s.employee||s.currentEmployee||{};
  const meta=authUser?.user_metadata||{};

  return {
    email:String(
      s.email||u.email||p.email||authUser?.email||emp.email||''
    ).trim().toLowerCase(),
    employee_no:String(
      s.employee_no||s.employeeNo||
      u.employee_no||u.employeeNo||
      p.employee_no||p.employeeNo||
      emp.employee_no||emp.employeeNo||''
    ).trim(),
    name:String(
      s.name||s.userName||s.user_name||
      u.name||u.full_name||
      p.name||p.full_name||p.korean_name||p.user_name||
      emp.name||
      meta.name||meta.full_name||''
    ).trim()
  };
}

function sameEmail(a,b){
  return !!a && !!b && String(a).trim().toLowerCase()===String(b).trim().toLowerCase();
}

function sameEmployeeNo(a,b){
  return !!a && !!b && String(a).trim()===String(b).trim();
}

function roleAssignments(kind){
  const roleKey=kind==='writer'?'operator':'approver';
  return approvalRoles.filter(r=>
    r.is_active!==false &&
    String(r.app_key||'').toLowerCase()==='waste' &&
    String(r.role_key||'').toLowerCase()===roleKey
  );
}

function assignmentMatchesUser(row,user){
  return (
    sameEmail(row?.email,user?.email) ||
    sameEmployeeNo(row?.employee_no,user?.employee_no)
  );
}

function currentRoleAssignment(kind){
  const user=currentUserIdentity();
  return roleAssignments(kind).find(r=>assignmentMatchesUser(r,user))||null;
}

function roleDisplayName(kind,record){
  const rows=roleAssignments(kind);
  const approvedName=kind==='writer'?record?.writer_name:record?.approver_name;
  if(approvedName)return approvedName;

  if(rows.length===1){
    return rows[0].name||rows[0].email||(kind==='writer'?'담당자':'결재자');
  }
  if(rows.length>1){
    return kind==='writer'?`운영자 ${rows.length}명`:`결재자 ${rows.length}명`;
  }
  return kind==='writer'?'담당자 미설정':'결재자 미설정';
}

function approvalRecord(){
  if(month==='all')return null;
  return approvals.find(x=>
    x.ledger_type==='combined' &&
    Number(x.approval_year)===Number(year) &&
    Number(x.approval_month)===Number(month)
  )||null;
}

function approvalPeriodReady(){
  if(month==='all')return false;
  if(viewMode==='legal' && typeId)return false;
  return true;
}

function approvalDate(v){
  if(!v)return '';
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return '';
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function approvalStampHtml(){
  return `<span class="approval-stamp"><span>결재</span></span>`;
}

function approvalCellHtml(kind){
  const record=approvalRecord();
  const assignments=roleAssignments(kind);
  const currentAssignment=currentRoleAssignment(kind);

  const isWriter=kind==='writer';
  const roleLabel=isWriter?'담당자':'결재자';
  const personName=roleDisplayName(kind,record);
  const approvedAt=isWriter?record?.writer_approved_at:record?.approver_approved_at;
  const approved=!!approvedAt;
  const writerDone=!!record?.writer_approved_at;
  const finalDone=!!record?.approver_approved_at;
  const periodReady=approvalPeriodReady();

  let body='';

  if(approved){
    const canCancelWriter=
      isWriter &&
      !finalDone &&
      currentAssignment &&
      sameEmail(record?.writer_email,currentAssignment.email);

    body=`
      <div class="approval-stamp-wrap">${approvalStampHtml()}</div>
      <div class="approval-person">${esc(personName)}</div>
      <div class="approval-date">${approvalDate(approvedAt)}</div>
      ${canCancelWriter
        ? `<button type="button" class="approval-cancel" data-approval-action="writer-cancel">결재취소</button>`
        : ''}
    `;
  }else{
    let reason='';

    if(!assignments.length){
      reason='최상위 설정에서 권한 지정';
    }else if(!periodReady){
      reason=month==='all'?'월 선택 필요':'전체 폐기물에서 결재';
    }else if(!isWriter && !writerDone){
      reason='담당자 결재 후 가능';
    }else if(!currentAssignment){
      reason='미결재';
    }

    if(
      assignments.length &&
      periodReady &&
      currentAssignment &&
      (isWriter || writerDone)
    ){
      body=`
        <button type="button"
          class="approval-action-button"
          data-approval-action="${isWriter?'writer-approve':'approver-approve'}">
          결재
        </button>
        <div class="approval-person">${esc(currentAssignment.name||currentAssignment.email||personName)}</div>
        <div class="approval-date">미결재</div>
      `;
    }else{
      body=`
        <div class="approval-empty-mark">-</div>
        <div class="approval-person">${esc(personName)}</div>
        <div class="approval-date">${esc(reason||'미결재')}</div>
      `;
    }
  }

  return `
    <div class="approval-cell">
      <div class="approval-role">${roleLabel}</div>
      <div class="approval-cell-body">${body}</div>
    </div>
  `;
}

function approvalPanelHtml(){
  return `
    <div class="approval-panel" aria-label="결재란">
      <div class="approval-label">결재</div>
      ${approvalCellHtml('writer')}
      ${approvalCellHtml('approver')}
    </div>
  `;
}

async function reloadApprovals(){
  const a=await A.list('waste_ledger_approvals','*','approval_year',false);
  if(a.error)throw a.error;
  approvals=a.data||[];
}

function validateApprovalAction(kind){
  const assignments=roleAssignments(kind);
  const assignment=currentRoleAssignment(kind);

  if(!assignments.length){
    alert(`최상위 설정 > 권한관리 > 수동 권한 설정에서 폐기물 ${kind==='writer'?'운영자':'결재자'}를 먼저 지정하세요.`);
    return false;
  }
  if(month==='all'){
    alert('결재는 월 단위입니다. 1월~12월 중 결재할 월을 선택하세요.');
    return false;
  }
  if(viewMode==='legal' && typeId){
    alert('사업장 폐기물 관리대장은 전체 폐기물 기준으로 결재합니다. 폐기물 필터를 "전체 폐기물"로 변경하세요.');
    return false;
  }
  if(!assignment){
    alert(`최상위 설정에서 폐기물 ${kind==='writer'?'운영자':'결재자'}로 지정된 사용자만 결재할 수 있습니다.`);
    return false;
  }
  return true;
}

async function writerApprove(){
  if(!validateApprovalAction('writer'))return;

  const assignment=currentRoleAssignment('writer');
  const current=approvalRecord();
  const now=new Date().toISOString();

  let res;
  if(current){
    if(current.approver_approved_at){
      return alert('최종 결재가 완료된 관리대장은 담당자 결재를 변경할 수 없습니다.');
    }
    res=await A.update('waste_ledger_approvals',current.id,{
      writer_email:assignment.email||currentUserIdentity().email||null,
      writer_name:assignment.name||currentUserIdentity().name||assignment.email||'담당자',
      writer_approved_at:now
    });
  }else{
    res=await A.insert('waste_ledger_approvals',{
      ledger_type:'combined',
      approval_year:Number(year),
      approval_month:Number(month),
      writer_email:assignment.email||currentUserIdentity().email||null,
      writer_name:assignment.name||currentUserIdentity().name||assignment.email||'담당자',
      writer_approved_at:now
    });
  }

  if(res.error)return alert('담당자 결재 오류: '+res.error.message);
  await reloadApprovals();
  render();
}

async function writerCancel(){
  if(!validateApprovalAction('writer'))return;

  const assignment=currentRoleAssignment('writer');
  const current=approvalRecord();

  if(!current?.writer_approved_at)return;
  if(current.approver_approved_at){
    return alert('결재자 최종 결재가 완료되어 담당자 결재를 취소할 수 없습니다.');
  }
  if(
    current.writer_email &&
    assignment?.email &&
    !sameEmail(current.writer_email,assignment.email)
  ){
    return alert('본인이 처리한 담당자 결재만 취소할 수 있습니다.');
  }
  if(!confirm('담당자 결재를 취소하시겠습니까?'))return;

  const res=await A.update('waste_ledger_approvals',current.id,{
    writer_email:null,
    writer_name:null,
    writer_approved_at:null
  });
  if(res.error)return alert('결재취소 오류: '+res.error.message);

  await reloadApprovals();
  render();
}

async function approverApprove(){
  if(!validateApprovalAction('approver'))return;

  const assignment=currentRoleAssignment('approver');
  const current=approvalRecord();

  if(!current?.writer_approved_at){
    return alert('담당자 결재 완료 후 결재자 결재가 가능합니다.');
  }
  if(current.approver_approved_at){
    return alert('이미 최종 결재가 완료되었습니다.');
  }

  if(!confirm('최종 결재 후에는 담당자 결재취소가 불가능합니다. 최종 결재하시겠습니까?'))return;

  const res=await A.update('waste_ledger_approvals',current.id,{
    approver_email:assignment.email||currentUserIdentity().email||null,
    approver_name:assignment.name||currentUserIdentity().name||assignment.email||'결재자',
    approver_approved_at:new Date().toISOString()
  });
  if(res.error)return alert('결재자 결재 오류: '+res.error.message);

  await reloadApprovals();
  render();
}

function bindApprovalActions(){
  document.querySelectorAll('[data-approval-action]').forEach(btn=>{
    btn.onclick=async()=>{
      const action=btn.dataset.approvalAction;
      btn.disabled=true;
      try{
        if(action==='writer-approve')await writerApprove();
        else if(action==='writer-cancel')await writerCancel();
        else if(action==='approver-approve')await approverApprove();
      }finally{
        btn.disabled=false;
      }
    };
  });
}

function commonTabsHtml(){
  return `
    <div class="subtabs" style="margin-bottom:10px;">
      <button id="mode-legal" class="${viewMode==='legal'?'active':''}">
        사업장 폐기물 관리대장
      </button>
      <button id="mode-facility" class="${viewMode==='facility'?'active':''}">
        폐수배출시설 운영일지
      </button>
    </div>`;
}

function commonFiltersHtml(){
  return `
    <div class="toolbar">
      <select id="year" class="btn">
        ${[Number(year)-2,Number(year)-1,Number(year),Number(year)+1].map(y=>
          `<option value="${y}" ${String(y)===year?'selected':''}>${y}년</option>`
        ).join('')}
      </select>

      <select id="month" class="btn">
        <option value="all" ${month==='all'?'selected':''}>전체</option>
        ${Array.from({length:12},(_,i)=>{
          const m=String(i+1).padStart(2,'0');
          return `<option value="${m}" ${m===month?'selected':''}>${i+1}월</option>`;
        }).join('')}
      </select>

      ${viewMode==='legal'?`
        <select id="type" class="btn">
          <option value="" ${typeId===''?'selected':''}>전체 폐기물</option>
          ${types.map(x=>
            `<option value="${x.id}" ${x.id===typeId?'selected':''}>${esc(typeName(x))}</option>`
          ).join('')}
        </select>
      `:''}

      <button class="btn primary" id="print">인쇄</button>
      <div class="spacer"></div>
    </div>`;
}


function commonApprovalHeaderHtml(){
  return `
    <div class="ledger-control-bar">
      <div class="ledger-control-left">
        ${commonTabsHtml()}
        ${commonFiltersHtml()}
      </div>
      <div class="ledger-control-approval">
        ${approvalPanelHtml()}
      </div>
    </div>`;
}

function renderLegal(){
  const rows=legalLedgerRows();
  $('#app').innerHTML=`
    ${commonApprovalHeaderHtml()}

    <div class="card">
      <div class="section-head">
        <h2>🧾 사업장 폐기물 관리대장</h2>
        <div class="spacer"></div>
        <span class="hint">${periodLabel()} · 단위: 톤(T)</span>
      </div>

      <div class="hint">
        ① 폐기물의 종류: <b>${esc(selectedTypeLabel())}</b>
        · ${periodLabel()} 일일입력 및 수거등록 데이터를 기반으로 자동 작성
      </div>

      <br>

      <div class="table-wrap">
        <table class="ledger-data-table legal-ledger-table">
          <colgroup>
            <col style="width:92px">
            <col style="width:160px">
            <col style="width:92px">
            <col style="width:100px">
            <col style="width:92px">
            <col style="width:92px">
            <col style="width:112px">
            <col style="width:92px">
            <col style="width:112px">
            <col style="width:120px">
            <col style="width:120px">
            <col style="width:112px">
            <col style="width:105px">
            <col style="width:105px">
          </colgroup>
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
              const generationDisplay=!r.hasGeneration
                ? '-'
                : (r.hasUnknownGeneration
                    ? (r.generationKg>0
                        ? `${num(r.generationKg/1000,4)}<br><span class="pill amber">+ 미확정</span>`
                        : '<span class="pill amber">미확정</span>')
                    : num(r.generationKg/1000,4));

              const selfMethods=(r.selfMethods||[]).length
                ? r.selfMethods.map(x=>esc(x)).join('<br>')
                : '-';

              const outTransporters=(r.outTransporters||[]).length
                ? r.outTransporters.map(x=>esc(x)).join('<br>')
                : '-';

              const outProcessors=(r.outProcessors||[]).length
                ? r.outProcessors.map(x=>esc(x)).join('<br>')
                : '-';

              const outMethods=(r.outMethods||[]).length
                ? r.outMethods.map(x=>esc(x)).join('<br>')
                : '-';

              return `
                <tr>
                  <td>${r.hasGeneration?r.date:'-'}</td>
                  <td>${natureCell(r)}</td>
                  <td class="num">${generationDisplay}</td>
                  <td class="num">${num(r.genCum/1000,4)}</td>

                  <td>${r.hasSelf?r.date:'-'}</td>
                  <td class="num">${r.hasSelf?num(r.selfKg/1000,4):'-'}</td>
                  <td>${r.hasSelf?selfMethods:'-'}</td>

                  <td>${r.hasOut?r.date:'-'}</td>
                  <td class="num">${r.hasOut?num(r.outsourcedKg/1000,4):'-'}</td>
                  <td>${r.hasOut?outTransporters:'-'}</td>
                  <td>${r.hasOut?outProcessors:'-'}</td>
                  <td>${r.hasOut?outMethods:'-'}</td>
                  <td class="num">${num(r.outsourcedCum/1000,4)}</td>

                  <td class="num">
                    ${num(r.balance/1000,4)}${r.hasUnknown?' *':''}
                  </td>
                </tr>`;
            }).join('') : `
              <tr>
                <td colspan="14" class="empty">
                  ${periodLabel()} 해당 데이터가 없습니다.
                </td>
              </tr>`
            }
          </tbody>
        </table>
      </div>

      <br>

      <div class="hint">
        ${month==='all'?'연도 시작':'월 시작'} 확정 기준 이월 보관량:
        <b>${num(openingBalanceKg()/1000,4)} T</b>
      </div>

      <div class="hint warning" style="margin-top:6px;">
        ※ 발생 시 중량 미확정 건은 관리대장 발생량을 확정할 수 없어 '미확정'으로 표시합니다.
        미확정 발생건이 포함된 이후 보관량에는 * 표시가 붙으며 확정 중량 기준입니다.
      </div>
    </div>`;

  bindCommon();
}

function renderFacility(){
  const rows=facilityRowsForPeriod();

  $('#app').innerHTML=`
    ${commonApprovalHeaderHtml()}

    <div class="card">
      <div class="section-head">
        <h2>🧾 폐수배출시설 운영일지</h2>
        <div class="spacer"></div>
        <span class="hint">${periodLabel()}</span>
      </div>

      <div class="hint">
        일일입력에서 <b>폐수배출시설 운영일지</b>로 저장한 기록과,
        수거등록에서 같은 항목을 체크한 수거건만 날짜 기준으로 합쳐 표시합니다.
      </div>

      <br>

      <div class="table-wrap">
        <table class="ledger-data-table facility-ledger-table">
          <colgroup>
            <col style="width:115px">
            <col style="width:95px">
            <col style="width:105px">
            <col style="width:115px">
            <col style="width:125px">
            <col style="width:145px">
            <col style="width:115px">
            <col style="width:115px">
            <col style="width:130px">
            <col style="width:160px">
            <col style="width:175px">
          </colgroup>
          <thead>
            <tr>
              <th>날짜</th>
              <th>용수 금일</th>
              <th>당일 사용량</th>
              <th>저장고 높이</th>
              <th>외부보관</th>
              <th>처리업소</th>
              <th>금일지침</th>
              <th>총 발생량</th>
              <th>확인서번호</th>
              <th>수거 정보</th>
              <th>기타</th>
            </tr>
          </thead>

          <tbody>
            ${rows.length ? rows.map(r=>{
              const holiday=effectiveFacilityHoliday(r);
              const isHoliday=holiday.isHoliday;
              const p=r.pickup;

              return `
                <tr>
                  <td>
                    ${r.entry_date}
                    ${facilityWasteCell(r)}
                  </td>

                  <td class="num">
                    ${isHoliday?'휴일':(r.usage==null?'-':num(r.usage,2))}
                  </td>

                  <td class="num">
                    ${isHoliday?'휴일':(r.water_used==null?'-':num(r.water_used,2))}
                  </td>

                  <td class="num">
                    ${isHoliday?'휴일':(r.height==null?'-':`${num(r.height,1)} cm`)}
                  </td>

                  <td>
                    ${isHoliday
                      ? '-'
                      : (r.has_external
                          ? `${num(r.external_ton||0,1)} T / ${num(r.external_cm_calc||0,1)} cm`
                          : '-')}
                  </td>

                  <td>${facilityContractor(p)}</td>

                  <td>
                    ${isHoliday
                      ? '휴일'
                      : (r.total_cm!=null && r.total_cm>CM_LIMIT
                          ? `<span class="pill amber">OVER ${CM_LIMIT}</span>`
                          : esc(r.guideline_text||'-'))}
                  </td>

                  <td>
                    ${isHoliday
                      ? '휴일'
                      : (r.generated_text==='Unverified'
                          ? '<span class="pill amber">Unverified</span>'
                          : esc(r.generated_text||'-'))}
                  </td>

                  <td>${facilityCertificates(p)}</td>

                  <td>${facilityPickupInfo(p)}</td>

                  <td class="ledger-notes">
                    ${isHoliday
                      ? esc(holiday.reason||r.holiday_reason||'휴일')
                      : esc(r.note||'')}
                    ${p?.notes?.length
                      ? `${r.note?'<br>':''}<span class="muted">${p.notes.map(esc).join('<br>')}</span>`
                      : ''}
                  </td>
                </tr>`;
            }).join('') : `
              <tr>
                <td colspan="11" class="empty">
                  ${periodLabel()} 폐수배출시설 운영일지 데이터가 없습니다.
                </td>
              </tr>`
            }
          </tbody>
        </table>
      </div>

      <br>

      <div class="hint">
        계산 기준은 기존 폐수 운영일지와 동일하게
        저장고 기준 <b>${CM_LIMIT} cm = ${MAX_TON_M3} m³</b>,
        외부보관 환산 기본값은 <b>1 T = ${TON_TO_CM} cm</b>를 사용합니다.
        수거 후 높이가 입력된 날은 해당 값을 다음 발생량 계산의 기준으로 사용합니다.
      </div>
    </div>`;

  bindCommon();
}

function bindCommon(){
  $('#mode-legal').onclick=()=>{
    viewMode='legal';
    render();
  };

  $('#mode-facility').onclick=()=>{
    viewMode='facility';
    typeId='';
    render();
  };

  $('#year').onchange=e=>{
    year=e.target.value;
    render();
  };

  $('#month').onchange=e=>{
    month=e.target.value;
    render();
  };

  if($('#type')){
    $('#type').onchange=e=>{
      typeId=e.target.value;
      render();
    };
  }

  $('#print').onclick=()=>window.print();
  bindApprovalActions();
}

function render(){
  if(viewMode==='facility') renderFacility();
  else renderLegal();
}

load();
