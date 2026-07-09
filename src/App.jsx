import { useState, useRef, useEffect } from "react";
import { Browser } from "@capacitor/browser";

/* ──────────────────────────────────────────────────────────────────────────
   Oryx TELECOMUNICAÇÕES — App do Cliente (conectado ao n8n)

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

const API_BASE = "https://n8n02.proativaia.com.br/webhook"; // TODO Oryx: trocar pela base de webhooks do n8n da Oryx

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
const MESES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const parseData = v => {
  const s=String(v||"").trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(m) return new Date(+m[3],+m[2]-1,+m[1]);
  return null;
};
const fmtData = v => { const d=parseData(v); if(!d) return v||"—"; const p=n=>String(n).padStart(2,"0"); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; };
const fmtValor = v => {
  if(v==null||v==="") return "R$ —";
  let s=String(v).replace(/r\$/i,"").trim();
  if(/,\d{1,2}$/.test(s)) s=s.replace(/\./g,"").replace(",",".");
  const n=Number(s); if(isNaN(n)) return "R$ "+String(v);
  return "R$ "+n.toFixed(2).replace(".",",");
};

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
      <text x="100" y="178" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="44" fill={word}>ORYX</text>
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
      <text x="100" y="56" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="46" fill={word}>ORYX</text>
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
  <button onClick={onClick} aria-label="Alternar tema" style={{width:36,height:36,borderRadius:"50%",background:C.logoNeg?"rgba(255,255,255,0.14)":"#3D3D5C",border:`1px solid ${C.logoNeg?"rgba(255,255,255,0.22)":"#3D3D5C"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.logoNeg?"#fff":"#F5C200",fontSize:16,flexShrink:0}}>{theme==="light"?"🌙":"☀️"}</button>
);

// ─── ICONS ───
const Ico = {
  home:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  boleto:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  os:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  apps:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><rect x="2" y="3" width="9" height="9" rx="2"/><rect x="13" y="3" width="9" height="9" rx="2"/><rect x="2" y="14" width="9" height="9" rx="2"/><rect x="13" y="14" width="9" height="9" rx="2"/></svg>,
  wifi:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8} strokeLinecap="round"><path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M8.5 16.4a6 6 0 0 1 7 0"/><path d="M12 20h.01"/></svg>,
  suporte:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  velocidade:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M12 14a1 1 0 0 0 1-1V8"/><path d="M5.6 18.4A9 9 0 1 1 18.4 18.4"/><line x1="12" y1="13" x2="15.5" y2="9.5"/></svg>,
};

// ─── DADOS DEMO (fallback quando webhook indisponível) ───
const DEMO_CLIENTE = {cpf:"00000000000",nome:"João Silva",contratoId:"001234",clienteId:"5678",plano:"Fibra 500 Mega",valor:"89,90",status:"Ativo",vencimento:10,valorAberto:"89,90",titulos:1,pendencia:true};
const DEMO_CONTA = {cpf:"00000000000",nome:"Oryx Internet",contratos:[
  {contratoId:"101",clienteId:"77",plano:"FIBRA 700 MEGA Oryx",status:"Ativo",vencimento:25,valorAberto:"119,90",titulos:1,pendencia:true,cidade:"Sobradinho/DF",termoAssinado:true,termoUrl:"",termoPdf:""},
  {contratoId:"58",clienteId:"77",plano:"FIBRA 500 MEGA Oryx",status:"Ativo",vencimento:10,valorAberto:null,titulos:0,pendencia:false,cidade:"Sobradinho/DF",termoAssinado:false,termoUrl:"https://oryxinternet.com.br",termoPdf:""},
]};
const DEMO_BOLETOS = [
  {mes:"Maio 2026",valor:"R$ 89,90",venc:"10/05/2026",status:"vencido",cor:C.r,linha:"00190.00009 01234.560005 61237.100000 2 00000000008990",pix:"00020126360014br.gov.bcb.pix0114+556130203761520400005303986540589.905802BR5905Oryx6008BRASILIA62070503***6304A1B2",link:""},
  {mes:"Junho 2026",valor:"R$ 89,90",venc:"10/06/2026",status:"aberto",cor:C.y,linha:"00190.00009 01234.560005 61237.100000 2 00000000008990",pix:"00020126360014br.gov.bcb.pix0114+556130203761520400005303986540589.905802BR5905Oryx6008BRASILIA62070503***6304C3D4",link:""},
  {mes:"Maio 2026",valor:"R$ 89,90",venc:"10/05/2026",status:"pago",cor:C.g,linha:"",link:""},
  {mes:"Abril 2026",valor:"R$ 89,90",venc:"10/04/2026",status:"pago",cor:C.g,linha:"",link:""},
];

const corStatus = (st="") => {
  const s = st.toLowerCase();
  if (s.includes("pago")||s.includes("conclu")) return C.g;
  if (s.includes("atras")||s.includes("vencid")) return C.r;
  if (s.includes("andamento")) return C.o;
  if (s.includes("agend")) return C.p;
  return C.y;
};

// ─── LOGIN (CPF/CNPJ + senha) ───
const Login = ({onAuth,theme,toggleTheme}) => {
  const [cpf,setCpf]=useState(""); const [senha,setSenha]=useState(""); const [loading,setLoading]=useState(false);
  const [focused,setFocused]=useState(false); const [focSenha,setFocSenha]=useState(false); const [verSenha,setVerSenha]=useState(false); const [erro,setErro]=useState("");

  const login=async()=>{
    const c=onlyDigits(cpf);
    if(c.length!==11&&c.length!==14){setErro("CPF ou CNPJ inválido.");return;}
    if(!senha.trim()){setErro("Digite sua senha.");return;}
    setErro(""); setLoading(true);
    try{
      const d=await api("app-login",{cpf:c,senha:senha});
      if(d&&d.ok===false&&d.motivo==="senha_incorreta"){
        setErro("Senha incorreta. Verifique e tente novamente.");
      }else if(d&&d.ok!==false&&Array.isArray(d.contratos)&&d.contratos.length){
        onAuth({cpf:c,senha:senha,nome:d.nome||"Cliente",contratos:d.contratos});
      }else if(d&&d.ok!==false&&(d.contratoId||d.nome)){
        onAuth({cpf:c,senha:senha,nome:d.nome||"Cliente",contratos:[{contratoId:d.contratoId,clienteId:d.clienteId,plano:d.plano,status:d.status,vencimento:d.vencimento,valorAberto:d.valorAberto,titulos:d.titulos,pendencia:d.pendencia}]});
      }else{
        setErro("CPF/CNPJ não encontrado. Verifique e tente novamente.");
      }
    }catch(e){
      setErro("Sem conexão com o servidor. Verifique sua internet e tente novamente.");
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
        <p style={{color:C.s,fontSize:13,margin:0}}>Informe seu CPF/CNPJ e senha para acessar sua conta</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <label style={{color:C.lbl,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>CPF ou CNPJ</label>
          <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${focused?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:focused?"rgba(245,194,0,0.05)":C.surf,transition:"all 0.2s"}}>
            <input style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit",letterSpacing:1}} type="text" inputMode="numeric" placeholder="CPF ou CNPJ" value={cpf} onChange={e=>setCpf(fmtDoc(e.target.value))} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onKeyDown={e=>e.key==="Enter"&&login()}/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <label style={{color:C.lbl,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>Senha</label>
          <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${focSenha?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:focSenha?"rgba(245,194,0,0.05)":C.surf,transition:"all 0.2s"}}>
            <input style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit"}} type={verSenha?"text":"password"} placeholder="Sua senha" value={senha} onChange={e=>setSenha(e.target.value)} onFocus={()=>setFocSenha(true)} onBlur={()=>setFocSenha(false)} onKeyDown={e=>e.key==="Enter"&&login()}/>
            <button onClick={()=>setVerSenha(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",padding:"6px",display:"flex",alignItems:"center",color:C.s}} aria-label="Mostrar senha">
              {verSenha
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>
        </div>
        {erro&&<div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,padding:"10px 14px",color:C.r,fontSize:13}}>⚠️ {erro}</div>}
        <Btn label={loading?"Entrando...":"Entrar →"} onClick={login} disabled={loading||onlyDigits(cpf).length<11||!senha.trim()}/>
        <button onClick={async()=>{const u="https://oryx.sgp.tsmx.com.br/central/alterarsenha/";try{await Browser.open({url:u,presentationStyle:"fullscreen"});}catch(e){window.open(u,"_blank");}}} style={{background:"none",border:"none",cursor:"pointer",color:C.s,fontSize:13,padding:"2px 0 0",fontFamily:"inherit",textDecoration:"underline",textUnderlineOffset:3}}>Esqueci / quero alterar minha senha</button>
      </div>
    </div>
  );
};

// ─── HOME ───
const SelectContrato=({conta,onEscolher,onSair,theme,toggleTheme})=>(
  <div style={{padding:"28px 18px",display:"flex",flexDirection:"column",gap:16,minHeight:"100%"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <LogoH h={26}/>
      <ThemeBtn theme={theme} onClick={toggleTheme}/>
    </div>
    <div>
      <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:"6px 0 2px"}}>Olá, {conta.nome}</h2>
      <p style={{color:C.s,fontSize:13,margin:0}}>Você tem {conta.contratos.length} contratos. Escolha qual deseja acessar:</p>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {conta.contratos.map((ct,i)=>{
        const bloq=/bloque|inativ|suspens|cancel/i.test(ct.status||"");
        return (
          <div key={i} onClick={()=>onEscolher(ct)} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <div style={{flex:1}}>
              <p style={{color:C.t,fontSize:15,fontWeight:700,margin:"0 0 4px"}}>{ct.plano||"Contrato"}</p>
              <p style={{color:C.s,fontSize:12,margin:"0 0 8px"}}>Contrato #{ct.contratoId}{ct.cidade?` • ${ct.cidade}`:""}</p>
              <Badge label={ct.status||"Ativo"} color={bloq?C.r:C.g}/>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.s} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        );
      })}
    </div>
    <button onClick={onSair} style={{background:"none",border:`1px solid ${C.b}`,borderRadius:12,padding:12,color:C.s,fontSize:13,cursor:"pointer",marginTop:4}}>Sair</button>
  </div>
);

const DEMO_PROMOS=[
  {titulo:"Upgrade 1 GIGA",texto:"Dobre sua velocidade — 1\u00ba m\u00eas gr\u00e1tis!",cor:"#3D3D5C",imagem:"",link:"https://oryxinternet.com.br",botao:"Quero!"},
  {titulo:"Indique e Ganhe",texto:"Indique um amigo e ganhe 1 m\u00eas gr\u00e1tis",cor:"#16a34a",imagem:"",link:"https://oryxinternet.com.br",botao:"Participar"},
];

const Promos=()=>{
  const [promos,setPromos]=useState(null);
  const [idx,setIdx]=useState(0);
  const ref=useRef(null);
  useEffect(()=>{(async()=>{
    try{ const d=await api("app-promocoes",{}); const arr=(d.promocoes||d.promos||[]); setPromos(arr); }
    catch(e){ setPromos([]); }
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
              : <div style={{background:`linear-gradient(135deg,${p.cor||"#3D3D5C"},#3D3D5C)`,padding:18,color:"#fff",position:"relative"}}>
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

// ─── STATUS DA CONEXÃO ───
const StatusConexao = ({cliente}) => {
  const off = /inativ|bloqu|suspens|cancel|desativ|cortad|pré-?contrato/i.test(String(cliente.status||""));
  const ok = !off;
  return (
    <div style={{background:ok?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.10)",border:`1px solid ${(ok?C.g:C.r)}44`,borderRadius:14,padding:"12px 14px",display:"flex",gap:12,alignItems:"center"}}>
      <span style={{width:11,height:11,borderRadius:"50%",background:ok?C.g:C.r,flexShrink:0,boxShadow:`0 0 0 4px ${(ok?C.g:C.r)}22`}}/>
      <div style={{flex:1}}><p style={{color:C.t,fontSize:13,fontWeight:700,margin:"0 0 1px"}}>{ok?"Conexão online":"Conexão offline"}</p><p style={{color:C.s,fontSize:11.5,margin:0}}>{ok?"Seu serviço está ativo.":"Serviço suspenso — regularize para reativar."}</p></div>
    </div>
  );
};

// ─── CONSUMO ───
const fmtBytes = (n) => {
  const v=Number(n); if(!v||isNaN(v)) return "0";
  if(v>=1e9) return (v/1e9).toFixed(2).replace(".",",")+" GB";
  if(v>=1e6) return (v/1e6).toFixed(1).replace(".",",")+" MB";
  if(v>=1e3) return (v/1e3).toFixed(0)+" KB";
  return v+" B";
};
const Consumo = ({goBack,cliente}) => {
  const hoje=new Date();
  const [ano,setAno]=useState(hoje.getFullYear());
  const [mes,setMes]=useState(hoje.getMonth()+1);
  const [data,setData]=useState(null); const [demo,setDemo]=useState(false);
  useEffect(()=>{ setData(null); (async()=>{
    try{ const d=await api("app-consumo",{cpf:cliente.cpf,senha:cliente.senha,contrato:cliente.contratoId,ano,mes}); setData(d); setDemo(false); }
    catch(e){ setData("erro"); }
  })();},[ano,mes]);
  const prev=()=>{ let m=mes-1,a=ano; if(m<1){m=12;a--;} setMes(m); setAno(a); };
  const next=()=>{ const now=new Date(); let m=mes+1,a=ano; if(a>now.getFullYear()||(a===now.getFullYear()&&m>now.getMonth()+1))return; setMes(m); setAno(a); };
  const lista=(data&&(data.list||data.dias||data.detalhe))||[];
  return (
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Consumo de internet</h2>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.surf,border:`1px solid ${C.b}`,borderRadius:12,padding:"6px 8px"}}>
        <button onClick={prev} style={{background:"none",border:"none",color:C.t,fontSize:22,cursor:"pointer",padding:"0 12px"}}>‹</button>
        <span style={{color:C.t,fontSize:14,fontWeight:700}}>{MESES[mes-1]} {ano}</span>
        <button onClick={next} style={{background:"none",border:"none",color:C.t,fontSize:22,cursor:"pointer",padding:"0 12px"}}>›</button>
      </div>
      {data===null ? <Spinner label="Buscando seu consumo..."/> : data==="erro" ? (<div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.r,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>Sem conexão</p><p style={{color:C.s,fontSize:13,margin:0}}>Não foi possível carregar o consumo. Verifique sua internet.</p></div>) : (<>
        <div style={{background:"linear-gradient(135deg,#3D3D5C,#000)",borderRadius:18,padding:"20px 18px",color:"#fff"}}>
          <p style={{margin:"0 0 4px",fontSize:11,letterSpacing:1,color:"#F5C200",fontWeight:800}}>TOTAL NO MÊS</p>
          <p style={{margin:0,fontSize:30,fontWeight:900}}>{fmtBytes(data.total!=null?data.total:(data.consumoTotal||0))}</p>
          <p style={{margin:"6px 0 0",fontSize:12,opacity:.85}}>Plano: {data.plano||cliente.plano}</p>
        </div>
        {lista.length>0 ? (
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:"4px 16px"}}>
            {lista.map((it,i)=>{ const dia=it.data||it.dia||it.dataReferencia||it.referencia||("#"+(i+1)); const val=it.total!=null?it.total:((Number(it.download)||0)+(Number(it.upload)||0)||it.consumo||it.bytes||0); return (
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<lista.length-1?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:13}}>{dia}</span><span style={{color:C.t,fontSize:13,fontWeight:700}}>{fmtBytes(val)}</span></div>
            );})}
          </div>
        ) : (
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:18,textAlign:"center"}}><p style={{color:C.s,fontSize:13,margin:0}}>Sem detalhamento diário para este mês.</p></div>
        )}
      </>)}
    </div>
  );
};

// ─── CARD CENTRAL DINÂMICO (pendência | promoção | tudo certo) ───
const CardCentral = ({cliente,goTo}) => {
  const [promos,setPromos]=useState(null);
  const ref=useRef(null); const [idx,setIdx]=useState(0);
  useEffect(()=>{(async()=>{ try{ const d=await api("app-promocoes",{}); setPromos(d.promocoes||d.promos||[]); }catch(e){ setPromos([]); } })();},[]);
  const abrir=async(link)=>{ if(!link)return; try{ await Browser.open({url:link,presentationStyle:"fullscreen"}); }catch(e){ window.open(link,"_blank"); } };
  const onScroll=()=>{ const el=ref.current; if(!el)return; setIdx(Math.round(el.scrollLeft/el.clientWidth)); };
  const valNum=parseFloat(String(cliente.valorAberto||"0").replace(/\./g,"").replace(",","."));
  const pend=(cliente.titulos>0)&&valNum>0;
  const st=String(cliente.status||"Ativo");
  const ativo=!/(inativ|bloqu|suspens|cancel|desativ|cortad)/i.test(st);
  const CARD={background:"#fff",borderRadius:22,boxShadow:"0 12px 30px rgba(0,0,0,0.18)"};

  if(!cliente.termoAssinado) return (
    <div onClick={()=>goTo("contrato")} style={{...CARD,padding:"26px 22px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:"pointer"}}>
      <div style={{width:74,height:74,borderRadius:"50%",background:"rgba(245,194,0,0.16)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34}}>✍️</div>
      <p style={{color:"#16161d",fontSize:21,fontWeight:800,margin:0}}>Assine seu contrato</p>
      <p style={{color:"#6b6457",fontSize:13.5,margin:0,textAlign:"center"}}>Seu termo de adesão está pendente de assinatura.</p>
      <div style={{marginTop:8,width:"100%",background:"linear-gradient(135deg,#F5C200,#FFD633)",color:"#2b2b3d",fontSize:14,fontWeight:800,padding:"12px 0",borderRadius:13,textAlign:"center"}}>Assinar agora →</div>
    </div>
  );
  if(pend) return (
    <div onClick={()=>goTo("boleto")} style={{...CARD,padding:"26px 22px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:"pointer"}}>
      <div style={{width:74,height:74,borderRadius:"50%",background:"rgba(220,38,38,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>⚠️</div>
      <p style={{color:"#16161d",fontSize:21,fontWeight:800,margin:0}}>Fatura pendente</p>
      <p style={{color:"#6b6457",fontSize:13.5,margin:0,textAlign:"center"}}>R$ {cliente.valorAberto}{cliente.vencimento?` • venc. dia ${cliente.vencimento}`:""}</p>
      <div style={{marginTop:8,width:"100%",background:"linear-gradient(135deg,#F5C200,#FFD633)",color:"#2b2b3d",fontSize:14,fontWeight:800,padding:"12px 0",borderRadius:13,textAlign:"center"}}>Pagar com Pix / 2ª via →</div>
    </div>
  );
  if(promos===null) return <div style={{...CARD,height:220}}/>;
  if(promos.length>0) return (
    <div>
      <div ref={ref} onScroll={onScroll} style={{display:"flex",gap:10,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",borderRadius:22}}>
        {promos.map((pp,i)=>(
          <div key={i} onClick={()=>abrir(pp.link)} style={{minWidth:"100%",scrollSnapAlign:"center",borderRadius:22,overflow:"hidden",cursor:"pointer",boxShadow:"0 12px 30px rgba(0,0,0,0.18)"}}>
            {pp.imagem
              ? <img src={pp.imagem} alt={pp.titulo||"Promoção"} style={{width:"100%",display:"block",objectFit:"cover"}}/>
              : <div style={{background:`linear-gradient(140deg,${pp.cor||"#3D3D5C"},#1a1c4e)`,padding:"24px 20px",color:"#fff",position:"relative",minHeight:160}}>
                  <div style={{position:"absolute",top:-12,right:-12,width:70,height:70,borderRadius:"50%",background:"rgba(245,194,0,0.85)"}}/>
                  <div style={{fontSize:11,color:"#F5C200",fontWeight:800,letterSpacing:1,position:"relative"}}>{pp.selo||"PROMOÇÃO"}</div>
                  <div style={{fontSize:23,fontWeight:900,margin:"8px 0 4px",position:"relative",lineHeight:1.15}}>{pp.titulo}</div>
                  {pp.texto&&<div style={{fontSize:13,opacity:0.9,marginBottom:16,position:"relative"}}>{pp.texto}</div>}
                  {pp.link&&<div style={{background:"#F5C200",color:"#1a1c4e",fontSize:13,fontWeight:800,padding:"9px 16px",borderRadius:10,display:"inline-block",position:"relative"}}>{(pp.botao||"Saiba mais")} →</div>}
                </div>}
          </div>
        ))}
      </div>
      {promos.length>1&&<div style={{display:"flex",gap:5,justifyContent:"center",marginTop:10}}>
        {promos.map((_,i)=>(<div key={i} style={{width:idx===i?18:5,height:5,borderRadius:9,background:idx===i?"#fff":"rgba(255,255,255,0.5)",transition:"all 0.2s"}}/>))}
      </div>}
    </div>
  );
  return (
    <div style={{...CARD,padding:"30px 22px",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
      <div style={{width:78,height:78,borderRadius:"50%",background:ativo?"rgba(22,163,74,0.12)":"rgba(234,88,12,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:38}}>{ativo?"✅":"⚠️"}</div>
      <p style={{color:"#16161d",fontSize:22,fontWeight:800,margin:0}}>{ativo?"Tudo certo":st}</p>
      <p style={{color:"#6b6457",fontSize:14,margin:0,textAlign:"center"}}>{ativo?"com o seu plano!":"Regularize para reativar sua conexão"}</p>
      <div style={{marginTop:4,background:ativo?"rgba(22,163,74,0.12)":"rgba(234,88,12,0.12)",color:ativo?"#15803d":"#c2410c",fontSize:12,fontWeight:700,padding:"5px 14px",borderRadius:20,textAlign:"center"}}>{cliente.plano}{ativo?" • em dia":""}</div>
    </div>
  );
};

const Home = ({goTo,cliente,theme,toggleTheme,onTrocar,varios}) => {
  const inicial=(cliente.nome||"C").charAt(0).toUpperCase();
  const primeiro=(cliente.nome||"Cliente").split(" ")[0];
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  const contatos=[["💬",()=>abrir("https://wa.me/556130203761")],[(<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>),()=>abrir("https://instagram.com/oryxinternet")],["📞",()=>{try{window.location.href="tel:+556130203761";}catch(e){}}]];
  const atalhos=[
    {emoji:"💳",label:"2ª via",screen:"boleto"},
    {emoji:"🔓",label:"Desbloqueio",screen:"desbloqueio"},
    {emoji:"📊",label:"Consumo",screen:"consumo"},
    {emoji:"✍️",label:"Contrato",screen:"contrato"},
    {emoji:"⚡",label:"Velocidade",screen:"velocidade"},
    {emoji:"📺",label:"Meus Apps",screen:"apps"},
    {emoji:"💬",label:"Suporte",screen:"suporte"},
  ];
  const claroSec=C.logoNeg?"rgba(255,255,255,0.72)":"rgba(43,43,61,0.7)";
  const titColor=C.logoNeg?"#ffffff":"#2b2b3d";
  return (
    <div style={{minHeight:"100%",background:C.logoNeg?C.bg:"linear-gradient(170deg,#FFDD55,#F5C200)",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"18px 18px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:8}}>
          {contatos.map(([e,fn],i)=>(
            <button key={i} onClick={fn} style={{width:38,height:38,borderRadius:"50%",background:"#3D3D5C",border:"none",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,cursor:"pointer"}}>{e}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <ThemeBtn theme={theme} onClick={toggleTheme}/>
          <button onClick={()=>goTo("perfil")} style={{width:38,height:38,borderRadius:"50%",background:"#3D3D5C",border:"2px solid #F5C200",display:"flex",alignItems:"center",justifyContent:"center",color:"#F5C200",fontSize:15,fontWeight:700,cursor:"pointer"}}>{inicial}</button>
        </div>
      </div>
      <div style={{padding:"16px 20px 0"}}>
        <p style={{color:claroSec,fontSize:13,margin:0}}>Olá,</p>
        <h2 style={{color:titColor,fontSize:24,fontWeight:800,margin:0}}>{primeiro}!</h2>
        {varios&&<p onClick={onTrocar} style={{color:titColor,fontSize:12,fontWeight:700,margin:"5px 0 0",cursor:"pointer",textDecoration:"underline"}}>↺ Trocar contrato</p>}
      </div>
      <div style={{flex:1,display:"flex",alignItems:"center",padding:"14px 18px"}}>
        <div style={{width:"100%"}}><CardCentral cliente={cliente} goTo={goTo}/></div>
      </div>
      <div style={{padding:"0 0 calc(18px + env(safe-area-inset-bottom)) 16px",display:"flex",gap:11,overflowX:"auto",scrollbarWidth:"none"}}>
        {atalhos.map((a,i)=>(
          <button key={i} onClick={()=>goTo(a.screen)} style={{minWidth:90,flexShrink:0,background:"#3D3D5C",border:"none",borderRadius:16,padding:"14px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,color:"#fff",cursor:"pointer"}}>
            <span style={{fontSize:24}}>{a.emoji}</span>
            <span style={{fontSize:11,textAlign:"center"}}>{a.label}</span>
          </button>
        ))}
        <div style={{minWidth:14,flexShrink:0}}/>
      </div>
    </div>
  );
};

// ─── BOLETO ───
const Boleto = ({goBack,goTo,cliente}) => {
  const [sel,setSel]=useState(null); const [lista,setLista]=useState(null); const [demo,setDemo]=useState(false); const [copiado,setCopiado]=useState(false); const [copiadoPix,setCopiadoPix]=useState(false);
  useEffect(()=>{(async()=>{
    try{
      const d=await api("app-boletos",{cpf:cliente.cpf,contrato:cliente.contratoId});
      const hoje=new Date(); hoje.setHours(0,0,0,0);
      const arr=(d.boletos||d.titulos||[]).map(b=>{
        const venc=b.venc||b.dataVencimento||b.data_vencimento||"";
        const dt=parseData(venc);
        const pago=/pago|quit/i.test(b.status||"");
        const vencido=!pago&&dt&&dt<hoje;
        const status=pago?"pago":(vencido?"vencido":"aberto");
        const titulo=dt?`${MESES[dt.getMonth()]} ${dt.getFullYear()}`:(b.mes||b.competencia||fmtData(venc));
        return {
          mes:titulo,
          valor:fmtValor(b.valor),
          venc:fmtData(venc),
          status,
          cor:pago?C.g:(vencido?C.r:C.y),
          linha:b.linha||b.linhaDigitavel||b.codigo_barras||"",
          pix:b.pix||b.codigoPix||b.codigo_pix||b.pixCopiaECola||b.pix_copia_cola||b.qrcode||b.qr_code||b.emv||b.brcode||"",
          link:b.link||b.link_cobranca||"",
        };
      });
      setLista(arr);
    }catch(e){ setLista("erro"); }
  })();},[]);

  if(lista===null) return <div style={{padding:"20px 16px"}}><Back onClick={goBack}/><Spinner label="Buscando seus boletos..."/></div>;

  if(lista==="erro") return <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}><Back onClick={goBack}/><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>2ª Via de Boleto</h2><div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.r,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>Sem conexão</p><p style={{color:C.s,fontSize:13,margin:0}}>Não foi possível carregar seus boletos. Verifique sua internet.</p></div></div>;

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
        {b.linha&&<Btn label={copiado?"✓ Copiado!":"📋 Copiar código de barras"} onClick={()=>{navigator.clipboard?.writeText(b.linha);setCopiado(true);setTimeout(()=>setCopiado(false),2000);}} s={{background:"rgba(245,194,0,0.12)",color:C.y,boxShadow:"none",border:`1px solid rgba(245,194,0,0.25)`}}/>}
        {b.pix&&<div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:12,padding:14}}>
          <p style={{color:C.s,fontSize:11,margin:"0 0 6px",letterSpacing:1,textTransform:"uppercase"}}>Pix copia e cola</p>
          <p style={{color:C.t,fontSize:11,fontFamily:"monospace",margin:0,letterSpacing:0.5,wordBreak:"break-all"}}>{b.pix}</p>
        </div>}
        {b.pix&&<Btn label={copiadoPix?"✓ Pix copiado!":"📲 Copiar Pix (copia e cola)"} onClick={()=>{navigator.clipboard?.writeText(b.pix);setCopiadoPix(true);setTimeout(()=>setCopiadoPix(false),2000);}}/>}
        {b.link&&<Btn label="📄 Abrir boleto / PDF" onClick={async()=>{try{await Browser.open({url:b.link,presentationStyle:"fullscreen"});}catch(e){window.open(b.link,"_blank");}}} s={{background:"rgba(245,194,0,0.12)",color:C.y,boxShadow:"none",border:`1px solid rgba(245,194,0,0.25)`}}/>}
      </>}
      {b.status==="pago"&&<div style={{background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:12,padding:14,textAlign:"center"}}><p style={{color:C.g,fontSize:13,fontWeight:600,margin:0}}>✓ Boleto quitado</p></div>}
    </div>
  );}

  return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>2ª Via de Boleto</h2>
      <p style={{color:C.s,fontSize:13,margin:0}}>Contrato #{cliente.contratoId} — {cliente.nome}</p>
      <button onClick={()=>goTo("notas")} style={{alignSelf:"flex-start",background:C.surf,border:`1px solid ${C.b}`,borderRadius:12,padding:"10px 14px",color:C.t,fontSize:13,fontWeight:700,cursor:"pointer"}}>🧾 Minhas notas fiscais ›</button>
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

// ─── SUPORTE ───
const Velocidade=({goBack})=>{
  const [fase,setFase]=useState("idle");
  const [mbps,setMbps]=useState(0);
  const [res,setRes]=useState({ping:null,down:null,up:null});
  const testando=fase==="ping"||fase==="download"||fase==="upload";

  const medirPing=async()=>{
    let best=Infinity;
    for(let i=0;i<5;i++){ const t=performance.now(); try{ await fetch("https://speed.cloudflare.com/__down?bytes=0&r="+Math.random(),{cache:"no-store"}); }catch(e){} const d=performance.now()-t; if(d<best)best=d; }
    return best===Infinity?null:Math.round(best);
  };
  const medirDownload=async()=>{
    const bytes=30000000; const t0=performance.now(); let loaded=0;
    const resp=await fetch("https://speed.cloudflare.com/__down?bytes="+bytes+"&r="+Math.random(),{cache:"no-store"});
    if(resp.body&&resp.body.getReader){
      const reader=resp.body.getReader();
      while(true){ const r=await reader.read(); if(r.done)break; loaded+=r.value.length; const sec=(performance.now()-t0)/1000; if(sec>0)setMbps((loaded*8)/sec/1e6); }
    } else { const buf=await resp.arrayBuffer(); loaded=buf.byteLength; }
    const sec=(performance.now()-t0)/1000; return sec>0?(loaded*8)/sec/1e6:0;
  };
  const medirUpload=async()=>{
    const bytes=10000000; const data=new Uint8Array(bytes); const t0=performance.now();
    try{ await fetch("https://speed.cloudflare.com/__up",{method:"POST",body:data,cache:"no-store"}); }catch(e){ return null; }
    const sec=(performance.now()-t0)/1000; return sec>0?(bytes*8)/sec/1e6:null;
  };
  const iniciar=async()=>{
    if(testando)return;
    setRes({ping:null,down:null,up:null}); setMbps(0);
    try{
      setFase("ping"); const ping=await medirPing(); setRes(r=>({...r,ping}));
      setFase("download"); const down=await medirDownload(); setRes(r=>({...r,down})); setMbps(down);
      setFase("upload"); setMbps(0); const up=await medirUpload(); setRes(r=>({...r,up}));
      setFase("done");
    }catch(e){ setFase("erro"); }
  };

  const fmt=(v)=>v==null?"—":(v>=100?String(Math.round(v)):v.toFixed(1));
  const ringMax=Math.max(50,(res.down||mbps||50));
  const pct=Math.min((mbps||0)/ringMax,1);
  const R=86, CIRC=2*Math.PI*R;
  const faseLabel={idle:"Toque para iniciar",ping:"Medindo latência…",download:"Testando download…",upload:"Testando upload…",done:"Teste concluído",erro:"Falha no teste — tente de novo"}[fase];
  const centro = fase==="upload" ? fmt(res.up) : (fase==="done" ? fmt(res.down) : fmt(mbps||(fase==="idle"?null:0)));

  return (
    <div style={{padding:"16px 16px 28px",display:"flex",flexDirection:"column",gap:16}}>
      <div><h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Teste de Velocidade</h2><p style={{color:C.s,fontSize:13,margin:"4px 0 0"}}>Medição feita dentro do app, sem abrir o navegador</p></div>

      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"24px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <div style={{position:"relative",width:200,height:200}}>
          <svg width="200" height="200" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="86" fill="none" stroke={C.line2} strokeWidth="14"/>
            <circle cx="100" cy="100" r="86" fill="none" stroke={C.y} strokeWidth="14" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC*(1-pct)} transform="rotate(-90 100 100)" style={{transition:"stroke-dashoffset 0.25s"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:C.t,fontSize:42,fontWeight:900,lineHeight:1}}>{centro}</span>
            <span style={{color:C.s,fontSize:13,fontWeight:700,marginTop:2}}>Mbps</span>
          </div>
        </div>
        <p style={{color:testando?C.y:C.s,fontSize:13,fontWeight:700,margin:0}}>{faseLabel}</p>

        <div style={{display:"flex",gap:10,width:"100%"}}>
          {[["Ping",res.ping==null?"—":res.ping+" ms"],["Download",res.down==null?"—":fmt(res.down)+" Mbps"],["Upload",res.up==null?"—":fmt(res.up)+" Mbps"]].map(([k,v],i)=>(
            <div key={i} style={{flex:1,background:C.card,border:`1px solid ${C.line}`,borderRadius:12,padding:"10px 6px",textAlign:"center"}}>
              <p style={{color:C.s,fontSize:10.5,margin:"0 0 3px",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{k}</p>
              <p style={{color:C.t,fontSize:13,fontWeight:800,margin:0}}>{v}</p>
            </div>
          ))}
        </div>

        <button onClick={iniciar} disabled={testando} style={{width:"100%",background:testando?C.line3:C.y,color:"#3D3D5C",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:800,cursor:testando?"default":"pointer",opacity:testando?0.7:1}}>{testando?"Testando…":((fase==="done"||fase==="erro")?"Testar novamente":"Iniciar teste →")}</button>
      </div>

      <div style={{background:"rgba(245,194,0,0.07)",border:`1px solid ${C.line}`,borderRadius:12,padding:"13px 15px"}}>
        <p style={{color:C.t,fontSize:12.5,fontWeight:700,margin:"0 0 6px"}}>💡 Dicas para um teste preciso</p>
        <p style={{color:C.s,fontSize:11.5,margin:0,lineHeight:1.6}}>• Conecte o aparelho no Wi-Fi e fique perto do roteador<br/>• Feche apps e downloads em segundo plano<br/>• Evite outras pessoas usando a internet durante o teste<br/>• Para medir o plano contratado, use cabo no computador quando possível</p>
      </div>
    </div>
  );
};

const Suporte=({goBack,goTo})=>{
  const [faq,setFaq]=useState(null);
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  const tel=()=>{ try{ window.location.href="tel:+556130203761"; }catch(e){} };
  const canais=[
    {icon:"💬",label:"Chat pelo WhatsApp",sub:"Atendimento rápido",color:C.wa,action:"Iniciar",go:()=>abrir("https://wa.me/556130203761?text="+encodeURIComponent("Olá! Preciso de ajuda com minha internet Oryx."))},
    {icon:"📞",label:"Ligar para o suporte",sub:"(61) 3020-3761",color:C.p,action:"Ligar",go:tel},
    {icon:"🔧",label:"Abrir chamado técnico",sub:"Falar com o suporte",color:C.o,action:"Abrir",go:()=>abrir("https://wa.me/556130203761?text="+encodeURIComponent("Olá! Preciso de ajuda com minha internet Oryx. Quero abrir um chamado técnico."))},
    {icon:"🔓",label:"Desbloqueio de confiança",sub:"Liberar conexão",color:C.y,action:"Liberar",go:()=>goTo("desbloqueio")},
  ];
  const redes=[
    {icon:"📷",label:"Instagram",sub:"@oryxinternet",color:"#E1306C",go:()=>abrir("https://instagram.com/oryxinternet")},
    {icon:"👍",label:"Facebook",sub:"Oryx Internet",color:"#1877F2",go:()=>abrir("https://facebook.com/profile.php?id=61577225497699")},
  ];
  const faqs=[
    {q:"Minha internet está lenta, o que fazer?",a:"Reinicie o roteador desligando e ligando novamente. Aguarde 2 minutos. Você também pode usar a aba Velocidade do app para testar sua conexão. Se persistir, abra um chamado técnico ou fale no WhatsApp."},
    {q:"Estou sem conexão, e agora?",a:"Verifique se as luzes do roteador estão acesas e reinicie o aparelho. Se você estiver com fatura em aberto, use o Desbloqueio de Confiança no app para liberar na hora. Persistindo, fale com o suporte."},
    {q:"Como faço a 2ª via do meu boleto?",a:"Na aba Boleto do app você vê todas as suas faturas e pode copiar a linha digitável ou abrir o boleto."},
  ];
  return(
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Suporte & Contato</h2>
      <p style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:0}}>Canais de atendimento</p>
      {canais.map((item,i)=>(
        <div key={i} onClick={item.go} style={{background:C.surf,border:`1px solid ${item.color}22`,borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}>
          <div style={{width:46,height:46,borderRadius:14,background:`${item.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{item.icon}</div>
          <div style={{flex:1}}><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 2px"}}>{item.label}</p><p style={{color:C.s,fontSize:12,margin:0}}>{item.sub}</p></div>
          <span style={{color:item.color,fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{item.action} →</span>
        </div>
      ))}
      <p style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:"4px 0 0"}}>Redes sociais</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {redes.map((r,i)=>(
          <div key={i} onClick={r.go} style={{background:C.surf,border:`1px solid ${r.color}22`,borderRadius:14,padding:"14px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer"}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${r.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{r.icon}</div>
            <p style={{color:C.t,fontSize:13,fontWeight:700,margin:0}}>{r.label}</p>
            <p style={{color:C.s,fontSize:11,margin:0}}>{r.sub}</p>
          </div>
        ))}
      </div>
      <p style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:"4px 0 0"}}>Perguntas frequentes</p>
      {faqs.map((f,i)=>(
        <div key={i} style={{background:C.surf,border:`1px solid ${faq===i?"rgba(245,194,0,0.25)":C.b}`,borderRadius:14,overflow:"hidden",cursor:"pointer"}} onClick={()=>setFaq(faq===i?null:i)}>
          <div style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><p style={{color:C.t,fontSize:13,fontWeight:600,margin:0,flex:1,paddingRight:8}}>{f.q}</p><span style={{color:C.y,fontSize:16,display:"block",transform:faq===i?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}>›</span></div>
          {faq===i&&<div style={{padding:"0 16px 14px",borderTop:`1px solid ${C.line}`}}><p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.6}}>{f.a}</p></div>}
        </div>
      ))}
      <div style={{background:"rgba(245,194,0,0.06)",border:"1px solid rgba(245,194,0,0.15)",borderRadius:16,padding:16,textAlign:"center"}}>
        <p style={{color:C.s,fontSize:12,margin:"0 0 6px"}}>Horário de atendimento</p>
        <p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 10px"}}>Seg–Sex: 8h–19h • Sáb: 9h–16h</p>
        <p style={{color:C.s,fontSize:11.5,margin:0,lineHeight:1.5}}>📍 SCS Quadra 07, Bloco A, Ed. Pátio Brasil, sala 1228 — Asa Sul, Brasília/DF</p>
      </div>
    </div>
  );
};

// ─── PERFIL ───
const AtualizarCadastro = ({goBack,cliente}) => {
  const [tel,setTel]=useState(""); const [email,setEmail]=useState(""); const [foc,setFoc]=useState("");
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  const enviar=()=>{
    const msg="Olá! Sou "+cliente.nome+" (contrato #"+cliente.contratoId+"). Quero atualizar meu cadastro:"+(tel?"\nTelefone: "+tel:"")+(email?"\nE-mail: "+email:"");
    abrir("https://wa.me/556130203761?text="+encodeURIComponent(msg));
  };
  const campo=(label,val,setVal,ph,key,type)=>(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{color:C.lbl,fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>{label}</label>
      <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${foc===key?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:foc===key?"rgba(245,194,0,0.05)":C.surf}}>
        <input style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit"}} type={type||"text"} placeholder={ph} value={val} onChange={e=>setVal(e.target.value)} onFocus={()=>setFoc(key)} onBlur={()=>setFoc("")}/>
      </div>
    </div>
  );
  return (
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:16}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Atualizar cadastro</h2>
      <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.5}}>Informe seu novo telefone e/ou e-mail. Sua solicitação será enviada para a equipe da Oryx pelo WhatsApp.</p>
      {campo("Telefone / WhatsApp",tel,setTel,"(61) 9 9999-9999","tel","tel")}
      {campo("E-mail",email,setEmail,"voce@email.com","email","email")}
      <Btn label="Enviar atualização" onClick={enviar} disabled={!tel.trim()&&!email.trim()}/>
    </div>
  );
};

const Notas = ({goBack,cliente}) => {
  const [lista,setLista]=useState(null); const [demo,setDemo]=useState(false);
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  const statusLabel=(st)=>{ const m={"1":"Autorizada","3":"Em digitação","5":"Rejeitada","8":"Cancelada","9":"Importada","10":"Aguardando","11":"Substituída"}; return m[String(st)]||String(st||""); };
  useEffect(()=>{(async()=>{
    try{
      const d=await api("app-notas",{cpf:cliente.cpf,contrato:cliente.contratoId});
      const arr=(d.notas||d.results||d.list||[]).map(n=>({numero:n.numero||n.id, id:n.id, data:n.data_emissao||n.data||"", status:n.status, serie:n.serie||""}));
      setLista(arr); setDemo(false);
    }catch(e){ setLista("erro"); }
  })();},[]);
  const baixar=(id)=>{ abrir(API_BASE+"/app-nota-pdf?id="+encodeURIComponent(id)+"&contrato="+encodeURIComponent(cliente.contratoId)); };
  return (
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Notas fiscais</h2>
      <p style={{color:C.s,fontSize:13,margin:0}}>Notas emitidas no seu contrato #{cliente.contratoId}.</p>
      {lista===null ? <Spinner label="Buscando suas notas..."/> : lista==="erro" ? (
        <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.r,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>Sem conexão</p><p style={{color:C.s,fontSize:13,margin:0}}>Não foi possível carregar suas notas. Verifique sua internet.</p></div>
      ) : (
        lista.length===0 ? (
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.s,fontSize:14,margin:0}}>Nenhuma nota fiscal emitida ainda.</p></div>
        ) : lista.map((n,i)=>(
          <div key={i} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>NFCom Nº {n.numero}{n.serie?(" • Série "+n.serie):""}</p><p style={{color:C.s,fontSize:12,margin:"0 0 8px"}}>Emitida em {fmtData(n.data)}</p><Badge label={statusLabel(n.status)} color={String(n.status)==="1"?C.g:C.o}/></div>
            {String(n.status)==="1" ? <button onClick={()=>baixar(n.id)} style={{background:C.y,color:"#1a1000",border:"none",borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>Baixar PDF</button> : <span style={{color:C.s,fontSize:11.5,whiteSpace:"nowrap"}}>PDF indisponível</span>}
          </div>
        ))
      )}
    </div>
  );
};

const Perfil=({goBack,goLogin,goTo,cliente})=>(
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
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {[["✏️ Atualizar cadastro",()=>goTo("atualizar")]].map(([lbl,fn],i)=>(
        <button key={i} onClick={fn} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:14,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",color:C.t,fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left"}}>{lbl}<span style={{color:C.s}}>›</span></button>
      ))}
    </div>
    <button onClick={goLogin} style={{background:"none",border:"1px solid rgba(241,85,85,0.3)",borderRadius:14,padding:14,color:C.r,fontSize:14,fontWeight:600,cursor:"pointer"}}>Sair da conta</button>
  </div>
);

// ─── TAB BAR ───

// ─── DESBLOQUEIO ───
const Desbloqueio = ({goBack,cliente}) => {
  const [step,setStep]=useState("info"); const [res,setRes]=useState(null); const [demo,setDemo]=useState(false);
  const liberar=async()=>{
    setStep("processando");
    try{
      const d=await api("app-desbloqueio",{contrato:cliente.contratoId});
      setRes(d); setDemo(false);
    }catch(e){
      setRes({ok:false,mensagem:"Não foi possível concluir. Verifique sua conexão e tente novamente."});
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
        <Btn label="Voltar ao início" onClick={goBack} s={{background:"rgba(255,255,255,0.07)",color:C.t,boxShadow:"none",border:`1px solid rgba(255,255,255,0.1)`}}/>
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
      <div style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Cliente",cliente.nome],["Contrato",`#${cliente.contratoId}`],["Plano",cliente.plano]].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<2?`1px solid rgba(255,255,255,0.06)`:undefined}}><span style={{color:C.s,fontSize:13}}>{k}</span><span style={{color:C.t,fontSize:13,fontWeight:700}}>{v}</span></div>
        ))}
      </div>
      <Btn label="🔓 Liberar minha conexão" onClick={liberar}/>
    </div>
  );
};

// ─── CONTRATO (assinatura via termo de aceite) ───

// ─── CONTRATO (SGPsign) ───
const PdfViewer=({url,title,onClose})=>{
  const [pages,setPages]=useState([]);
  const [estado,setEstado]=useState("load");
  useEffect(()=>{ let cancel=false; (async()=>{
    try{
      const src="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs";
      const pdfjs=await import(/* @vite-ignore */ src);
      pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
      const doc=await pdfjs.getDocument({url}).promise;
      const imgs=[]; const scale=Math.min(2.2,(window.devicePixelRatio||1)*1.4);
      for(let n=1;n<=doc.numPages;n++){
        if(cancel)return;
        const page=await doc.getPage(n);
        const vp=page.getViewport({scale});
        const canvas=document.createElement("canvas");
        canvas.width=vp.width; canvas.height=vp.height;
        await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
        imgs.push(canvas.toDataURL("image/jpeg",0.85));
      }
      if(!cancel){ setPages(imgs); setEstado("ok"); }
    }catch(e){ if(!cancel) setEstado("erro"); }
  })(); return ()=>{cancel=true;}; },[url]);
  const abrirExterno=async()=>{ try{ await Browser.open({url,presentationStyle:"fullscreen"}); }catch(e){ window.open(url,"_blank"); } };
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"calc(10px + env(safe-area-inset-top)) 14px 10px",borderBottom:`1px solid ${C.line}`,background:C.nav}}>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.t,fontSize:24,lineHeight:1,cursor:"pointer",padding:"0 4px"}}>‹</button>
        <span style={{color:C.t,fontSize:15,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title||"Documento"}</span>
        <button onClick={abrirExterno} style={{background:"none",border:"none",color:C.yd,fontSize:13,fontWeight:700,cursor:"pointer"}}>Baixar</button>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:C.surf,padding:"12px 10px calc(14px + env(safe-area-inset-bottom))"}}>
        {estado==="load"&&<p style={{color:C.s,fontSize:13,textAlign:"center",marginTop:40}}>Carregando documento…</p>}
        {estado==="erro"&&(<div style={{textAlign:"center",marginTop:40,padding:"0 24px"}}><p style={{color:C.s,fontSize:13,lineHeight:1.5}}>Não foi possível exibir o PDF aqui. Toque abaixo para abrir.</p><button onClick={abrirExterno} style={{marginTop:14,background:C.y,color:"#1a1000",border:"none",borderRadius:12,padding:"12px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Abrir documento</button></div>)}
        {estado==="ok"&&pages.map((src,i)=>(<img key={i} src={src} alt={"Página "+(i+1)} style={{width:"100%",display:"block",marginBottom:10,borderRadius:6,boxShadow:"0 2px 10px rgba(0,0,0,0.15)"}}/>))}
      </div>
    </div>
  );
};

const PhotoCard=({label,val,onPick,capture})=>(
  <label style={{flex:1,minWidth:0,aspectRatio:"1/1",background:val?"#000":C.surf,border:`1.5px dashed ${val?"transparent":C.line3}`,borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer",overflow:"hidden",position:"relative"}}>
    <input type="file" accept="image/*" capture={capture} onChange={onPick} style={{display:"none"}}/>
    {val
      ? <><img src={val} alt={label} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/><span style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:10,fontWeight:700,padding:"3px 0",textAlign:"center"}}>{label} ✓</span></>
      : <><span style={{fontSize:22}}>📷</span><span style={{color:C.s,fontSize:10.5,fontWeight:700,textAlign:"center",padding:"0 4px"}}>{label}</span></>}
  </label>
);

const AssinarContrato=({cliente,onClose})=>{
  const canvasRef=useRef(null); const drawing=useRef(false);
  const [temAss,setTemAss]=useState(false);
  const [fotos,setFotos]=useState({frente:null,verso:null,selfie:null});
  const [aceite,setAceite]=useState(false);
  const [enviando,setEnviando]=useState(false);
  const [erro,setErro]=useState(null);
  const [ok,setOk]=useState(false);

  useEffect(()=>{ const c=canvasRef.current; if(!c)return; const r=c.getBoundingClientRect(); c.width=r.width*2; c.height=r.height*2; const ctx=c.getContext("2d"); ctx.scale(2,2); ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle="#111111"; },[]);
  const pos=(e)=>{ const c=canvasRef.current; const r=c.getBoundingClientRect(); const t=e.touches&&e.touches[0]?e.touches[0]:e; return {x:t.clientX-r.left,y:t.clientY-r.top}; };
  const start=(e)=>{ e.preventDefault(); drawing.current=true; const ctx=canvasRef.current.getContext("2d"); const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); };
  const move=(e)=>{ if(!drawing.current)return; e.preventDefault(); const ctx=canvasRef.current.getContext("2d"); const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); if(!temAss)setTemAss(true); };
  const end=()=>{ drawing.current=false; };
  const limpar=()=>{ const c=canvasRef.current; c.getContext("2d").clearRect(0,0,c.width,c.height); setTemAss(false); };

  const lerFoto=(key)=>(e)=>{ const file=e.target.files&&e.target.files[0]; if(!file)return;
    const fr=new FileReader();
    fr.onload=()=>{ const img=new Image(); img.onload=()=>{ const max=1280; let w=img.width,h=img.height; if(w>h&&w>max){h=h*max/w;w=max;} else if(h>=w&&h>max){w=w*max/h;h=max;} const cv=document.createElement("canvas"); cv.width=w; cv.height=h; cv.getContext("2d").drawImage(img,0,0,w,h); setFotos(f=>({...f,[key]:cv.toDataURL("image/jpeg",0.7)})); }; img.src=fr.result; };
    fr.readAsDataURL(file);
  };

  const completo = temAss && fotos.frente && fotos.verso && fotos.selfie && aceite;
  const enviar=async()=>{
    if(!completo||enviando)return; setEnviando(true); setErro(null);
    try{
      const assinatura=canvasRef.current.toDataURL("image/png");
      const d=await api("app-contrato-assinar",{cpf:cliente.cpf,senha:cliente.senha,contrato:cliente.contratoId,nome:cliente.nome,assinatura,docFrente:fotos.frente,docVerso:fotos.verso,selfie:fotos.selfie,aceite:true,dataHora:new Date().toISOString()});
      if(d&&(d.ok||d.success||d.status==="success"||d.status===true)) setOk(true);
      else setErro((d&&(d.mensagem||d.message))||"Não foi possível enviar agora. Tente novamente.");
    }catch(e){ setErro("Falha de conexão. Tente novamente."); }
    setEnviando(false);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"calc(10px + env(safe-area-inset-top)) 14px 10px",borderBottom:`1px solid ${C.line}`,background:C.nav}}>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.t,fontSize:24,lineHeight:1,cursor:"pointer",padding:"0 4px"}}>‹</button>
        <span style={{color:C.t,fontSize:15,fontWeight:700,flex:1}}>Assinar contrato</span>
      </div>

      {ok ? (
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:"0 28px",textAlign:"center"}}>
          <div style={{width:74,height:74,borderRadius:"50%",background:"rgba(52,211,153,0.15)",border:"2px solid rgba(52,211,153,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34}}>✅</div>
          <p style={{color:C.t,fontSize:18,fontWeight:800,margin:0}}>Assinatura enviada!</p>
          <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.5}}>Recebemos sua assinatura e suas fotos. Seu contrato será registrado em instantes.</p>
          <button onClick={onClose} style={{marginTop:8,width:"100%",maxWidth:280,background:C.y,color:"#1a1000",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:800,cursor:"pointer"}}>Concluir</button>
        </div>
      ) : (
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"16px 16px calc(20px + env(safe-area-inset-bottom))",display:"flex",flexDirection:"column",gap:16}}>
          <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.5}}>Contrato #{cliente.contratoId} — {cliente.nome}. Assine no quadro e envie as fotos solicitadas.</p>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <label style={{color:C.t,fontSize:13,fontWeight:700}}>Sua assinatura</label>
              <button onClick={limpar} style={{background:"none",border:"none",color:C.yd,fontSize:12,fontWeight:700,cursor:"pointer"}}>Limpar</button>
            </div>
            <canvas ref={canvasRef} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{width:"100%",height:170,background:"#ffffff",border:`1px solid ${C.line2}`,borderRadius:12,touchAction:"none",display:"block"}}/>
            {!temAss&&<p style={{color:C.s,fontSize:11,margin:"6px 0 0",textAlign:"center"}}>Assine com o dedo dentro do quadro</p>}
          </div>

          <div>
            <label style={{color:C.t,fontSize:13,fontWeight:700,display:"block",marginBottom:8}}>Documento e selfie</label>
            <div style={{display:"flex",gap:10}}>
              <PhotoCard label="Doc. frente" val={fotos.frente} onPick={lerFoto("frente")} capture="environment"/>
              <PhotoCard label="Doc. verso" val={fotos.verso} onPick={lerFoto("verso")} capture="environment"/>
              <PhotoCard label="Selfie c/ doc" val={fotos.selfie} onPick={lerFoto("selfie")} capture="user"/>
            </div>
          </div>

          <label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
            <input type="checkbox" checked={aceite} onChange={e=>setAceite(e.target.checked)} style={{marginTop:2,width:18,height:18,flexShrink:0,accentColor:C.y}}/>
            <span style={{color:C.t,fontSize:12.5,lineHeight:1.45}}>Li e aceito os termos do contrato e confirmo que as informações e fotos enviadas são verdadeiras.</span>
          </label>

          {erro&&<div style={{background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.4)",borderRadius:12,padding:"11px 14px",color:C.t,fontSize:13}}>⚠️ {erro}</div>}

          <button onClick={enviar} disabled={!completo||enviando} style={{width:"100%",background:(!completo||enviando)?C.line3:C.y,color:"#1a1000",border:"none",borderRadius:14,padding:15,fontSize:15,fontWeight:800,cursor:(!completo||enviando)?"default":"pointer",opacity:(!completo||enviando)?0.7:1}}>{enviando?"Enviando…":"Enviar assinatura"}</button>
          <p style={{color:C.s,fontSize:11,margin:0,textAlign:"center",lineHeight:1.4}}>Registramos data, hora e seu aceite junto com a assinatura.</p>
        </div>
      )}
    </div>
  );
};

