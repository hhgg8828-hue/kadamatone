(() => {
  const cfg = window.KHADAMAT_APP || {};
  let deferredPrompt = null;
  const label = cfg.label || 'تطبيق خدمات';
  const isProvider = cfg.id === 'provider';

  function showInstallHelp() {
    const old = document.getElementById('khadamat-install-help');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'khadamat-install-help';
    Object.assign(box.style, {position:'fixed',inset:'0',zIndex:'100000',background:'rgba(7,15,27,.65)',display:'grid',placeItems:'center',padding:'18px',direction:'rtl'});
    const card = document.createElement('section');
    Object.assign(card.style,{maxWidth:'430px',width:'100%',background:'#fff',color:'#182230',borderRadius:'18px',padding:'22px',font:'16px/1.8 system-ui,sans-serif',boxShadow:'0 18px 50px rgba(0,0,0,.28)'});
    const title = document.createElement('h2'); title.textContent = `تثبيت ${label}`; title.style.marginTop='0';
    const intro = document.createElement('p'); intro.textContent = 'إذا لم يظهر زر التثبيت التلقائي، يمكنك إضافة تطبيق مقدم الخدمة إلى الشاشة الرئيسية من قائمة المتصفح.';
    const steps = document.createElement('ol');
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua);
    const samsung = /SamsungBrowser/i.test(ua);
    const li = (txt) => { const el=document.createElement('li'); el.textContent=txt; return el; };
    if (ios) { steps.append(li('اضغط زر المشاركة في Safari.'),li('اختر «إضافة إلى الشاشة الرئيسية»، ثم اضغط «إضافة».')); }
    else if (samsung) { steps.append(li('افتح قائمة المتصفح (☰).'),li('اختر «إضافة صفحة إلى» ثم «الشاشة الرئيسية»، أو خيار «تثبيت التطبيق» إن ظهر.')); }
    else { steps.append(li('افتح قائمة المتصفح (⋮).'),li('اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»، ثم أكد الإضافة.')); }
    const note=document.createElement('p'); note.textContent='قد تختلف أسماء الخيارات حسب الجهاز والمتصفح. يتطلب التثبيت تأكيدك ولا يمكن للرابط تثبيت التطبيق بصمت.'; note.style.fontSize='13px'; note.style.color='#667085';
    const close=document.createElement('button'); close.type='button'; close.textContent='حسنًا'; Object.assign(close.style,{border:0,borderRadius:'12px',padding:'10px 18px',background:'#176b4d',color:'#fff',fontWeight:700,cursor:'pointer'}); close.onclick=()=>box.remove();
    card.append(title,intro,steps,note,close); box.append(card); box.addEventListener('click',e=>{if(e.target===box)box.remove()}); document.body.append(box);
  }
  function addButton() {
    if (document.getElementById('khadamat-install-button')) return;
    const btn = document.createElement('button');
    btn.id = 'khadamat-install-button'; btn.type = 'button'; btn.textContent = `تثبيت ${label}`;
    Object.assign(btn.style,{position:'fixed',bottom:'18px',left:'18px',zIndex:'99999',border:'0',borderRadius:'16px',padding:'13px 18px',font:'700 14px system-ui,sans-serif',color:'#fff',background:'#176b4d',boxShadow:'0 10px 28px rgba(0,0,0,.22)',cursor:'pointer'});
    btn.onclick = async () => {
      if (!deferredPrompt) { showInstallHelp(); return; }
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      if (!isProvider) btn.remove();
    };
    document.body.appendChild(btn);
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; addButton(); });
  window.addEventListener('appinstalled', () => document.getElementById('khadamat-install-button')?.remove());
  // The provider portal gets a visible manual-install path on browsers that do not expose beforeinstallprompt (notably iOS/Safari).
  if (isProvider) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton, {once:true}); else addButton(); }
})();
