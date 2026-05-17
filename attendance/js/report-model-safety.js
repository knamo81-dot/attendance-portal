/* ===== Attendance report modal safety patch ===== */
(function(){
  function ensureReportModalVisible(){
    var modal = document.getElementById('attendanceReportModal');
    if(!modal) return;

    var top = modal.querySelector('.reportModalTop');
    var actions = modal.querySelector('.reportModalActions');
    var settings = modal.querySelector('.reportSettings');
    var status = document.getElementById('attendanceReportStatus');

    if(top){
      top.style.display = 'flex';
      top.style.visibility = 'visible';
      top.style.opacity = '1';
    }
    if(actions){
      actions.style.display = 'flex';
      actions.style.visibility = 'visible';
      actions.style.opacity = '1';
    }
    if(settings){
      settings.style.display = 'flex';
      settings.style.visibility = 'visible';
      settings.style.opacity = '1';
    }
    if(status){
      status.style.display = 'block';
      status.style.visibility = 'visible';
      status.style.opacity = '1';
    }
  }

  function bindReportButtonsAgain(){
    var openBtn = document.getElementById('attendanceReportOpenBtn');
    var modal = document.getElementById('attendanceReportModal');

    if(openBtn && openBtn.__reportSafetyBound !== true){
      openBtn.__reportSafetyBound = true;
      openBtn.addEventListener('click', function(){
        setTimeout(ensureReportModalVisible, 0);
        setTimeout(ensureReportModalVisible, 120);
        setTimeout(ensureReportModalVisible, 400);
      }, true);
    }

    if(modal && modal.__reportSafetyObserverBound !== true){
      modal.__reportSafetyObserverBound = true;
      var observer = new MutationObserver(function(){
        if(modal.classList.contains('show') || modal.getAttribute('aria-hidden') === 'false'){
          ensureReportModalVisible();
        }
      });
      observer.observe(modal, { attributes:true, attributeFilter:['class','aria-hidden'] });
    }

    ['attendanceReportLoadBtn','attendanceReportRegenerateBtn','attendanceReportPrintBtn','attendanceReportCloseBtn'].forEach(function(id){
      var btn = document.getElementById(id);
      if(btn){
        btn.style.display = '';
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
      }
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindReportButtonsAgain);
  }else{
    bindReportButtonsAgain();
  }
  setTimeout(bindReportButtonsAgain, 500);
  setTimeout(bindReportButtonsAgain, 1500);
  window.ensureAttendanceReportModalVisible = ensureReportModalVisible;
})();