const Contrato = ({goBack,cliente}) => {
  const [verPdf,setVerPdf]=useState(null);
  const assinado=!!cliente.termoAssinado;
  const url=cliente.termoUrl||"";
  const pdf=cliente.termoPdf||"";
  const abrir=async(u)=>{ if(!u)return; try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  return(<>
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Meu Contrato</h2>
      <p style={{color:C.s,fontSize:13,margin:0}}>Contrato #{cliente.contratoId} — {cliente.nome}</p>

      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Plano",cliente.plano],["Contrato",`#${cliente.contratoId}`],[docLabel(cliente.cpf),maskDoc(cliente.cpf)],["Status",cliente.status||"Ativo"]].map(([k,v],i,a)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<a.length-1?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:13}}>{k}</span><span style={{color:C.t,fontSize:13,fontWeight:700}}>{v}</span></div>
        ))}
      </div>

      {assinado ? (
        <div style={{background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.25)",borderRadius:16,padding:18,display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(52,211,153,0.15)",border:"2px solid rgba(52,211,153,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>✅</div>
          <p style={{color:C.g,fontSize:16,fontWeight:700,margin:"4px 0 0"}}>Contrato assinado</p>
          <p style={{color:C.s,fontSize:12,margin:0,lineHeight:1.5}}>Seu termo de adesão já está assinado e registrado no sistema.</p>
          {pdf&&<button onClick={()=>setVerPdf(pdf)} style={{marginTop:8,width:"100%",background:C.surf2,color:C.t,border:`1px solid ${C.line2}`,borderRadius:12,padding:13,fontSize:14,fontWeight:600,cursor:"pointer"}}>📄 Baixar termo assinado (PDF)</button>}
        </div>
      ) : (
        <div style={{background:"rgba(245,194,0,0.07)",border:"1px solid rgba(245,194,0,0.25)",borderRadius:16,padding:18,display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(245,194,0,0.15)",border:"2px solid rgba(245,194,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>✍️</div>
          <p style={{color:C.t,fontSize:16,fontWeight:700,margin:"4px 0 0"}}>Termo de adesão pendente</p>
          <p style={{color:C.s,fontSize:12,margin:0,lineHeight:1.5}}>Você tem um termo de adesão para assinar. A assinatura é feita na página oficial, com validade jurídica.</p>
          {url ? (
            <button onClick={()=>abrirNoApp(url)} style={{marginTop:10,width:"100%",background:C.y,color:"#3D3D5C",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Assinar contrato →</button>
          ) : (
            <p style={{color:C.s,fontSize:11,margin:"8px 0 0",fontStyle:"italic"}}>O link de assinatura ainda não está disponível. Fale com o suporte se precisar assinar agora.</p>
          )}
          {pdf&&<button onClick={()=>setVerPdf(pdf)} style={{marginTop:4,width:"100%",background:"none",color:C.s,border:"none",fontSize:12,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3}}>Ver o termo (PDF)</button>}
        </div>
      )}
    </div>
      {verPdf&&<PdfViewer url={verPdf} title="Termo de adesão" onClose={()=>setVerPdf(null)}/>}
    </>
  );
};

// ─── MEUS APPS ───
const abrirNoApp=async(url)=>{
  try{
    const mod=await import("@capacitor/inappbrowser");
    const IAB=mod.InAppBrowser;
    if(IAB&&IAB.openInWebView){
      const opt=mod.DefaultWebViewOptions||{};
      await IAB.openInWebView({url,options:{...opt,showURL:false}});
      return;
    }
  }catch(e){}
  try{ await Browser.open({url,presentationStyle:"fullscreen"}); return; }catch(e){}
  window.open(url,"_blank");
};

const MeusApps=({goBack})=>{
  const PORTAL="https://www.portaldoassinante.com/oryx";
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  return(
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:16}}>
      <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Meus Apps</h2>
      <p style={{color:C.s,fontSize:13,margin:"-6px 0 0"}}>Acesse os serviços inclusos no seu plano</p>

      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"22px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:18,background:"rgba(245,194,0,0.14)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>📺</div>
        <p style={{color:C.t,fontSize:16,fontWeight:700,margin:"6px 0 0"}}>Portal do Assinante</p>
        <p style={{color:C.s,fontSize:12,margin:0,lineHeight:1.5}}>Acesse seus aplicativos de streaming, serviços e benefícios inclusos no seu plano Oryx.</p>
        <button onClick={()=>abrirNoApp(PORTAL)} style={{marginTop:10,width:"100%",background:C.y,color:"#3D3D5C",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Abrir Portal do Assinante →</button>
      </div>

      <div style={{background:"rgba(245,194,0,0.07)",border:`1px solid ${C.line}`,borderRadius:12,padding:"13px 15px"}}>
        <p style={{color:C.t,fontSize:12.5,fontWeight:700,margin:"0 0 6px"}}>💡 O que você encontra no portal</p>
        <p style={{color:C.s,fontSize:11.5,margin:0,lineHeight:1.6}}>• Aplicativos de streaming e TV<br/>• Serviços e benefícios do plano<br/>• Configurações da sua conta</p>
      </div>
    </div>
  );
};

// ─── SUPORTE ───

// ─── MEU WI-FI (via GenieACS / n8n — TR-069) ───
function MeuWifi({cliente}){
  const [st,setSt]=useState("load");        // load | ready | erro
  const [redes,setRedes]=useState([]);
  const [editar,setEditar]=useState(false);
  const [nome,setNome]=useState("");
  const [senha,setSenha]=useState("");
  const [ver,setVer]=useState(false);
  const [salvando,setSalvando]=useState(false);
  const [msg,setMsg]=useState("");
  const [erroMsg,setErroMsg]=useState("");

  async function carregar(){
    setSt("load"); setMsg("");
    try{
      const d=await api("app-wifi-get",{cpf:cliente.cpf,contrato:cliente.contratoId});
      if(d&&d.ok!==false&&Array.isArray(d.redes)){ setRedes(d.redes); setSt("ready"); return; }
      throw new Error((d&&(d.mensagem||d.error))||"resposta inválida");
    }catch(e){ setErroMsg((e&&e.message)?e.message:"falha"); setSt("erro"); }
  }
  useEffect(()=>{ carregar(); },[]);

  async function salvar(){
    if(nome.trim().length>32){ setMsg("O nome deve ter até 32 caracteres."); return; }
    if(senha.trim().length<8){ setMsg("A senha deve ter no mínimo 8 caracteres."); return; }
    setMsg(""); setSalvando(true);
    try{
      const d=await api("app-wifi-set",{cpf:cliente.cpf,contrato:cliente.contratoId,novo_nome:nome.trim()||null,nova_senha:senha});
      if(d&&d.ok===false) throw new Error((d&&(d.mensagem||d.error))||"não aplicou");
      setMsg("✅ Pedido enviado! A troca pode levar até 1 minuto pra valer. Depois reconecte seus aparelhos com o novo nome e senha.");
      setEditar(false); setNome(""); setSenha("");
      setTimeout(carregar,4000);
    }catch(e){ setMsg("❌ Não deu pra alterar agora. "+((e&&e.message)?e.message:"")+" Tente de novo em instantes."); }
    setSalvando(false);
  }

  const inputStyle={width:"100%",boxSizing:"border-box",background:C.surf,border:`1.5px solid ${C.line2}`,borderRadius:12,padding:"13px 14px",color:C.t,fontSize:16,fontFamily:"inherit",outline:"none"};

  return (
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:16}}>
      <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Meu Wi-Fi</h2>
      <p style={{color:C.s,fontSize:13,margin:"-6px 0 0"}}>Altere o nome e a senha da sua rede — de qualquer lugar</p>

      {st==="load"&&<Spinner label="Carregando sua rede…"/>}

      {st==="erro"&&(
        <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"22px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"}}>
          <div style={{width:64,height:64,borderRadius:18,background:"rgba(245,194,0,0.14)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>📶</div>
          <p style={{color:C.t,fontSize:16,fontWeight:700,margin:"4px 0 0"}}>Não conseguimos carregar sua rede</p>
          <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.55}}>Pode ser instabilidade momentânea. Tente de novo em instantes ou fale com o suporte.</p>
          <button onClick={carregar} style={{marginTop:8,width:"100%",background:C.y,color:"#3D3D5C",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Tentar de novo</button>
          <a href={"https://wa.me/556130203761?text="+encodeURIComponent("Olá! Quero trocar o nome/senha do meu Wi-Fi.")} style={{color:C.s,fontSize:13,textDecoration:"underline",textUnderlineOffset:3}}>Falar com o suporte</a>
        </div>
      )}

      {st==="ready"&&!editar&&(
        <>
          {redes.map((r,i)=>(
            <div key={i} style={{background:C.card,border:`1px solid ${C.line}`,borderRadius:16,padding:"16px",display:"flex",flexDirection:"column",gap:6}}>
              <span style={{color:C.s,fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Rede {r.band}</span>
              <p style={{color:C.s,fontSize:11,margin:"2px 0 0"}}>Nome (SSID)</p>
              <p style={{color:C.t,fontSize:16,fontWeight:700,margin:0,wordBreak:"break-all"}}>{r.ssid||"—"}</p>
            </div>
          ))}
          <div style={{background:"rgba(245,194,0,0.07)",border:`1px solid ${C.line}`,borderRadius:12,padding:"11px 14px"}}>
            <p style={{color:C.s,fontSize:11.5,margin:0,lineHeight:1.55}}>🔒 Por segurança, a senha atual não pode ser exibida. Você pode definir uma senha nova a qualquer momento.</p>
          </div>
          <Btn label="Alterar nome e senha" onClick={()=>{ setEditar(true); setNome(""); setSenha(""); setMsg(""); }}/>
          {msg&&<div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:10,padding:"10px 14px",color:C.t,fontSize:13}}>{msg}</div>}
          <button onClick={carregar} style={{background:"none",border:"none",color:C.s,fontSize:13,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,alignSelf:"center"}}>Atualizar</button>
        </>
      )}

      {st==="ready"&&editar&&(
        <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"20px 18px",display:"flex",flexDirection:"column",gap:14}}>
          <h3 style={{color:C.t,fontSize:16,fontWeight:800,margin:0}}>Alterar Wi-Fi</h3>
          <p style={{color:C.s,fontSize:12,margin:"-6px 0 0",lineHeight:1.5}}>O nome e a senha vão para as duas redes (2.4G e 5G). A rede 5G recebe o sufixo <b>-5G</b>. A troca pode levar até 1 minuto.</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{color:C.lbl,fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Novo nome (opcional)</label>
            <input value={nome} onChange={e=>setNome(e.target.value)} maxLength={32} placeholder="Ex.: Casa da Ana" style={inputStyle}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{color:C.lbl,fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Nova senha</label>
            <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${C.line2}`,borderRadius:12,padding:"0 12px",background:C.surf}}>
              <input value={senha} onChange={e=>setSenha(e.target.value)} type={ver?"text":"password"} maxLength={63} placeholder="Mínimo 8 caracteres" style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit"}}/>
              <button onClick={()=>setVer(v=>!v)} style={{background:"none",border:"none",color:C.s,fontSize:12,cursor:"pointer",padding:6}}>{ver?"ocultar":"ver"}</button>
            </div>
          </div>
          {msg&&<div style={{background:"rgba(220,38,38,0.1)",border:"1px solid rgba(220,38,38,0.3)",borderRadius:10,padding:"10px 14px",color:C.r,fontSize:13}}>{msg}</div>}
          <Btn label={salvando?"Enviando…":"Salvar alterações"} onClick={salvar} disabled={salvando||senha.trim().length<8}/>
          <button onClick={()=>{ setEditar(false); setMsg(""); }} disabled={salvando} style={{background:"none",border:"none",color:C.s,fontSize:13,cursor:"pointer",alignSelf:"center"}}>Cancelar</button>
        </div>
      )}
    </div>
  );
}


const TABS=["home","boleto","velocidade","apps","wifi","suporte"];
const TLABELS={home:"Início",boleto:"Boleto",velocidade:"Velocidade",apps:"Meus Apps",wifi:"Wi-Fi",suporte:"Suporte"};
const TICONS={home:Ico.home,boleto:Ico.boleto,velocidade:Ico.velocidade,apps:Ico.apps,wifi:Ico.wifi,suporte:Ico.suporte};

// ─── APP ───
// ─── NOTIFICAÇÕES PUSH (Firebase) ───
const registrarPush=async(cpf,contratoId)=>{
  try{
    const cap=window.Capacitor;
    if(!cap||!cap.isNativePlatform||!cap.isNativePlatform())return; // só no celular
    const {PushNotifications}=await import("@capacitor/push-notifications");
    let perm=await PushNotifications.checkPermissions();
    if(perm.receive!=="granted") perm=await PushNotifications.requestPermissions();
    if(perm.receive!=="granted")return;
    PushNotifications.addListener("registration",async(t)=>{
      try{await api("app-token",{cpf:String(cpf||"").replace(/\D/g,""),contrato:String(contratoId||""),token:t.value,plataforma:"android"});}catch(e){}
    });
    await PushNotifications.register();
  }catch(e){}
};

// ─── SESSÃO (mantém logado) ───
const SKEY="oryx_sessao_v1";
const salvarSessao=(conta,contratoId,theme)=>{try{localStorage.setItem(SKEY,JSON.stringify({conta,contratoId,theme}));}catch(e){}};
const lerSessao=()=>{try{const s=localStorage.getItem(SKEY);return s?JSON.parse(s):null;}catch(e){return null;}};
const limparSessao=()=>{try{localStorage.removeItem(SKEY);}catch(e){}};

export default function App(){
  const [screen,setScreen]=useState("login");
  const [tab,setTab]=useState("home");
  const [cliente,setCliente]=useState(null);
  const [conta,setConta]=useState(null);
  const mkCliente=(a,ct)=>({cpf:a.cpf,senha:a.senha||"",demo:!!a.demo,nome:a.nome,contratoId:ct.contratoId,clienteId:ct.clienteId,plano:ct.plano||"Internet",status:ct.status||"Ativo",vencimento:ct.vencimento||null,valorAberto:ct.valorAberto||null,titulos:ct.titulos||0,pendencia:!!ct.pendencia,termoAssinado:!!ct.termoAssinado,termoUrl:ct.termoUrl||"",termoPdf:ct.termoPdf||""});
  const onAuth=(a)=>{ setConta(a); if(a.contratos.length===1){ setCliente(mkCliente(a,a.contratos[0])); setScreen("main"); salvarSessao(a,a.contratos[0].contratoId); registrarPush(a.cpf,a.contratos[0].contratoId); } else { setScreen("selecao"); salvarSessao(a,null); } };
  const escolher=(ct)=>{ setCliente(mkCliente(conta,ct)); setScreen("main"); salvarSessao(conta,ct.contratoId); registrarPush(conta.cpf,ct.contratoId); };
  const refreshCliente=async()=>{
    if(!conta||!cliente)return;
    try{
      const d=await api("app-login",{cpf:conta.cpf,senha:conta.senha});
      let contratos=null;
      if(d&&d.ok!==false&&Array.isArray(d.contratos)&&d.contratos.length) contratos=d.contratos;
      else if(d&&d.ok!==false&&(d.contratoId||d.nome)) contratos=[{contratoId:d.contratoId,clienteId:d.clienteId,plano:d.plano,status:d.status,vencimento:d.vencimento,valorAberto:d.valorAberto,titulos:d.titulos,pendencia:d.pendencia,termoAssinado:d.termoAssinado,termoUrl:d.termoUrl,termoPdf:d.termoPdf}];
      if(!contratos)return;
      const nc={...conta,nome:d.nome||conta.nome,contratos};
      setConta(nc);
      const ct=contratos.find(x=>String(x.contratoId)===String(cliente.contratoId))||contratos[0];
      setCliente(mkCliente(nc,ct));
      salvarSessao(nc,ct.contratoId);
    }catch(e){}
  };
  useEffect(()=>{
    const onVis=()=>{ if(document.visibilityState==="visible") refreshCliente(); };
    document.addEventListener("visibilitychange",onVis);
    return ()=>document.removeEventListener("visibilitychange",onVis);
  },[conta,cliente]);
  const [theme,setTheme]=useState("light");
  useEffect(()=>{
    const s=lerSessao();
    if(s&&s.conta&&Array.isArray(s.conta.contratos)&&s.conta.contratos.length){
      setConta(s.conta);
      const ct=s.contratoId?s.conta.contratos.find(x=>String(x.contratoId)===String(s.contratoId)):null;
      if(ct){ setCliente(mkCliente(s.conta,ct)); setScreen("main"); registrarPush(s.conta.cpf,ct.contratoId); }
      else if(s.conta.contratos.length===1){ setCliente(mkCliente(s.conta,s.conta.contratos[0])); setScreen("main"); registrarPush(s.conta.cpf,s.conta.contratos[0].contratoId); }
      else { setScreen("selecao"); }
    }
  },[]);
  Object.assign(C, themes[theme]);
  const toggleTheme=()=>setTheme(t=>t==="light"?"dark":"light");
  const goTo=(s)=>{if(TABS.includes(s)){setTab(s);setScreen("main");}else setScreen(s);};
  const goBack=()=>{setScreen("main");setTab("home");};
  const goLogin=()=>{limparSessao();setScreen("login");setTab("home");setCliente(null);setConta(null);};
  const isMain=screen==="main";

  const screenMap={
    home:<Home goTo={goTo} cliente={cliente} theme={theme} toggleTheme={toggleTheme} varios={conta&&conta.contratos.length>1} onTrocar={()=>setScreen("selecao")}/>,
    boleto:<Boleto goBack={goBack} goTo={goTo} cliente={cliente}/>,
    velocidade:<Velocidade goBack={goBack}/>,
    apps:<MeusApps goBack={goBack}/>,
    wifi:<MeuWifi cliente={cliente}/>,
    consumo:<Consumo goBack={goBack} cliente={cliente}/>,
    suporte:<Suporte goBack={goBack} goTo={goTo}/>,
    desbloqueio:<Desbloqueio goBack={goBack} cliente={cliente}/>,
    contrato:<Contrato goBack={goBack} cliente={cliente}/>,
    atualizar:<AtualizarCadastro goBack={goBack} cliente={cliente}/>,
    notas:<Notas goBack={goBack} cliente={cliente}/>,
    perfil:<Perfil goBack={goBack} goLogin={goLogin} goTo={goTo} cliente={cliente}/>,
  };

  return(
    <div style={{position:"fixed",inset:0,background:C.bg,display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      {/* área de conteúdo — ocupa o espaço disponível e rola */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingTop:"env(safe-area-inset-top)"}}>
        {screen==="login"&&<Login onAuth={onAuth} theme={theme} toggleTheme={toggleTheme}/>}
          {screen==="selecao"&&conta&&<SelectContrato conta={conta} onEscolher={escolher} onSair={goLogin} theme={theme} toggleTheme={toggleTheme}/>}
        {screen!=="login"&&screen!=="selecao"&&cliente&&screenMap[isMain?tab:screen]}
      </div>
      {/* barra de abas fixa no rodapé, respeitando o gesto do Android */}
      {screen!=="login"&&screen!=="selecao"&&!(isMain&&tab==="home")&&(
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
