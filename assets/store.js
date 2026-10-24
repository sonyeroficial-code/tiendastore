/* SONYER STORE v3 — Firebase-linked customer accounts and payment requests.
 * The buyer's account remains pending; PagoCheck may attempt owner-approved
 * activation based on a MONI notification. This is NOT bank verification.
 */
(() => {
  'use strict';

  const DEFAULT_PRODUCTS = [
    {id:'app-acceso',title:'Aplicación de acceso',type:'app',description:'Cuenta personalizada para ingresar desde tu celular.',price:30,discount:0,mode:'contact',seller:true,url:'https://example.com',mark:'A',tone:''},
    {id:'panel-web',title:'Panel Web Premium',type:'web',description:'Panel de acceso desde celular o computadora.',price:20,discount:0,mode:'contact',seller:false,url:'https://example.com',mark:'W',tone:'blue'},
    {id:'acceso-pro',title:'Acceso Digital PRO',type:'premium',description:'Cuenta digital con registro de vendedor.',price:50,discount:0,mode:'contact',seller:true,url:'https://example.com',mark:'✧',tone:'mint'},
    {id:'diseno-flyers',title:'Diseño de flyers',type:'service',description:'Flyers para negocios, anuncios y redes sociales.',price:15,discount:0,mode:'contact',seller:false,url:'',mark:'✦',tone:'mint'},
    {id:'web-negocio',title:'Página web para tu negocio',type:'web',description:'Diseño web adaptable a celular y computadora.',price:120,discount:10,mode:'contact',seller:false,url:'',mark:'W',tone:'blue'},
    {id:'soporte-digital',title:'Soporte digital',type:'service',description:'Asistencia y configuración de soluciones digitales.',price:20,discount:0,mode:'contact',seller:false,url:'',mark:'S',tone:''},
    {id:'chatgpt-sonyer',title:'ChatGPT',type:'app',description:'Configura el precio y el enlace del servicio antes de publicarlo.',price:30,discount:0,mode:'access',seller:false,appSource:'CHATGPT',url:'',mark:'C',tone:'mint',published:false},
    {id:'netflix-sonyer',title:'Netflix',type:'app',description:'Configura el precio y el enlace del servicio antes de publicarlo.',price:30,discount:0,mode:'access',seller:false,appSource:'NETFLIX',url:'',mark:'N',tone:'',published:false},
    {id:'instagram-followers-sonyer',title:'Seguidores de Instagram',type:'service',category:'Seguidores',description:'Personaliza la cantidad, precio y condiciones antes de publicar este servicio.',price:10,discount:0,mode:'contact',seller:false,url:'',mark:'IG',tone:'mint',published:false},
    {id:'lemon-sonyer',title:'Lemon',type:'app',description:'Configura el precio y el enlace de tu aplicacion antes de publicarla.',price:30,discount:0,mode:'access',seller:false,appSource:'LEMON',url:'',mark:'L',tone:'mint',published:false},
    {id:'dni-tramites-sonyer',title:'DNI',type:'service',category:'Trámites',description:'Orientación para trámites oficiales de DNI. Configura los detalles antes de publicar.',price:10,discount:0,mode:'contact',seller:false,url:'',mark:'D',tone:'blue',published:false},
    {id:'descanso-medico-orientacion',title:'Orientación sobre descanso médico',type:'service',category:'Salud',description:'Orientación sobre certificados y licencias médicas legítimas emitidas por profesionales autorizados.',price:10,discount:0,mode:'contact',seller:false,url:'',mark:'✚',tone:'mint',published:false}
  ];
  const STORAGE_KEY='sonyer-store-demo-catalog-v2';
  const PAYMENT_KEY='sonyer-store-demo-payment-v1';
  const HISTORY_KEY='sonyer-store-demo-history-v1';
  const CONTACT_KEY='sonyer-store-demo-contact-v1';
  const ADMIN_LOGIN_GUARD_KEY='sonyer-store-admin-login-guard-v1';
  const ADMIN_MAX_ATTEMPTS=3;
  const ADMIN_LOCK_MS=60*60*1000;
  const DEFAULT_PAYMENT={name:'Ivan Reyzhino Mescco Mayta',qr:'assets/moni-qr.jpg'};
  const DEFAULT_CONTACT={whatsapp:'51942978154',telegram:''};
  const TYPE_LABELS={app:'App digital',platform:'Plataforma',web:'Página web',service:'Servicio',premium:'Premium',other:'Otros'};
  const TYPE_TONES={app:'',platform:'blue',web:'blue',service:'mint',premium:'mint',other:''};
  const CATALOG_ARTWORK={
    bcp:'assets/catalog-bcp-new.webp',
    yape:'assets/catalog-yape.jpg',
    interbank:'assets/catalog-interbank-new.webp',
    frefire:'assets/catalog-freefire.webp',
    tiktok:'assets/catalog-tiktok.webp',
    chatgpt:'assets/catalog-chatgpt.webp',
    netflix:'assets/catalog-netflix.webp',
    instagram:'assets/catalog-instagram-followers.webp',
    lemon:'assets/catalog-lemon-logo.webp',
    dni:'assets/catalog-dni-new.webp',
    medico:'assets/catalog-descanso-medico.webp'
  };
  const CATALOG_SECONDARY_ARTWORK={
    lemon:'assets/catalog-lemon-screen.webp',
    bcp:'assets/catalog-bcp-screen.webp',
    interbank:'assets/catalog-interbank-screen.webp',
    yape:'assets/catalog-yape-screen.webp',
    dni:'assets/catalog-dni-old.webp',
    tiktok:'assets/catalog-tiktok-screen.webp',
    frefire:'assets/catalog-freefire-screen.webp'
  };
  const CATALOG_PREVIEW_VIDEOS={
    netflix:'assets/preview-netflix.mp4',
    instagram:'assets/preview-instagram-followers.mp4'
  };
  function artworkForProduct(item){
    const source=String(item.appSource||'').toLowerCase();
    if(Object.prototype.hasOwnProperty.call(CATALOG_ARTWORK,source))return {source,path:CATALOG_ARTWORK[source]};
    // Legacy catalog entries might be missing appSource; recognise one clear app name.
    const title=String(item.title||'').toLowerCase();
    if(item.id==='descanso-medico-orientacion'||/descanso\s+m[eé]dico/.test(title))return {source:'medico',path:CATALOG_ARTWORK.medico};
    if(/\b(free[ -]?fire|frefire)\b/.test(title))return {source:'frefire',path:CATALOG_ARTWORK.frefire};
    if(/\b(tik[ -]?tok|tiktok)\b/.test(title))return {source:'tiktok',path:CATALOG_ARTWORK.tiktok};
    const matches=Object.keys(CATALOG_ARTWORK).filter(name=>new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(title));
    return matches.length===1?{source:matches[0],path:CATALOG_ARTWORK[matches[0]]}:null;
  }
  function untouchedExample(item){
    const template=DEFAULT_PRODUCTS.find(sample=>sample.id===item.id);
    if(!template)return false;
    return ['title','description','price','discount','mode','type','category','url'].every(key=>
      String(item[key]??'')===String(template[key]??''));
  }
  function isPublicProduct(item){return item.published!==false}
  function categoryTitle(item){return item.category||TYPE_LABELS[item.type]||TYPE_LABELS.other}
  function categoryFilterKey(category){return 'category:'+category.toLocaleLowerCase('es-PE')}
  // Client apps use distinct Firestore username formats (not all use APP_SOURCE).
  const APP_PREFIXES=['Yape','BCP','interbank','FREFIRE','TIKTOK','CHATGPT','NETFLIX','LEMON'];
  function normaliseAppCode(value){
    const raw=clean(value).replace(/[^a-zA-Z0-9]/g,'').slice(0,24);
    if(!raw)return '';
    const legacy={yape:'Yape',bcp:'BCP',interbank:'interbank'};
    return legacy[raw.toLowerCase()]||raw.toUpperCase();
  }
  function storedUsername(appSource,username){
    const user=clean(username).toLowerCase();
    if(!appSource)return '';
    // Verified in the BCP app: new profiles store the raw name; older profiles may use Bcp-user.
    if(appSource.toLowerCase()==='bcp')return user;
    // Verified in the Interbank app: APP_SOURCE is lowercase but username is Interbank-user.
    if(appSource.toLowerCase()==='interbank')return `Interbank-${user}`;
    if(appSource==='Yape')return `Yape_${user}`;
    if(appSource==='FREFIRE')return `frefire_${user}`;
    if(appSource==='TIKTOK')return `tiktok_${user}`;
    // Verified in the Yape app: APP_SOURCE + '_' + lowercase username.
    return `${appSource.toLowerCase()}_${user}`;
  }
  const $=id=>document.getElementById(id);
  const esc=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=number=>'S/ '+Number(number).toFixed(2);
  const clean=value=>String(value ?? '').trim();
  const discountedPrice=item=>Math.round((item.price*(100-(item.discount||0)))/100*100)/100;
  const discountText=item=>item.discount?`−${item.discount}%`:'';

  let products=readCatalog();
  let payment=readPayment();
  let contacts=readContacts();
  let purchases=readPurchases();
  let opinions=[];
  let opinionsSaving=false;
  let adminSection='catalogo';
  let lastPopularInteraction=0;
  let catalogPreviewObserver=null;
  const sessionAccess=new Map(); // Access details are never written to browser storage.
  let accountPreview=null; // Firebase Auth identity (when email/password sign-in is enabled).
  let filter='todos';
  let search='';
  let sortMode='normal';
  const engagementStats=new Map();
  const engagementUpdatedAt=new Map();
  const likedProducts=new Set();
  const engagementPending=new Set();
  let engagementRefreshing=false;
  let engagementRefreshQueued=false;
  let purchaseFilter='todas';
  let chosen=null;
  let order=null;
  let view='';
  let toastTimeout=null;
  let loadingTimeout=null;
  let firebaseStore=null;
  let firebaseState='conectando';
  let firebaseAccount=null;
  // Firestore is the source of truth. Never overwrite it with a local draft
  // before the initial catalog snapshot has arrived.
  let catalogReady=false;
  let catalogSaving=false;
  let cloudOrders=[];
  let cloudOrderError='';
  let stopAdminOrders=null;
  const cloudOrderIds=new Set();
  const stopKnownOrders=new Map();
  let voucherCheckAnimation=null;
  let voucherConfettiAnimation=null;
  let voucherConfettiTimer=null;

  const overlay=$('overlay');
  const dialog=overlay.querySelector('.dialog');
  const body=$('modalBody');
  const toastNode=document.createElement('div');
  toastNode.className='toast';
  toastNode.setAttribute('role','status');
  document.body.appendChild(toastNode);

  function normaliseProduct(item){
    if(!item||typeof item!=='object')return null;
    const title=clean(item.title).slice(0,70);
    const description=clean(item.description).slice(0,220);
    const price=Number(item.price);
    const type=Object.prototype.hasOwnProperty.call(TYPE_LABELS,item.type)?item.type:'app';
    if(!title||!Number.isFinite(price)||price<=0||price>10000)return null;
    const rawId=clean(item.id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50);
    const url=clean(item.url).slice(0,400);
    const discount=Number(item.discount)||0;
    const mode=item.mode==='contact'?'contact':'access';
    const appSource=mode==='access'?normaliseAppCode(item.appSource):'';
    const category=clean(item.category).replace(/\s+/g,' ').slice(0,40);
    if(!Number.isInteger(discount)||discount<0||discount>90)return null;
    if(category&&category.length<2)return null;
    const published=item.published===true?true:item.published===false?false:!untouchedExample(item);
    return {id:rawId||'demo-'+Date.now(),title,description,price,discount,mode,type,category,seller:mode==='access'&&!!item.seller,appSource,url:url.startsWith('https://')?url:'',mark:clean(item.mark).slice(0,2)||title.charAt(0).toUpperCase(),tone:TYPE_TONES[type],published};
  }
  function readCatalog(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){const data=JSON.parse(raw);if(Array.isArray(data)&&data.length<=60)return data.map(normaliseProduct).filter(Boolean)}
    }catch(error){}
    return DEFAULT_PRODUCTS.map(item=>({...item,published:false}));
  }
  function saveCatalog(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(products));return true}
    catch(error){return false}
  }
  function catalogErrorText(error){
    const code=String(error?.code||'').replace(/^firestore\//,'').trim();
    const message=String(error?.message||'').trim().slice(0,180);
    if(code==='permission-denied')return 'Firebase rechazó el permiso (permission-denied). Comprueba que las reglas publicadas son las de esta versión y que ingresaste con la cuenta administradora.';
    if(code==='unavailable')return 'Firebase no está disponible (unavailable). Revisa Internet y vuelve a intentar.';
    if(code==='resource-exhausted')return 'Firebase alcanzó el límite de operaciones (resource-exhausted). Intenta más tarde.';
    if(code)return `Firebase devolvió ${code}${message?`: ${message}`:''}`;
    return message||'No se pudo publicar el catálogo. Revisa la conexión.';
  }
  async function saveCatalogToCloud(nextProducts,successMessage){
    if(catalogSaving){notify('Espera a que termine de guardarse el cambio anterior');return false}
    if(!firebaseStore||!catalogReady){notify('Espera a que se conecte el catálogo y vuelve a intentar');return false}
    catalogSaving=true;
    try{
      if(!(await firebaseStore.isAdmin())){notify('Inicia sesión como administrador para guardar');return false}
      await firebaseStore.publishCatalog(nextProducts);
      products=nextProducts;
      saveCatalog();
      renderCatalog();
      if(view==='admin')renderAdmin();
      refreshEngagement({force:true});
      notify(successMessage||'Cambios guardados en Firebase ✓');
      return true;
    }catch(error){
      console.warn('SONYER: error guardando el catálogo',error?.code||error?.message);
      const detail=catalogErrorText(error);
      const editorError=$('editorSaveError');
      if(editorError){editorError.textContent=detail;editorError.hidden=false}
      notify('No se guardó. Revisa el detalle mostrado en la pantalla.');
      return false;
    }finally{catalogSaving=false}
  }
  function readContacts(){
    try{
      const saved=JSON.parse(localStorage.getItem(CONTACT_KEY)||'null');
      if(saved&&typeof saved==='object')return {whatsapp:clean(saved.whatsapp).replace(/\D/g,'').slice(0,15)||DEFAULT_CONTACT.whatsapp,telegram:clean(saved.telegram).replace(/^@/,'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32)};
    }catch(error){}
    return {...DEFAULT_CONTACT};
  }
  function saveContacts(){try{localStorage.setItem(CONTACT_KEY,JSON.stringify(contacts));return true}catch(error){return false}}
  const whatsappLink=item=>{
    const message=item?`Hola SONYER, quiero consultar por ${item.title} (${money(discountedPrice(item))}).`:'Hola SONYER, quiero consultar por sus apps y servicios.';
    return `https://wa.me/${contacts.whatsapp}?text=${encodeURIComponent(message)}`;
  };
  const whatsappOrderLink=id=>`https://wa.me/${contacts.whatsapp}?text=${encodeURIComponent(`Hola SONYER, deseo consultar la verificación de mi pedido ${id}.`)}`;
  const telegramLink=()=>contacts.telegram?`https://t.me/${contacts.telegram}`:'';
  function updateContactLinks(){
    $('whatsappFloat').href=whatsappLink();
  }
  const contactIcon=app=>`<img class="contact-brand-icon" src="assets/${app==='telegram'?'telegram':'whatsapp'}.webp" alt="" aria-hidden="true" width="21" height="21">`;
  function stopVoucherAnimations(){
    clearTimeout(voucherConfettiTimer);
    voucherConfettiTimer=null;
    voucherCheckAnimation?.destroy?.();
    voucherCheckAnimation=null;
    voucherConfettiAnimation?.destroy?.();
    voucherConfettiAnimation=null;
    dialog.querySelector('#voucherConfetti')?.remove();
  }
  function animateVoucherCheck(id){
    const target=$(id);
    if(!target||!window.lottie||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    try{
      const animation=window.lottie.loadAnimation({
        container:target,renderer:'svg',loop:true,autoplay:true,
        path:'assets/Check_Logo_bucher.json'
      });
      voucherCheckAnimation=animation;
      animation.addEventListener('DOMLoaded',()=>{
        if(target.isConnected&&voucherCheckAnimation===animation)target.classList.add('check-is-ready');
      });
      animation.addEventListener('data_failed',()=>target.classList.remove('check-is-ready'));
    }catch(error){console.warn('SONYER: animación del check no disponible',error?.message)}
  }
  function fallbackVoucherConfetti(layer){
    const colors=['#a77bff','#6ee7c9','#ffd76a','#ff8da9','#ffffff'];
    for(let i=0;i<52;i++){
      const piece=document.createElement('i');
      piece.className='voucher-confetti-piece';
      piece.style.cssText=`--left:${Math.random()*100}%;--delay:${Math.random()*.6}s;--duration:${1.5+Math.random()*1.2}s;--drift:${Math.random()*180-90}px;--spin:${Math.random()*720-360}deg;background:${colors[i%colors.length]}`;
      layer.appendChild(piece);
    }
  }
  function celebrateApprovedPurchase(){
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    const layer=document.createElement('div');
    layer.id='voucherConfetti';
    layer.className='voucher-confetti';
    layer.setAttribute('aria-hidden','true');
    dialog.appendChild(layer);
    if(window.lottie&&window.__YAPE_CONFETTI_DATA){
      try{
        const animationData=JSON.parse(JSON.stringify(window.__YAPE_CONFETTI_DATA));
        voucherConfettiAnimation=window.lottie.loadAnimation({
          container:layer,renderer:'canvas',loop:false,autoplay:true,animationData
        });
        voucherConfettiAnimation.addEventListener('data_failed',()=>{
          if(layer.isConnected)fallbackVoucherConfetti(layer);
        });
      }catch(error){fallbackVoucherConfetti(layer)}
    }else fallbackVoucherConfetti(layer);
    voucherConfettiTimer=setTimeout(()=>{
      voucherConfettiAnimation?.destroy?.();
      voucherConfettiAnimation=null;
      layer.remove();
      voucherConfettiTimer=null;
    },3200);
  }
  function readPayment(){
    try{
      const saved=JSON.parse(localStorage.getItem(PAYMENT_KEY)||'null');
      if(saved&&typeof saved==='object'){
        const name=clean(saved.name).slice(0,100);
        const qr=String(saved.qr||'');
        const validQr=qr===DEFAULT_PAYMENT.qr||(/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(qr)&&qr.length<1300000);
        if(name&&validQr)return {name,qr};
      }
    }catch(error){}
    return {...DEFAULT_PAYMENT};
  }
  function savePayment(){
    try{localStorage.setItem(PAYMENT_KEY,JSON.stringify(payment));return true}
    catch(error){return false}
  }
  function readPurchases(){
    try{
      const raw=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
      if(Array.isArray(raw))return raw.slice(0,25).filter(item=>item&&typeof item==='object'&&['pendiente','aprobado','aprobado-ejemplo','correccion'].includes(item.status))
        .map(item=>({id:clean(item.id).slice(0,80),title:clean(item.title).slice(0,70),productId:clean(item.productId).slice(0,50),appUrl:clean(item.appUrl).startsWith('https://')?clean(item.appUrl).slice(0,400):'',price:Number(item.price)||0,status:item.status,date:clean(item.date).slice(0,35),approvedAt:clean(item.approvedAt).slice(0,35)})).filter(item=>item.id&&item.title);
    }catch(error){}
    return [];
  }
  function savePurchases(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(purchases.slice(0,25)))}catch(error){}updatePurchaseCount()}
  function updatePurchaseCount(){
    const count=$('purchaseCount');if(!count)return;
    const n=purchases.length;count.textContent=String(Math.min(n,99));count.hidden=!n;
  }
  function trackPurchase(){
    const id=`order-${Date.now()}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2,12)}`;
    purchases.unshift({id,title:chosen.title,productId:chosen.id,appUrl:chosen.url||'',price:order.price,date:new Date().toISOString(),status:'pendiente'});
    sessionAccess.set(id,{url:chosen.url,user:order.user,storedUser:order.storedUser,password:order.password,email:order.email,seller:order.seller});
    purchases=purchases.slice(0,25);order.purchaseId=id;savePurchases();
  }
  function watchKnownOrder(id){
    if(!firebaseStore||stopKnownOrders.has(id)||!/^order-[a-z0-9-]{14,80}$/.test(id))return;
    try{
      const stop=firebaseStore.watchOrder(id,data=>{
        if(!data)return;
        const approved=data.status==='approved' && data.accountApproved===true;
        const pending=data.status==='pending';
        if(!approved&&!pending)return;
        const iso=data.approvedAt?.toDate?.()?.toISOString?.()||'';
        const existing=purchases.find(p=>p.id===id);
        if(!existing)return;
        purchases=purchases.map(p=>p.id===id?{...p,status:approved?'aprobado':'pendiente',approvedAt:approved?(iso||p.approvedAt):p.approvedAt}:p);
        savePurchases();
        if(approved&&order?.purchaseId===id&&(view==='waiting'||view==='loading')){
          clearTimeout(loadingTimeout);
          renderSuccess(true);
        }else if(view==='history')renderPurchases();
        else if(view==='history-detail')renderPurchaseDetail(id);
      },error=>console.warn('SONYER: sin lectura del estado del pedido',error?.code||error?.message));
      stopKnownOrders.set(id,stop);
    }catch(error){console.warn('SONYER: no se pudo vigilar el pedido',error?.message)}
  }
  async function submitPendingOrder(){
    if(!firebaseStore){
      firebaseState='sin conexión';
      cloudOrderError='No pudimos conectarnos. Revisa tu conexión a internet.';
      return false;
    }
    try {
      await Promise.race([
        firebaseStore.submitOrder({id:order.purchaseId,productId:chosen.id,productTitle:chosen.title,total:order.price,payerName:order.name,account:order.account}),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tiempo de conexión agotado')),8000))
      ]);
      cloudOrderIds.add(order.purchaseId);
      watchKnownOrder(order.purchaseId);
      firebaseState='conectado';
      cloudOrderError='';
      updatePurchaseStatus('pendiente');
      return true;
    } catch(error){
      firebaseState='error de envío';
      const code=String(error?.code||'');
      const detail=String(error?.message||'').slice(0,220);
      cloudOrderError=detail.startsWith('El producto o su precio')?detail:
        code==='permission-denied'||code==='firestore/permission-denied'
          ?'No pudimos enviar tu solicitud en este momento. Contacta a soporte con tu número de pedido.':
        code==='unauthenticated'||code==='firestore/unauthenticated'
          ?'Tu sesión ha caducado. Vuelve a iniciar sesión.':
        detail==='Tiempo de conexión agotado'
          ?'La conexión tardó demasiado. Puedes reintentar sin realizar otro pago.':
        'Ocurrió un problema al registrar tu solicitud. Intenta nuevamente o contacta a soporte.';
      updatePurchaseStatus('correccion');
      console.warn('SONYER: la solicitud no llegó a Firestore',error?.code||error?.message);
      return false;
    }
  }
  function firebaseStatusText(){
    return firebaseState==='conectado'?'Conectado a Firebase · login-48d79':
      firebaseState==='conectando'?'Conectando a Firebase…':
      'Sin sincronización con Firebase';
  }
  function updatePurchaseStatus(status){
    if(!order?.purchaseId)return;
    purchases=purchases.map(item=>item.id===order.purchaseId?{...item,status,approvedAt:status==='aprobado-ejemplo'?new Date().toISOString():item.approvedAt}:item);
    savePurchases();
  }
  const dateLabel=iso=>{
    const date=new Date(iso);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'}).format(date):'Sin fecha';
  };
  const statusLabel=status=>status==='aprobado'?'Aprobado por aviso':status==='aprobado-ejemplo'?'Aprobado · Ejemplo':status==='correccion'?'Por corregir':'Pendiente';
  function notify(message){
    toastNode.textContent=message;
    toastNode.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout=setTimeout(()=>toastNode.classList.remove('show'),2200);
  }
  async function copyText(value){
    if(!value){notify('Todavía no hay datos para copiar');return}
    try{
      if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value)}
      else{
        const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();
        if(!document.execCommand('copy'))throw Error('copy unavailable');field.remove();
      }
      notify('Copiado correctamente ✓');
    }catch(error){notify('Mantén pulsado el texto para copiarlo')}
  }
  function prettyCount(value){return Number(value).toLocaleString('es-PE')}
  function metricText(id,kind){
    const count=engagementStats.get(id)?.[kind];
    return Number.isSafeInteger(count)?prettyCount(count):'—';
  }
  function popularityScore(item){
    const stats=engagementStats.get(item.id);
    if(!stats)return 0;
    return Math.max(0,Number(stats.likes)||0)*4+Math.max(0,Number(stats.views)||0);
  }
  function normaliseOpinion(item){
    if(!item||typeof item!=='object')return null;
    const id=clean(item.id).slice(0,80),productId=clean(item.productId).slice(0,50);
    const text=clean(item.text).slice(0,280),createdAt=clean(item.createdAt).slice(0,35);
    if(!/^[a-zA-Z0-9_-]{6,80}$/.test(id)||!/^[a-zA-Z0-9_-]{1,50}$/.test(productId)||text.length<12)return null;
    return {id,productId,text,createdAt};
  }
  function reviewCardMarkup(productId){
    const current=opinions.find(item=>item.productId===productId);
    if(!current)return '';
    return `<div class="product-opinion"><span class="opinion-by">✎ COMENTARIO DE SONYER</span><p>${esc(current.text)}</p></div>`;
  }
  async function saveOpinionsToCloud(items){
    if(opinionsSaving){notify('Espera mientras guardamos el comentario anterior');return false}
    if(!firebaseStore?.publishOpinions){notify('Espera a que se conecte Firebase');return false}
    opinionsSaving=true;
    try{
      if(!(await firebaseStore.isAdmin())){notify('Solo el administrador puede escribir comentarios');return false}
      await firebaseStore.publishOpinions(items);
      opinions=items;
      renderCatalog();
      return true;
    }catch(error){
      console.warn('SONYER: error publicando comentario',error?.code||error?.message);
      notify('No se guardó el comentario. Revisa tu conexión y permisos.');
      return false;
    }finally{opinionsSaving=false}
  }
  function renderPopularShowcase(){
    const section=$('popularShowcase');
    if(!section)return;
    const previousScroll=section.querySelector('.popular-cards')?.scrollLeft||0;
    // Never invent popularity. Hide this block until there are real reactions
    // or visits to rank, and keep search/category results uncluttered.
    const popular=filter==='todos'&&!search.trim()
      ?products.filter(item=>isPublicProduct(item)&&popularityScore(item)>0)
        .sort((a,b)=>popularityScore(b)-popularityScore(a)).slice(0,3)
      :[];
    section.hidden=popular.length===0;
    if(!popular.length){section.innerHTML='';return}
    section.innerHTML=`<div class="popular-head"><div><span class="popular-kicker">★ TENDENCIAS EN SONYER</span><h3>Los más populares</h3><p>Según visitas y corazones de personas reales</p></div><span class="popular-live-dot" aria-hidden="true"></span></div>
      <div class="popular-cards" id="popularCards" tabindex="0" role="region" aria-label="Aplicaciones populares, desliza horizontalmente">${popular.map((item,index)=>{
        const artwork=artworkForProduct(item);
        return `<button type="button" class="popular-card" data-buy="${esc(item.id)}" aria-label="Ver ${esc(item.title)}, popular número ${index+1}">
          <span class="popular-rank">#${index+1}</span>
          <span class="popular-art${artwork?' has-image':''}">${artwork?`<img src="${artwork.path}" alt="" loading="lazy" decoding="async">`:esc(item.mark)}</span>
          <span class="popular-info"><strong>${esc(item.title)}</strong><small>♥ <span data-like-count="${esc(item.id)}">${metricText(item.id,'likes')}</span> · ◉ <span data-view-count="${esc(item.id)}">${metricText(item.id,'views')}</span></small></span>
          <span class="popular-arrow" aria-hidden="true">↗</span>
        </button>`}).join('')}</div><p class="popular-scroll-hint">Las recomendaciones avanzan automáticamente. También puedes deslizar.</p>`;
    const track=section.querySelector('.popular-cards');
    track.scrollLeft=previousScroll;
  }
  function engagementMarkup(item){
    const liked=likedProducts.has(item.id);
    return `<div class="product-social"><button class="product-like${liked?' is-liked':''}" type="button" data-like="${esc(item.id)}" aria-pressed="${liked}" aria-label="${liked?'Quitar corazón de':'Dar corazón a'} ${esc(item.title)}" title="Me gusta">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 21.1 3.3 12.8A5.8 5.8 0 0 1 11.8 5l.2.2.2-.2a5.8 5.8 0 0 1 8.5 7.8L12 21.1Z"/></svg>
      <span data-like-count="${esc(item.id)}">${metricText(item.id,'likes')}</span></button>
      <span class="product-view-stat" title="Personas que abrieron este servicio"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.7"/></svg><span data-view-count="${esc(item.id)}">${metricText(item.id,'views')}</span></span></div>`;
  }
  function paintEngagement(){
    document.querySelectorAll('[data-like-count]').forEach(el=>{el.textContent=metricText(el.dataset.likeCount,'likes')});
    document.querySelectorAll('[data-view-count]').forEach(el=>{el.textContent=metricText(el.dataset.viewCount,'views')});
    document.querySelectorAll('[data-like]').forEach(button=>{
      const id=button.dataset.like,liked=likedProducts.has(id);
      button.classList.toggle('is-liked',liked);
      button.classList.toggle('is-busy',engagementPending.has(id));
      button.setAttribute('aria-pressed',String(liked));
      button.setAttribute('aria-label',`${liked?'Quitar corazón de':'Dar corazón a'} ${products.find(item=>item.id===id)?.title||'esta aplicación'}`);
      button.disabled=engagementPending.has(id);
    });
    document.querySelectorAll('[data-admin-like-count]').forEach(el=>{el.textContent=metricText(el.dataset.adminLikeCount,'likes')});
    document.querySelectorAll('[data-admin-view-count]').forEach(el=>{el.textContent=metricText(el.dataset.adminViewCount,'views')});
  }
  async function refreshEngagement({force=false,ids=null}={}){
    if(!firebaseStore?.getEngagement||document.hidden)return;
    if(engagementRefreshing){engagementRefreshQueued=true;return}
    engagementRefreshing=true;
    try{
      const now=Date.now();
      const selected=ids?new Set(ids):null;
      const items=products.filter(item=>isPublicProduct(item)&&(!selected||selected.has(item.id))
        &&(force||!engagementUpdatedAt.has(item.id)||now-engagementUpdatedAt.get(item.id)>180000)).slice(0,60);
      if(!items.length)return;
      // Read server-side counts, not every visitor document.
      const results=await Promise.allSettled(items.map(item=>firebaseStore.getEngagement(item.id)));
      results.forEach((result,index)=>{
        if(result.status!=='fulfilled')return;
        const id=items[index].id,stats=result.value;
        engagementStats.set(id,{likes:stats.likes,views:stats.views});
        engagementUpdatedAt.set(id,Date.now());
        if(!engagementPending.has(id)){
          if(stats.liked)likedProducts.add(id);else likedProducts.delete(id);
        }
      });
      if(sortMode==='popular')renderCatalog();else{paintEngagement();renderPopularShowcase()}
    }finally{
      engagementRefreshing=false;
      if(engagementRefreshQueued){engagementRefreshQueued=false;void refreshEngagement({force:true})}
    }
  }
  async function toggleProductLike(id){
    if(!firebaseStore?.toggleEngagementLike){notify('Los corazones no están disponibles por ahora');return}
    if(engagementPending.has(id))return;
    const originallyLiked=likedProducts.has(id);
    const prev=engagementStats.get(id);
    engagementPending.add(id);
    if(originallyLiked)likedProducts.delete(id);else likedProducts.add(id);
    if(prev)engagementStats.set(id,{...prev,likes:Math.max(0,prev.likes+(originallyLiked?-1:1))});
    paintEngagement();renderPopularShowcase();
    try{
      const saved=await firebaseStore.toggleEngagementLike(id);
      if(saved)likedProducts.add(id);else likedProducts.delete(id);
      await refreshEngagement({force:true,ids:[id]});
    }catch(error){
      if(originallyLiked)likedProducts.add(id);else likedProducts.delete(id);
      if(prev)engagementStats.set(id,prev);
      notify('No pudimos guardar tu corazón. Intenta nuevamente.');
      console.warn('SONYER: reacción no guardada',error?.code||error?.message);
    }finally{engagementPending.delete(id);if(sortMode==='popular')renderCatalog();else{paintEngagement();renderPopularShowcase()}}
  }
  function prepareCatalogPreviews(){
    catalogPreviewObserver?.disconnect();
    catalogPreviewObserver=null;
    const previews=[...document.querySelectorAll('[data-catalog-preview]')];
    if(!previews.length||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    if(!('IntersectionObserver' in window))return;
    catalogPreviewObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        const preview=entry.target;
        clearTimeout(preview.sonyerPreviewTimer);
        if(entry.isIntersecting&&!document.hidden){
          preview.sonyerPreviewTimer=setTimeout(()=>{
            if(!preview.isConnected||document.hidden)return;
            if(preview.tagName!=='VIDEO'){
              preview.classList.add('is-playing');
              return;
            }
            if(!preview.src)preview.src=preview.dataset.src;
            // Muted inline preview: the supplied still image stays visible
            // until the browser confirms that video playback has started.
            const playback=preview.play();
            playback?.catch?.(()=>preview.classList.remove('is-playing'));
          },3000);
        }else{
          preview.classList.remove('is-playing');
          if(preview.tagName==='VIDEO'){
            preview.pause();
            try{preview.currentTime=0}catch(error){}
          }
        }
      });
    },{threshold:.4});
    previews.forEach(preview=>{
      if(preview.tagName==='VIDEO')preview.addEventListener('playing',()=>preview.classList.add('is-playing'));
      catalogPreviewObserver.observe(preview);
    });
  }
  function renderCatalog(){
    const publicProducts=products.filter(isPublicProduct);
    const types=new Set(publicProducts.map(item=>item.type));
    const filtersNode=$('filters');
    filtersNode.querySelectorAll('.custom-category-chip').forEach(button=>button.remove());
    const categories=new Map();
    publicProducts.forEach(item=>{if(item.category)categories.set(categoryFilterKey(item.category),item.category)});
    [...categories].sort((a,b)=>a[1].localeCompare(b[1],'es')).forEach(([key,label])=>{
      const button=document.createElement('button');
      button.className='chip custom-category-chip';button.dataset.filter=key;
      button.textContent=label;filtersNode.appendChild(button);
    });
    document.querySelectorAll('#filters [data-filter]:not(.custom-category-chip)').forEach(button=>{
      button.hidden=button.dataset.filter!=='todos'&&!types.has(button.dataset.filter);
    });
    if(filter!=='todos'&&!types.has(filter)&&!categories.has(filter))filter='todos';
    document.querySelectorAll('#filters [data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter===filter));
    const result=publicProducts.filter(item=>(filter==='todos'||item.type===filter||(!!item.category&&categoryFilterKey(item.category)===filter))&&(`${item.title} ${item.description} ${item.category||''}`).toLowerCase().includes(search.toLowerCase()));
    if(sortMode==='popular')result.sort((a,b)=>popularityScore(b)-popularityScore(a));
    renderPopularShowcase();
    $('catalog').innerHTML=result.length?result.map(item=>{
      const artwork=artworkForProduct(item);
      return `
      <article class="product"><button class="product-main" type="button" data-buy="${esc(item.id)}" aria-label="Ver ${esc(item.title)} y ${item.mode==='contact'?'consultar':'comprar acceso'}">
        <span class="cover ${esc(item.tone)}${artwork?' has-catalog-artwork':''}">${artwork?`<img class="catalog-artwork catalog-artwork-${artwork.source}" src="${artwork.path}" alt="" loading="lazy" decoding="async">${CATALOG_SECONDARY_ARTWORK[artwork.source]?`<img class="catalog-preview-image catalog-preview-${artwork.source}" data-catalog-preview src="${CATALOG_SECONDARY_ARTWORK[artwork.source]}" alt="" loading="lazy" decoding="async" aria-hidden="true">`:''}${CATALOG_PREVIEW_VIDEOS[artwork.source]?`<video class="catalog-preview-video${artwork.source==='instagram'?' catalog-preview-portrait':''}" data-catalog-preview data-src="${CATALOG_PREVIEW_VIDEOS[artwork.source]}" preload="none" muted playsinline loop disablepictureinpicture aria-hidden="true"></video>`:''}`:''}<span class="product-tag">${esc(categoryTitle(item))}</span>${item.discount?`<span class="sale-badge">${discountText(item)}</span>`:''}${artwork?'':`<span class="cover-art"><span>${esc(item.mark)}</span></span>`}</span>
        <span class="product-body"><span class="product-title">${esc(item.title)}</span><span class="product-desc">${esc(item.description)}</span>
          <span class="product-foot"><span><span class="price-label">${item.discount?'Precio de oferta':'Precio'}</span>${item.discount?`<span class="old-price">${money(item.price)}</span>`:''}<span class="price" style="display:block">${money(discountedPrice(item))}</span></span><span class="buy-action">${item.mode==='contact'?'Consultar ↗':'Comprar ↗'}</span></span>
        </span>
      </button>${engagementMarkup(item)}${reviewCardMarkup(item.id)}</article>`;
    }).join(''):`<div class="empty">${publicProducts.length?'No encontramos apps o servicios con ese nombre.':'Pronto encontrarás aquí nuestras aplicaciones y servicios disponibles.'}</div>`;
    prepareCatalogPreviews();
  }
  function productGallerySlides(item){
    const artwork=artworkForProduct(item);
    if(!artwork)return [];
    const slides=[{type:'image',src:artwork.path}];
    if(CATALOG_SECONDARY_ARTWORK[artwork.source])slides.push({type:'image',src:CATALOG_SECONDARY_ARTWORK[artwork.source]});
    if(CATALOG_PREVIEW_VIDEOS[artwork.source])slides.push({type:'video',src:CATALOG_PREVIEW_VIDEOS[artwork.source]});
    return slides;
  }
  function openProductGallery(productId,initialIndex=0){
    const item=products.find(product=>product.id===productId);
    if(!item||!isPublicProduct(item))return;
    const slides=productGallerySlides(item);
    if(!slides.length){beginPurchase(item.id);return}
    let selected=Math.max(0,Math.min(slides.length-1,initialIndex));
    view='product-gallery';fullScreen();heading('GALERÍA · SONYER STORE',item.title);
    body.innerHTML=`<div class="product-gallery">
      <div class="gallery-heading"><strong>${esc(item.title)}</strong><span>Imágenes y videos del servicio</span></div>
      <div id="galleryStage" class="gallery-stage" role="region" aria-label="Vista ampliada de ${esc(item.title)}"></div>
      <div class="gallery-controls"><button class="gallery-nav" id="galleryPrevious" type="button" aria-label="Ver foto anterior">‹</button><span id="galleryCount" class="gallery-count" aria-live="polite"></span><button class="gallery-nav" id="galleryNext" type="button" aria-label="Ver foto siguiente">›</button></div>
      <p class="gallery-hint">Desliza hacia los lados para ver más imágenes. Cierra con la ✕ superior.</p>
      <button id="galleryGoToProduct" type="button" class="primary gallery-action">${item.mode==='contact'?'Consultar este servicio ↗':'Ver detalles y comprar ↗'}</button>
    </div>`;
    const stage=$('galleryStage');
    const renderSlide=()=>{
      const current=slides[selected];
      stage.innerHTML=current.type==='video'
        ?`<video class="gallery-media" src="${esc(current.src)}" controls playsinline preload="metadata" aria-label="Video ${selected+1} de ${slides.length}"></video>`
        :`<img class="gallery-media" src="${esc(current.src)}" alt="${esc(item.title)} · Imagen ${selected+1} de ${slides.length}" decoding="async">`;
      $('galleryCount').textContent=`${selected+1} / ${slides.length}`;
      $('galleryPrevious').disabled=selected===0;
      $('galleryNext').disabled=selected===slides.length-1;
    };
    const move=increment=>{selected=Math.max(0,Math.min(slides.length-1,selected+increment));renderSlide()};
    $('galleryPrevious').addEventListener('click',()=>move(-1));
    $('galleryNext').addEventListener('click',()=>move(1));
    $('galleryGoToProduct').addEventListener('click',()=>{closeModal();beginPurchase(item.id)});
    let startX=null;
    stage.addEventListener('touchstart',event=>{startX=event.changedTouches[0]?.clientX??null},{passive:true});
    stage.addEventListener('touchend',event=>{
      const endX=event.changedTouches[0]?.clientX;
      if(startX!==null&&endX!==undefined&&Math.abs(endX-startX)>55)move(endX<startX?1:-1);
      startX=null;
    },{passive:true});
    renderSlide();openModal();
  }
  function openModal(){
    overlay.classList.add('open');
    document.body.style.overflow='hidden';
    $('closeModal').focus();
  }
  function closeModal(){
    clearTimeout(loadingTimeout);
    stopVoucherAnimations();
    body.querySelector('.gallery-stage video')?.pause();
    if(stopAdminOrders){stopAdminOrders();stopAdminOrders=null}
    overlay.classList.remove('open');
    overlay.classList.remove('success-screen');
    overlay.classList.remove('full-screen');
    document.body.style.overflow='';
    dialog.classList.remove('admin-dialog');
    dialog.classList.remove('success-dialog');
    dialog.classList.remove('history-dialog');
    dialog.classList.remove('full-dialog');
    if(order){order.password='';order=null}
    chosen=null;view='';
  }
  function heading(step,title){$('modalStep').textContent=step;$('modalTitle').textContent=title}
  function fullScreen(){overlay.classList.add('full-screen');dialog.classList.add('full-dialog')}
  function progress(step){return `<div class="progress" aria-label="Paso ${step} de 3"><span class="active"></span><span class="${step>=2?'active':''}"></span><span class="${step>=3?'active':''}"></span></div>`}
  function summary(){return `<div class="summary"><span><strong>${esc(chosen.title)}</strong><small>Acceso digital</small></span><span class="money">${money(discountedPrice(chosen))}</span></div>`}

  function beginPurchase(id){
    chosen=products.find(item=>item.id===id);
    if(!chosen||!isPublicProduct(chosen))return;
    if(chosen.mode==='access'&&!/^[A-Za-z0-9]{2,24}$/.test(chosen.appSource)){
      notify('Esta aplicación todavía no tiene código de registro');
      return;
    }
    if(firebaseStore?.recordUniqueView){
      const viewedId=chosen.id;
      firebaseStore.recordUniqueView(viewedId).then(added=>{if(added)refreshEngagement({force:true,ids:[viewedId]})})
        .catch(error=>console.warn('SONYER: no se pudo contar la visita',error?.code||error?.message));
    }
    cloudOrderError='';order=null;view='register';dialog.classList.remove('admin-dialog');
    if(chosen.mode==='contact')renderServiceContact();else renderRegister();
    openModal();
  }
  function renderServiceContact(){
    view='service-contact';heading('SONYER · APPS Y SERVICIOS','Detalle del servicio');
    body.innerHTML=`<div class="service-contact"><div class="service-topline"><span class="service-icon ${esc(chosen.tone)}">${esc(chosen.mark)}</span><span class="service-category">${TYPE_LABELS[chosen.type]}</span></div>
      <h3>${esc(chosen.title)}</h3><p>${esc(chosen.description)}</p>
      <div class="service-price-box"><span>${chosen.discount?'Precio promocional':'Precio publicado'}</span><div>${chosen.discount?`<del>${money(chosen.price)}</del><strong>${money(discountedPrice(chosen))}</strong><span class="sale-pill">${discountText(chosen)}</span>`:`<strong>${money(chosen.price)}</strong>`}</div></div>
      <p class="service-help">Consulta disponibilidad, entrega y detalles directamente con SONYER.</p>
      <div class="service-contact-actions"><a class="primary contact-primary" href="${esc(whatsappLink(chosen))}" target="_blank" rel="noopener noreferrer">${contactIcon('whatsapp')} Consultar por WhatsApp ↗</a>${contacts.telegram?`<a class="secondary contact-primary" href="${esc(telegramLink())}" target="_blank" rel="noopener noreferrer">${contactIcon('telegram')} Contactar por Telegram ↗</a>`:''}</div>
      <button class="secondary service-close" id="serviceClose" type="button">Volver al catálogo</button></div>`;
    $('serviceClose').addEventListener('click',closeModal);
  }
  function renderRegister(){
    view='register';heading('PASO 1 DE 3','Crear cuenta');
    body.innerHTML=progress(1)+summary()+`
      <form id="accountForm" autocomplete="off"><div class="form-grid">
        ${(chosen.seller||chosen.appSource)?'<div class="field wide"><label for="seller">ID del vendedor (MAYÚSCULAS)</label><input id="seller" name="seller" placeholder="SONYER" value="SONYER" maxlength="32" autocapitalize="characters" spellcheck="false" style="text-transform:uppercase" required><small class="field-help">Usa SONYER si es el ID indicado para tu aplicación.</small></div>':''}
        <div class="field wide"><label for="user">Nombre de usuario</label><input id="user" name="user" placeholder="Tu usuario" minlength="3" maxlength="35" required></div>
        <div class="field wide"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres" minlength="6" maxlength="60" required></div>
        <div class="field wide"><label for="email">Correo de recuperación</label><input id="email" name="email" type="email" autocomplete="off" placeholder="correo@ejemplo.com" required></div>
      </div>
      <button class="primary" id="registerAccountBtn" style="width:100%" type="submit">Registrar y continuar →</button></form>`;
    if(chosen.seller||chosen.appSource){$('seller').addEventListener('input',event=>{event.target.value=event.target.value.toUpperCase()})}
    $('user').addEventListener('input',event=>{event.target.value=event.target.value.toLowerCase()});
    $('accountForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(!event.currentTarget.reportValidity())return;
      const data=new FormData(event.currentTarget);
      const user=clean(data.get('user')).toLowerCase();
      const next={seller:clean(data.get('seller')).toUpperCase(),user,storedUser:storedUsername(chosen.appSource,user),password:String(data.get('password')),email:clean(data.get('email')).toLowerCase(),name:'',code:'',price:discountedPrice(chosen)};
      const button=$('registerAccountBtn');button.disabled=true;button.textContent='Comprobando cuenta…';
      try{
        if(!firebaseStore)throw new Error('No pudimos conectarnos. Revisa tu conexión a internet.');
        next.account=await firebaseStore.linkOrCreateAppAccount({appCode:chosen.appSource,
          seller:next.seller,username:next.user,email:next.email,password:next.password});
        order=next;renderPayment();
        notify(next.account.created?'Cuenta creada y pendiente de aprobación':'Cuenta pendiente encontrada ✓');
      }catch(error){
        notify(String(error?.message||'Error de registro').slice(0,140));
        button.disabled=false;button.textContent='Registrar y continuar →';
      }
    });
  }
  function renderPayment(){
    view='payment';heading('PASO 2 DE 3','Realizar tu pago');
    body.innerHTML=progress(2)+summary()+`
      <div class="payment-amount"><small>Monto fijo de la compra</small><b>${money(order.price)}</b><small>Debe coincidir exactamente con el pago recibido</small></div>
      <h3 class="payment-title">Escanea el QR para pagar</h3>
      <p class="payment-sub">Titular receptor: <strong>${esc(payment.name)}</strong></p>
      <div class="qr-box"><img src="${esc(payment.qr)}" alt="QR de cobro de SONYER"></div>
      <div style="text-align:center"><a class="qr-save" href="${esc(payment.qr)}" download="SONYER-QR-Moni.jpg">↓ Guardar QR</a></div>
      <div class="payment-verify-tip"><span class="payment-verify-icon" aria-hidden="true">✓</span><span><strong>Ayúdanos a verificar tu pago</strong><small>Ingresa el nombre completo de quien realizó la transferencia, tal como aparece en su billetera digital o banco.</small></span></div>
      <div class="field"><label for="payer">Nombre completo del pagador</label><input id="payer" placeholder="Escribe tu nombre y apellidos completos" value="${esc(order.name||'')}" maxlength="110" autocomplete="name" required><small class="field-help">El nombre debe coincidir con el de la persona que pagó.</small></div>
      <div class="field"><label for="code">Número de operación (opcional)</label><input id="code" placeholder="Solo si aparece en tu comprobante" value="${esc(order.code||'')}" maxlength="20" autocomplete="off"></div>
      <div class="subtle-disclaimer">El pedido se enviará como pendiente. «Ya pagué» no confirma una transferencia ni habilita el acceso.</div>
      <div class="modal-actions"><button class="secondary" id="back" type="button">← Volver</button><button class="primary" id="paid" type="button">Ya pagué →</button></div>`;
    $('back').addEventListener('click',renderRegister);
    $('paid').addEventListener('click',async()=>{
      const name=clean($('payer').value).replace(/\s+/g,' ');
      if(name.length<5){$('payer').setCustomValidity('Escribe el nombre completo del pagador');$('payer').reportValidity();$('payer').setCustomValidity('');return}
      order.name=name;order.code=clean($('code').value);
      if(!order.purchaseId)trackPurchase();else updatePurchaseStatus('pendiente');
      renderLoading();
      await submitPendingOrder();
      if(view==='loading')loadingTimeout=setTimeout(renderWaiting,500);
    });
  }
  function renderLoading(){
    stopVoucherAnimations();
    view='loading';fullScreen();heading('SONYER STORE','Tu solicitud');
    body.innerHTML=`<section class="approval-screen" aria-live="polite"><div class="approval-stage"><div class="approval-ring" aria-hidden="true"><span class="approval-ring-core">S</span></div><span class="approval-eyebrow">UN MOMENTO</span><h3>Registrando tu solicitud</h3><p>Estamos enviando los datos de tu compra para su verificación. No necesitas realizar otro pago.</p></div></section><button class="mistake-link" id="wrongLoading" type="button">✕ Corregir datos</button>`;
    $('wrongLoading').addEventListener('click',renderCorrection);
  }
  function renderWaiting(){
    if(view!=='loading')return;
    stopVoucherAnimations();
    view='waiting';fullScreen();heading('SONYER STORE','Tu solicitud');
    const saved=cloudOrderIds.has(order.purchaseId);
    body.innerHTML=`<section class="approval-screen" aria-live="polite">
      <div class="approval-stage ${saved?'':'approval-stage-error'}">
        ${saved?'<div class="approval-ring" aria-hidden="true"><span class="approval-ring-core receipt-check-holder" id="pendingVoucherCheck"><span class="check-fallback">✓</span></span></div>':'<span class="approval-error-icon" aria-hidden="true">!</span>'}
        <span class="approval-eyebrow">${saved?'SOLICITUD RECIBIDA':'ATENCIÓN A TU SOLICITUD'}</span>
        <h3>${saved?'Estamos verificando tu compra':'No pudimos registrar tu solicitud'}</h3>
        <p>${saved?'Por favor, no cierres esta pantalla. Estamos verificando tu pago y la solicitud de acceso. Espera unos minutos más; aquí te avisaremos cuando sea aprobado.':'Si ya realizaste el pago, no vuelvas a pagar. Puedes intentar enviar esta misma solicitud nuevamente.'}</p>
        ${saved?`<div class="approval-message-cycle" aria-hidden="true"><span>No cierres esta pantalla mientras revisamos tu solicitud.</span><span>Estamos verificando tu compra. Un momento más, por favor.</span><span>Tu acceso sigue pendiente. Te avisaremos al aprobarse.</span></div>`:''}
        ${saved?'<div class="approval-progress"><span class="done">✓ Solicitud enviada</span><span class="current">◉ Verificación en curso</span><span>○ Acceso habilitado</span></div>':''}
        <span class="approval-status"><span class="approval-status-dot" aria-hidden="true"></span>${saved?'Pendiente de aprobación':'Necesita revisión'}</span>
      </div>
      <div class="approval-receipt"><div class="approval-receipt-head"><span>Resumen de tu pedido</span><strong>SONYER</strong></div><div class="approval-receipt-row"><span>Aplicación</span><strong>${esc(chosen.title)}</strong></div><div class="approval-receipt-row"><span>Importe</span><strong>${money(order.price)}</strong></div><div class="approval-receipt-row"><span>Pagador</span><strong>${esc(order.name)}</strong></div></div>
      <details class="approval-order-detail"><summary>Ver número de pedido</summary><div class="approval-order-id"><span>N.º ${esc(order.purchaseId)}</span><button id="copyPendingId" type="button">Copiar</button></div></details>
      ${saved?'<p class="approval-auto-note"><span class="approval-status-dot" aria-hidden="true"></span>Esta pantalla se actualizará automáticamente al aprobarse tu acceso.</p>':`<p class="approval-error-detail">${esc(cloudOrderError||'Verifica tu conexión e intenta nuevamente.')}</p>`}
      <div class="approval-buttons">${saved?'':'<button id="retryOrder" class="primary" type="button">↻ Reintentar envío</button>'}<a class="${saved?'primary':'secondary'} contact-primary" href="${esc(whatsappOrderLink(order.purchaseId))}" target="_blank" rel="noopener noreferrer">${contactIcon('whatsapp')} Consultar con soporte ↗</a></div>
      <button id="wrongWaiting" class="approval-minor-link" type="button">Necesito corregir mis datos</button>
    </section>`;
    if(!saved)$('retryOrder').addEventListener('click',async()=>{
      renderLoading();await submitPendingOrder();if(view==='loading')renderWaiting();
    });
    $('copyPendingId').addEventListener('click',()=>copyText(order.purchaseId));
    $('wrongWaiting').addEventListener('click',renderCorrection);
    if(saved)animateVoucherCheck('pendingVoucherCheck');
  }
  function renderCorrection(){
    clearTimeout(loadingTimeout);
    stopVoucherAnimations();
    overlay.classList.remove('full-screen');dialog.classList.remove('full-dialog');
    const alreadySent=!!order?.purchaseId&&cloudOrderIds.has(order.purchaseId);
    if(!alreadySent)updatePurchaseStatus('correccion');
    view='correction';heading('REVISAR SOLICITUD','¿Te equivocaste?');
    body.innerHTML=`<div class="pending-state correction-state"><span class="error-mark" aria-hidden="true">✕</span><h3>Revisa los datos</h3><p>${alreadySent?'El pedido ya está enviado. Para evitar dos aprobaciones por el mismo pago, solicita la corrección a SONYER indicando tu ID.':'Puedes corregir el nombre del pagador antes de registrar el pedido.'}</p></div>
      <div class="subtle-disclaimer">Corregir el formulario no revierte una transferencia de dinero.</div>
      ${alreadySent?`<a class="primary contact-primary" href="${esc(whatsappOrderLink(order.purchaseId))}" target="_blank" rel="noopener noreferrer">${contactIcon('whatsapp')} Solicitar corrección por WhatsApp ↗</a>`:''}
      <div class="modal-actions"><button class="secondary" id="cancelCorrection" type="button">Cerrar</button>${alreadySent?'':'<button class="primary" id="fixPayment" type="button">Corregir datos →</button>'}</div>`;
    $('cancelCorrection').addEventListener('click',closeModal);
    if(!alreadySent)$('fixPayment').addEventListener('click',renderPayment);
  }
  function copyRow(label,value){return `<div class="copy-line"><span class="copy-text"><small>${esc(label)}</small><strong>${esc(value)}</strong></span><button class="copy-btn" type="button" data-copy="${esc(value)}" aria-label="Copiar ${esc(label)}">Copiar</button></div>`}
  function renderSuccess(automatic=false){
    stopVoucherAnimations();
    automatic=automatic===true;
    view='success';heading('SONYER STORE','Compra finalizada');
    updatePurchaseStatus(automatic?'aprobado':'aprobado-ejemplo');
    const savedPurchase=purchases.find(item=>item.id===order.purchaseId);
    order.approvedAt=new Date(savedPurchase?.approvedAt||Date.now());
    overlay.classList.remove('full-screen');dialog.classList.remove('full-dialog');
    overlay.classList.add('success-screen');dialog.classList.add('success-dialog');
    const approvalDate=new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'}).format(order.approvedAt);
    const appUrl=chosen.url||'';
    const all=[`Aplicación: ${chosen.title}`,`Enlace: ${appUrl||'No configurado'}`,`Usuario: ${order.user}`,`Contraseña: ${order.password}`,`Correo: ${order.email}`];
    if(order.storedUser)all.push(`Identificador interno: ${order.storedUser}`);
    if(order.seller)all.push(`ID vendedor: ${order.seller}`);
    all.push(`Fecha de aprobación${automatic?'':' (ejemplo)'}: ${approvalDate}`);
    body.innerHTML=`<div class="success-shell">
      <div class="success-hero"><span class="success-check receipt-check-holder" id="approvedVoucherCheck" aria-hidden="true"><span class="check-fallback">✓</span></span><div><div class="success-kicker">Gracias por tu compra</div><h2>${automatic?'Cuenta activada':'Vista previa de entrega'}</h2><p>${automatic?'Tu solicitud fue aprobada. Ya puedes consultar los datos de acceso.':'Esta pantalla es solo un ejemplo de cómo se verá la entrega.'}</p></div></div>
      <div class="approval-meta"><span><small>Estado</small><strong class="approved">${automatic?'Acceso habilitado':'Aprobado · Ejemplo'}</strong></span><span><small>Fecha de aprobación</small><strong>${esc(approvalDate)}</strong></span><span><small>Aplicación</small><strong>${esc(chosen.title)}</strong></span></div>
      ${automatic&&appUrl?`<a class="primary open-app-action" href="${esc(appUrl)}" target="_blank" rel="noopener noreferrer">Abrir aplicación <span aria-hidden="true">↗</span></a>`:''}
      <div class="success-columns"><section class="access-panel"><div class="access-heading"><div><h3>Datos de acceso</h3><p>Selecciona «Copiar» en cualquier dato o copia todo junto.</p></div><button id="copyAll" class="primary compact-action" type="button">Copiar todo <span aria-hidden="true">⧉</span></button></div>
        ${copyRow('Enlace de la aplicación',appUrl||'Enlace pendiente de configurar')}
        ${copyRow('Nombre de usuario',order.user)}
        ${order.storedUser?copyRow('Identificador interno de la app',order.storedUser):''}
        ${copyRow('Contraseña',order.password)}
        ${copyRow('Correo de recuperación',order.email)}
        ${order.seller?copyRow('ID de vendedor',order.seller):''}</section>
      <aside class="success-aside"><div class="access-steps"><strong>Cómo ingresar</strong><ol><li>Copia el enlace de tu aplicación.</li><li>Pégalo en Chrome.</li><li>Inicia sesión con los datos registrados.</li></ol></div><div class="success-note"><strong>Información importante</strong><p>${automatic?'La aprobación se realizó con base en el aviso de pago recibido. Si necesitas ayuda, contacta a SONYER.':'Esta es una vista previa de aprobación. Todavía no se ha verificado ningún pago ni creado una cuenta real.'}</p></div></aside></div>
      <button class="secondary finish-button" id="finish" type="button">Volver a la tienda</button>
    </div>`;
    body.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',()=>copyText(button.dataset.copy)));
    $('copyAll').addEventListener('click',()=>copyText(all.join('\n')));
    $('finish').addEventListener('click',closeModal);
    dialog.scrollTop=0;
    animateVoucherCheck('approvedVoucherCheck');
    celebrateApprovedPurchase();
  }

  function openPurchases(){
    dialog.classList.add('history-dialog');fullScreen();
    view='history';renderPurchases();openModal();
  }
  function renderPurchases(){
    view='history';heading('SONYER STORE','Mis compras');
    const visible=purchases.filter(item=>purchaseFilter==='todas'||(purchaseFilter==='aprobadas'?item.status==='aprobado'||item.status==='aprobado-ejemplo':item.status!=='aprobado'&&item.status!=='aprobado-ejemplo'));
    body.innerHTML=`<div class="purchase-page"><div class="page-intro"><div><span class="page-eyebrow">MI ESPACIO</span><h3>Mis aplicaciones</h3><p>Consulta tus pedidos y revisa los accesos disponibles.</p></div><span class="page-total">${purchases.length} ${purchases.length===1?'solicitud':'solicitudes'}</span></div>
      <div class="purchase-tabs"><button class="${purchaseFilter==='todas'?'active':''}" type="button" data-history-filter="todas">Todas</button><button class="${purchaseFilter==='aprobadas'?'active':''}" type="button" data-history-filter="aprobadas">Aprobadas</button><button class="${purchaseFilter==='pendientes'?'active':''}" type="button" data-history-filter="pendientes">Pendientes</button></div>
      ${visible.length?`<div class="history-list">${visible.map(item=>`
        <button class="history-item" type="button" data-purchase="${esc(item.id)}">
          <span class="history-app-icon">${esc(item.title.slice(0,1).toUpperCase())}</span>
          <span class="history-info"><strong>${esc(item.title)}</strong><small>${esc(dateLabel(item.date))}</small><span class="history-status ${item.status==='aprobado'||item.status==='aprobado-ejemplo'?'is-green':item.status==='correccion'?'is-red':''}">${esc(statusLabel(item.status))}</span></span>
          <span class="history-price">${money(item.price)}<small>Ver detalle →</small></span>
        </button>`).join('')}</div>`:'<div class="history-empty"><span aria-hidden="true">▢</span><strong>Aún no hay compras en esta sección</strong><p>Cuando envíes una solicitud aparecerá aquí.</p></div>'}
      <div class="page-note">Tu historial de solicitudes se conserva en este dispositivo.</div>
      <button class="secondary page-back" id="closeHistory" type="button">← Volver a la tienda</button></div>`;
    body.querySelectorAll('[data-purchase]').forEach(button=>button.addEventListener('click',()=>renderPurchaseDetail(button.dataset.purchase)));
    body.querySelectorAll('[data-history-filter]').forEach(button=>button.addEventListener('click',()=>{purchaseFilter=button.dataset.historyFilter;renderPurchases()}));
    $('closeHistory').addEventListener('click',closeModal);
  }
  function renderPurchaseDetail(id){
    const item=purchases.find(entry=>entry.id===id);if(!item){renderPurchases();return}
    view='history-detail';heading('MI COMPRA','Detalle de mi aplicación');
    const access=sessionAccess.get(item.id);
    const currentProduct=products.find(product=>product.id===item.productId)||products.find(product=>product.title===item.title);
    const appLaunchUrl=[currentProduct?.url,item.appUrl,access?.url].find(url=>typeof url==='string'&&url.startsWith('https://'))||'';
    const approved=item.status==='aprobado'||item.status==='aprobado-ejemplo';
    const all=approved&&access?[`Aplicación: ${item.title}`,`Enlace: ${access.url||'No configurado'}`,`Usuario: ${access.user}`,`Identificador interno: ${access.storedUser||'No configurado'}`,`Contraseña: ${access.password}`,`Correo: ${access.email}`,`ID vendedor: ${access.seller||'No requerido'}`]:[];
    body.innerHTML=`<div class="purchase-page"><div class="purchase-detail"><div class="purchase-detail-icon">${esc(item.title.slice(0,1).toUpperCase())}</div><h3>${esc(item.title)}</h3><span class="history-status ${approved?'is-green':item.status==='correccion'?'is-red':''}">${esc(statusLabel(item.status))}</span></div>
      <div class="purchase-details-grid"><div><small>Importe</small><strong>${money(item.price)}</strong></div><div><small>Fecha de compra</small><strong>${esc(dateLabel(item.date))}</strong></div><div><small>Fecha de aprobación</small><strong>${item.approvedAt?esc(dateLabel(item.approvedAt)):'Pendiente'}</strong></div></div>
      ${item.status==='aprobado'&&appLaunchUrl?`<a class="primary open-app-action" href="${esc(appLaunchUrl)}" target="_blank" rel="noopener noreferrer">Abrir aplicación <span aria-hidden="true">↗</span></a>`:''}
      ${approved&&access?`<section class="access-panel purchase-access"><div class="access-heading"><div><h3>Datos de tu aplicación</h3><p>Copia cada dato o todos juntos.</p></div><button id="copyPurchaseAll" class="primary compact-action" type="button">Copiar todo</button></div>
        ${copyRow('Enlace de la aplicación',access.url||'Enlace pendiente')}
        ${copyRow('Usuario',access.user)}
        ${access.storedUser?copyRow('Identificador interno de la app',access.storedUser):''}
        <div class="copy-line"><span class="copy-text"><small>Contraseña</small><strong id="purchasePassword">••••••••</strong></span><span class="secret-actions"><button id="revealPurchase" class="copy-btn" type="button" aria-pressed="false">Mostrar</button><button class="copy-btn" type="button" data-copy="${esc(access.password)}">Copiar</button></span></div>
        ${copyRow('Correo de recuperación',access.email)}
        ${access.seller?copyRow('ID del vendedor',access.seller):''}</section>`:`<div class="history-access-empty"><strong>${approved?'Datos no disponibles en esta sesión':'Acceso aún no habilitado'}</strong><p>${approved?'Para recuperar credenciales después de cerrar la página necesitaremos cuentas protegidas.':'Cuando se confirme el acceso aparecerán aquí el enlace y los datos de ingreso.'}</p></div>`}
      <div class="page-note">${item.status==='aprobado'?'Tu solicitud fue aprobada con base en el aviso de pago recibido.':item.status==='aprobado-ejemplo'?'Esta es una demostración; no se ha registrado una compra real.':'Tu solicitud sigue pendiente de aprobación.'}</div>
      <button class="secondary page-back" id="backHistory" type="button">← Mis compras</button></div>`;
    body.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',()=>copyText(button.dataset.copy)));
    if(approved&&access){
      $('copyPurchaseAll').addEventListener('click',()=>copyText(all.join('\n')));
      $('revealPurchase').addEventListener('click',()=>{const button=$('revealPurchase');const next=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(next));button.textContent=next?'Ocultar':'Mostrar';$('purchasePassword').textContent=next?access.password:'••••••••'});
    }
    $('backHistory').addEventListener('click',renderPurchases);
  }

  function openSettings(){fullScreen();renderSettings();openModal()}
  function openBuyingGuide(){
    view='how-to-buy';fullScreen();heading('SONYER STORE','Guía para comprar');
    body.innerHTML=`<div class="buy-guide-page"><div class="guide-heading"><div class="guide-brand"><img src="assets/sonyer-logo.webp" width="156" height="100" alt="SONYER STORE"></div><span class="page-eyebrow">COMPRA PASO A PASO</span><h3>¿Cómo obtener tu aplicación?</h3><p>Te explicamos cómo hacer tu compra y qué ocurrirá después del pago.</p></div>
      <div class="guide-steps">
        <article class="guide-step"><span class="guide-num">01</span><div><h4>Elige tu aplicación</h4><p>Abre el catálogo, selecciona el servicio que quieres y toca <strong>Comprar</strong>.</p></div></article>
        <article class="guide-step"><span class="guide-num">02</span><div><h4>Registra tus datos</h4><p>Ingresa tu usuario, contraseña y correo de recuperación. Si te pide el ID del vendedor, escribe:</p><div class="guide-seller"><strong>SONYER</strong><button id="copyGuideSeller" type="button">Copiar ID</button></div><small>El ID debe corresponder al vendedor configurado para esa aplicación.</small></div></article>
        <article class="guide-step"><span class="guide-num">03</span><div><h4>Paga desde tu billetera o banco</h4><p>Escanea el QR o guárdalo. Puedes utilizar una billetera digital o banco compatible. Envía el <strong>importe exacto</strong> y escribe el nombre completo de quien pagó.</p></div></article>
        <article class="guide-step"><span class="guide-num">04</span><div><h4>Espera la aprobación</h4><p>Pulsa <strong>Ya pagué</strong> una sola vez. Mantén abierta la pantalla de seguimiento; no vuelvas a transferir si la verificación tarda.</p></div></article>
        <article class="guide-step"><span class="guide-num">05</span><div><h4>Abre tu aplicación</h4><p>Cuando tu solicitud aparezca como <strong>Aprobada</strong>, podrás ver tus datos y pulsar <strong>Abrir aplicación</strong> si el enlace está configurado.</p></div></article>
      </div><div class="guide-note"><strong>Importante</strong><p>Enviar una solicitud no significa que el pago esté confirmado. SONYER debe revisar la recepción y aprobación antes de habilitar el acceso.</p></div><button class="primary guide-start" type="button" id="guideToCatalog">Entendido · Ver catálogo →</button></div>`;
    $('copyGuideSeller').addEventListener('click',()=>copyText('SONYER'));
    $('guideToCatalog').addEventListener('click',()=>{closeModal();$('catalogo').scrollIntoView({behavior:'smooth',block:'start'})});
    openModal();
  }
  function renderSettings(){
    view='settings';heading('SONYER STORE','Configuración');
    body.innerHTML=`<div class="settings-page"><div class="page-intro"><div><span class="page-eyebrow">MI ESPACIO</span><h3>Mi cuenta SONYER</h3><p>Accede a tu cuenta, revisa compras o sigue explorando.</p></div></div>
      <div class="settings-grid"><section class="settings-card accent settings-account"><div class="settings-card-top"><span class="settings-symbol" aria-hidden="true">♙</span><div><h3>${accountPreview?'Sesión activa':'Cuenta personal'}</h3><p>${accountPreview?'Ya puedes gestionar tu cuenta.':'Tu cuenta es opcional.'}</p></div></div>
        ${accountPreview?`<p class="settings-email">${esc(accountPreview.email)}</p><span class="history-status is-green">Sesión iniciada</span><button class="secondary settings-action" id="leaveAccountPreview" type="button">Cerrar sesión</button>`:
          `<p>Ingresa con tu correo si deseas utilizar una cuenta. Puedes comprar sin registrarte.</p><div class="settings-actions"><button class="primary" id="createAccount" type="button">Crear cuenta</button><button class="secondary" id="loginAccount" type="button">Iniciar sesión</button></div>`}</section>
        <section class="settings-card settings-shortcut"><div class="settings-card-top"><span class="settings-symbol" aria-hidden="true">▣</span><div><h3>Mis compras</h3><p>${purchases.length} solicitudes guardadas en este dispositivo.</p></div></div><button class="secondary settings-action" id="settingsPurchases" type="button">Ver mis compras →</button></section>
        <section class="settings-card settings-shortcut"><div class="settings-card-top"><span class="settings-symbol" aria-hidden="true">✓</span><div><h3>Seguir explorando</h3><p>No necesitas una cuenta para ver el catálogo.</p></div></div><button class="secondary settings-action" id="settingsGuest" type="button">Volver a la tienda →</button></section></div></div>`;
    if(accountPreview){$('leaveAccountPreview').addEventListener('click',async()=>{try{await firebaseStore?.signOut();accountPreview=null;renderSettings();notify('Sesión cerrada')}catch(error){notify('No se pudo cerrar sesión')}})}
    else{
      $('createAccount').addEventListener('click',()=>renderAccountForm('register'));
      $('loginAccount').addEventListener('click',()=>renderAccountForm('login'));
    }
    $('settingsPurchases').addEventListener('click',renderPurchases);
    $('settingsGuest').addEventListener('click',closeModal);
  }
  function renderAccountForm(mode){
    view='account-form';heading('SONYER STORE',mode==='register'?'Crear cuenta':'Iniciar sesión');
    body.innerHTML=`<div class="account-page"><span class="page-eyebrow">CUENTA OPCIONAL</span><h3>${mode==='register'?'Crea tu cuenta SONYER':'Bienvenido de nuevo'}</h3><p>Ingresa con tu correo para gestionar tu cuenta SONYER.</p>
      <form id="storeAccountForm" autocomplete="on"><div class="field"><label for="storeAccountEmail">Correo electrónico</label><input id="storeAccountEmail" type="email" name="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" maxlength="120" required></div><div class="field"><label for="storeAccountPassword">Contraseña</label><input id="storeAccountPassword" type="password" name="password" autocomplete="${mode==='register'?'new-password':'current-password'}" placeholder="Mínimo 8 caracteres" minlength="8" maxlength="64" required></div>
      <button id="submitStoreAccount" class="primary settings-action" type="submit">${mode==='register'?'Crear mi cuenta':'Entrar a mi cuenta'}</button></form>
      <button class="secondary settings-action" id="accountBack" type="button">← Volver a configuración</button></div>`;
    $('accountBack').addEventListener('click',renderSettings);
    $('storeAccountForm').addEventListener('submit',async event=>{
      event.preventDefault();if(!event.currentTarget.reportValidity())return;
      if(!firebaseStore){notify('No se pudo conectar. Intenta nuevamente.');return}
      const email=clean($('storeAccountEmail').value).slice(0,120),password=$('storeAccountPassword').value;
      const button=$('submitStoreAccount');button.disabled=true;button.textContent='Conectando…';
      try{
        const result=mode==='register'?await firebaseStore.createAccount(email,password):await firebaseStore.signIn(email,password);
        accountPreview={email:result.user.email,uid:result.user.uid};
        $('storeAccountPassword').value='';renderSettings();notify('Sesión iniciada ✓');
      }catch(error){
        const code=String(error?.code||'');
        const message=code.includes('operation-not-allowed')?'El registro por correo no está disponible por ahora. Contacta a soporte.':
          code.includes('email-already-in-use')?'Ese correo ya está registrado. Prueba iniciar sesión':
          code.includes('invalid-credential')?'Correo o contraseña incorrectos':
          code.includes('weak-password')?'Elige una contraseña más segura':'No se pudo conectar la cuenta. Revisa los datos';
        notify(message);button.disabled=false;button.textContent=mode==='register'?'Crear mi cuenta':'Entrar a mi cuenta';
      }
    });
  }

  // UX cooldown on this browser. Firebase Auth and owner UID rules remain the
  // actual security boundary; browser storage is NOT a server-enforced lockout.
  function readAdminLoginGuard(){
    try{
      const state=JSON.parse(localStorage.getItem(ADMIN_LOGIN_GUARD_KEY)||'null');
      if(state&&Number.isInteger(state.failures)&&state.failures>=0&&Number.isFinite(state.lockedUntil)){
        if(state.lockedUntil&&state.lockedUntil<=Date.now()){
          localStorage.removeItem(ADMIN_LOGIN_GUARD_KEY);
          return {failures:0,lockedUntil:0};
        }
        return state;
      }
    }catch(error){}
    return {failures:0,lockedUntil:0};
  }
  function writeAdminLoginGuard(state){try{localStorage.setItem(ADMIN_LOGIN_GUARD_KEY,JSON.stringify(state))}catch(error){}}
  function recordAdminLoginFailure(){
    const current=readAdminLoginGuard();
    if(current.lockedUntil>Date.now())return current;
    const failures=current.failures+1;
    const next={failures,lockedUntil:failures>=ADMIN_MAX_ATTEMPTS?Date.now()+ADMIN_LOCK_MS:0};
    writeAdminLoginGuard(next);
    return next;
  }
  function paintAdminLoginGuard(){
    const status=$('adminLoginGuardStatus'),button=$('adminEnter');
    if(!status||!button)return;
    const current=readAdminLoginGuard(),remaining=Math.max(0,current.lockedUntil-Date.now());
    const locked=remaining>0;
    status.classList.toggle('is-locked',locked);
    status.textContent=locked?`Acceso pausado durante 1 hora después de 3 intentos fallidos. Faltan ${Math.ceil(remaining/60000)} min. para volver a intentar.`:
      current.failures?`Intentos restantes en este dispositivo: ${ADMIN_MAX_ATTEMPTS-current.failures} de ${ADMIN_MAX_ATTEMPTS}.`:
      'Por seguridad, este dispositivo permite 3 intentos antes de una pausa de 1 hora.';
    button.disabled=locked;
    if(locked)button.textContent='Acceso temporalmente pausado';
    else if(button.textContent==='Acceso temporalmente pausado')button.textContent='Ingresar al panel →';
  }
  /* Real Firebase Auth login. Firestore security rules enforce the owner UID. */
  async function adminLogin(){
    if(order){order.password='';order=null}
    view='admin-login';chosen=null;dialog.classList.add('admin-dialog');fullScreen();
    if(firebaseStore&&readAdminLoginGuard().lockedUntil<=Date.now()&&await firebaseStore.isAdmin()){
      renderAdmin();openModal();return;
    }
    heading('SONYER · ADMINISTRACIÓN','Administrador SONYER');
    body.innerHTML=`<div class="admin-login-wrap"><div class="admin-login-logo has-brand"><img src="assets/sonyer-logo.webp" width="150" height="86" alt="SONYER STORE"></div><h3>Panel de control SONYER</h3><p>Gestiona tu catálogo, pedidos y cobros.</p>
      <form id="adminForm"><div class="form-grid"><div class="field wide"><label for="adminEmail">Correo del administrador</label><input id="adminEmail" type="email" required autocomplete="username" placeholder="Correo de tu cuenta Firebase"></div><div class="field wide"><label for="adminPassword">Contraseña</label><input id="adminPassword" type="password" required autocomplete="current-password" placeholder="Contraseña de tu cuenta Firebase"></div></div>
      <button class="primary" style="width:100%" id="adminEnter" type="submit">Ingresar al panel →</button><p id="adminLoginGuardStatus" class="admin-login-guard" role="status" aria-live="polite"></p></form>
      <div class="admin-footnote">Acceso exclusivo del administrador autorizado. Si olvidaste la clave, utiliza la recuperación de Firebase.</div></div>`;
    paintAdminLoginGuard();
    $('adminForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(readAdminLoginGuard().lockedUntil>Date.now()){paintAdminLoginGuard();return}
      if(!firebaseStore){notify('Sin conexión con Firebase');return}
      const enter=$('adminEnter');enter.disabled=true;enter.textContent='Comprobando…';
      try{
        await firebaseStore.signIn(clean($('adminEmail').value),$('adminPassword').value);
        $('adminPassword').value='';
        if(!(await firebaseStore.isAdmin())){
          recordAdminLoginFailure();
          notify('Esta cuenta no tiene acceso al administrador');
          return;
        }
        writeAdminLoginGuard({failures:0,lockedUntil:0});
        renderAdmin();
      }catch(error){
        const code=String(error?.code||'');
        if(/invalid-credential|invalid-email|wrong-password|user-not-found|user-disabled/.test(code)){
          const result=recordAdminLoginFailure();
          notify(result.lockedUntil?'Límite alcanzado. Intenta otra vez en una hora.':`Datos incorrectos. Quedan ${ADMIN_MAX_ATTEMPTS-result.failures} intentos.`);
        }else notify('No se pudo conectar con Firebase. Revisa Internet.');
      }
      finally{if(view==='admin-login'){enter.disabled=false;enter.textContent='Ingresar al panel →';paintAdminLoginGuard()}}
    });
    openModal();
  }
  function renderAdmin(){
    view='admin';fullScreen();heading('SONYER · ADMINISTRACIÓN','Panel de aplicaciones');
    if(firebaseStore&&!stopAdminOrders&&firebaseAccount){
      stopAdminOrders=firebaseStore.watchOrders(rows=>{cloudOrders=rows;if(view==='admin')renderAdmin()},error=>{
        console.warn('SONYER: no se pudieron leer pedidos',error?.code||error?.message);
      });
    }
    body.innerHTML=`<div class="admin-page"><div class="page-intro"><div><span class="page-eyebrow">PANEL DE CONTROL</span><h3>Mi tienda SONYER</h3><p>Administra tu tienda por secciones.</p></div><span class="page-total">${products.filter(isPublicProduct).length} publicados</span></div>
      <nav class="admin-section-nav" aria-label="Secciones del administrador"><button type="button" data-admin-tab="catalogo">Catálogo</button><button type="button" data-admin-tab="actividad">Actividad</button><button type="button" data-admin-tab="pedidos">Pedidos <span>${cloudOrders.filter(item=>item.status==='pending').length}</span></button><button type="button" data-admin-tab="ajustes">Ajustes</button></nav>
      <section class="admin-panel" data-admin-section="catalogo"><div class="admin-panel-head"><div><span class="page-eyebrow">PRODUCTOS Y SERVICIOS</span><h4>Tu catálogo</h4><p>Edita, publica o quita aplicaciones.</p></div><button class="primary" id="addProduct" type="button">+ Agregar</button></div>
      <div class="admin-list" id="adminList">${products.map(item=>`<div class="admin-item"><div class="admin-title-line"><strong>${esc(item.title)}</strong>${item.discount?`<span class="sale-pill">${discountText(item)}</span>`:''}${!isPublicProduct(item)?'<span class="admin-draft-pill">No publicado</span>':''}</div><p>${esc(item.description)}</p><div class="meta">${money(discountedPrice(item))}${item.discount?` <del>${money(item.price)}</del>`:''} · ${esc(categoryTitle(item))} · ${item.mode==='contact'?'Consulta por mensaje':item.seller?'Acceso con ID vendedor':'Acceso digital'}</div><div class="admin-actions"><button type="button" data-edit="${esc(item.id)}">Editar</button><button class="danger" type="button" data-delete="${esc(item.id)}">Eliminar</button></div></div>`).join('')}</div>
      <div class="admin-brand-drafts"><div class="admin-brand-art"><img src="assets/catalog-chatgpt.webp" alt="ChatGPT"><img src="assets/catalog-netflix.webp" alt="Netflix"></div><div><strong>ChatGPT y Netflix</strong><p>Plantillas con imágenes listas. Configura precio y enlace antes de hacerlas visibles.</p></div><button class="secondary compact-action" id="addBrandApps" type="button">+ Añadir</button></div>
      <div class="admin-brand-drafts"><div class="admin-brand-art"><img src="assets/catalog-instagram-followers.webp" alt="Seguidores de Instagram"></div><div><strong>Seguidores de Instagram</strong><p>Incluye foto y video automático. Configura precio y detalles antes de publicar.</p></div><button class="secondary compact-action" id="addFollowers" type="button">+ Añadir</button></div>
      <div class="admin-brand-drafts"><div class="admin-brand-art"><img src="assets/catalog-lemon-logo.webp" alt="Logo Lemon"><img src="assets/catalog-lemon-screen.webp" alt="Vista de Lemon"></div><div><strong>Lemon</strong><p>Primero muestra el logo y después la imagen de la aplicación. Configura el enlace y el precio antes de publicarla.</p></div><button class="secondary compact-action" id="addLemon" type="button">+ Añadir</button></div>
      <div class="admin-brand-drafts"><div class="admin-brand-art"><img src="assets/catalog-dni-new.webp" alt="DNI reciente"><img src="assets/catalog-dni-old.webp" alt="DNI anterior"></div><div><strong>DNI · Orientación en trámites</strong><p>Muestra las dos imágenes en orden. Configura un servicio de asesoría para trámites oficiales antes de publicarlo.</p></div><button class="secondary compact-action" id="addDni" type="button">+ Añadir</button></div>
      <div class="admin-brand-drafts medical-draft-card"><div class="admin-brand-art"><img src="assets/catalog-descanso-medico.webp" alt="Ilustración de orientación médica"></div><div><strong>Descanso médico · Orientación</strong><p>Guía sobre certificados y licencias emitidos tras evaluación por profesionales autorizados. Se añade sin publicidad de emisión garantizada.</p></div><button class="secondary compact-action" id="addMedicalGuide" type="button">+ Añadir</button></div>
      <div class="admin-mini-actions"><button class="secondary" id="addExampleServices" type="button">+ Añadir servicios de ejemplo</button></div>
      <h3 class="admin-subheading">Firebase · Sincronización</h3><div class="payment-settings-card"><span class="payment-settings-icon">☁</span><div><strong>${esc(firebaseStatusText())}</strong><small>Las aplicaciones se guardan en Firebase al pulsar «Guardar producto». Usa sincronizar para actualizar también los datos de cobro.</small></div><button class="secondary compact-action" id="publishStore" type="button">Sincronizar →</button></div>
      </section><section class="admin-panel" data-admin-section="actividad"><div class="admin-panel-head"><div><span class="page-eyebrow">COMUNIDAD</span><h4>Actividad de tu tienda</h4><p>Visitas, corazones y comentarios.</p></div><button class="secondary compact-action" id="refreshEngagement" type="button">↻ Actualizar</button></div><div class="admin-toolbar admin-engagement-head"><p>Interacciones reales</p></div>
      <div class="admin-engagement-grid">${products.filter(isPublicProduct).map(item=>`<div class="admin-engagement-item"><strong>${esc(item.title)}</strong><span><span class="engagement-heart-mark">♥</span> <b data-admin-like-count="${esc(item.id)}">${metricText(item.id,'likes')}</b> corazones</span><span>◉ <b data-admin-view-count="${esc(item.id)}">${metricText(item.id,'views')}</b> visitas únicas</span></div>`).join('')}</div>
      <div class="admin-toolbar admin-opinions-head"><p>Opiniones y comentarios</p><button class="primary compact-action" id="addOpinion" type="button">+ Agregar opinión</button></div>
      <p class="admin-opinions-note">Selecciona un servicio y escribe un comentario que aparecerá firmado como «SONYER». No se mostrará como una reseña verificada de un cliente.</p>
      <div class="admin-opinions-list" id="adminOpinions">${opinions.length?opinions.map(item=>`<div class="admin-opinion-item"><div><strong>${esc(products.find(product=>product.id===item.productId)?.title||'Servicio eliminado')}</strong><p>${esc(item.text)}</p><small>Publicado por SONYER</small></div><button type="button" data-delete-opinion="${esc(item.id)}">Eliminar</button></div>`).join(''):'<p class="admin-opinions-empty">Todavía no has publicado comentarios.</p>'}</div>
      </section><section class="admin-panel" data-admin-section="pedidos"><div class="admin-panel-head"><div><span class="page-eyebrow">VENTAS</span><h4>Solicitudes de compra</h4><p>Revisa las solicitudes recibidas y su estado.</p></div><span class="admin-count">${cloudOrders.length} recientes</span></div><div class="admin-orders" id="cloudOrders">${cloudOrders.length?cloudOrders.slice(0,40).map(item=>`<article class="admin-order-card"><div class="admin-order-top"><span class="admin-order-icon">${esc((item.productTitle||'A')[0].toUpperCase())}</span><div><strong>${esc(item.productTitle||item.productId||'Aplicación')}</strong><small>${item.createdAt?.toDate?.()?esc(dateLabel(item.createdAt.toDate().toISOString())):'Solicitud registrada'}</small></div><span class="admin-order-status ${item.status==='approved'?'is-approved':''}">${item.status==='approved'?'Aprobado':'Pendiente'}</span></div><div class="admin-order-meta"><span>${money(item.amount||0)}</span><span>${esc(item.payerName||'Pagador no indicado')}</span></div><details class="admin-order-details"><summary>Ver número de solicitud</summary><code>${esc(item.id)}</code></details></article>`).join(''):'<div class="admin-footnote">Todavía no hay solicitudes sincronizadas.</div>'}</div><div class="page-note">Los pedidos pendientes se aprueban únicamente después de verificar el pago por tu sistema autorizado. Esta pantalla muestra su estado y no realiza la aprobación.</div>
      </section><section class="admin-panel" data-admin-section="ajustes"><div class="admin-panel-head"><div><span class="page-eyebrow">PREFERENCIAS</span><h4>Configuración de tu tienda</h4><p>Canales, cobros y sincronización.</p></div></div><h3 class="admin-subheading">Canales de contacto</h3><div class="payment-settings-card"><span class="payment-settings-icon">☎</span><div><strong>WhatsApp y Telegram</strong><small>Configura dónde recibir consultas sobre tus servicios</small></div><button class="secondary compact-action" id="editContact" type="button">Configurar →</button></div>
      <h3 class="admin-subheading">Configuración de cobro</h3><div class="payment-settings-card"><span class="payment-settings-icon">▦</span><div><strong>Datos para recibir pagos</strong><small>QR de Moni y nombre del titular</small></div><button class="secondary compact-action" id="editPayment" type="button">Configurar →</button></div>
      <div class="page-note">Se usa el mismo Firebase login-48d79. Antes de vender aplica las reglas protegidas e indica el UID del dueño en el archivo de conexión. No se almacenan contraseñas de aplicaciones en Firestore.</div>
      <div class="modal-actions admin-bottom"><button class="secondary" id="adminBack" type="button">Cerrar panel</button><button class="secondary" id="resetCatalog" type="button">Restaurar ejemplos</button></div></section></div>`;
    const showAdminSection=name=>{
      adminSection=['catalogo','actividad','pedidos','ajustes'].includes(name)?name:'catalogo';
      body.querySelectorAll('[data-admin-section]').forEach(panel=>{panel.hidden=panel.dataset.adminSection!==adminSection});
      body.querySelectorAll('[data-admin-tab]').forEach(button=>{const active=button.dataset.adminTab===adminSection;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false')});
    };
    showAdminSection(adminSection);
    body.querySelector('.admin-section-nav').addEventListener('click',event=>{
      const tab=event.target.closest('[data-admin-tab]');
      if(!tab)return;
      showAdminSection(tab.dataset.adminTab);
      dialog.scrollTop=0;
    });
    $('addProduct').addEventListener('click',()=>renderEditor(null));
    $('addBrandApps').addEventListener('click',async()=>{
      const presets=DEFAULT_PRODUCTS.filter(item=>['chatgpt-sonyer','netflix-sonyer'].includes(item.id)&&!products.some(existing=>existing.id===item.id));
      if(!presets.length){notify('ChatGPT y Netflix ya están en el catálogo para editarlos');return}
      if(products.length+presets.length>60){notify('Primero elimina algún producto: alcanzaste el límite del catálogo');return}
      await saveCatalogToCloud([...products,...presets.map(item=>({...item,published:false}))],'ChatGPT y Netflix añadidos como borradores ✓');
    });
    $('addFollowers').addEventListener('click',async()=>{
      const preset=DEFAULT_PRODUCTS.find(item=>item.id==='instagram-followers-sonyer');
      if(!preset||products.some(item=>item.id===preset.id)){notify('Seguidores de Instagram ya está añadido para editarlo');return}
      if(products.length>=60){notify('El catálogo está lleno; elimina un producto antes de añadir otro');return}
      await saveCatalogToCloud([...products,{...preset,published:false}],'Seguidores de Instagram añadido como borrador ✓');
    });
    $('addLemon').addEventListener('click',async()=>{
      const preset=DEFAULT_PRODUCTS.find(item=>item.id==='lemon-sonyer');
      if(!preset||products.some(item=>item.id===preset.id)){notify('Lemon ya está añadido; búscalo arriba para editarlo');return}
      if(products.length>=60){notify('El catálogo está lleno; elimina un producto antes de añadir otro');return}
      await saveCatalogToCloud([...products,{...preset,published:false}],'Lemon añadido como borrador ✓');
    });
    $('addDni').addEventListener('click',async()=>{
      const preset=DEFAULT_PRODUCTS.find(item=>item.id==='dni-tramites-sonyer');
      if(!preset||products.some(item=>item.id===preset.id)){notify('DNI ya está añadido; búscalo arriba para editarlo');return}
      if(products.length>=60){notify('El catálogo está lleno; elimina un producto antes de añadir otro');return}
      await saveCatalogToCloud([...products,{...preset,published:false}],'Servicio de DNI añadido como borrador ✓');
    });
    $('addMedicalGuide').addEventListener('click',async()=>{
      const preset=DEFAULT_PRODUCTS.find(item=>item.id==='descanso-medico-orientacion');
      if(!preset||products.some(item=>item.id===preset.id)){notify('La orientación sobre descanso médico ya está añadida');return}
      if(products.length>=60){notify('El catálogo está lleno; elimina un producto antes de añadir otro');return}
      await saveCatalogToCloud([...products,{...preset,published:false}],'Orientación médica añadida como borrador ✓');
    });
    $('addOpinion').addEventListener('click',renderOpinionEditor);
    $('adminOpinions').addEventListener('click',async event=>{
      const button=event.target.closest('[data-delete-opinion]');
      if(!button)return;
      if(!confirm('¿Eliminar este comentario público de SONYER?'))return;
      if(await saveOpinionsToCloud(opinions.filter(item=>item.id!==button.dataset.deleteOpinion))){renderAdmin();notify('Comentario eliminado ✓')}
    });
    $('refreshEngagement').addEventListener('click',()=>refreshEngagement({force:true}));
    $('addExampleServices').addEventListener('click',async()=>{
      const samples=DEFAULT_PRODUCTS.filter(item=>item.mode==='contact'&&!products.some(existing=>existing.id===item.id));
      if(!samples.length){notify('Los servicios de ejemplo ya están añadidos');return}
      await saveCatalogToCloud([...products,...samples.map(item=>({...item,published:false}))],'Servicios de ejemplo guardados como ocultos ✓');
    });
    $('editContact').addEventListener('click',renderContactSettings);
    $('editPayment').addEventListener('click',renderPaymentSettings);
    $('publishStore').addEventListener('click',async()=>{
      if(!firebaseStore){notify('Firebase aún no está disponible');return}
      if(!(await firebaseStore.isAdmin())){notify('Falta iniciar sesión con una cuenta administradora autorizada');return}
      if(!catalogReady||catalogSaving){notify('Espera a que termine de cargar o guardar el catálogo');return}
      if(!confirm('ATENCIÓN: antes de vender de verdad debes proteger las cuentas existentes y verificar los pagos por un canal confiable. ¿Publicar el catálogo de SONYER en Firebase?'))return;
      const button=$('publishStore');button.disabled=true;button.textContent='Publicando…';
      try{
        await firebaseStore.publishCatalog(products);
        await firebaseStore.publishSettings({name:payment.name,qr:payment.qr,whatsapp:contacts.whatsapp,telegram:contacts.telegram});
        notify('Catálogo y cobros publicados en Firebase ✓');renderAdmin();
      }catch(error){
        console.warn('SONYER: no se pudieron publicar los datos',error?.code||error?.message);
        notify('Error al publicar. Revisa permisos y tamaño del QR');button.disabled=false;button.textContent='Publicar →';
      }
    });
    $('adminBack').addEventListener('click',closeModal);
    $('resetCatalog').addEventListener('click',async()=>{
      if(!confirm('¿Reemplazar TODO el catálogo publicado por los ejemplos? Esto quitará de la tienda tus productos personalizados.'))return;
      await saveCatalogToCloud(DEFAULT_PRODUCTS.map(item=>({...item,published:false})),'Ejemplos restaurados como ocultos ✓');
    });
    $('adminList').addEventListener('click',async event=>{
      const edit=event.target.closest('[data-edit]');
      if(edit){renderEditor(edit.dataset.edit);return}
      const del=event.target.closest('[data-delete]');
      if(!del)return;
      const item=products.find(product=>product.id===del.dataset.delete);
      if(!item||!confirm(`¿Quitar «${item.title}» del catálogo publicado?`))return;
      await saveCatalogToCloud(products.filter(product=>product.id!==item.id),'Aplicación eliminada del catálogo ✓');
    });
  }
  function renderContactSettings(){
    view='contact-settings';fullScreen();heading('CONFIGURACIÓN','Canales de contacto');
    body.innerHTML=`<div class="admin-footnote">Estos datos se mostrarán al cliente cuando elija un servicio por consulta. Telegram es opcional.</div>
      <form id="contactForm"><div class="field"><label for="contactWhatsapp">Número de WhatsApp con código de país</label><input id="contactWhatsapp" type="tel" inputmode="tel" value="${esc(contacts.whatsapp)}" placeholder="51942978154" maxlength="18" required><small class="field-help">Si escribes nueve dígitos, añadiremos el prefijo de Perú (+51).</small></div>
      <div class="field"><label for="contactTelegram">Usuario de Telegram (opcional)</label><input id="contactTelegram" value="${esc(contacts.telegram)}" placeholder="@tuusuario" maxlength="33"><small class="field-help">Solo tu usuario público; por ejemplo, @sonyer_soporte. No escribas una contraseña.</small></div>
      <div class="modal-actions"><button class="secondary" id="cancelContact" type="button">Volver</button><button class="primary" type="submit">Guardar contacto</button></div></form>`;
    $('cancelContact').addEventListener('click',renderAdmin);
    $('contactForm').addEventListener('submit',event=>{
      event.preventDefault();if(!event.currentTarget.reportValidity())return;
      let phone=clean($('contactWhatsapp').value).replace(/\D/g,'');
      if(phone.length===9)phone='51'+phone;
      const telegram=clean($('contactTelegram').value).replace(/^@/,'');
      if(phone.length<10||phone.length>15){notify('Revisa el número con código de país');return}
      if(telegram&&!/^[a-zA-Z0-9_]{5,32}$/.test(telegram)){notify('El usuario de Telegram debe tener de 5 a 32 caracteres');return}
      contacts={whatsapp:phone,telegram};const saved=saveContacts();updateContactLinks();renderAdmin();notify(saved?'Contactos guardados en este navegador':'Contactos actualizados para esta sesión');
    });
  }
  function renderPaymentSettings(){
    view='payment-settings';fullScreen();heading('CONFIGURACIÓN','Datos de cobro');
    let nextQr=payment.qr;
    body.innerHTML=`<div class="admin-footnote">Configura el QR y titular que verán tus clientes. Guarda los cambios y luego publícalos desde el panel.</div>
      <form id="paymentForm"><div class="field"><label for="payeeName">Nombre del titular que recibe los pagos</label><input id="payeeName" name="payeeName" maxlength="100" value="${esc(payment.name)}" placeholder="Nombre completo" required></div>
      <div class="field"><label for="qrFile">Cambiar código QR</label><input id="qrFile" type="file" accept="image/png,image/jpeg,image/webp"><small class="field-help">Para sincronizar en Firestore, imagen de máximo 500 KB.</small></div>
      <div class="qr-settings-preview"><img id="qrPreview" src="${esc(payment.qr)}" alt="Código QR actual"><div><strong>QR actual</strong><small>El que verá el comprador al pagar.</small><button class="secondary compact-action" id="originalQr" type="button">Usar QR original</button></div></div>
      <div class="modal-actions"><button class="secondary" id="cancelPaymentEdit" type="button">Volver</button><button class="primary" id="savePaymentBtn" type="submit">Guardar cambios</button></div></form>`;
    $('cancelPaymentEdit').addEventListener('click',renderAdmin);
    $('originalQr').addEventListener('click',()=>{nextQr=DEFAULT_PAYMENT.qr;$('qrPreview').src=nextQr;$('qrFile').value='';notify('QR original seleccionado')});
    $('qrFile').addEventListener('change',event=>{
      const file=event.target.files?.[0];if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>500000){notify('Usa una imagen JPG, PNG o WebP de máximo 500 KB');event.target.value='';return}
      $('savePaymentBtn').disabled=true;
      const reader=new FileReader();
      reader.onload=()=>{if(typeof reader.result==='string'&&/^data:image\/(?:jpeg|png|webp);base64,/.test(reader.result)){nextQr=reader.result;$('qrPreview').src=nextQr;notify('QR cargado')}else notify('No se pudo leer la imagen');$('savePaymentBtn').disabled=false};
      reader.onerror=()=>{notify('No se pudo cargar el QR');$('savePaymentBtn').disabled=false};
      reader.readAsDataURL(file);
    });
    $('paymentForm').addEventListener('submit',event=>{
      event.preventDefault();if(!event.currentTarget.reportValidity())return;
      const name=clean($('payeeName').value);
      if(!name||!nextQr){notify('Completa los datos del cobro');return}
      payment={name,qr:nextQr};const saved=savePayment();renderAdmin();notify(saved?'QR y titular actualizados':'Cambios visibles, pero no se pudieron guardar');
    });
  }
  function renderOpinionEditor(){
    view='admin-opinion';fullScreen();heading('SONYER · ADMINISTRACIÓN','Agregar opinión');
    const available=products.filter(isPublicProduct);
    if(!available.length){
      body.innerHTML='<div class="admin-footnote">Primero publica un servicio para poder agregarle un comentario.</div><button id="backFromOpinion" class="secondary" type="button">← Volver al panel</button>';
      $('backFromOpinion').addEventListener('click',renderAdmin);
      return;
    }
    body.innerHTML=`<div class="admin-banner">Los comentarios se publican como mensajes de SONYER. Escribe información real sobre tus servicios, sin atribuirla a compradores que no la hayan enviado.</div>
      <form id="opinionForm"><div class="field"><label for="opinionProduct">Selecciona una aplicación o servicio</label><select id="opinionProduct" required>${available.map(item=>`<option value="${esc(item.id)}">${esc(item.title)}</option>`).join('')}</select></div>
      <div class="field"><label for="opinionText">Escribe tu opinión o recomendación</label><textarea id="opinionText" placeholder="Ej. Te ayudamos a configurar el acceso paso a paso después de la aprobación." minlength="12" maxlength="280" rows="5" required></textarea><small class="field-help">Se mostrará públicamente con la firma «Comentario de SONYER».</small></div>
      <div class="catalog-error" id="opinionSaveError" role="alert" hidden></div>
      <div class="modal-actions"><button class="secondary" type="button" id="cancelOpinion">Volver</button><button class="primary" type="submit" id="saveOpinion">Publicar comentario</button></div></form>`;
    $('cancelOpinion').addEventListener('click',renderAdmin);
    $('opinionForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(!event.currentTarget.reportValidity())return;
      if(opinions.length>=40){$('opinionSaveError').hidden=false;$('opinionSaveError').textContent='Has llegado a 40 comentarios. Elimina uno anterior para añadir otro.';return}
      const productId=$('opinionProduct').value,text=clean($('opinionText').value);
      if(!products.some(item=>item.id===productId&&isPublicProduct(item))||text.length<12)return;
      const next=normaliseOpinion({id:`opinion-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,productId,text,createdAt:new Date().toISOString()});
      if(!next)return;
      const save=$('saveOpinion');save.disabled=true;save.textContent='Publicando…';
      if(await saveOpinionsToCloud([next,...opinions])){renderAdmin();notify('Comentario publicado en la tienda ✓')}
      else if(save.isConnected){save.disabled=false;save.textContent='Publicar comentario';$('opinionSaveError').hidden=false;$('opinionSaveError').textContent='No se pudo publicar. Revisa tu sesión de administrador y la conexión.'}
    });
  }
  function renderEditor(id){
    const item=products.find(product=>product.id===id)||null;
    view='admin-edit';fullScreen();heading('CATÁLOGO',item?'Editar producto':'Agregar producto');
    body.innerHTML=`<div class="admin-banner">El servicio se guardará en Firebase. Puedes mostrarlo a los clientes cuando esté configurado o mantenerlo oculto hasta terminar.</div>
      <form id="productForm"><div class="form-grid">
        <div class="field wide"><label for="productTitle">Nombre del producto o servicio</label><input id="productTitle" name="title" value="${esc(item?.title||'')}" placeholder="Ej. Diseño de flyers" maxlength="70" required></div>
        <div class="field wide"><label for="productDescription">Descripción</label><textarea id="productDescription" name="description" maxlength="220" placeholder="Qué ofrece este producto o servicio">${esc(item?.description||'')}</textarea></div>
        <div class="field"><label for="productType">Categoría</label><select id="productType" name="type">${Object.entries(TYPE_LABELS).map(([key,label])=>`<option value="${key}" ${(!item&&key==='app')||item?.type===key?'selected':''}>${label}</option>`).join('')}</select></div>
        <div class="field wide"><label for="productCategory">O escribe una categoría personalizada (opcional)</label><input id="productCategory" name="category" type="text" placeholder="Ej. Seguidores, Streaming, Inteligencia artificial" maxlength="40" value="${esc(item?.category||'')}"><small class="field-help">Puedes escribir y editar el nombre libremente. Si lo completas, aparecerá en la tarjeta del producto y como filtro en el catálogo.</small></div>
        <div class="field"><label for="productMode">Tipo de venta</label><select id="productMode" name="mode"><option value="access" ${!item||item.mode==='access'?'selected':''}>Comprar acceso con registro</option><option value="contact" ${item?.mode==='contact'?'selected':''}>Consultar por WhatsApp / Telegram</option></select></div>
        <div class="field wide" id="productAppSourceField"><label for="productAppSource">Código de aplicación</label><input id="productAppSource" name="appSource" list="appPrefixes" placeholder="Ej. FREFIRE o NUEVAAPP" maxlength="24" pattern="[A-Za-z0-9]{2,24}" value="${esc(item?.appSource||'')}"><datalist id="appPrefixes">${[...new Set([...APP_PREFIXES,...products.map(product=>product.appSource).filter(Boolean)])].map(prefix=>`<option value="${esc(prefix)}">`).join('')}</datalist><small class="field-help">Puedes añadir aplicaciones nuevas con un código propio. La tienda las registrará automáticamente en Firebase. Para que su app acepte el acceso, debe utilizar el formato de cuentas SONYER o disponer de su propia integración.</small></div>
        <div class="field"><label for="productPrice">Precio normal (S/)</label><input id="productPrice" name="price" type="number" min="0.01" max="10000" step="0.01" placeholder="30.00" value="${item?item.price:''}" required></div>
        <div class="field"><label for="productDiscount">Descuento (%) · Opcional</label><input id="productDiscount" name="discount" type="number" min="0" max="90" step="1" value="${item?.discount||0}" required><small class="field-help">0 = sin oferta. Máximo 90% de descuento.</small></div>
        <div class="field wide" id="productUrlField"><label for="productUrl">Enlace de ingreso (HTTPS)</label><input id="productUrl" name="url" type="url" pattern="https://.*" placeholder="https://tu-dominio.com/ingresar" value="${esc(item?.url||'')}" maxlength="400"><small class="field-help">Solo para productos que se entregan con acceso.</small></div>
      </div><label class="toggle-row" id="productSellerRow"><input id="productSeller" type="checkbox" ${item?.seller?'checked':''}>Pedir ID del vendedor al crear cuenta</label>
      <label class="toggle-row product-published-row"><input id="productPublished" type="checkbox" ${!item||isPublicProduct(item)?'checked':''}>Mostrar este servicio en el catálogo público</label>
      <small class="field-help">Si lo desactivas, el servicio no aparecerá en la tienda ni se ofrecerá para nuevas compras.</small>
      <div class="editor-preview-price" id="editorPreviewPrice"></div>
      <div class="catalog-error" id="editorSaveError" role="alert" hidden></div>
      <div class="modal-actions"><button class="secondary" id="cancelEdit" type="button">Volver</button><button class="primary" type="submit">Guardar producto</button></div></form>`;
    const updateEditor=()=>{
      const isAccess=$('productMode').value==='access';
      $('productUrlField').hidden=!isAccess;$('productSellerRow').hidden=!isAccess;$('productUrl').required=isAccess;
      $('productAppSourceField').hidden=!isAccess;
      $('productAppSource').required=isAccess;
      const price=Number($('productPrice').value),discount=Number($('productDiscount').value);
      $('editorPreviewPrice').textContent=price>0&&discount>=0&&discount<=90?`Precio que verá el cliente: ${money(Math.round(price*(100-discount))/100)}`:'Introduce un precio válido';
    };
    ['productMode','productPrice','productDiscount'].forEach(key=>$(key).addEventListener('input',updateEditor));
    updateEditor();
    $('cancelEdit').addEventListener('click',renderAdmin);
    $('productForm').addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
      $('editorSaveError').hidden=true;
      const data=new FormData(form);const next=normaliseProduct({id:item?.id||`product-${Date.now()}`,title:data.get('title'),description:data.get('description'),price:data.get('price'),discount:data.get('discount'),type:data.get('type'),category:data.get('category'),mode:data.get('mode'),seller:$('productSeller').checked,appSource:data.get('appSource'),url:data.get('url'),published:$('productPublished').checked});
      if(!next||(next.mode==='access'&&!next.url)){notify('Revisa el precio, descuento y enlace HTTPS');return}
      const nextProducts=item?products.map(product=>product.id===item.id?next:product):[...products,next];
      const button=form.querySelector('button[type="submit"]');
      button.disabled=true;button.textContent='Guardando en Firebase…';
      const saved=await saveCatalogToCloud(nextProducts,next.published?'Servicio guardado y publicado ✓':'Servicio guardado como oculto ✓');
      if(saved)renderAdmin();
      else if(button.isConnected){button.disabled=false;button.textContent='Guardar producto'}
    });
  }

  $('filters').addEventListener('click',event=>{
    const button=event.target.closest('[data-filter]');if(!button)return;
    filter=button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('active',el===button));
    renderCatalog();
  });
  $('search').addEventListener('input',event=>{search=event.target.value;renderCatalog()});
  $('catalogSort').addEventListener('change',event=>{sortMode=event.target.value==='popular'?'popular':'normal';renderCatalog()});
  $('catalog').addEventListener('click',event=>{
    const heart=event.target.closest('[data-like]');if(heart){toggleProductLike(heart.dataset.like);return}
    const card=event.target.closest('[data-buy]');
    if(!card)return;
    const image=event.target.closest('.cover.has-catalog-artwork');
    if(image){openProductGallery(card.dataset.buy,image.querySelector('.catalog-preview-image.is-playing,.catalog-preview-video.is-playing')?1:0);return}
    beginPurchase(card.dataset.buy);
  });
  $('popularShowcase').addEventListener('click',event=>{
    const card=event.target.closest('[data-buy]');if(!card)return;
    if(event.target.closest('.popular-art.has-image'))openProductGallery(card.dataset.buy);
    else beginPurchase(card.dataset.buy);
  });
  ['pointerdown','touchstart','wheel','keydown'].forEach(type=>$('popularShowcase').addEventListener(type,()=>{lastPopularInteraction=Date.now()},{passive:true}));
  setInterval(()=>{
    const track=$('popularCards');
    if(!track||document.hidden||overlay.classList.contains('open')||Date.now()-lastPopularInteraction<6500||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    if(track.scrollWidth<=track.clientWidth+5)return;
    const card=track.querySelector('.popular-card');
    const step=(card?.getBoundingClientRect().width||240)+9;
    if(track.scrollLeft+track.clientWidth>=track.scrollWidth-8)track.scrollTo({left:0,behavior:'smooth'});
    else track.scrollBy({left:step,behavior:'smooth'});
  },4400);
  $('adminLogo').addEventListener('click',adminLogin);
  $('howToBuy').addEventListener('click',openBuyingGuide);
  $('myPurchases').addEventListener('click',openPurchases);
  $('storeSettings').addEventListener('click',openSettings);
  $('closeModal').addEventListener('click',closeModal);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeModal()});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&overlay.classList.contains('open')){closeModal();return}
    if(view==='product-gallery'&&overlay.classList.contains('open')){
      if(event.key==='ArrowLeft'){$('galleryPrevious')?.click();event.preventDefault()}
      if(event.key==='ArrowRight'){$('galleryNext')?.click();event.preventDefault()}
    }
  });
  const firebaseTimeout=setTimeout(()=>{if(!firebaseStore){firebaseState='sin conexión';if(view==='settings'||view==='admin')notify('Firebase no respondió. Puedes usar la vista local')}},12000);
  if(window.sonyerFirebaseReady){
    window.sonyerFirebaseReady.then(result=>{
      clearTimeout(firebaseTimeout);
      if(!result?.ok){firebaseState='sin conexión';console.warn('SONYER: SDK Firebase no disponible');return}
      firebaseStore=result.api;
      firebaseState='conectado';
      setInterval(()=>{if(!document.hidden)refreshEngagement()},90000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshEngagement()});
      purchases.forEach(item=>watchKnownOrder(item.id));
      firebaseStore.onAuthChanged(user=>{
        firebaseAccount=user;
        accountPreview=user?{email:user.email||'',uid:user.uid}:null;
        if(view==='settings')renderSettings();
      });
      firebaseStore.watchCatalog(data=>{
        if(data===null){catalogReady=true;refreshEngagement();return}
        if(!Array.isArray(data)||data.length>60){catalogReady=false;return}
        const remote=data.map(normaliseProduct).filter(Boolean);
        if(remote.length!==data.length){catalogReady=false;return}
        catalogReady=true;
        // Firestore can emit an optimistic snapshot before the write succeeds.
        // Only accept it as the catalog after the owner's save is confirmed.
        if(catalogSaving)return;
        products=remote;saveCatalog();renderCatalog();
        refreshEngagement();
        if(view==='admin')renderAdmin();
      },error=>{
        catalogReady=false;
        console.warn('SONYER: catálogo remoto no disponible',error?.code||error?.message)
      });
      firebaseStore.watchSettings(data=>{
        if(!data||typeof data!=='object')return;
        const name=clean(data.name).slice(0,100),qr=String(data.qr||'');
        if(name&&(qr===DEFAULT_PAYMENT.qr||(/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(qr)&&qr.length<900000))){
          payment={name,qr};savePayment();
        }
        const phone=clean(data.whatsapp).replace(/\D/g,'').slice(0,15);
        if(phone.length>=10){contacts.whatsapp=phone;contacts.telegram=clean(data.telegram).replace(/^@/,'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);saveContacts();updateContactLinks()}
      },error=>{console.warn('SONYER: ajustes remotos no disponibles',error?.code||error?.message)});
      if(firebaseStore.watchOpinions)firebaseStore.watchOpinions(data=>{
        if(!Array.isArray(data)||data.length>40)return;
        const safe=data.map(normaliseOpinion).filter(Boolean);
        if(safe.length!==data.length)return;
        opinions=safe;
        renderCatalog();
        if(view==='admin')renderAdmin();
      },error=>console.warn('SONYER: no se pudieron leer comentarios',error?.code||error?.message));
    });
  }
  renderCatalog();
  updateContactLinks();
  updatePurchaseCount();
})();
