import { useState, useRef, useEffect } from "react";
import { Browser } from "@capacitor/browser";

/* ──────────────────────────────────────────────────────────────────────────
   ORYX INTERNET — App do Cliente (conectado ao n8n)

   O app NÃO fala direto com o SGP. Ele chama webhooks do n8n, e o n8n
   guarda o token do SGP e faz as chamadas reais. Assim o token nunca
   fica exposto no navegador.

   Webhooks esperados (criar no n8n — base abaixo):
   ┌────────────────────────┬──────────────────────────────┬───────────────────────────────────────────────┐
   │ POST app-login         │ { cpf }                      │ { ok, nome, contratoId, clienteId, plano,     │
   │                        │                              │   valor, status }                              │
   │ POST app-boletos       │ { cpf, contrato }            │ { boletos:[{ mes,valor,venc,status,linha,link}]}│
   │ POST app-os            │ { contrato_id, cliente_id }  │ { os:[{ id,tipo,data,status,tec,hora,desc }] } │
   │ POST app-os-abrir      │ { cpf, contrato, tipo, desc }│ { ok, protocolo }                              │
   │ POST app-desbloqueio   │ { contrato }                 │ { ok, mensagem, liberado_dias, data_promessa } │
   │ POST app-contrato-aceite│ { idcontrato }              │ { ok, protocolo }                              │
   └────────────────────────┴──────────────────────────────┴───────────────────────────────────────────────┘

   Enquanto os webhooks não existem, cada tela cai em "modo demonstração".
   ────────────────────────────────────────────────────────────────────────── */

const API_BASE = "https://n8n02.proativaia.com.br/webhook";

const api = async (path, body) => {
  const r = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
};


const themes = {
  light: {
    y:"#FFD633", yd:"#F5C200", g:"#16a34a", r:"#dc2626", p:"#6366f1", o:"#ea580c", wa:"#1eb053",
    bg:"#fdf6da", card:"#ffffff", t:"#16161d",
    b:"rgba(0,0,0,0.10)", s:"rgba(0,0,0,0.50)", m:"rgba(0,0,0,0.30)",
    surf:"rgba(0,0,0,0.03)", surf2:"rgba(0,0,0,0.06)",
    line:"rgba(0,0,0,0.08)", line2:"rgba(0,0,0,0.12)", line3:"rgba(0,0,0,0.18)",
    tx7:"rgba(0,0,0,0.70)", t3:"rgba(0,0,0,0.35)", lbl:"rgba(0,0,0,0.50)",
    head:"linear-gradient(160deg,#fffaf0,#fff7d6)", nav:"#ffffff", canvas:"#eef0f3",
    logoNeg:false,
  },
  dark: {
    y:"#FFD633", yd:"#F5C200", g:"#34d399", r:"#f87171", p:"#818cf8", o:"#fb923c", wa:"#25D366",
    bg:"#080810", card:"#0f0f18", t:"#ffffff",
    b:"rgba(255,255,255,0.08)", s:"rgba(255,255,255,0.4)", m:"rgba(255,255,255,0.18)",
    surf:"rgba(255,255,255,0.04)", surf2:"rgba(255,255,255,0.07)",
    line:"rgba(255,255,255,0.06)", line2:"rgba(255,255,255,0.10)", line3:"rgba(255,255,255,0.15)",
    tx7:"rgba(255,255,255,0.70)", t3:"rgba(255,255,255,0.30)", lbl:"rgba(255,255,255,0.45)",
    head:"linear-gradient(160deg,#151520,#1a1a2e)", nav:"#0d0d18", canvas:"#0a0a14",
    logoNeg:true,
  },
};
// objeto compartilhado de cores, atualizado conforme o tema (padrão: claro)
const C = { ...themes.light };

