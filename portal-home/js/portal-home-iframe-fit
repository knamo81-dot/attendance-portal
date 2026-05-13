/* portal-home-iframe-fit.js | Phase 1 split from original portal-home.html
   원본 inline script #4를 실행 순서 그대로 외부 파일로 분리했습니다. */

(function () {
  function resizeAttendanceFrame() {
    var frame = document.getElementById('attendance-embedded-frame');
    if (!frame) return;
    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (!doc) return;
      var body = doc.body;
      var html = doc.documentElement;
      var h = Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        html ? html.clientHeight : 0,
        html ? html.scrollHeight : 0,
        html ? html.offsetHeight : 0
      );
      if (h && isFinite(h)) {
        frame.style.height = (h + 40) + 'px';
      }
    } catch (e) {
      console.warn('attendance iframe resize skipped:', e);
    }
  }

  function bindResize() {
    var frame = document.getElementById('attendance-embedded-frame');
    if (!frame) return;

    frame.addEventListener('load', function () {
      resizeAttendanceFrame();
      try {
        var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (!doc) return;

        if ('ResizeObserver' in window) {
          var ro = new ResizeObserver(function () {
            resizeAttendanceFrame();
          });
          if (doc.body) ro.observe(doc.body);
          if (doc.documentElement) ro.observe(doc.documentElement);
        }

        setTimeout(resizeAttendanceFrame, 100);
        setTimeout(resizeAttendanceFrame, 400);
        setTimeout(resizeAttendanceFrame, 1000);
        setTimeout(resizeAttendanceFrame, 2000);
      } catch (e) {
        console.warn('attendance iframe observer skipped:', e);
      }
    });

    window.addEventListener('resize', function () {
      setTimeout(resizeAttendanceFrame, 50);
      setTimeout(resizeAttendanceFrame, 200);
    });

    document.addEventListener('click', function () {
      setTimeout(resizeAttendanceFrame, 80);
      setTimeout(resizeAttendanceFrame, 250);
      setTimeout(resizeAttendanceFrame, 700);
    });

    document.addEventListener('change', function () {
      setTimeout(resizeAttendanceFrame, 80);
      setTimeout(resizeAttendanceFrame, 250);
      setTimeout(resizeAttendanceFrame, 700);
    });

    setTimeout(resizeAttendanceFrame, 100);
    setTimeout(resizeAttendanceFrame, 400);
    setTimeout(resizeAttendanceFrame, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindResize);
  } else {
    bindResize();
  }
})();
