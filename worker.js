export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || "";
    const PROJECT_ID = env.FIREBASE_PROJECT_ID || "dompetkos-b5877";
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
      if(!s||s==="-"||s==="skip") return isoOf(new Date());
      if(s.startsWith("kemarin")) return isoOf(new Date(Date.now()-864e5));
      if(s.startsWith("besok")) return isoOf(new Date(Date.now()+864e5));
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

    const COLORS=["#fb923c","#c4f542","#22d3ee","#c084fc","#f472b6","#fbbf24","#f87171","#94a3b8"];

    const tg = async (method, body) => {
      const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
      if(!r.ok) console.error(`tg ${method} fail:`, JSON.stringify(r));
      return r;
    };
    const send = (chatId, text, reply_markup) => tg("sendMessage",{chat_id:chatId, text, parse_mode:"HTML", ...(reply_markup&&{reply_markup})});
    const edit = (chatId, mid, text, reply_markup) => tg("editMessageText",{chat_id:chatId, message_id:mid, text, parse_mode:"HTML", ...(reply_markup&&{reply_markup})});

    const unpack = (d)=>({id:d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,Object.values(v)[0]]))});
    const fsList = async (col)=>{
      const r=await fetch(`${FS}/${col}?pageSize=1000`).then(r=>r.json());
      if(r.error) throw new Error(r.error.message);
      return (r.documents||[]).map(unpack);
    };
    const fsAdd = async (col,obj,docId)=>{
      const fields={};
      for(const [k,v] of Object.entries(obj)) fields[k]= typeof v==="number" ? (Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}) : {stringValue:String(v)};
      const url=`${FS}/${col}${docId?`?documentId=${encodeURIComponent(docId)}`:""}`;
      const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fields})}).then(r=>r.json());
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

    const saldoBulanIni = async ()=>{
      const now=new Date(), first=isoOf(new Date(now.getFullYear(),now.getMonth(),1));
      const txs=await fsList("transactions");
      let masuk=0, keluar=0, piutang=0;
      for(const t of txs){
        if(String(t.date)<first) continue;
        if(t.type==="expense") keluar+=Number(t.amount)||0;
        else if(t.status==="pending") piutang+=Number(t.amount)||0;
        else if((t.status||"received")==="received") masuk+=Number(t.amount)||0;
      }
      return {masuk, keluar, piutang};
    };
    const saldoText = async ()=>{
      const {masuk,keluar,piutang}=await saldoBulanIni();
      let out=`💰 <b>Saldo bulan ini</b>\n\nMasuk: ${fmtRp(masuk)}\nKeluar: ${fmtRp(keluar)}`;
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
          await send(chatId,"👋 <b>DompetKos Bot</b>\n\n/input — catat transaksi\n/saldo — cek saldo\n/batal — batalkan\n\nNominal: 15000, 15rb, 2jt (titik/koma bebas)\nTanggal: kirim - untuk hari ini, atau kemarin, 20/8, 2026-08-20\n\nBot & web pakai data yang sama.");
          return;
        }
        if(cmd==="/saldo"){ try{ await send(chatId, await saldoText()); }catch(e){ await send(chatId,"Gagal ambil saldo: "+esc(e.message)); } return; }
        if(cmd==="/input"||cmd==="/catat"){ await askType(chatId); return; }
        if(cmd==="/batal"){ await delSession(String(chatId)); await send(chatId,"Dibatalkan."); return; }
        return;
      }
      const sess=await getSession(String(chatId));
      if(!sess){ await send(chatId,"Ketik /input buat catat transaksi, atau /saldo buat cek saldo."); return; }
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
          await send(chatId,"Tanggalnya kapan? Kirim - untuk hari ini.\nContoh: kemarin, 20/8, 2026-08-20");
          return;
        }
        case "date":{
          const date=parseDate(text);
          if(!date){ await send(chatId,"Tanggalnya nggak kebaca. Kirim - untuk hari ini. Contoh: kemarin, 20/8, 2026-08-20"); return; }
          let catId=sess.catId, catName="";
          if(catId){
            try{
              const r=await fetch(`${FS}/categories/${catId}`).then(r=>r.json());
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