const onlyDigits = v => (v || "").replace(/\D/g, "");
const fmtCpf = v => onlyDigits(v).slice(0,11).replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");
const maskCpf = v => onlyDigits(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4");
const fmtDoc = v => { const d=onlyDigits(v).slice(0,14); return d.length<=11
  ? d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2")
  : d.replace(/(\d{2})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1/$2").replace(/(\d{4})(\d{1,2})$/,"$1-$2"); };
const maskDoc = v => { const d=onlyDigits(v); return d.length<=11
  ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4")
  : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5"); };
const docLabel = v => onlyDigits(v).length>11 ? "CNPJ" : "CPF";

const LogoV = ({h=90}) => {
  const word=C.t, muito=C.logoNeg?"#F5C200":"#2b2b3d", rapida=C.logoNeg?"#ffffff":"#2b2b3d";
  return (
    <svg height={h} viewBox="0 0 200 232" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="gv"><circle cx="100" cy="70" r="44"/></clipPath><clipPath id="ov"><circle cx="100" cy="70" r="60"/></clipPath></defs>
      <circle cx="100" cy="70" r="60" fill="#F5C200"/>
      <g clipPath="url(#ov)"><ellipse cx="116" cy="92" rx="46" ry="36" fill="#E5A800" opacity="0.45"/></g>
      <circle cx="100" cy="70" r="44" fill="#3D3D5C"/>
      <g clipPath="url(#gv)" transform="rotate(-18 100 70)" stroke="#F5C200" strokeWidth="2.2" fill="none" strokeLinecap="round">
        <ellipse cx="100" cy="70" rx="14" ry="44"/>
        <ellipse cx="100" cy="70" rx="30" ry="44"/>
        <line x1="100" y1="26" x2="100" y2="114"/>
        <ellipse cx="100" cy="70" rx="44" ry="14"/>
        <ellipse cx="100" cy="70" rx="44" ry="30"/>
        <line x1="56" y1="70" x2="144" y2="70"/>
      </g>
      <circle cx="100" cy="70" r="43" fill="none" stroke="#F5C200" strokeWidth="2.4"/>
      <g transform="rotate(-18 100 70)" fill="#F5C200">
        <circle cx="100" cy="26" r="4.5"/><circle cx="100" cy="114" r="4.5"/>
        <circle cx="56" cy="70" r="4.5"/><circle cx="144" cy="70" r="4.5"/>
        <circle cx="72" cy="46" r="3"/><circle cx="128" cy="94" r="3"/>
      </g>
      <text x="100" y="178" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="44" fill={word}>Oryx</text>
      <text x="100" y="204" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="12" letterSpacing="1.5"><tspan fill={muito}>MUITO MAIS </tspan><tspan fill={rapida}>RÁPIDA!</tspan></text>
    </svg>
  );
};
const LogoH = ({h=28}) => {
  const word=C.t, muito=C.logoNeg?"#F5C200":"#2b2b3d", rapida=C.logoNeg?"#ffffff":"#2b2b3d";
  return (
    <svg height={h} viewBox="0 0 360 92" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="gh"><circle cx="46" cy="46" r="31"/></clipPath><clipPath id="oh"><circle cx="46" cy="46" r="42"/></clipPath></defs>
      <circle cx="46" cy="46" r="42" fill="#F5C200"/>
      <g clipPath="url(#oh)"><ellipse cx="58" cy="60" rx="32" ry="26" fill="#E5A800" opacity="0.45"/></g>
      <circle cx="46" cy="46" r="31" fill="#3D3D5C"/>
      <g clipPath="url(#gh)" transform="rotate(-18 46 46)" stroke="#F5C200" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <ellipse cx="46" cy="46" rx="10" ry="31"/>
        <ellipse cx="46" cy="46" rx="21" ry="31"/>
        <line x1="46" y1="15" x2="46" y2="77"/>
        <ellipse cx="46" cy="46" rx="31" ry="10"/>
        <ellipse cx="46" cy="46" rx="31" ry="21"/>
        <line x1="15" y1="46" x2="77" y2="46"/>
      </g>
      <circle cx="46" cy="46" r="30" fill="none" stroke="#F5C200" strokeWidth="1.8"/>
      <g transform="rotate(-18 46 46)" fill="#F5C200">
        <circle cx="46" cy="15" r="3.2"/><circle cx="46" cy="77" r="3.2"/>
        <circle cx="15" cy="46" r="3.2"/><circle cx="77" cy="46" r="3.2"/>
        <circle cx="64" cy="30" r="2.2"/><circle cx="28" cy="62" r="2.2"/>
      </g>
      <text x="100" y="56" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="46" fill={word}>Oryx</text>
      <text x="102" y="78" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="12" letterSpacing="1"><tspan fill={muito}>MUITO MAIS </tspan><tspan fill={rapida}>RÁPIDA!</tspan></text>
    </svg>
  );
};

const Btn = ({label,onClick,disabled=false,s={}}) => (
  <button onClick={onClick} disabled={disabled} style={{background:`linear-gradient(135deg,${C.y},${C.yd})`,color:"#1a1000",border:"none",borderRadius:14,padding:15,fontSize:15,fontWeight:800,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.35:1,width:"100%",boxShadow:"0 6px 20px rgba(245,194,0,0.22)",...s}}>{label}</button>
);

const Badge = ({label,color}) => (
  <span style={{background:`${color}18`,border:`1px solid ${color}44`,borderRadius:20,padding:"3px 10px",color,fontSize:11,fontWeight:700,textTransform:"uppercase"}}>{label}</span>
);

const Back = ({onClick}) => (
  <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:C.s,fontSize:13,cursor:"pointer",padding:0}}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg> Voltar
  </button>
);

const DemoChip = () => (
  <span style={{alignSelf:"flex-start",background:"rgba(251,146,60,0.12)",border:"1px solid rgba(251,146,60,0.3)",borderRadius:20,padding:"3px 10px",color:C.o,fontSize:10,fontWeight:700}}>⚠️ modo demonstração</span>
);

const Spinner = ({label="Carregando..."}) => (
  <div style={{padding:"40px 20px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,minHeight:200}}>
    <div style={{width:48,height:48,borderRadius:"50%",border:"3px solid ${C.line2}",borderTopColor:C.y,animation:"spin 0.8s linear infinite"}}/>
    <p style={{color:C.s,fontSize:13,margin:0}}>{label}</p>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const ThemeBtn = ({theme,onClick}) => (
  <button onClick={onClick} aria-label="Alternar tema" style={{width:36,height:36,borderRadius:"50%",background:C.surf2,border:`1px solid ${C.b}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.t,fontSize:16,flexShrink:0}}>{theme==="light"?"🌙":"☀️"}</button>
);

// ─── ICONS ───
const Ico = {
  home:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  boleto:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  os:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  apps:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><rect x="2" y="3" width="9" height="9" rx="2"/><rect x="13" y="3" width="9" height="9" rx="2"/><rect x="2" y="14" width="9" height="9" rx="2"/><rect x="13" y="14" width="9" height="9" rx="2"/></svg>,
  suporte:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
};

// ─── DADOS DEMO (fallback quando webhook indisponível) ───
const DEMO_CLIENTE = {cpf:"00000000000",nome:"João Silva",contratoId:"001234",clienteId:"5678",plano:"Fibra 400 Mega",valor:"89,90",status:"Ativo",vencimento:10,valorAberto:"89,90",titulos:1,pendencia:true};
const DEMO_BOLETOS = [
  {mes:"Junho 2026",valor:"R$ 89,90",venc:"10/06/2026",status:"aberto",cor:C.y,linha:"00190.00009 01234.560005 61237.100000 2 00000000008990",link:""},
  {mes:"Maio 2026",valor:"R$ 89,90",venc:"10/05/2026",status:"pago",cor:C.g,linha:"",link:""},
  {mes:"Abril 2026",valor:"R$ 89,90",venc:"10/04/2026",status:"pago",cor:C.g,linha:"",link:""},
];
const DEMO_OS = [
  {id:"#OS-4821",tipo:"Instalação de Fibra",data:"01/06/2026",status:"agendado",cor:C.p,tec:"Carlos S.",hora:"14h–18h",desc:"Instalação do roteador e passagem de cabeamento"},
  {id:"#OS-4756",tipo:"Suporte Técnico",data:"28/05/2026",status:"em andamento",cor:C.o,tec:"Rodrigo M.",hora:"Em campo",desc:"Lentidão na conexão reportada pelo cliente"},
  {id:"#OS-4699",tipo:"Manutenção Preventiva",data:"15/05/2026",status:"concluído",cor:C.g,tec:"André P.",hora:"Finalizado",desc:"Troca de splitter na caixa de distribuição"},
];

const corStatus = (st="") => {
  const s = st.toLowerCase();
  if (s.includes("pago")||s.includes("conclu")) return C.g;
  if (s.includes("atras")||s.includes("vencid")) return C.r;
  if (s.includes("andamento")) return C.o;
  if (s.includes("agend")) return C.p;
  return C.y;
};

// ─── LOGIN (só CPF) ───
const Login = ({onLogin,theme,toggleTheme}) => {
  const [cpf,setCpf]=useState(""); const [loading,setLoading]=useState(false);
  const [focused,setFocused]=useState(false); const [erro,setErro]=useState("");

  const login=async()=>{
    const c=onlyDigits(cpf);
    if(c.length!==11&&c.length!==14){setErro("CPF ou CNPJ inválido.");return;}
    setErro(""); setLoading(true);
    try{
      const d=await api("app-login",{cpf:c});
      if(d&&d.ok!==false&&(d.contratoId||d.nome)){
        onLogin({cpf:c,nome:d.nome||"Cliente",contratoId:d.contratoId,clienteId:d.clienteId,plano:d.plano||"Fibra",valor:d.valor||"—",status:d.status||"Ativo",vencimento:d.vencimento||null,valorAberto:d.valorAberto||null,titulos:d.titulos||0,pendencia:!!d.pendencia});
      }else{
        setErro("CPF/CNPJ não encontrado. Verifique e tente novamente.");
      }
    }catch(e){
      onLogin({...DEMO_CLIENTE,cpf:c,demo:true});
    }
    setLoading(false);
  };

  return (
    <div style={{padding:"32px 22px 28px",display:"flex",flexDirection:"column",gap:20,position:"relative"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 100% 45% at 50% -5%,rgba(245,194,0,0.09) 0%,transparent 60%)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",backgroundImage:"linear-gradient(rgba(245,194,0,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(245,194,0,0.025) 1px,transparent 1px)",backgroundSize:"40px 40px",inset:0,pointerEvents:"none"}}/>
      <div style={{display:"flex",justifyContent:"flex-end",position:"relative"}}><ThemeBtn theme={theme} onClick={toggleTheme}/></div>
      <div style={{display:"flex",justifyContent:"center",position:"relative"}}><LogoV h={100}/></div>
      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:20,padding:"22px 18px",display:"flex",flexDirection:"column",gap:14,position:"relative"}}>
        <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Entrar na sua conta</h2>
        <p style={{color:C.s,fontSize:13,margin:0}}>Informe seu CPF para acessar boletos, chamados e mais</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <label style={{color:C.lbl,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>CPF ou CNPJ</label>
          <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${focused?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:focused?"rgba(245,194,0,0.05)":C.surf,transition:"all 0.2s"}}>
            <input style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit",letterSpacing:1}} type="text" inputMode="numeric" placeholder="CPF ou CNPJ" value={cpf} onChange={e=>setCpf(fmtDoc(e.target.value))} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onKeyDown={e=>e.key==="Enter"&&login()}/>
          </div>
        </div>
        {erro&&<div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,padding:"10px 14px",color:C.r,fontSize:13}}>⚠️ {erro}</div>}
        <Btn label={loading?"Entrando...":"Entrar →"} onClick={login} disabled={loading||onlyDigits(cpf).length<11}/>
        <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,height:1,background:C.surf2}}/><span style={{color:C.m,fontSize:12}}>ou</span><div style={{flex:1,height:1,background:C.surf2}}/></div>
        <button onClick={()=>onLogin({...DEMO_CLIENTE,demo:true})} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"rgba(37,211,102,0.07)",border:"1.5px solid rgba(37,211,102,0.2)",borderRadius:14,padding:13,color:C.wa,fontSize:14,fontWeight:600,cursor:"pointer"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={C.wa}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
          Entrar pelo WhatsApp
        </button>
      </div>
    </div>
  );
};

// ─── HOME ───
const DEMO_PROMOS=[
  {titulo:"Upgrade 1 GIGA",texto:"Dobre sua velocidade — 1\u00ba m\u00eas gr\u00e1tis!",cor:"#3D3D5C",imagem:"",link:"https://oryxinternet.com.br",botao:"Quero!"},
  {titulo:"Indique e Ganhe",texto:"Indique um amigo e ganhe 1 m\u00eas gr\u00e1tis",cor:"#16a34a",imagem:"",link:"https://oryxinternet.com.br",botao:"Participar"},
];

const Promos=()=>{
  const [promos,setPromos]=useState(null);
  const [idx,setIdx]=useState(0);
  const ref=useRef(null);
  useEffect(()=>{(async()=>{
    try{ const d=await api("app-promocoes",{}); const arr=(d.promocoes||d.promos||[]); setPromos(arr.length?arr:DEMO_PROMOS); }
    catch(e){ setPromos(DEMO_PROMOS); }
  })();},[]);
  const abrir=async(link)=>{ if(!link)return; try{ await Browser.open({url:link,presentationStyle:"fullscreen"}); }catch(e){ window.open(link,"_blank"); } };
  const onScroll=()=>{ const el=ref.current; if(!el)return; setIdx(Math.round(el.scrollLeft/el.clientWidth)); };
  if(!promos||promos.length===0) return null;
  return (
    <div>
      <div ref={ref} onScroll={onScroll} style={{display:"flex",gap:10,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        {promos.map((p,i)=>(
          <div key={i} onClick={()=>abrir(p.link)} style={{minWidth:"100%",scrollSnapAlign:"center",borderRadius:16,overflow:"hidden",cursor:"pointer",boxShadow:"0 4px 14px rgba(0,0,0,0.18)"}}>
            {p.imagem
              ? <img src={p.imagem} alt={p.titulo||"Promoção"} style={{width:"100%",display:"block",objectFit:"cover"}}/>
              : <div style={{background:`linear-gradient(135deg,${p.cor||"#3D3D5C"},#1a1a2e)`,padding:18,color:"#fff",position:"relative"}}>
                  <div style={{position:"absolute",top:-8,right:-8,width:54,height:54,borderRadius:"50%",background:"rgba(245,194,0,0.85)"}}/>
                  <div style={{fontSize:10,color:"#F5C200",fontWeight:800,letterSpacing:1,position:"relative"}}>PROMOÇÃO</div>
                  <div style={{fontSize:18,fontWeight:900,margin:"5px 0",position:"relative"}}>{p.titulo}</div>
                  {p.texto&&<div style={{fontSize:12,opacity:0.88,marginBottom:12,position:"relative"}}>{p.texto}</div>}
                  {p.link&&<div style={{background:"#F5C200",color:"#1a1000",fontSize:12,fontWeight:800,padding:"7px 14px",borderRadius:9,display:"inline-block",position:"relative"}}>{(p.botao||"Saiba mais")} →</div>}
                </div>}
          </div>
        ))}
      </div>
      {promos.length>1&&<div style={{display:"flex",gap:5,justifyContent:"center",marginTop:10}}>
        {promos.map((_,i)=>(<div key={i} style={{width:idx===i?18:5,height:5,borderRadius:9,background:idx===i?C.y:C.m,transition:"all 0.2s"}}/>))}
      </div>}
    </div>
  );
};

const Home = ({goTo,cliente,theme,toggleTheme}) => {
  const inicial=(cliente.nome||"C").charAt(0).toUpperCase();
  const atalhos=[
    {icon:"💳",label:"2ª Via Boleto",sub:"Ver faturas",color:C.y,screen:"boleto"},
    {icon:"🔧",label:"Abrir Chamado",sub:"Suporte técnico",color:C.p,screen:"os"},
    {icon:"🔓",label:"Desbloqueio",sub:"De confiança",color:C.o,screen:"desbloqueio"},
    {icon:"✍️",label:"Meu Contrato",sub:"Ver ou assinar",color:C.g,screen:"contrato"},
  ];
  return (
    <div>
      <div style={{background:C.head,padding:"18px 20px 24px",borderRadius:"0 0 28px 28px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <LogoH h={28}/>
          <div style={{display:"flex",alignItems:"center",gap:10}}><ThemeBtn theme={theme} onClick={toggleTheme}/><button onClick={()=>goTo("perfil")} style={{width:36,height:36,borderRadius:"50%",background:"rgba(245,194,0,0.15)",border:"2px solid rgba(245,194,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",color:C.y,fontSize:15,fontWeight:700,cursor:"pointer"}}>{inicial}</button></div>
        </div>
        <p style={{color:C.s,fontSize:13,margin:"0 0 2px"}}>Olá, {cliente.nome} 👋</p>
        <h2 style={{color:C.t,fontSize:20,fontWeight:700,margin:"0 0 14px"}}>Bem-vindo de volta!</h2>
        <div style={{background:"rgba(245,194,0,0.08)",border:"1px solid rgba(245,194,0,0.2)",borderRadius:14,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{color:C.s,fontSize:11,margin:"0 0 3px",textTransform:"uppercase",letterSpacing:1}}>Plano ativo</p><p style={{color:C.t,fontSize:15,fontWeight:700,margin:0}}>{cliente.plano}</p>{cliente.vencimento&&<p style={{color:C.s,fontSize:11,margin:"3px 0 0"}}>Vencimento dia {cliente.vencimento}</p>}</div>
          <div style={{background:"rgba(72,199,116,0.15)",border:"1px solid rgba(72,199,116,0.3)",borderRadius:20,padding:"5px 12px",color:C.g,fontSize:12,fontWeight:700}}>✓ {cliente.status||"Ativo"}</div>
        </div>
      </div>
      <div style={{padding:"0 16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <Promos/>
        {cliente.pendencia&&(
          <div onClick={()=>goTo("boleto")} style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:14,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
            <span style={{fontSize:20}}>⚠️</span>
            <div style={{flex:1}}><p style={{color:C.t,fontSize:13,fontWeight:700,margin:"0 0 3px"}}>Você tem {cliente.titulos>1?`${cliente.titulos} faturas`:"fatura"} em aberto</p><p style={{color:C.s,fontSize:12,margin:0}}>{cliente.valorAberto?`Total R$ ${cliente.valorAberto} • `:""}toque para ver a 2ª via</p></div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.r} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        )}
        <p style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:0}}>Acesso rápido</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {atalhos.map((item,i)=>(
            <div key={i} onClick={()=>goTo(item.screen)} style={{background:`${item.color}0d`,border:`1px solid ${item.color}22`,borderRadius:16,padding:14,cursor:"pointer"}}>
              <div style={{fontSize:24,marginBottom:8}}>{item.icon}</div>
              <p style={{color:C.t,fontSize:13,fontWeight:700,margin:"0 0 2px"}}>{item.label}</p>
              <p style={{color:C.s,fontSize:11,margin:0}}>{item.sub}</p>
            </div>
          ))}
        </div>
        <div onClick={()=>goTo("suporte")} style={{background:"rgba(129,140,248,0.08)",border:"1px solid rgba(129,140,248,0.2)",borderRadius:14,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
          <span style={{fontSize:20}}>💬</span>
          <div style={{flex:1}}><p style={{color:C.t,fontSize:13,fontWeight:600,margin:"0 0 3px"}}>Precisa de ajuda?</p><p style={{color:C.s,fontSize:12,margin:0}}>Fale com o suporte ou consulte o FAQ</p></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.p} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>
  );
};

// ─── BOLETO ───
const Boleto = ({goBack,cliente}) => {
  const [sel,setSel]=useState(null); const [lista,setLista]=useState(null); const [demo,setDemo]=useState(false); const [copiado,setCopiado]=useState(false);
  useEffect(()=>{(async()=>{
    try{
      const d=await api("app-boletos",{cpf:cliente.cpf,contrato:cliente.contratoId});
      const arr=(d.boletos||d.titulos||[]).map(b=>({
        mes:b.mes||b.competencia||b.dataVencimento||"—",
        valor:b.valor?(String(b.valor).startsWith("R$")?b.valor:`R$ ${b.valor}`):"R$ —",
        venc:b.venc||b.dataVencimento||b.data_vencimento||"—",
        status:b.status||"aberto",
        cor:corStatus(b.status||"aberto"),
        linha:b.linha||b.linhaDigitavel||b.codigo_barras||"",
        link:b.link||b.link_cobranca||"",
      }));
      setLista(arr);
    }catch(e){ setLista(DEMO_BOLETOS); setDemo(true); }
  })();},[]);

  if(lista===null) return <div style={{padding:"20px 16px"}}><Back onClick={goBack}/><Spinner label="Buscando seus boletos..."/></div>;

  if(sel!==null){const b=lista[sel];return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={()=>setSel(null)}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Boleto — {b.mes}</h2>
      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Competência",b.mes],["Vencimento",b.venc],["Valor",b.valor],["Status",b.status.toUpperCase()],["Contrato",`#${cliente.contratoId}`]].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<4?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:13}}>{k}</span><span style={{color:C.t,fontSize:13,fontWeight:700}}>{v}</span></div>
        ))}
      </div>
      {b.status!=="pago"&&<>
        {b.linha&&<div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:12,padding:14}}>
          <p style={{color:C.s,fontSize:11,margin:"0 0 6px",letterSpacing:1,textTransform:"uppercase"}}>Código de barras</p>
          <p style={{color:C.t,fontSize:11,fontFamily:"monospace",margin:0,letterSpacing:1,wordBreak:"break-all"}}>{b.linha}</p>
        </div>}
        {b.linha&&<Btn label={copiado?"✓ Copiado!":"📋 Copiar código"} onClick={()=>{navigator.clipboard?.writeText(b.linha);setCopiado(true);setTimeout(()=>setCopiado(false),2000);}} s={{background:"rgba(245,194,0,0.12)",color:C.y,boxShadow:"none",border:`1px solid rgba(245,194,0,0.25)`}}/>}
        {b.link&&<Btn label="📄 Abrir boleto / PDF" onClick={()=>window.open(b.link,"_blank")}/>}
      </>}
      {b.status==="pago"&&<div style={{background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:12,padding:14,textAlign:"center"}}><p style={{color:C.g,fontSize:13,fontWeight:600,margin:0}}>✓ Boleto quitado</p></div>}
    </div>
  );}

  return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>2ª Via de Boleto</h2>
      <p style={{color:C.s,fontSize:13,margin:0}}>Contrato #{cliente.contratoId} — {cliente.nome}</p>
      {demo&&<DemoChip/>}
      {lista.length===0&&<div style={{background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.g,fontSize:15,fontWeight:700,margin:"0 0 4px"}}>✓ Conta em dia!</p><p style={{color:C.s,fontSize:13,margin:0}}>Nenhum boleto em aberto.</p></div>}
      {lista.map((b,i)=>(
        <div key={i} onClick={()=>setSel(i)} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
          <div><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>{b.mes}</p><p style={{color:C.s,fontSize:12,margin:"0 0 8px"}}>Venc. {b.venc}</p><Badge label={b.status} color={b.cor}/></div>
          <div style={{textAlign:"right"}}><p style={{color:C.t,fontSize:16,fontWeight:800,margin:"0 0 6px"}}>{b.valor}</p><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.s} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>
      ))}
    </div>
  );
};

