/* SONYER Store · Firebase bridge (registration + linked orders).
 * Registration writes a NEW pending app profile or reuses an authenticated
 * pending profile. Only the Firebase-owner session may approve it.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getFirestore, collection, doc, setDoc, updateDoc, getDoc, getDocs, getCountFromServer, writeBatch, onSnapshot, serverTimestamp, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, deleteUser, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCfjKjr5rqM8qzpUpgqKfWMx3QsiPMHUeY',
  authDomain: 'login-48d79.firebaseapp.com',
  projectId: 'login-48d79',
  storageBucket: 'login-48d79.firebasestorage.app',
  messagingSenderId: '1081911677152',
  appId: '1:1081911677152:web:dfe5416b6fe656f8994085',
  measurementId: 'G-KG2RDVTX9E'
};

// Copy the owner's Firebase Authentication UID here after finding it in
// Firebase Console > Authentication > Users. This is an identifier, NOT a secret.
const OWNER_UID = 'rPuIcSNugUV5YqwPAAKINUdL6MG3';

function fnv1a(str){
  let hash=0x811c9dc5;
  for(let i=0;i<str.length;i++){
    hash ^= str.charCodeAt(i);
    hash=Math.imul(hash,0x01000193);
  }
  return hash>>>0;
}
function slug(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36)||'user';
}
function bcpAuthEmail(seller,user){
  const raw=`${seller}|${user}`.toLowerCase();
  const safe=raw.replace(/[^a-z0-9._-]/g,'_').slice(0,42);
  return `u.${safe}.${fnv1a(raw).toString(36)}@login-48d79.firebaseapp.com`;
}
function interbankAuthEmail(seller,user){
  const rawUser=user.replace(/^IBK2-\s*/i,'').replace(/^Interbank-\s*/i,'').trim();
  const hash=fnv1a('interbank|'+seller+'|'+rawUser.toLowerCase()).toString(16).padStart(8,'0');
  return `interbank.${slug(seller)}.${slug(rawUser)}.${hash}@users.login-48d79.test`;
}
// Legacy formats are intentionally preserved. All new apps use one shared
// registration contract and are added through owner-published catalog entries.
const APP_LEGACY={
  Yape:{code:'Yape',source:'Yape',displayName:'Yape',kind:'legacy'},
  BCP:{code:'BCP',source:'firebase',displayName:'BCP',kind:'legacy'},
  interbank:{code:'interbank',source:'interbank',displayName:'Interbank',kind:'legacy'}
};
const APP_PRESETS={
  FREFIRE:{code:'FREFIRE',source:'frefire_sonyer',displayName:'Free Fire',kind:'standard',usernamePrefix:'frefire_',emailPrefix:'frefire'},
  TIKTOK:{code:'TIKTOK',source:'tiktok',displayName:'TikTok',kind:'standard',usernamePrefix:'tiktok_',emailPrefix:'tiktok'}
};
function validAppCode(code){return /^[A-Za-z0-9]{2,24}$/.test(code)}
// Older catalog entries may be marked as "access" without an app code.
// They can stay visible, but must not block publishing newer products.
function pricedAccess(product){
  return product?.published!==false && product?.mode==='access' && validAppCode(String(product.appSource||'').trim());
}
function appDefinition(raw){
  const code=String(raw||'').trim();
  if(!validAppCode(code))throw new Error('Código de aplicación inválido');
  const canonical=APP_LEGACY[code]||APP_PRESETS[code];
  return canonical||{code,source:code.toLowerCase(),displayName:code,kind:'standard',
    usernamePrefix:code.toLowerCase()+'_',emailPrefix:code.toLowerCase()};
}
function appAuthEmail(appCode,seller,user,email,def){
  if(appCode==='Yape')return email;
  if(appCode==='BCP')return bcpAuthEmail(seller,user);
  if(appCode==='interbank')return interbankAuthEmail(seller,user);
  const identity=appCode+'|'+seller+'|'+user;
  const hash=fnv1a(identity).toString(16).padStart(8,'0');
  return `${def.emailPrefix}.${slug(seller)}.${slug(user)}.${hash}@users.login-48d79.test`;
}
function correctProfile(data,code,seller,user,def){
  if(String(data.sellerId||'').trim().toUpperCase()!==seller)return false;
  if(code==='Yape')return data.appSource==='Yape'
    && String(data.loginUsername||'').toLowerCase()===user;
  if(code==='BCP')return data.appName==='BCP'
    && String(data.loginUsername||data.username||'').replace(/^Bcp-/i,'').toLowerCase()===user;
  if(code==='interbank')return String(data.appSource||'').toLowerCase()==='interbank'
    && String(data.loginUsername||'').replace(/^Interbank-/i,'').toLowerCase()===user;
  return data.app===code && data.appSource===def.source && data.loginUsername===user
    && typeof data.authUid==='string' && data.authUid.length>0;
}
function pendingProfile(code,seller,user,email,uid,def){
  const common={sellerId:seller,approved:false,approvalStatus:'pending',createdAt:serverTimestamp()};
  if(code==='Yape')return {...common,username:`Yape_${user}`,loginUsername:user,
    appUsername:`Yape_${user}`,appSource:'Yape',appName:'Yape',sourceLabel:'Yape',
    email,emailLower:email,authUid:uid,authManaged:true,deviceId:null};
  if(code==='BCP')return {...common,username:user,loginUsername:user,appUsername:user,
    appName:'BCP',appSource:'firebase',sourceLabel:'firebase',recoveryEmail:email,
    active:true,status:'pending',deviceId:'',previousDeviceId:'',updatedAt:serverTimestamp()};
  if(code==='interbank')return {...common,username:`Interbank-${user}`,
    loginUsername:user,appUsername:`Interbank-${user}`,appName:'Interbank',
    appSource:'interbank',recoveryEmail:email,active:true,status:'pending',
    deviceId:'',sessionVersion:1,updatedAt:serverTimestamp()};
  // Standard v1 contract for future apps: users/{authUid}, sellerId,
  // loginUsername, app, appSource, approved. New apps must use this contract.
  return {...common,username:def.usernamePrefix+user,appUsername:def.usernamePrefix+user,
    usernameLower:user,loginUsername:user,app:code,appCode:code,appName:code,
    appSource:def.source,email,emailLower:email,authUid:uid,authManaged:true,
    active:true,status:'pending',deviceId:'',previousDeviceId:'',sessionVersion:1,
    updatedAt:serverTimestamp()};
}

