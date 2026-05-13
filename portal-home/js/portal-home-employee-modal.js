/* portal-home-employee-modal.js | Phase 1 split from original portal-home.html
   원본 inline script #7 (id=employee-modal-popup-script)를 실행 순서 그대로 외부 파일로 분리했습니다. */

(function(){
  /* 저장 버튼으로 ok 클래스 감지·800ms 자동 닫기 금지. 닫힘은 saveEmployee() 성공 후 약 2.2초 뒤에만 호출되어 성공 메시지를 읽을 수 있습니다. */
  function el(id){ return document.getElementById(id); }
  function openEmpModal(){
    if(window.__empSaveCloseTimer){ clearTimeout(window.__empSaveCloseTimer); window.__empSaveCloseTimer = null; }
    const modal = el('realEmployeeModal');
    if(!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('real-modal-open');
  }
  function closeEmpModal(){
    const modal = el('realEmployeeModal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('real-modal-open');
  }
  window.closeEmployeeModal = closeEmpModal;
  document.addEventListener('click', function(e){
    if(e.target && e.target.id === 'realEmpAddBtn'){
      setTimeout(openEmpModal, 0);
    }
    const editBtn = e.target && e.target.closest ? e.target.closest('[data-emp-edit]') : null;
    if(editBtn){
      setTimeout(openEmpModal, 0);
    }
    if(e.target && (e.target.id === 'realEmployeeModalClose' || e.target.id === 'realEmpResetBtn')){
      if(e.target.id === 'realEmpResetBtn'){
        return; // keep reset behavior only
      }
      closeEmpModal();
    }
    if(e.target && e.target.id === 'realEmployeeModal'){
      closeEmpModal();
    }
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeEmpModal();
  });
})();