// ─── OS ───
const OS = ({goBack,cliente}) => {
  const [sel,setSel]=useState(null); const [nova,setNova]=useState(false); const [tipo,setTipo]=useState(""); const [desc,setDesc]=useState("");
  const [lista,setLista]=useState(null); const [demo,setDemo]=useState(false);
  const [enviando,setEnviando]=useState(false); const [enviado,setEnviado]=useState(null);

  const carregar=async()=>{
    setLista(null);
    try{
      const d=await api("app-os",{contrato_id:cliente.contratoId,cliente_id:cliente.clienteId});
      const arr=(d.os||d.ordens||[]).map(o=>({
        id:o.id?`#OS-${o.id}`:(o.os||"#OS"),
        tipo:o.tipo||o.assunto||"Ordem de Serviço",
        data:o.data||o.data_cadastro||"—",
        status:o.status||o.statusDisplay||"—",
        cor:corStatus(o.status||""),
        tec:o.tec||o.tecnico||"—",
        hora:o.hora||o.agendamento||"—",
        desc:o.desc||o.descricao||o.obs||"",
      }));
      setLista(arr);
    }catch(e){ setLista(DEMO_OS); setDemo(true); }
  };
  useEffect(()=>{carregar();},[]);

  const abrir=async()=>{
    setEnviando(true);
    try{
      const d=await api("app-os-abrir",{cpf:cliente.cpf,contrato:cliente.contratoId,tipo,desc});
      setEnviado({protocolo:d.protocolo||d.id||("OS-"+Date.now().toString().slice(-6))});
    }catch(e){
      setEnviado({protocolo:"OS-"+Date.now().toString().slice(-6),demo:true});
    }
    setEnviando(false);
  };

  if(enviado)return(
    <div style={{padding:"40px 20px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,minHeight:300}}>
      <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(52,211,153,0.15)",border:"2px solid rgba(52,211,153,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>✅</div>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0,textAlign:"center"}}>Chamado aberto!</h2>
      <p style={{color:C.s,fontSize:13,margin:0,textAlign:"center"}}>Protocolo: <strong style={{color:C.t}}>{enviado.protocolo}</strong><br/>Em breve um técnico entrará em contato.</p>
      <Btn label="Voltar para Chamados" onClick={()=>{setEnviado(null);setNova(false);setTipo("");setDesc("");carregar();}}/>
    </div>
  );

  if(nova)return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={()=>setNova(false)}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Abrir Chamado</h2>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        <label style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>Tipo</label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {["Sem conexão","Lentidão","Instalação","Outros"].map(t=>(
            <button key={t} onClick={()=>setTipo(t)} style={{background:tipo===t?"rgba(245,194,0,0.12)":C.surf,border:`1.5px solid ${tipo===t?C.y:C.line2}`,borderRadius:12,padding:"10px",color:tipo===t?C.y:C.s,fontSize:13,fontWeight:700,cursor:"pointer"}}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        <label style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>Descrição</label>
        <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Descreva o problema..." style={{background:C.surf,border:`1.5px solid ${C.line2}`,borderRadius:12,padding:14,color:C.t,fontSize:14,fontFamily:"inherit",resize:"none",height:100,outline:"none"}}/>
      </div>
      <Btn label={enviando?"Abrindo chamado...":"Abrir chamado"} onClick={abrir} disabled={!tipo||!desc||enviando}/>
    </div>
  );

  if(lista===null) return <div style={{padding:"20px 16px"}}><Back onClick={goBack}/><Spinner label="Carregando ordens de serviço..."/></div>;

  if(sel!==null){const os=lista[sel];return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={()=>setSel(null)}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><p style={{color:C.s,fontSize:11,margin:"0 0 2px",fontWeight:600}}>{os.id}</p><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>{os.tipo}</h2></div>
        <Badge label={os.status} color={os.cor}/>
      </div>
      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Data",os.data],["Técnico",os.tec],["Horário",os.hora]].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<2?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:13}}>{k}</span><span style={{color:C.t,fontSize:13,fontWeight:700}}>{v}</span></div>
        ))}
      </div>
      {os.desc&&<div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:14,padding:14}}><p style={{color:C.s,fontSize:11,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:1}}>Descrição</p><p style={{color:C.t,fontSize:13,margin:0,lineHeight:1.6}}>{os.desc}</p></div>}
    </div>
  );}

  return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Ordens de Serviço</h2>
        <button onClick={()=>setNova(true)} style={{background:"rgba(245,194,0,0.12)",border:`1px solid rgba(245,194,0,0.25)`,borderRadius:20,padding:"6px 14px",color:C.y,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Abrir OS</button>
      </div>
      {demo&&<DemoChip/>}
      {lista.length===0&&<div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.s,fontSize:13,margin:0}}>Nenhuma ordem de serviço encontrada.</p></div>}
      {lista.map((os,i)=>(
        <div key={i} onClick={()=>setSel(i)} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,cursor:"pointer",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><p style={{color:C.s,fontSize:11,margin:"0 0 2px",fontWeight:600}}>{os.id}</p><p style={{color:C.t,fontSize:15,fontWeight:700,margin:0}}>{os.tipo}</p></div>
            <Badge label={os.status} color={os.cor}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.line}`,paddingTop:10}}>
            <span style={{color:C.s,fontSize:12}}>📅 {os.data}</span><span style={{color:C.s,fontSize:12}}>👷 {os.tec}</span><span style={{color:C.s,fontSize:12}}>🕐 {os.hora}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── DESBLOQUEIO DE CONFIANÇA ───
const Desbloqueio = ({goBack,cliente}) => {
  const [step,setStep]=useState("info"); const [res,setRes]=useState(null); const [demo,setDemo]=useState(false);
  const liberar=async()=>{
    setStep("processando");
    try{
      const d=await api("app-desbloqueio",{contrato:cliente.contratoId});
      setRes(d); setDemo(false);
    }catch(e){
      setRes({ok:true,mensagem:"Conexão liberada por confiança.",liberado_dias:2,data_promessa:""}); setDemo(true);
    }
    setStep("resultado");
  };

  if(step==="processando")return <div style={{padding:"20px 16px"}}><Spinner label="Liberando sua conexão..."/></div>;

  if(step==="resultado"){
    const ok=res&&(res.ok===true||res.liberado===true||res.status===1);
    return(
      <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:16}}>
        <Back onClick={goBack}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,paddingTop:8,textAlign:"center"}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:ok?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)",border:`2px solid ${ok?"rgba(52,211,153,0.4)":"rgba(248,113,113,0.4)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>{ok?"🔓":"⚠️"}</div>
          <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>{ok?"Desbloqueio realizado!":"Não foi possível"}</h2>
          <p style={{color:C.s,fontSize:13,margin:0}}>{res?.mensagem||res?.msg||(ok?"Sua conexão foi liberada.":"Tente novamente ou fale com um atendente.")}</p>
        </div>
        {ok&&<div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:10}}>
          <p style={{color:C.t,fontSize:13,margin:0,lineHeight:1.6}}>⚠️ O desbloqueio de confiança vale por <strong>{res?.liberado_dias||2} dias</strong>. Regularize seu pagamento para evitar novo bloqueio.</p>
          {res?.data_promessa&&<p style={{color:C.s,fontSize:12,margin:0}}>📅 Promessa de pagamento até: <strong style={{color:C.t}}>{res.data_promessa}</strong></p>}
        </div>}
        {demo&&<DemoChip/>}
        <Btn label="Voltar ao início" onClick={goBack} s={{background:C.surf2,color:C.t,boxShadow:"none",border:`1px solid ${C.line2}`}}/>
      </div>
    );
  }

  return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:16}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Desbloqueio de Confiança</h2>
      <div style={{background:"rgba(251,146,60,0.06)",border:"1px solid rgba(251,146,60,0.2)",borderRadius:16,padding:16}}>
        <p style={{color:C.t,fontSize:14,fontWeight:600,margin:"0 0 8px"}}>🔓 Está com a conexão bloqueada?</p>
        <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.6}}>Você pode liberar temporariamente sua internet enquanto regulariza o pagamento. O desbloqueio é válido por alguns dias.</p>
      </div>
      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Cliente",cliente.nome],["Contrato",`#${cliente.contratoId}`],["Plano",cliente.plano]].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<2?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:13}}>{k}</span><span style={{color:C.t,fontSize:13,fontWeight:700}}>{v}</span></div>
        ))}
      </div>
      <Btn label="🔓 Liberar minha conexão" onClick={liberar}/>
    </div>
  );
};

