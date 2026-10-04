export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || "";
    const PROJECT_ID = env.FIREBASE_PROJECT_ID || "dompetkos-b5877";
    const FIREBASE_API_KEY = env.FIREBASE_API_KEY || "AIzaSyBqjpuBAUVKpwGpoZjyXNVyIZHKT10nGhc";
    const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

    const fmtRp = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    const fmtDate = (iso) => { const [y,m,d]=iso.split("-").map(Number); return `${d} ${BULAN[m-1]} ${y}`; };

    function parseAmount(raw){
      let s=String(raw).toLowerCase().replace(/rp/g,"").replace(/\s/g,"");
      let mult=1, m=s.match(/(juta|jt)$/);
      if(m){ mult=1e6; s=s.slice(0,-m[0].length); }
      else if((m=s.match(/(ribu|rb|k)$/))){ mult=1e3; s=s.slice(0,-m[0].length); }
      const hasDot=s.includes("."), hasComma=s.includes(",");
      if(hasDot&&hasComma){
        const dec=s.lastIndexOf(",")>s.lastIndexOf(".") ? "," : ".";
        const thou=dec===","?".":",";
        s=s.split(thou).join("").split(dec).join(".");
      } else if(hasDot||hasComma){
        const sep=hasDot?".":",";
        if(/^\d{1,3}([.,]\d{3})+$/.test(s)) s=s.split(sep).join("");
        else if(sep===",") s=s.replace(",",".");
      }
      const n=Number(s);
      return Number.isFinite(n)&&n>0 ? Math.round(n*mult) : 0;
    }
    function parseDate(raw){
      const s=String(raw).trim().toLowerCase();
      if(!s||s==="-"||s==="skip"||s==="hari ini"||s.startsWith("hari ini")||s==="tadi"||s.startsWith("tadi ")) return isoOf(new Date());
      if(s.startsWith("kemarin")||s.startsWith("kemaren")||s.startsWith("kmrn")) return isoOf(new Date(Date.now()-864e5));
      if(s.startsWith("besok")) return isoOf(new Date(Date.now()+864e5));
      if(s==="lusa"||s.startsWith("lusa")) return isoOf(new Date(Date.now()+2*864e5));
      let m2=s.match(/^(\d+)\s*hari\s*(yang\s*)?(lalu|yg\s*lalu)/); if(m2) return isoOf(new Date(Date.now()-parseInt(m2[1],10)*864e5));
      if(/^seminggu(\s+yang)?\s+lalu/.test(s)) return isoOf(new Date(Date.now()-7*864e5));
      if(/^sebulan(\s+yang)?\s+lalu/.test(s)){ const d=new Date(); d.setMonth(d.getMonth()-1); return isoOf(d); }
      let y,mo,d,hadYear=true, m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
      if(m){ y=+m[1]; mo=+m[2]; d=+m[3]; }
      else if((m=s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/))){
        d=+m[1]; mo=+m[2];
        if(m[3]!=null){ y=+m[3]; if(y<100) y+=2000; }
        else { y=new Date().getFullYear(); hadYear=false; }
      } else return null;
      if(mo<1||mo>12||d<1||d>31) return null;
      const dt=new Date(y,mo-1,d);
      if(dt.getMonth()!==mo-1||dt.getDate()!==d) return null;
      let out=isoOf(dt);
      if(!hadYear&&out>isoOf(new Date())) out=isoOf(new Date(y-1,mo-1,d));
      return out;
    }

    function parseQuickInput(raw, categories){
      const original=String(raw).trim();
      if(!original || original.startsWith("/")) return null;
      let working=original;
      const lower=original.toLowerCase();
      let date=null, dateRaw=null;
      const dateRegex=/\b(\d+\s*hari\s*(yang\s*)?(lalu|yg\s*lalu)|seminggu(\s+yang)?\s+lalu|sebulan(\s+yang)?\s+lalu|hari ini|kemarin|kemaren|kmrn|besok|lusa|tadi|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\b/gi;
      let m;
      while((m=dateRegex.exec(lower))!==null){
        const cand=m[0];
        const parsed=parseDate(cand);
        if(parsed){ date=parsed; dateRaw=cand; break; }
      }
      if(dateRaw){
        const idx=lower.indexOf(dateRaw.toLowerCase());
        if(idx!==-1) working=working.slice(0,idx)+" "+working.slice(idx+dateRaw.length);
      }
      if(!date) date=isoOf(new Date());
      const lower2=working.toLowerCase();
      const amtRegex=/(?:rp\s*)?\d[\d.,]*\s*(?:juta|jt|ribu|rb|k)?\b/gi;
      let amount=0, amountRaw=null;
      let a;
      while((a=amtRegex.exec(lower2))!==null){
        const cand=a[0];
        const parsed=parseAmount(cand);
        if(parsed>0){ amount=parsed; amountRaw=cand; break; }
      }
      if(!amount) return null;
      {
        const lw=working.toLowerCase();
        const idx=lw.indexOf(amountRaw.toLowerCase().trim());
        if(idx!==-1) working=working.slice(0,idx)+" "+working.slice(idx+amountRaw.length);
      }
      let type="expense";
      const incWords=["pemasukan","masuk","income","gajian","gaji","terima","dapat","nambah"];
      const expWords=["pengeluaran","keluar","expense","beli","bayar","jajan","belanja"];
      const hasInc=incWords.some(w=>new RegExp(`\\b${w}\\b`,"i").test(original));
      const hasExp=expWords.some(w=>new RegExp(`\\b${w}\\b`,"i").test(original));
      if(hasInc && !hasExp) type="income";
      else if(hasExp && !hasInc) type="expense";
      else if(hasInc && hasExp){
        const iIdx=Math.min(...incWords.map(w=>{const i=lower.indexOf(w);return i===-1?Infinity:i}));
        const eIdx=Math.min(...expWords.map(w=>{const i=lower.indexOf(w);return i===-1?Infinity:i}));
        type=iIdx<eIdx?"income":"expense";
      }
      const allTypeWords=[...incWords,...expWords];
      for(const w of allTypeWords){
        const re=new RegExp(`\\b${w}\\b`,"i");
        if(re.test(working)){ working=working.replace(re," "); break; }
      }
      working=working.replace(/\brp\b/gi," ");
      const FOOD=["ikan","telur","nasi","ayam","tempe","tahu","sayur","sambal","rendang","soto","bakso","mie","bebek","lele","tongkol","teri","cumi","udang","daging","sapi","kambing","opor","gulai","sate","pepes","pindang","kangkung","bayam","sop","nila","kopi","teh","es","roti","susu","keju"];
      const ALIAS={makan:FOOD.concat(["makan","mkn","kuliner","warteg","jajan","sarapan","lauk","makanan","minum","ngopi","jajan"]), transport:["bensin","grab","gojek","ojek","transport","angkot","bus","kereta","parkir"], kos:["kos","kost","kontrakan","sewa"], gaji:["gaji","gajian","thr","bonus"]};
      const aliasFor=(name)=>{ const k=name.toLowerCase(); if(k.includes("makan")||k.includes("kuliner")||k.includes("jajan")) return ALIAS.makan; if(k.includes("transport")||k.includes("bensin")) return ALIAS.transport; if(k.includes("kos")) return ALIAS.kos; if(k.includes("gaji")||k.includes("income")||k.includes("pemasukan")) return ALIAS.gaji; return []; };
      let catId=null, catName="", bestScore=-1;
      if(categories && categories.length){
        const catsFiltered=categories.filter(c=>c.type===type);
        const wl=working.toLowerCase();
        for(const c of catsFiltered){
          let score=0;
          const cn=c.name.toLowerCase();
          if(wl.includes(cn)) score+=2;
          for(const al of aliasFor(c.name)) if(wl.includes(al)) score+=1;
          if(score>bestScore){ bestScore=score; catId=c.id; catName=c.name; }
        }
        if(bestScore<=0){ catId=null; catName=""; }
      }
      let note=working.trim().replace(/\s+/g," ").replace(/^[-–—]+/,"").trim().slice(0,200);
      if(catName && new RegExp("\\b"+catName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b\\s*$","i").test(note)) note=note.replace(new RegExp("\\b"+catName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b\\s*$","i"),"").trim().replace(/[,\\s]+$/,"").trim();
      return {type, amount, date, catId, catName, note, amountRaw, dateRaw};
    }

    const COLORS=["#cb6441","#b2572f","#9c87f6","#f4997b","#ded7c2","#dad2ef","#525044","#b4b1a3"];

    const tg = async (method, body) => {
      const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
      if(!r.ok) console.error(`tg ${method} fail:`, JSON.stringify(r));
      return r;
    };
    const send = (chatId, text, reply_markup) => tg("sendMessage",{chat_id:chatId, text, parse_mode:"HTML", ...(reply_markup&&{reply_markup})});
    const edit = (chatId, mid, text, reply_markup) => tg("editMessageText",{chat_id:chatId, message_id:mid, text, parse_mode:"HTML", ...(reply_markup&&{reply_markup})});

    const unpack = (d)=>({id:d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,Object.values(v)[0]]))});
    // auth anonim (tanpa password) — identitas minimal buat firestore rules;
    // token di-cache per isolate, refresh otomatis sebelum kadaluarsa
    let anonTok=null, anonExp=0;
    const anonToken = async ()=>{
      if(anonTok && Date.now()<anonExp) return anonTok;
      const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.json());
      if(!r.idToken) throw new Error("auth anonim gagal: "+((r.error&&r.error.message)||"no idToken"));
      anonTok=r.idToken;
      anonExp=Date.now()+(parseInt(r.expiresIn,10)||3600)*1000-60000;
      return anonTok;
    };
    const fsFetch = async (url,opts={})=>{
      const tok=await anonToken();
      return fetch(url,{...opts,headers:{...(opts.headers||{}),authorization:`Bearer ${tok}`}});
    };
    const fsList = async (col)=>{
      const r=await fsFetch(`${FS}/${col}?pageSize=1000`).then(r=>r.json());
      if(r.error) throw new Error(r.error.message);
      return (r.documents||[]).map(unpack);
    };
    const fsAdd = async (col,obj,docId)=>{
      const fields={};
      for(const [k,v] of Object.entries(obj)) fields[k]= typeof v==="number" ? (Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}) : {stringValue:String(v)};
      const url=`${FS}/${col}${docId?`?documentId=${encodeURIComponent(docId)}`:""}`;
      const r=await fsFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fields})}).then(r=>r.json());
      if(r.error) throw new Error(r.error.message);
      return r.name?r.name.split("/").pop():docId;
    };
    // ponytail: session di Firestore biar worker stateless tetap ingat step input
    const getSession = async (chatId)=>{
      const r=await fetch(`${FS}/telegram_sessions/${chatId}`).then(r=>r.json());
      if(r.error){ if(r.error.code===404) return null; throw new Error(r.error.message); }
      return unpack(r);
    };
    const setSession = async (chatId, data)=>{
      await fetch(`${FS}/telegram_sessions/${chatId}`,{method:"DELETE"}).catch(()=>{});
      const fields={};
      for(const [k,v] of Object.entries(data)){
        if(v===undefined||v===null) continue;
        if(k==="amount") fields[k]={integerValue:String(v)};
        else fields[k]={stringValue:String(v)};
      }
      const r=await fetch(`${FS}/telegram_sessions?documentId=${encodeURIComponent(chatId)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fields})}).then(r=>r.json());
      if(r.error) throw new Error(r.error.message);
    };
    const delSession = async (chatId)=>{ await fetch(`${FS}/telegram_sessions/${chatId}`,{method:"DELETE"}).catch(()=>{}); };

    const saldoDompet = async ()=>{
      const txs=await fsList("transactions");
      let masuk=0, keluar=0, piutang=0;
      for(const t of txs){
        if(t.type==="expense") keluar+=Number(t.amount)||0;
        else if(t.status==="pending") piutang+=Number(t.amount)||0;
        else if((t.status||"received")==="received") masuk+=Number(t.amount)||0;
      }
      return {masuk, keluar, piutang};
    };
    const saldoText = async ()=>{
      const {masuk,keluar,piutang}=await saldoDompet();
      let out=`💰 <b>Saldo dompet</b>\n\nMasuk: ${fmtRp(masuk)}\nKeluar: ${fmtRp(keluar)}`;
      if(piutang) out+=`\nPiutang: ${fmtRp(piutang)}`;
      out+=`\n\nSaldo kas: <b>${fmtRp(masuk-keluar)}</b>`;
      if(piutang) out+=`\nSaldo + piutang: <b>${fmtRp(masuk-keluar+piutang)}</b>`;
      return out;
    };

    const askType = async (chatId)=>{
      await setSession(chatId, {step:"type"});
      await send(chatId,"Catat apa?",{inline_keyboard:[[{text:"💸 Pengeluaran",callback_data:"type:expense"},{text:"💰 Pemasukan",callback_data:"type:income"}],[{text:"✖ Batal",callback_data:"cancel"}]]});
    };
    const askCategory = async (chatId, editMid)=>{
      const sess=await getSession(String(chatId));
      const cats=(await fsList("categories")).filter(c=>c.type===sess.type);
      const rows=[];
      for(let i=0;i<cats.length;i+=2) rows.push(cats.slice(i,i+2).map(c=>({text:c.name,callback_data:`cat:${c.id}`})));
      rows.push([{text:"➕ Kategori baru",callback_data:"newcat"}]);
      rows.push([{text:"✖ Batal",callback_data:"cancel"}]);
      const label=sess.type==="expense"?"pengeluaran":"pemasukan";
      const text=`Kategori ${label}:`;
      if(editMid) await edit(chatId,editMid,text,{inline_keyboard:rows});
      else await send(chatId,text,{inline_keyboard:rows});
    };

    async function handleUpdate(u){
      if(!BOT_TOKEN) return;
      if(u.callback_query){
        const cb=u.callback_query;
        if(!cb.message){ await tg("answerCallbackQuery",{callback_query_id:cb.id}); return; }
        const chatId=cb.message.chat.id, mid=cb.message.message_id, data=cb.data;
        await tg("answerCallbackQuery",{callback_query_id:cb.id});
        if(data==="cancel"){ await delSession(String(chatId)); await edit(chatId,mid,"Dibatalkan.").catch(()=>{}); return; }
        const sess=await getSession(String(chatId));
        if(!sess){ await edit(chatId,mid,"Sesi kedaluwarsa, ketik /input lagi.").catch(()=>{}); return; }
        if(data==="newcat"){ await setSession(String(chatId),{step:"newcat", type:sess.type}); await edit(chatId,mid,"Nama kategori baru?"); return; }
        if(data.startsWith("cat:")){
          const catId=data.slice(4);
          await setSession(String(chatId),{step:"amount", type:sess.type, catId});
          await edit(chatId,mid,"Nominalnya berapa?\nContoh: 15000, 15rb, 2jt");
          return;
        }
        if(data.startsWith("type:")){
          const type=data.slice(5);
          await setSession(String(chatId),{step:"category", type});
          await askCategory(chatId,mid);
          return;
        }
        return;
      }
      const msg=u.message;
      if(!msg) return;
      const chatId=msg.chat.id;
      if(msg.text==null){
        const s=await getSession(String(chatId));
        if(s) await send(chatId,"Kirim teks ya — ketik /batal buat batalkan.");
        return;
      }
      const text=msg.text.trim();
      if(text.startsWith("/")){
        const cmd=text.split(/\s+/)[0].toLowerCase().split("@")[0];
        if(cmd==="/start"||cmd==="/help"){
          await delSession(String(chatId));
          await send(chatId,"👋 <b>DompetKos Bot</b>\n\n<b>Kilat (1 baris jadi):</b>\n<code>keluar 25rb makan siang kemarin</code>\n<code>masuk 2jt gajian</code>\n<code>15rb kopi 20/8</code>\n\n/input — step-by-step\n/saldo — cek saldo\n/batal — batalkan\n\nNominal: 15000, 15rb, 2jt (titik/koma bebas)\nTanggal: Hari ini, kemarin, 20/8, 2026-08-20\n\nBot & web pakai data yang sama.");
          return;
        }
        if(cmd==="/saldo"){ try{ await send(chatId, await saldoText()); }catch(e){ await send(chatId,"Gagal ambil saldo: "+esc(e.message)); } return; }
        if(cmd==="/input"||cmd==="/catat"){ await askType(chatId); return; }
        if(cmd==="/batal"){ await delSession(String(chatId)); await send(chatId,"Dibatalkan."); return; }
        return;
      }
      const sess=await getSession(String(chatId));
      if(!sess){
        // ponytail: coba kilat dulu
        try{
          const cats=await fsList("categories");
          const q=parseQuickInput(text, cats);
          if(q){
            let catId=q.catId, catName=q.catName;
            if(!catId && q.catName) catName=q.catName;
            if(!catName && catId){
              try{ const r=await fsFetch(`${FS}/categories/${catId}`).then(r=>r.json()); if(!r.error) catName=unpack(r).name||""; }catch{}
            }
            await fsAdd("transactions",{type:q.type, category:catId||"", amount:q.amount, note:q.note||"", date:q.date, status:"received", createdAt:Date.now()});
            const jenis=q.type==="expense"?"💸 Pengeluaran":"💰 Pemasukan";
            let conf=`✅ <b>Tersimpan!</b> (kilat)\n\n${jenis} — ${esc(catName||catId||"Lainnya")}\n💵 ${fmtRp(q.amount)}`;
            if(q.note) conf+=`\n📝 ${esc(q.note)}`;
            conf+=`\n📅 ${fmtDate(q.date)}`;
            try{ conf+=`\n\n${await saldoText()}`;}catch{}
            await send(chatId, conf);
            return;
          }
        }catch(e){ console.error("quick fail:",e.message); }
        await send(chatId,"Ketik kilat contoh:\n<code>keluar 25rb makan siang kemarin</code>\n<code>masuk 2jt gajian</code>\n\natau /input buat step-by-step, /saldo cek saldo.");
        return;
      }
      switch(sess.step){
        case "type":
        case "category":{
          await send(chatId,"Pilih di tombol di atas ya.");
          return;
        }
        case "newcat":{
          const name=text.slice(0,40).trim();
          if(!name){ await send(chatId,"Nama kategorinya?"); return; }
          await setSession(String(chatId),{step:"amount", type:sess.type, newCatName:name});
          await send(chatId,`Kategori "${esc(name)}" ✅\n\nNominalnya berapa?\nContoh: 15000, 15rb, 2jt`);
          return;
        }
        case "amount":{
          const amount=parseAmount(text);
          if(!amount){ await send(chatId,"Nominalnya belum kebaca. Contoh: 15000, 15rb, 2jt"); return; }
          const data={step:"note", type:sess.type, amount:String(amount)};
          if(sess.catId) data.catId=sess.catId;
          if(sess.newCatName) data.newCatName=sess.newCatName;
          await setSession(String(chatId), data);
          await send(chatId,`${fmtRp(amount)} ✅\n\nDeskripsinya apa? Kirim - untuk lewati`);
          return;
        }
        case "note":{
          const note=(text==="-"||text.toLowerCase()==="skip")?"":text.slice(0,200);
          const data={step:"date", type:sess.type, amount:sess.amount, note};
          if(sess.catId) data.catId=sess.catId;
          if(sess.newCatName) data.newCatName=sess.newCatName;
          await setSession(String(chatId), data);
          await send(chatId,"Tanggalnya kapan? Kirim Hari ini.\nContoh: kemarin, 20/8, 2026-08-20");
          return;
        }
        case "date":{
          const date=parseDate(text);
          if(!date){ await send(chatId,"Tanggalnya nggak kebaca. Kirim Hari ini. Contoh: kemarin, 20/8, 2026-08-20"); return; }
          let catId=sess.catId, catName="";
          if(catId){
            try{
              const r=await fsFetch(`${FS}/categories/${catId}`).then(r=>r.json());
              if(!r.error) catName=unpack(r).name||"";
            }catch{}
          }
          if(sess.newCatName){
            catId=Date.now().toString();
            catName=sess.newCatName;
            await fsAdd("categories",{id:catId, name:catName, icon:"ellipsis", color:COLORS[catName.length%COLORS.length], type:sess.type}, catId);
          }
          if(!catName && catId) catName=catId;
          await fsAdd("transactions",{type:sess.type, category:catId, amount:Number(sess.amount), note:sess.note||"", date, status:"received", createdAt:Date.now()});
          await delSession(String(chatId));
          const jenis=sess.type==="expense"?"💸 Pengeluaran":"💰 Pemasukan";
          let conf=`✅ <b>Tersimpan!</b>\n\n${jenis} — ${esc(catName||"?")}\n💵 ${fmtRp(Number(sess.amount))}`;
          if(sess.note) conf+=`\n📝 ${esc(sess.note)}`;
          conf+=`\n📅 ${fmtDate(date)}`;
          try{ conf+=`\n\n${await saldoText()}`; }catch{}
          await send(chatId, conf);
          return;
        }
      }
    }

    if(request.method==="POST"){
      if(!BOT_TOKEN) console.error("BOT_TOKEN kosong! set wrangler secret put TELEGRAM_BOT_TOKEN");
      try{
        const update=await request.json();
        console.log("update:", JSON.stringify(update).slice(0,800));
        ctx.waitUntil(handleUpdate(update).catch(e=>console.error("handleUpdate error:", e, e.stack)));
      }catch(e){ console.error("parse error:", e); }
      return new Response("ok",{status:200});
    }
    return new Response("DompetKos Worker OK — set webhook ke "+request.url, {headers:{"content-type":"text/plain"}});
  }
};