try {
  const app = initializeApp(firebaseConfig, 'sonyer-store');
  const db = getFirestore(app);
  const auth = getAuth(app);
  // Separate Auth instance: registering a customer must not log out the owner.
  const customerApp = initializeApp(firebaseConfig, 'sonyer-store-customers');
  const customerDb = getFirestore(customerApp);
  const customerAuth = getAuth(customerApp);
  // A separate anonymous identity for likes/unique views never signs out buyers.
  // Enable Anonymous in Firebase Authentication before using these features.
  const visitorApp = initializeApp(firebaseConfig, 'sonyer-store-visitors');
  const visitorDb = getFirestore(visitorApp);
  const visitorAuth = getAuth(visitorApp);
  let visitorPromise=null;
  function validEngagementProduct(id){
    const value=String(id||'');
    if(!/^[a-zA-Z0-9_-]{1,50}$/.test(value))throw new Error('Producto inválido');
    return value;
  }
  function engagementCollection(id,kind){
    return collection(visitorDb,'sonyer_store_engagement',validEngagementProduct(id),kind);
  }
  function engagementRecord(id,kind,uid){
    return doc(engagementCollection(id,kind),uid);
  }
  async function visitorUid(){
    if(visitorAuth.currentUser)return visitorAuth.currentUser.uid;
    if(!visitorPromise){
      visitorPromise=signInAnonymously(visitorAuth).then(result=>result.user.uid)
        .catch(error=>{visitorPromise=null;throw error});
    }
    return visitorPromise;
  }
  let currentLinkedAccount=null;
  const publicCatalog = doc(db, 'sonyer_store_public', 'catalog');
  const publicSettings = doc(db, 'sonyer_store_public', 'settings');
  const publicOpinions = doc(db, 'sonyer_store_public', 'opinions');
  async function isAdmin(){
    return !!auth.currentUser && auth.currentUser.uid === OWNER_UID;
  }
  async function requireAdmin(){
    if(!(await isAdmin()))throw new Error('El usuario no tiene el rol sonyerStoreAdmin');
  }

  const api = {
    projectId: firebaseConfig.projectId,
    onAuthChanged(callback) { return onAuthStateChanged(auth, callback); },
    getCurrentUser() { return auth.currentUser; },
    async createAccount(email, password) { return createUserWithEmailAndPassword(auth, email, password); },
    async signIn(email, password) { return signInWithEmailAndPassword(auth, email, password); },
    async signOut() { return signOut(auth); },
    isAdmin,
    async getEngagement(productId){
      const id=validEngagementProduct(productId);
      const [likedCount,viewCount]=await Promise.all([
        getCountFromServer(query(engagementCollection(id,'likes'),where('liked','==',true))),
        getCountFromServer(engagementCollection(id,'views'))
      ]);
      let liked=false;
      try{
        const uid=await visitorUid();
        const ownLike=await getDoc(engagementRecord(id,'likes',uid));
        liked=ownLike.exists()&&ownLike.data()?.liked===true;
      }catch(error){
        // Public counts still work if Anonymous auth has not been enabled yet.
        console.warn('SONYER: no se pudo identificar al visitante',error?.code||error?.message);
      }
      return {likes:likedCount.data().count,views:viewCount.data().count,liked};
    },
    async toggleEngagementLike(productId){
      const id=validEngagementProduct(productId);
      const uid=await visitorUid();
      const ref=engagementRecord(id,'likes',uid);
      const current=await getDoc(ref);
      const liked=!(current.exists()&&current.data()?.liked===true);
      if(current.exists())await updateDoc(ref,{liked,updatedAt:serverTimestamp()});
      else await setDoc(ref,{liked:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      return liked;
    },
    async recordUniqueView(productId){
      const id=validEngagementProduct(productId);
      const uid=await visitorUid();
      const ref=engagementRecord(id,'views',uid);
      if((await getDoc(ref)).exists())return false;
      try{await setDoc(ref,{viewedAt:serverTimestamp()});return true}
      catch(error){
        if(error?.code==='already-exists')return false;
        throw error;
      }
    },
    async linkOrCreateAppAccount({appCode,seller,username,email,password}) {
      const code=String(appCode||'').trim();
      const def=appDefinition(code);
      const s=String(seller||'').trim().toUpperCase();
      const u=String(username||'').trim().toLowerCase();
      const mail=String(email||'').trim().toLowerCase();
      // Only owner-published apps may receive orders. Neither an untrusted
      // catalog field nor a buyer can register a new application definition.
      const appSnap=await getDoc(doc(customerDb,'sonyer_store_apps',code));
      const registered=appSnap.exists()?appSnap.data():null;
      if(!registered||registered.active!==true||registered.code!==code||
          registered.source!==def.source)
        throw new Error('Esta aplicación aún no está publicada para compras');
      if(!/^[A-Z0-9_-]{2,32}$/.test(s)||!/^[a-z0-9._-]{3,35}$/.test(u))throw new Error('Revisa ID vendedor y nombre de usuario');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||String(password||'').length<6)throw new Error('Revisa el correo y la contraseña');
      const sellerSnapshot=await getDoc(doc(customerDb,'sellers',s));
      if(!sellerSnapshot.exists()||sellerSnapshot.data()?.active!==true)throw new Error('Ese vendedor no existe o no está activo');
      const authEmail=appAuthEmail(code,s,u,mail,def);
      // For Yape, reject a duplicate seller+username even if a different email is used.
      if(code==='Yape'){
        const duplicates=await getDocs(query(collection(customerDb,'users'),
          where('sellerId','==',s),where('loginUsername','==',u),limit(3)));
        if(!duplicates.empty && !duplicates.docs.some(d=>
          String(d.data()?.emailLower||d.data()?.email||'').trim().toLowerCase()===mail)){
          throw new Error('Ese usuario de Yape ya existe para este vendedor');
        }
      }
      let created=false,credential;
      try {
        try {
          credential=await signInWithEmailAndPassword(customerAuth,authEmail,password);
        } catch(error){
          if(error?.code==='auth/invalid-credential'||error?.code==='auth/user-not-found'){
            credential=await createUserWithEmailAndPassword(customerAuth,authEmail,password);
            created=true;
          }else throw error;
        }
        let userDoc=doc(customerDb,'users',credential.user.uid);
        let snap=await getDoc(userDoc);
        if(!snap.exists() && !created && code==='Yape'){
          // Legacy Yape versions use a random Firestore document ID.
          const legacy=await getDocs(query(collection(customerDb,'users'),
            where('authUid','==',credential.user.uid),limit(2)));
          if(legacy.size===1){userDoc=legacy.docs[0].ref;snap=legacy.docs[0]}
        }
        if(created){
          await setDoc(userDoc,pendingProfile(code,s,u,mail,credential.user.uid,def));
        }else if(!snap.exists()||!correctProfile(snap.data(),code,s,u,def)){
          throw new Error('Ese correo o usuario pertenece a otra cuenta');
        }else if(snap.data().approved===true){
          throw new Error('Esta cuenta ya está aprobada; puedes ingresar a la app');
        }else if(snap.data().active===false ||
          ['blocked','rejected','suspended'].includes(String(snap.data().status||'').toLowerCase()) ||
          ['blocked','rejected'].includes(String(snap.data().approvalStatus||'').toLowerCase())){
          throw new Error('La cuenta está bloqueada o desactivada');
        }
        currentLinkedAccount={authUid:credential.user.uid,userDocId:userDoc.id,appCode:code,
          sellerId:s,loginUsername:u};
        return {created,...currentLinkedAccount};
      }catch(error){
        if(created&&credential?.user){try{await deleteUser(credential.user)}catch(_){}}
        currentLinkedAccount=null;
        throw error;
      }
    },
    linkedAccount(){return currentLinkedAccount;},
    watchCatalog(onData, onError) {
      return onSnapshot(publicCatalog, snapshot => onData(snapshot.exists() ? snapshot.data().products : null), onError);
    },
    watchSettings(onData, onError) {
      return onSnapshot(publicSettings, snapshot => onData(snapshot.exists() ? snapshot.data() : null), onError);
    },
    watchOpinions(onData, onError) {
      return onSnapshot(publicOpinions, snapshot => onData(snapshot.exists() ? snapshot.data().items : []), onError);
    },
    async publishOpinions(items) {
      await requireAdmin();
      if(!Array.isArray(items)||items.length>40)throw new Error('Límite de opiniones alcanzado');
      await setDoc(publicOpinions,{items,updatedAt:serverTimestamp()});
    },
    async publishCatalog(items) {
      await requireAdmin();
      // Store authoritative individual prices for Firestore order-creation rules.
      const batch=writeBatch(db);
      const activeIds=new Set(items.filter(pricedAccess).map(item=>String(item.id)));
      const existing=await getDocs(collection(db,'sonyer_store_prices'));
      existing.forEach(old=>{
        if(!activeIds.has(old.id))batch.set(old.ref,{active:false},{merge:true});
      });
      const registeredApps=new Set();
      for(const product of items){
        if(!pricedAccess(product))continue;
        const def=appDefinition(product.appSource);
        if(!registeredApps.has(def.code)){
          // Public registry is the source of truth for dynamic app codes.
          batch.set(doc(db,'sonyer_store_apps',def.code),{
            code:def.code,source:def.source,displayName:def.displayName,
            kind:def.kind,active:true,updatedAt:serverTimestamp()
          },{merge:true});
          registeredApps.add(def.code);
        }
        const price=Math.round(Number(product.price)*(100-Number(product.discount||0)))/100;
        batch.set(doc(db,'sonyer_store_prices',String(product.id)),{
          price, active:true, title:String(product.title).slice(0,70),
          appCode:String(product.appSource||'').slice(0,24)
        });
      }
      batch.set(publicCatalog,{products:items, updatedAt:serverTimestamp()}, {merge:true});
      await batch.commit();
    },
    async publishSettings(data) {
      await requireAdmin();
      await setDoc(publicSettings, {...data, updatedAt:serverTimestamp()}, {merge:true});
    },
    async submitOrder({id, productId, productTitle, total, payerName,account}) {
      if (!/^order-[a-z0-9-]{14,80}$/.test(id)) throw new Error('Identificador de pedido inválido');
      const payer=String(payerName||'').trim().replace(/\s+/g,' ').slice(0,100);
      if(payer.length<5)throw new Error('Falta nombre del pagador');
      if(!account||!customerAuth.currentUser||customerAuth.currentUser.uid!==account.authUid)
        throw new Error('La cuenta de la app no está vinculada');
      // Show the actual configuration problem before creating the order. Older
      // published price documents lack appCode until the owner republishes.
      const priceSnap=await getDoc(doc(customerDb,'sonyer_store_prices',String(productId)));
      const published=priceSnap.exists()?priceSnap.data():null;
      if(!published||published.active!==true||published.appCode!==account.appCode||
          Math.abs(Number(published.price)-Number(total))>0.001){
        throw new Error('El producto o su precio no están sincronizados. SONYER debe entrar al panel y pulsar Publicar.');
      }
      // NEVER put app passwords, recovery email, PIN or payment security code here.
      await setDoc(doc(customerDb, 'sonyer_store_orders', id), {
        productId:String(productId).slice(0,50),
        productTitle:String(productTitle).slice(0,70),
        amount:Number(total),
        payerName:payer,
        accountUid:account.authUid,
        userDocId:account.userDocId,
        appCode:account.appCode,
        sellerId:account.sellerId,
        loginUsername:account.loginUsername,
        currency:'PEN',
        status:'pending',
        createdAt:serverTimestamp(),
        source:'sonyer-store-web'
      });
    },
    watchOrder(id,onData,onError){
      if(!/^order-[a-z0-9-]{14,80}$/.test(id))throw new Error('Pedido inválido');
      return onSnapshot(doc(db,'sonyer_store_orders',id),snap=>onData(snap.exists()?snap.data():null),onError);
    },
    watchOrders(onData, onError) {
      return onSnapshot(query(collection(db, 'sonyer_store_orders'),orderBy('createdAt','desc'),limit(40)), snapshot => {
        const rows = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
        rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        onData(rows.slice(0,60));
      }, onError);
    }
  };
  window.dispatchEvent(new CustomEvent('sonyer:firebase-ready', {detail:{ok:true,api}}));
} catch(error) {
  window.dispatchEvent(new CustomEvent('sonyer:firebase-ready', {detail:{ok:false,error}}));
}
