// Supabase 연결 설정
// 아래 두 값을 현재 프로젝트 값으로 교체하세요.
// 기존 포탈/근태/폐수/시약에서 사용하는 값과 같은 방식입니다.

const SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

let supabaseClient = null;

function initSupabase() {
  if (!window.supabase) {
    console.error("Supabase CDN을 불러오지 못했습니다.");
    return null;
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
  ) {
    console.warn("Supabase URL/KEY가 아직 설정되지 않았습니다.");
    return null;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

function getSupabase() {
  return supabaseClient || initSupabase();
}
