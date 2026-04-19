(function(){
  const FRAME_SRC = 'attendance-legacy.html';
  function activatePanel(doc, key){
    const tab = doc.querySelector(`.mainTab[data-main="${key}"]`);
    if(tab && typeof tab.click === 'function') tab.click();
    doc.querySelectorAll('.mainTab').forEach(el=>{
      if(el.dataset.main !== key) el.style.display='none';
    });
    doc.querySelectorAll('.mainPanel').forEach(el=>{
      if(el.id !== `main-${key}`) el.style.display='none';
    });
    const spacer = doc.querySelector('.mainTabs .spacer');
    if(spacer) spacer.style.display='none';
    const tabsWrap = doc.querySelector('.mainTabs');
    if(tabsWrap) tabsWrap.style.display='none';
  }
  function fitFrame(frame){
    try{
      const doc = frame.contentDocument;
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 900);
      frame.style.height = (h + 24) + 'px';
    }catch(e){}
  }
  function boot(){
    const frame = document.getElementById('featureFrame');
    if(!frame) return;
    const key = document.body.dataset.feature;
    frame.src = FRAME_SRC;
    frame.addEventListener('load', ()=>{
      try{
        const doc = frame.contentDocument;
        activatePanel(doc, key);
        fitFrame(frame);
        const ro = new ResizeObserver(()=>fitFrame(frame));
        ro.observe(doc.body);
      }catch(err){
        console.warn('split-shell load warn', err);
      }
    }, { once:true });
  }
  window.addEventListener('load', boot, { once:true });
})();
