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
  velocidade:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.5:1.8}><path d="M12 14a1 1 0 0 0 1-1V8"/><path d="M5.6 18.4A9 9 0 1 1 18.4 18.4"/><line x1="12" y1="13" x2="15.5" y2="9.5"/></svg>,
};

// ─── DADOS DEMO (fallback quando webhook indisponível) ───
const DEMO_CLIENTE = {cpf:"00000000000",nome:"João Silva",contratoId:"001234",clienteId:"5678",plano:"Fibra 400 Mega",valor:"89,90",status:"Ativo",vencimento:10,valorAberto:"89,90",titulos:1,pendencia:true};
const DEMO_CONTA = {cpf:"00000000000",nome:"Oryx Internet Ltda",contratos:[
  {contratoId:"101",clienteId:"77",plano:"700 MEGA ORYX BÁSICO NOVO",status:"Ativo",vencimento:25,valorAberto:"119,90",titulos:1,pendencia:true,cidade:"Brasília",termoAssinado:true,termoUrl:"",termoPdf:""},
  {contratoId:"58",clienteId:"77",plano:"700 MEGA ORYX BÁSICO",status:"Ativo",vencimento:10,valorAberto:null,titulos:0,pendencia:false,cidade:"Brasília",termoAssinado:false,termoUrl:"https://oryxinternet.com.br",termoPdf:""},
]};
const DEMO_BOLETOS = [
  {mes:"Maio 2026",valor:"R$ 89,90",venc:"10/05/2026",status:"vencido",cor:C.r,linha:"00190.00009 01234.560005 61237.100000 2 00000000008990",link:""},
  {mes:"Junho 2026",valor:"R$ 89,90",venc:"10/06/2026",status:"aberto",cor:C.y,linha:"00190.00009 01234.560005 61237.100000 2 00000000008990",link:""},
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
        onAuth({cpf:c,nome:d.nome||"Cliente",contratos:d.contratos});
      }else if(d&&d.ok!==false&&(d.contratoId||d.nome)){
        onAuth({cpf:c,nome:d.nome||"Cliente",contratos:[{contratoId:d.contratoId,clienteId:d.clienteId,plano:d.plano,status:d.status,vencimento:d.vencimento,valorAberto:d.valorAberto,titulos:d.titulos,pendencia:d.pendencia}]});
      }else{
        setErro("CPF/CNPJ não encontrado. Verifique e tente novamente.");
      }
    }catch(e){
      onAuth({...DEMO_CONTA,cpf:c,demo:true});
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

const Home = ({goTo,cliente,theme,toggleTheme,onTrocar,varios}) => {
  const inicial=(cliente.nome||"C").charAt(0).toUpperCase();
  const atalhos=[
    {icon:"💳",label:"2ª Via Boleto",sub:"Ver faturas",color:C.y,screen:"boleto"},
    {icon:"🔓",label:"Desbloqueio",sub:"De confiança",color:C.o,screen:"desbloqueio"},
    {icon:"✍️",label:"Meu Contrato",sub:"Ver ou assinar",color:C.g,screen:"contrato"},
    {icon:"⚡",label:"Velocidade",sub:"Testar internet",color:C.y,screen:"velocidade"},
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
          <div><p style={{color:C.s,fontSize:11,margin:"0 0 3px",textTransform:"uppercase",letterSpacing:1}}>Plano ativo</p><p style={{color:C.t,fontSize:15,fontWeight:700,margin:0}}>{cliente.plano}</p>{cliente.vencimento&&<p style={{color:C.s,fontSize:11,margin:"3px 0 0"}}>Vencimento dia {cliente.vencimento}</p>}{varios&&<p onClick={onTrocar} style={{color:C.yd,fontSize:11,fontWeight:700,margin:"6px 0 0",cursor:"pointer"}}>↺ Trocar contrato</p>}</div>
          <div style={{background:"rgba(72,199,116,0.15)",border:"1px solid rgba(72,199,116,0.3)",borderRadius:20,padding:"5px 12px",color:C.g,fontSize:12,fontWeight:700}}>✓ {cliente.status||"Ativo"}</div>
        </div>
      </div>
      <div style={{padding:"0 16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <Promos/>
        {(() => {
          const valNum = parseFloat(String(cliente.valorAberto||"0").replace(/\./g,"").replace(",","."));
          const temPendencia = (cliente.titulos>0) && valNum>0;
          return temPendencia ? (
            <div onClick={()=>goTo("boleto")} style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:14,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
              <span style={{fontSize:20}}>⚠️</span>
              <div style={{flex:1}}><p style={{color:C.t,fontSize:13,fontWeight:700,margin:"0 0 3px"}}>Você tem {cliente.titulos>1?`${cliente.titulos} faturas`:"fatura"} em aberto</p><p style={{color:C.s,fontSize:12,margin:0}}>Total R$ {cliente.valorAberto} • toque para ver a 2ª via</p></div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.r} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ) : (
            <div style={{background:"rgba(52,211,153,0.1)",border:"1px solid rgba(52,211,153,0.3)",borderRadius:14,padding:"14px 16px",display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:20}}>✅</span>
              <div style={{flex:1}}><p style={{color:C.t,fontSize:13,fontWeight:700,margin:"0 0 3px"}}>Você está em dia!</p><p style={{color:C.s,fontSize:12,margin:0}}>Nenhuma fatura em aberto no momento.</p></div>
            </div>
          );
        })()}
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
          link:b.link||b.link_cobranca||"",
        };
      });
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

// ─── SUPORTE ───
const Velocidade=({goBack})=>{
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  return (
    <div style={{padding:"16px 16px 28px",display:"flex",flexDirection:"column",gap:16}}>
      <div><h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Teste de Velocidade</h2><p style={{color:C.s,fontSize:13,margin:"4px 0 0"}}>Meça a velocidade real da sua conexão</p></div>

      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"22px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:"rgba(245,194,0,0.14)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>⚡</div>
        <p style={{color:C.t,fontSize:15,fontWeight:700,margin:"6px 0 0"}}>Teste rápido (download)</p>
        <p style={{color:C.s,fontSize:12,margin:0,textAlign:"center",lineHeight:1.5}}>Mede a velocidade de download da sua internet automaticamente. Rápido e sem complicação.</p>
        <button onClick={()=>abrir("https://fast.com")} style={{marginTop:10,width:"100%",background:C.y,color:"#1a1a2e",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Iniciar teste rápido →</button>
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
        <p style={{color:C.s,fontSize:11,margin:0,lineHeight:1.5}}>📍 SCS Quadra 07, Bloco A, Ed. Pátio Brasil, sala 1228 — Asa Sul, Brasília/DF</p>
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

// ─── DESBLOQUEIO ───
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
const Contrato = ({goBack,cliente}) => {
  const assinado=!!cliente.termoAssinado;
  const url=cliente.termoUrl||"";
  const pdf=cliente.termoPdf||"";
  const abrir=async(u)=>{ if(!u)return; try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  return(
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
          {pdf&&<button onClick={()=>abrir(pdf)} style={{marginTop:8,width:"100%",background:C.surf2,color:C.t,border:`1px solid ${C.line2}`,borderRadius:12,padding:13,fontSize:14,fontWeight:600,cursor:"pointer"}}>📄 Baixar termo assinado (PDF)</button>}
        </div>
      ) : (
        <div style={{background:"rgba(245,194,0,0.07)",border:"1px solid rgba(245,194,0,0.25)",borderRadius:16,padding:18,display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(245,194,0,0.15)",border:"2px solid rgba(245,194,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>✍️</div>
          <p style={{color:C.t,fontSize:16,fontWeight:700,margin:"4px 0 0"}}>Termo de adesão pendente</p>
          <p style={{color:C.s,fontSize:12,margin:0,lineHeight:1.5}}>Você tem um termo de adesão para assinar. A assinatura é feita na página oficial, com validade jurídica.</p>
          {url ? (
            <button onClick={()=>abrir(url)} style={{marginTop:10,width:"100%",background:C.y,color:"#1a1a2e",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Assinar contrato →</button>
          ) : (
            <p style={{color:C.s,fontSize:11,margin:"8px 0 0",fontStyle:"italic"}}>O link de assinatura ainda não está disponível. Fale com o suporte se precisar assinar agora.</p>
          )}
          {pdf&&<button onClick={()=>abrir(pdf)} style={{marginTop:4,width:"100%",background:"none",color:C.s,border:"none",fontSize:12,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3}}>Ver o termo (PDF)</button>}
        </div>
      )}
    </div>
  );
};

// ─── MEUS APPS ───
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
        <button onClick={()=>abrir(PORTAL)} style={{marginTop:10,width:"100%",background:C.y,color:"#1a1a2e",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Abrir Portal do Assinante →</button>
      </div>

      <div style={{background:"rgba(245,194,0,0.07)",border:`1px solid ${C.line}`,borderRadius:12,padding:"13px 15px"}}>
        <p style={{color:C.t,fontSize:12.5,fontWeight:700,margin:"0 0 6px"}}>💡 O que você encontra no portal</p>
        <p style={{color:C.s,fontSize:11.5,margin:0,lineHeight:1.6}}>• Aplicativos de streaming e TV<br/>• Serviços e benefícios do plano<br/>• Configurações da sua conta</p>
      </div>
    </div>
  );
};

// ─── SUPORTE ───

const TABS=["home","boleto","velocidade","apps","suporte"];
const TLABELS={home:"Início",boleto:"Boleto",velocidade:"Velocidade",apps:"Meus Apps",suporte:"Suporte"};
const TICONS={home:Ico.home,boleto:Ico.boleto,velocidade:Ico.velocidade,apps:Ico.apps,suporte:Ico.suporte};

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
  const mkCliente=(a,ct)=>({cpf:a.cpf,nome:a.nome,contratoId:ct.contratoId,clienteId:ct.clienteId,plano:ct.plano||"Internet",status:ct.status||"Ativo",vencimento:ct.vencimento||null,valorAberto:ct.valorAberto||null,titulos:ct.titulos||0,pendencia:!!ct.pendencia,termoAssinado:!!ct.termoAssinado,termoUrl:ct.termoUrl||"",termoPdf:ct.termoPdf||""});
  const onAuth=(a)=>{ setConta(a); if(a.contratos.length===1){ setCliente(mkCliente(a,a.contratos[0])); setScreen("main"); salvarSessao(a,a.contratos[0].contratoId); registrarPush(a.cpf,a.contratos[0].contratoId); } else { setScreen("selecao"); salvarSessao(a,null); } };
  const escolher=(ct)=>{ setCliente(mkCliente(conta,ct)); setScreen("main"); salvarSessao(conta,ct.contratoId); registrarPush(conta.cpf,ct.contratoId); };
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
    boleto:<Boleto goBack={goBack} cliente={cliente}/>,
    apps:<MeusApps goBack={goBack}/>,
    velocidade:<Velocidade goBack={goBack}/>,
    suporte:<Suporte goBack={goBack} goTo={goTo}/>,
    desbloqueio:<Desbloqueio goBack={goBack} cliente={cliente}/>,
    contrato:<Contrato goBack={goBack} cliente={cliente}/>,
    perfil:<Perfil goBack={goBack} goLogin={goLogin} cliente={cliente}/>,
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
      {screen!=="login"&&screen!=="selecao"&&(
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
