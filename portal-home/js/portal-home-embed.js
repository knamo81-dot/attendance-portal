/* portal-home-embed.js | Phase 1 split from original portal-home.html
   원본 inline script #1를 실행 순서 그대로 외부 파일로 분리했습니다. */

(function(){
      var embed = false;
      try { embed = window.self !== window.top; } catch(e) { embed = true; }
      var q = new URLSearchParams(location.search);
      if (q.get('embed') === '1' || q.get('embed') === 'true') embed = true;
      if (embed) document.documentElement.classList.add('embed-mode');
    })();