// ─── CONTRATO (assinatura via termo de aceite) ───
const Contrato = ({goBack,cliente}) => {
  const [step,setStep]=useState("ver");
  const [fotos,setFotos]=useState({a:false,b:false,c:false});
  const [signed,setSigned]=useState(false); const [resSGP,setResSGP]=useState(null); const [demo,setDemo]=useState(false);
  const canvasRef=useRef(null); const drawing=useRef(false); const lastPos=useRef(null);

  useEffect(()=>{if(canvasRef.current&&step==="assinar"){const ctx=canvasRef.current.getContext("2d");ctx.fillStyle=C.canvas;ctx.fillRect(0,0,300,150);}});
  useEffect(()=>{if(step==="enviando")enviarSGP();},[step]);

  const enviarSGP=async()=>{
    try{
      const d=await api("app-contrato-aceite",{idcontrato:cliente.contratoId});
      setResSGP(d); setDemo(false);
    }catch(e){
      setResSGP({protocolo:"SGP-"+Date.now().toString().slice(-6)}); setDemo(true);
    }
    setStep("ok");
  };

  const getPos=(e,c)=>{const r=c.getBoundingClientRect(),sx=c.width/r.width,sy=c.height/r.height;if(e.touches)return{x:(e.touches[0].clientX-r.left)*sx,y:(e.touches[0].clientY-r.top)*sy};return{x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy};};
  const startD=(e)=>{e.preventDefault();drawing.current=true;setSigned(true);lastPos.current=getPos(e,canvasRef.current);};
  const doD=(e)=>{e.preventDefault();if(!drawing.current)return;const c=canvasRef.current,ctx=c.getContext("2d"),p=getPos(e,c);ctx.beginPath();ctx.moveTo(lastPos.current.x,lastPos.current.y);ctx.lineTo(p.x,p.y);ctx.strokeStyle=C.y;ctx.lineWidth=2.5;ctx.lineCap="round";ctx.stroke();lastPos.current=p;};
  const stopD=(e)=>{e.preventDefault();drawing.current=false;};
  const clearC=()=>{const c=canvasRef.current,ctx=c.getContext("2d");ctx.fillStyle=C.canvas;ctx.fillRect(0,0,c.width,c.height);setSigned(false);};

  const steps=["ver","fotos","assinar","ok"];
  const stepIdx=steps.indexOf(step);

  const Progress=()=>(
    <div style={{padding:"10px 20px 4px",background:C.nav}}>
      <div style={{display:"flex",alignItems:"center"}}>
        {["Contrato","Fotos","Assinatura","Conclusão"].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",flex:1}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:stepIdx>i?C.g:stepIdx===i?C.y:C.line2,border:`2px solid ${stepIdx>i?C.g:stepIdx===i?C.y:C.line3}`,display:"flex",alignItems:"center",justifyContent:"center",color:stepIdx>i?"white":stepIdx===i?"#1a1000":C.m,fontSize:11,fontWeight:800}}>{stepIdx>i?"✓":i+1}</div>
              <span style={{fontSize:9,color:stepIdx===i?C.y:stepIdx>i?C.g:C.m,fontWeight:stepIdx>=i?700:400,whiteSpace:"nowrap"}}>{s}</span>
            </div>
            {i<3&&<div style={{flex:1,height:2,background:stepIdx>i?C.g:C.b,margin:"0 3px",marginBottom:14}}/>}
          </div>
        ))}
      </div>
    </div>
  );

  if(step==="enviando")return(
    <div style={{padding:"40px 20px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,minHeight:300}}>
      <div style={{width:56,height:56,borderRadius:"50%",border:`3px solid ${C.line2}`,borderTopColor:C.y,animation:"spin 0.8s linear infinite"}}/>
      <p style={{color:C.t,fontSize:15,fontWeight:600,margin:0,textAlign:"center"}}>Registrando aceite no SGP...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if(step==="ok"){
    const proto=resSGP?.protocolo||resSGP?.id||("SGP-"+cliente.contratoId);
    const agora=new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    return(
      <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,paddingTop:8,textAlign:"center"}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(52,211,153,0.15)",border:"2px solid rgba(52,211,153,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>✅</div>
          <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Contrato assinado!</h2>
          <p style={{color:C.s,fontSize:13,margin:0}}>Aceite registrado com sucesso no SGP.</p>
        </div>
        <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
          {[["Cliente",cliente.nome],["Contrato",`#${cliente.contratoId}`],["Plano",cliente.plano],["Assinado em",agora],["Protocolo SGP",proto]].map(([k,v],i,a)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<a.length-1?"1px solid rgba(52,211,153,0.1)":undefined}}><span style={{color:C.s,fontSize:12}}>{k}</span><span style={{color:C.t,fontSize:12,fontWeight:700,textAlign:"right",maxWidth:"55%"}}>{v}</span></div>
          ))}
        </div>
        {demo&&<DemoChip/>}
        <Btn label="Voltar ao início" onClick={goBack} s={{background:C.surf2,color:C.t,boxShadow:"none",border:`1px solid ${C.line2}`}}/>
      </div>
    );
  }

  return(
    <div>
      {["ver","fotos","assinar"].includes(step)&&<Progress/>}
      <div style={{padding:"16px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
        <Back onClick={()=>step==="ver"?goBack():setStep(step==="fotos"?"ver":"fotos")}/>

        {step==="ver"&&<>
          <div><p style={{color:C.y,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",margin:"0 0 4px"}}>Etapa 1 de 4</p><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Seu contrato</h2></div>
          <div style={{background:"rgba(245,194,0,0.06)",border:"1px solid rgba(245,194,0,0.2)",borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:46,height:46,borderRadius:"50%",background:"rgba(245,194,0,0.15)",border:"2px solid rgba(245,194,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",color:C.y,fontSize:18,fontWeight:800,flexShrink:0}}>{(cliente.nome||"C").charAt(0)}</div>
            <div><p style={{color:C.t,fontSize:15,fontWeight:700,margin:0}}>{cliente.nome}</p><p style={{color:C.s,fontSize:12,margin:"2px 0 0"}}>{docLabel(cliente.cpf)}: {maskDoc(cliente.cpf)}</p></div>
          </div>
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
            {[["Contrato",`#${cliente.contratoId}`],["Plano",cliente.plano],["Valor",`R$ ${cliente.valor}/mês`],["Status",cliente.status||"Ativo"],["Vencimento","Todo dia 10"]].map(([k,v],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<4?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:13}}>{k}</span><span style={{color:C.t,fontSize:13,fontWeight:700}}>{v}</span></div>
            ))}
          </div>
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:14,height:160,overflowY:"auto",padding:14,fontSize:11,color:C.s,lineHeight:1.8}}>
            <p style={{color:C.t,fontWeight:700,fontSize:12,margin:"0 0 10px"}}>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</p>
            <p><strong style={{color:C.tx7}}>CONTRATADA:</strong> Oryx Internet Ltda.</p>
            <p><strong style={{color:C.tx7}}>CONTRATANTE:</strong> {cliente.nome}</p>
            <p><strong style={{color:C.tx7}}>CLÁUSULA 1:</strong> Prestação de serviços de internet, plano {cliente.plano}.</p>
            <p><strong style={{color:C.tx7}}>CLÁUSULA 2:</strong> Valor R$ {cliente.valor}/mês, vencimento dia 10.</p>
            <p><strong style={{color:C.tx7}}>CLÁUSULA 3:</strong> Vigência de 12 meses com renovação automática.</p>
            <p style={{color:C.m,fontSize:10}}>Ao assinar, declara ter lido e concordado com todos os termos.</p>
          </div>
          <Btn label="Li e aceito →" onClick={()=>setStep("fotos")}/>
        </>}

        {step==="fotos"&&<>
          <div><p style={{color:C.y,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",margin:"0 0 4px"}}>Etapa 2 de 4</p><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Fotos do documento</h2></div>
          {[{k:"a",icon:"🪪",l:"Documento — Frente",s:"CNH ou RG (frente)"},{k:"b",icon:"🪪",l:"Documento — Verso",s:"CNH ou RG (verso)"},{k:"c",icon:"🤳",l:"Selfie com documento",s:"Segure o doc ao lado do rosto"}].map(f=>(
            <div key={f.k} style={{background:fotos[f.k]?"rgba(52,211,153,0.08)":C.surf,border:`1px solid ${fotos[f.k]?"rgba(52,211,153,0.3)":C.b}`,borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:12,background:fotos[f.k]?"rgba(52,211,153,0.15)":C.line,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{fotos[f.k]?"✅":f.icon}</div>
              <div style={{flex:1}}><p style={{color:C.t,fontSize:13,fontWeight:700,margin:"0 0 2px"}}>{f.l}</p><p style={{color:C.s,fontSize:11,margin:0}}>{f.s}</p></div>
              {fotos[f.k]?<span style={{color:C.g,fontSize:12,fontWeight:700}}>✓ OK</span>:<button onClick={()=>setFotos(p=>({...p,[f.k]:true}))} style={{background:"rgba(245,194,0,0.12)",border:"1px solid rgba(245,194,0,0.25)",borderRadius:10,padding:"7px 14px",color:C.y,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>📷 Tirar</button>}
            </div>
          ))}
          <Btn label="Continuar →" onClick={()=>setStep("assinar")} disabled={!fotos.a||!fotos.b||!fotos.c}/>
        </>}

        {step==="assinar"&&<>
          <div><p style={{color:C.y,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",margin:"0 0 4px"}}>Etapa 3 de 4</p><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Assine o contrato</h2></div>
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{color:C.s,fontSize:11,fontWeight:600,letterSpacing:1}}>ASSINATURA DO CLIENTE</span>
              <button onClick={clearC} style={{background:"none",border:`1px solid ${C.line3}`,borderRadius:8,padding:"4px 10px",color:C.s,fontSize:11,cursor:"pointer"}}>Limpar</button>
            </div>
            <div style={{position:"relative"}}>
              <canvas ref={canvasRef} width={300} height={150} style={{width:"100%",height:150,borderRadius:10,border:`1px dashed rgba(245,194,0,0.2)`,cursor:"crosshair",display:"block",touchAction:"none"}}
                onMouseDown={startD} onMouseMove={doD} onMouseUp={stopD} onMouseLeave={stopD}
                onTouchStart={startD} onTouchMove={doD} onTouchEnd={stopD}/>
              {!signed&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",color:"rgba(245,194,0,0.2)",fontSize:13,pointerEvents:"none",fontStyle:"italic"}}>✍️ Assine aqui</div>}
            </div>
          </div>
          <div style={{background:C.surf,border:`1px solid ${C.line}`,borderRadius:12,padding:"12px 14px"}}><p style={{color:C.m,fontSize:11,margin:0,lineHeight:1.6}}>🔒 Registrado com IP, data, hora e CPF. Válido juridicamente (MP 2.200-2/2001).</p></div>
          <Btn label="Confirmar e enviar para SGP →" onClick={()=>setStep("enviando")} disabled={!signed}/>
        </>}
      </div>
    </div>
  );
};

// ─── MEUS APPS ───
const APPS=[
  {id:1,nome:"Netflix",cor:"#E50914",bg:"#1a0002",ativo:true,logo:"N",desc:"Séries e filmes"},
  {id:2,nome:"Spotify",cor:"#1DB954",bg:"#001a06",ativo:true,logo:"♪",desc:"Música e podcasts"},
  {id:3,nome:"Disney+",cor:"#0063e5",bg:"#00031a",ativo:false,logo:"✦",desc:"Disney, Marvel, Star Wars"},
  {id:4,nome:"HBO Max",cor:"#b535f5",bg:"#0f001a",ativo:true,logo:"H",desc:"Séries premiadas"},
  {id:5,nome:"Amazon",cor:"#00a8e0",bg:"#00101a",ativo:false,logo:"▶",desc:"Prime Video"},
  {id:6,nome:"Globoplay",cor:"#F5C200",bg:"#1a1400",ativo:true,logo:"G",desc:"Conteúdo nacional"},
];
const MeusApps=({goBack})=>{
  const url="https://www.portaldoassinante.com/oryx";
  const abrir=async()=>{
    try{ await Browser.open({url, presentationStyle:"fullscreen"}); }
    catch(e){ window.open(url,"_blank"); }
  };
  return (
    <div>
      <div style={{background:C.head,padding:"18px 20px 22px"}}>
        <LogoH h={26}/>
        <h2 style={{color:C.t,fontSize:20,fontWeight:700,margin:"14px 0 4px"}}>Portal do Assinante</h2>
        <p style={{color:C.s,fontSize:13,margin:0}}>Seus streamings e serviços em um só lugar</p>
      </div>
      <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:20,display:"flex",flexDirection:"column",alignItems:"center",gap:12,textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:16,background:"rgba(245,194,0,0.12)",border:"1px solid rgba(245,194,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>📺</div>
          <p style={{color:C.t,fontSize:15,fontWeight:700,margin:0}}>Acesse o Portal do Assinante</p>
          <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.6}}>Gerencie seus aplicativos e serviços de streaming diretamente pelo portal, sem sair do app.</p>
        </div>
        <Btn label="Abrir Portal →" onClick={abrir}/>
      </div>
    </div>
  );
};

// ─── SUPORTE ───
const Suporte=({goBack,goTo})=>{
  const [faq,setFaq]=useState(null);
  const canais=[
    {icon:"💬",label:"Chat pelo WhatsApp",sub:"Atendimento rápido",color:C.wa,action:"Iniciar"},
    {icon:"📞",label:"Ligar para o suporte",sub:"(XX) XXXX-XXXX",color:C.p,action:"Ligar"},
    {icon:"🔧",label:"Abrir chamado técnico",sub:"Problemas de conexão",color:C.o,action:"Abrir",screen:"os"},
    {icon:"🔓",label:"Desbloqueio de confiança",sub:"Liberar conexão",color:C.y,action:"Liberar",screen:"desbloqueio"},
  ];
  const faqs=[
    {q:"Minha internet está lenta, o que fazer?",a:"Reinicie o roteador desligando e ligando novamente. Aguarde 2 minutos. Se persistir, abra um chamado técnico."},
    {q:"Como atualizar meus dados cadastrais?",a:"Acesse a aba Perfil no menu do app e clique em Editar Dados."},
    {q:"Posso mudar meu plano pelo app?",a:"Sim! Acesse Perfil > Meu Plano e escolha uma das opções disponíveis."},
  ];
  return(
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Suporte & Contato</h2>
      <p style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:0}}>Canais de atendimento</p>
      {canais.map((item,i)=>(
        <div key={i} onClick={()=>item.screen&&goTo(item.screen)} style={{background:C.surf,border:`1px solid ${item.color}22`,borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}>
          <div style={{width:46,height:46,borderRadius:14,background:`${item.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{item.icon}</div>
          <div style={{flex:1}}><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 2px"}}>{item.label}</p><p style={{color:C.s,fontSize:12,margin:0}}>{item.sub}</p></div>
          <span style={{color:item.color,fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{item.action} →</span>
        </div>
      ))}
      <p style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:"4px 0 0"}}>Perguntas frequentes</p>
      {faqs.map((f,i)=>(
        <div key={i} style={{background:C.surf,border:`1px solid ${faq===i?"rgba(245,194,0,0.25)":C.b}`,borderRadius:14,overflow:"hidden",cursor:"pointer"}} onClick={()=>setFaq(faq===i?null:i)}>
          <div style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><p style={{color:C.t,fontSize:13,fontWeight:600,margin:0,flex:1,paddingRight:8}}>{f.q}</p><span style={{color:C.y,fontSize:16,display:"block",transform:faq===i?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}>›</span></div>
          {faq===i&&<div style={{padding:"0 16px 14px",borderTop:`1px solid ${C.line}`}}><p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.6}}>{f.a}</p></div>}
        </div>
      ))}
      <div style={{background:"rgba(245,194,0,0.06)",border:"1px solid rgba(245,194,0,0.15)",borderRadius:16,padding:16,textAlign:"center"}}>
        <p style={{color:C.s,fontSize:12,margin:"0 0 6px"}}>Horário de atendimento</p>
        <p style={{color:C.t,fontSize:14,fontWeight:700,margin:0}}>Seg–Sex: 8h–19h • Sáb: 9h–16h</p>
      </div>
    </div>
  );
};

// ─── PERFIL ───
const Perfil=({goBack,goLogin,cliente})=>(
  <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
    <Back onClick={goBack}/>
    <div style={{display:"flex",alignItems:"center",gap:14}}>
      <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(245,194,0,0.15)",border:"2px solid rgba(245,194,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",color:C.y,fontSize:24,fontWeight:700}}>{(cliente.nome||"C").charAt(0)}</div>
      <div><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:"0 0 3px"}}>{cliente.nome}</h2><p style={{color:C.s,fontSize:13,margin:0}}>Cliente Oryx Internet</p></div>
    </div>
    <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
      {[["Nome",cliente.nome],[docLabel(cliente.cpf),maskDoc(cliente.cpf)],["Plano",cliente.plano],["Contrato",`#${cliente.contratoId}`],["Status",cliente.status||"Ativo"]].map(([k,v],i,a)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<a.length-1?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:13}}>{k}</span><span style={{color:C.t,fontSize:13,fontWeight:600}}>{v}</span></div>
      ))}
    </div>
    <Btn label="✏️ Editar dados" onClick={()=>{}} s={{background:C.line,color:C.t,boxShadow:"none",border:`1px solid ${C.line2}`}}/>
    <button onClick={goLogin} style={{background:"none",border:"1px solid rgba(241,85,85,0.3)",borderRadius:14,padding:14,color:C.r,fontSize:14,fontWeight:600,cursor:"pointer"}}>Sair da conta</button>
  </div>
);

// ─── TAB BAR ───
const TABS=["home","boleto","apps","os","suporte"];
const TLABELS={home:"Início",boleto:"Boleto",apps:"Meus Apps",os:"Chamados",suporte:"Suporte"};
const TICONS={home:Ico.home,boleto:Ico.boleto,apps:Ico.apps,os:Ico.os,suporte:Ico.suporte};

// ─── APP ───
export default function App(){
  const [screen,setScreen]=useState("login");
  const [tab,setTab]=useState("home");
  const [cliente,setCliente]=useState(null);
  const [theme,setTheme]=useState("light");
  Object.assign(C, themes[theme]);
  const toggleTheme=()=>setTheme(t=>t==="light"?"dark":"light");
  const goTo=(s)=>{if(TABS.includes(s)){setTab(s);setScreen("main");}else setScreen(s);};
  const goBack=()=>{setScreen("main");setTab("home");};
  const goLogin=()=>{setScreen("login");setTab("home");setCliente(null);};
  const isMain=screen==="main";

  const screenMap={
    home:<Home goTo={goTo} cliente={cliente} theme={theme} toggleTheme={toggleTheme}/>,
    boleto:<Boleto goBack={goBack} cliente={cliente}/>,
    apps:<MeusApps goBack={goBack}/>,
    os:<OS goBack={goBack} cliente={cliente}/>,
    suporte:<Suporte goBack={goBack} goTo={goTo}/>,
    desbloqueio:<Desbloqueio goBack={goBack} cliente={cliente}/>,
    contrato:<Contrato goBack={goBack} cliente={cliente}/>,
    perfil:<Perfil goBack={goBack} goLogin={goLogin} cliente={cliente}/>,
  };

  return(
    <div style={{position:"fixed",inset:0,background:C.bg,display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      {/* área de conteúdo — ocupa o espaço disponível e rola */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingTop:"env(safe-area-inset-top)"}}>
        {screen==="login"&&<Login onLogin={(c)=>{setCliente(c);setScreen("main");}} theme={theme} toggleTheme={toggleTheme}/>}
        {screen!=="login"&&cliente&&screenMap[isMain?tab:screen]}
      </div>
      {/* barra de abas fixa no rodapé, respeitando o gesto do Android */}
      {screen!=="login"&&(
        <div style={{display:"flex",background:C.nav,borderTop:`1px solid ${C.line}`,padding:"8px 0 calc(4px + env(safe-area-inset-bottom))",flexShrink:0}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>{setTab(t);setScreen("main");}} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"6px 0",color:tab===t&&isMain?C.y:C.t3,transition:"color 0.2s"}}>
              {TICONS[t](tab===t&&isMain)}
              <span style={{fontSize:9,fontWeight:tab===t&&isMain?700:500}}>{TLABELS[t]}</span>
              {tab===t&&isMain&&<div style={{width:18,height:3,background:C.y,borderRadius:99}}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
