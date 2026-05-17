/* ===== extracted inline script #2 (inline) ===== */

(async function(){

  const SUPABASE_URL = 'https://mbqpsovlwvedwrtbbauj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.top.location.href = '/';
    return;
  }

})();
