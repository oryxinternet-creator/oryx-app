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

// Endereço do n8n: primeiro o da Oryx (api.oryxinternet.com.br, na Cloudflare); se não responder, o atual.
// Trocar de servidor = mudar o IP do "api" na Cloudflare, sem atualizar o app.
const BASES = ["https://api.oryxinternet.com.br/webhook", "https://n8n02.proativaia.com.br/webhook"];
// o endereço que respondeu da última vez fica guardado: o app já abre usando ele, sem esperar o teste
const BKEY = "oryx_base_v1";
const baseSalva = (() => { try { const b = localStorage.getItem(BKEY); return BASES.includes(b) ? b : ""; } catch (e) { return ""; } })();
let API_BASE = baseSalva || BASES[0];

// Versão deste app (o "código da versão" da Play Store; o GitHub Actions passa no build)
const APP_BUILD = Number(import.meta.env.VITE_APP_BUILD || 0);
const LOJA_ID = "com.oryxinternet.cliente";

// ─── CONFIGURAÇÃO (Painel do App → aba App) ───
// O app já sabe tudo isto; o painel só troca o que estiver preenchido lá.
const PADRAO = {
  whatsapp:"556130203761", telefone:"556130203761", telefone_exibir:"(61) 3020-3761", instagram:"oryxinternet",
  facebook:"https://facebook.com/profile.php?id=61577225497699", horario:"Seg–Sex: 8h–19h • Sáb: 9h–16h",
  endereco:"SCS Quadra 07, Bloco A, Ed. Pátio Brasil, sala 1228 — Asa Sul, Brasília/DF", portal:"https://www.portaldoassinante.com/oryx",
  faq:[
    {q:"Minha internet está lenta, o que fazer?",a:"Reinicie o roteador desligando e ligando novamente. Aguarde 2 minutos. Você também pode usar a aba Velocidade do app para testar sua conexão. Se persistir, abra um chamado técnico ou fale no WhatsApp."},
    {q:"Estou sem conexão, e agora?",a:"Verifique se as luzes do roteador estão acesas e reinicie o aparelho. Se você estiver com fatura em aberto, use o Desbloqueio de Confiança no app para liberar na hora. Persistindo, fale com o suporte."},
    {q:"Como faço a 2ª via do meu boleto?",a:"Na aba Boleto do app você vê todas as suas faturas e pode copiar a linha digitável ou abrir o boleto."},
  ],
  desligados:[], tema:null, aviso:null, versao_minima:0, versao_atual:0, versao_texto:"",
};
const CKEY = "oryx_config_v1";
const lerConfig = () => { try { const c = JSON.parse(localStorage.getItem(CKEY) || "null"); return c && typeof c === "object" ? c : {}; } catch (e) { return {}; } };
let CFG = { ...PADRAO, ...lerConfig() };

// Busca a configuração e, de quebra, descobre qual endereço do n8n está respondendo
const buscarConfig = async () => {
  for (const base of BASES) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${base}/app-config`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      const d = r.ok ? await r.json() : null;
      if (d && d.ok) { API_BASE = base; try { localStorage.setItem(BKEY, base); } catch (e) {} return d.config || {}; }
    } catch (e) {}
  }
  return null;
};
const configPronta = buscarConfig();

// tema e aviso têm data de fim: a cópia guardada no celular também respeita
const quandoBR = s => new Date(s.length === 10 ? s + "T00:00:00-03:00" : s + ":00-03:00").getTime();
const vigente = x => (x && (!x.fim || Date.now() <= quandoBR(String(x.fim)))) ? x : null;
const ligado = k => !(CFG.desligados || []).includes(k);
const waLink = msg => `https://wa.me/${CFG.whatsapp}` + (msg ? `?text=${encodeURIComponent(msg)}` : "");
const ligarSuporte = () => { try { window.location.href = `tel:+${CFG.telefone}`; } catch (e) {} };

// cor de destaque: amarelo Oryx, ou a cor da campanha (Outubro Rosa etc.) enquanto estiver no período
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const misturar = (h, alvo, p) => "#" + hexRgb(h).map(v => Math.round(v + (alvo - v) * p).toString(16).padStart(2, "0")).join("");
const acento = () => {
  const t = vigente(CFG.tema);
  if (!t || !/^#[0-9a-f]{6}$/i.test(t.cor || "")) return { y:"#FFD633", yd:"#F5C200", yClaro:"#FFDD55", yRgb:"245,194,0" };
  return { y:misturar(t.cor, 255, 0.2), yd:t.cor, yClaro:misturar(t.cor, 255, 0.35), yRgb:hexRgb(t.cor).join(",") };
};

// Chave de sessão devolvida pelo app-login. Vai em todo pedido; o n8n só responde
// sobre o CPF e os contratos que estão dentro dela.
let SESSAO = "";
let aoExpirarSessao = () => {};

const chamar = async (path, body) => {
  const r = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(body || {}), ...(SESSAO ? { sessao: SESSAO } : {}) }),
  });
  // só pedidos de dados do cliente derrubam o login; login, promoções e registro de notificação, não
  if (r.status === 401 && !["app-login", "app-token", "app-promocoes", "app-recuperar-senha"].includes(path)) { aoExpirarSessao(); throw new Error("Sessão expirada"); }
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
};
// Só no "npm run dev" com ?demo na URL: respostas de exemplo para ver as telas sem login real.
// Não existe no app publicado (o Vite remove este trecho no build).
const DEMO_API = import.meta.env.DEV && typeof location !== "undefined" && /[?&]demo/.test(location.search);
const respostaDemo = (path) => new Promise(ok => setTimeout(() => ok(({
  "app-login": { ok:true, sessao:"demo", nome:"Maria Souza", contratos:[{contratoId:"1234",clienteId:"77",plano:"FIBRA 700 MEGA",status:"Ativo",vencimento:10,valorAberto:"99,90",titulos:1,pendencia:true,termoAssinado:false,termoUrl:"https://oryxinternet.com.br",termoPdf:"https://raw.githubusercontent.com/mozilla/pdf.js/master/web/compressed.tracemonkey-pldi-09.pdf"}] },
  "app-assinar-contrato": { ok:true, mensagem:"Contrato assinado com sucesso!" },
  "app-boletos": { boletos:[{venc:"2026-11-10",valor:"99.90",status:"aberto",linha:"00190.00009 01234.560005 61237.100000 2 00000000009990",pix:"00020126360014br.gov.bcb.pix0114+55613020376152040000",link:"https://oryxinternet.com.br"},{venc:"2026-10-10",valor:"99.90",status:"pago"},{venc:"2026-09-10",valor:"99.90",status:"pago"}] },
  "app-promocoes": { promocoes:[] },
  "app-notas": { notas:[{numero:"5531",id:"1",data_emissao:"2026-10-01",status:"1",serie:"1"}] },
  "app-wifi-get": { ok:true, redes:[{band:"2.4 GHz",ssid:"ORYX-Maria"},{band:"5 GHz",ssid:"ORYX-Maria_5G"}] },
  "app-recuperar-senha": { ok:true, mensagem:"Pronto! Enviamos sua senha no WhatsApp cadastrado." },
  "app-consumo": { total: 182000000000, list:[{data:"01/11",total:6100000000},{data:"31/10",total:5400000000}] },
}[path]) || { ok:true }), 900));

const api = async (path, body) => {
  if (DEMO_API) return respostaDemo(path);
  // primeira vez no aparelho: espera descobrir qual endereço está no ar. Depois disso, vai direto
  // no endereço guardado; se ele falhar, espera o teste e tenta de novo no que estiver no ar.
  if (!baseSalva) await configPronta;
  try { return await chamar(path, body); }
  catch (e) {
    if (e.message === "Sessão expirada") throw e;
    const antes = API_BASE; await configPronta;
    if (API_BASE === antes) throw e;
    return await chamar(path, body);
  }
};

// ─── CACHE NO CELULAR ───
// As telas mostram na hora o que veio da última vez e atualizam por trás.
// Pedidos iguais feitos ao mesmo tempo (ex.: duas telas pedindo promoções) viram um só.
const XKEY = "oryx_cache_v1:";
const emVoo = {};
const chaveCache = (path, body) => XKEY + path + ":" + JSON.stringify(body || {});
const lerCache = (path, body) => { try { const v = localStorage.getItem(chaveCache(path, body)); return v ? JSON.parse(v) : undefined; } catch (e) { return undefined; } };
const apiFresco = (path, body) => {
  const k = chaveCache(path, body);
  if (!emVoo[k]) emVoo[k] = api(path, body)
    .then(d => { try { localStorage.setItem(k, JSON.stringify(d)); } catch (e) {} return d; })
    .finally(() => { setTimeout(() => { delete emVoo[k]; }, 1500); });
  return emVoo[k];
};
// usa: useApi("app-boletos", {cpf, contrato}) → { data, erro, carregando, recarregar }
const useApi = (path, body, ativo = true) => {
  const chave = JSON.stringify(body || {});
  const [estado, setEstado] = useState(() => ({ data: ativo ? lerCache(path, body) : undefined, erro: null }));
  const [vez, setVez] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const guardado = lerCache(path, body);
    setEstado({ data: guardado, erro: null });
    apiFresco(path, body).then(d => { if (vivo) setEstado({ data: d, erro: null }); })
      .catch(e => { if (vivo) setEstado(s => ({ data: s.data, erro: e })); });
    return () => { vivo = false; };
  }, [path, chave, vez, ativo]);
  return { data: estado.data, erro: estado.data === undefined ? estado.erro : null, carregando: estado.data === undefined && !estado.erro, recarregar: () => setVez(v => v + 1) };
};
const limparCache = () => { try { Object.keys(localStorage).filter(k => k.startsWith(XKEY)).forEach(k => localStorage.removeItem(k)); } catch (e) {} };
// logo depois de entrar: já busca boletos e promoções, para a tela abrir pronta
const preCarregar = (cli) => {
  if (!cli || cli.demo) return;
  apiFresco("app-promocoes", {}).catch(() => {});
  apiFresco("app-boletos", { cpf: cli.cpf, contrato: cli.contratoId }).catch(() => {});
};


const themes = {
  light: {
    y:"#FFD633", yd:"#F5C200", yClaro:"#FFDD55", yRgb:"245,194,0", g:"#16a34a", r:"#dc2626", p:"#6366f1", o:"#ea580c", wa:"#1eb053",
    bg:"#fdf6da", card:"#ffffff", t:"#16161d",
    b:"rgba(0,0,0,0.10)", s:"rgba(0,0,0,0.50)", m:"rgba(0,0,0,0.30)",
    surf:"rgba(0,0,0,0.03)", surf2:"rgba(0,0,0,0.06)",
    line:"rgba(0,0,0,0.08)", line2:"rgba(0,0,0,0.12)", line3:"rgba(0,0,0,0.18)",
    tx7:"rgba(0,0,0,0.70)", t3:"rgba(0,0,0,0.35)", lbl:"rgba(0,0,0,0.50)",
    head:"linear-gradient(160deg,#fffaf0,#fff7d6)", nav:"#ffffff", canvas:"#eef0f3",
    navy:"#302D42", // roxo-escuro da marca (o mesmo do site)
    logoNeg:false,
  },
  dark: {
    y:"#FFD633", yd:"#F5C200", yClaro:"#FFDD55", yRgb:"245,194,0", g:"#34d399", r:"#f87171", p:"#818cf8", o:"#fb923c", wa:"#25D366",
    bg:"#080810", card:"#0f0f18", t:"#ffffff",
    b:"rgba(255,255,255,0.08)", s:"rgba(255,255,255,0.4)", m:"rgba(255,255,255,0.18)",
    surf:"rgba(255,255,255,0.04)", surf2:"rgba(255,255,255,0.07)",
    line:"rgba(255,255,255,0.06)", line2:"rgba(255,255,255,0.10)", line3:"rgba(255,255,255,0.15)",
    tx7:"rgba(255,255,255,0.70)", t3:"rgba(255,255,255,0.30)", lbl:"rgba(255,255,255,0.45)",
    head:"linear-gradient(160deg,#151520,#1a1a2e)", nav:"#0d0d18", canvas:"#0a0a14",
    navy:"#2A2840",
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
  <button onClick={onClick} disabled={disabled} style={{background:`linear-gradient(135deg,${C.y},${C.yd})`,color:"#1a1000",border:"none",borderRadius:14,padding:15,fontSize:15,fontWeight:800,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.35:1,width:"100%",boxShadow:`0 6px 20px rgba(${C.yRgb},0.22)`,...s}}>{label}</button>
);

const Badge = ({label,color}) => (
  <span style={{background:`${color}18`,border:`1px solid ${color}44`,borderRadius:20,padding:"3px 10px",color:(!C.logoNeg&&(color===C.y||color===C.yd))?"#8C6800":color,fontSize:12,fontWeight:700,textTransform:"uppercase"}}>{label}</span>
);

const Back = ({onClick}) => (
  <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:C.s,fontSize:14,cursor:"pointer",padding:"8px 8px 8px 0",minHeight:44,alignSelf:"flex-start",fontFamily:"inherit"}}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg> Voltar
  </button>
);

const DemoChip = () => (
  <span style={{alignSelf:"flex-start",background:"rgba(251,146,60,0.12)",border:"1px solid rgba(251,146,60,0.3)",borderRadius:20,padding:"3px 10px",color:C.o,fontSize:13,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5}}><Ic n="alerta" size={13}/>modo demonstração</span>
);

const Spinner = ({label="Carregando..."}) => (
  <div role="status" style={{padding:"40px 20px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,minHeight:200}}>
    <div style={{width:48,height:48,borderRadius:"50%",border:`3px solid ${C.line2}`,borderTopColor:C.y,animation:"spin 0.8s linear infinite"}}/>
    <p style={{color:C.s,fontSize:14,margin:0}}>{label}</p>
  </div>
);

// Tela de esqueleto: blocos cinzas no formato do conteúdo enquanto ele chega
const Osso = ({h=16,w="100%",r=8,s={}}) => <div style={{height:h,width:w,borderRadius:r,background:C.surf2,animation:"pulsar 1.2s ease-in-out infinite",...s}}/>;
const EsqueletoLista = ({n=3,label="Carregando"}) => (
  <div role="status" aria-label={label} style={{display:"flex",flexDirection:"column",gap:12}}>
    {Array.from({length:n}).map((_,i)=>(
      <div key={i} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}><Osso w="45%" h={15}/><Osso w="30%" h={12}/><Osso w={64} h={20} r={20}/></div>
        <Osso w={72} h={18}/>
      </div>
    ))}
  </div>
);
// estilos globais: animações, foco visível e quem prefere menos movimento
const EstilosGlobais = () => (
  <style>{`@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulsar{0%,100%{opacity:1}50%{opacity:.45}}
button:focus-visible,a:focus-visible,input:focus-visible,[role=button]:focus-visible{outline:2px solid ${C.yd};outline-offset:2px}
button:active,[role=button]:active{transform:scale(.97)}
button,[role=button]{transition:transform .12s ease,opacity .2s}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}`}</style>
);

const ThemeBtn = ({theme,onClick}) => (
  <button onClick={onClick} aria-label={theme==="light"?"Usar tema escuro":"Usar tema claro"} style={{width:42,height:42,borderRadius:"50%",background:C.logoNeg?"rgba(255,255,255,0.14)":C.navy,border:`1px solid ${C.logoNeg?"rgba(255,255,255,0.22)":C.navy}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.logoNeg?"#fff":`${C.yd}`,flexShrink:0}}><Ic n={theme==="light"?"lua":"sol"} size={19}/></button>
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

// Ícones de traço (no lugar dos emojis): iguais em qualquer celular e seguem a cor do texto
const PATHS = {
  cartao:<><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></>,
  cadeado:<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  destravar:<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/></>,
  wifi:<><path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>,
  grafico:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  caneta:<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
  raio:<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  tv:<><rect x="2" y="7" width="20" height="14" rx="2"/><polyline points="17 2 12 7 7 2"/></>,
  chat:<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>,
  telefone:<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>,
  alerta:<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  ok:<><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14 9 11"/></>,
  check:<polyline points="20 6 9 17 4 12"/>,
  ferramenta:<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>,
  camera:<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  instagram:<><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></>,
  facebook:<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>,
  foguete:<><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0"/><path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/></>,
  info:<><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  calendario:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  local:<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  documento:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  copiar:<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  pix:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></>,
  lua:<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>,
  sol:<><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></>,
  lampada:<><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></>,
  recibo:<><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></>,
  x:<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
  trocar:<><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/></>,
  seta:<polyline points="9 18 15 12 9 6"/>,
  voltar:<polyline points="15 18 9 12 15 6"/>,
};
const Ic = ({n,size=22,w=2,s={}}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0,display:"block",...s}}>{PATHS[n]}</svg>
);
const IcTxt = ({n,t}) => <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8}}><Ic n={n} size={18}/>{t}</span>;
// círculo colorido com ícone dentro (cartões de destaque, canais, resultados)
const IcBola = ({n,cor,size=74,r="50%",fundo}) => (
  <div style={{width:size,height:size,borderRadius:r,background:fundo||`${cor}1f`,color:cor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic n={n} size={Math.round(size*0.46)} w={1.9}/></div>
);

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
const Login = ({onAuth,theme,toggleTheme,aviso="",onPrimeiro}) => {
  const [cpf,setCpf]=useState(""); const [senha,setSenha]=useState(""); const [loading,setLoading]=useState(false);
  const [focused,setFocused]=useState(false); const [focSenha,setFocSenha]=useState(false); const [verSenha,setVerSenha]=useState(false); const [erro,setErro]=useState(aviso);

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
        onAuth({cpf:c,senha:senha,sessao:d.sessao||"",nome:d.nome||"Cliente",contratos:d.contratos});
      }else if(d&&d.ok!==false&&(d.contratoId||d.nome)){
        onAuth({cpf:c,senha:senha,sessao:d.sessao||"",nome:d.nome||"Cliente",contratos:[{contratoId:d.contratoId,clienteId:d.clienteId,plano:d.plano,status:d.status,vencimento:d.vencimento,valorAberto:d.valorAberto,titulos:d.titulos,pendencia:d.pendencia}]});
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
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 100% 45% at 50% -5%,rgba(${C.yRgb},0.09) 0%,transparent 60%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",backgroundImage:`linear-gradient(rgba(${C.yRgb},0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(${C.yRgb},0.025) 1px,transparent 1px)`,backgroundSize:"40px 40px",inset:0,pointerEvents:"none"}}/>
      <div style={{display:"flex",justifyContent:"flex-end",position:"relative"}}><ThemeBtn theme={theme} onClick={toggleTheme}/></div>
      <div style={{display:"flex",justifyContent:"center",position:"relative"}}><LogoV h={100}/></div>
      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:20,padding:"22px 18px",display:"flex",flexDirection:"column",gap:14,position:"relative"}}>
        <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Entrar na sua conta</h2>
        <p style={{color:C.s,fontSize:14,margin:0}}>Informe seu CPF/CNPJ e senha para acessar sua conta</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <label style={{color:C.lbl,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>CPF ou CNPJ</label>
          <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${focused?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:focused?`rgba(${C.yRgb},0.05)`:C.surf,transition:"all 0.2s"}}>
            <input style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit",letterSpacing:1}} type="text" inputMode="numeric" placeholder="CPF ou CNPJ" value={cpf} onChange={e=>setCpf(fmtDoc(e.target.value))} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onKeyDown={e=>e.key==="Enter"&&login()}/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <label style={{color:C.lbl,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>Senha</label>
          <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${focSenha?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:focSenha?`rgba(${C.yRgb},0.05)`:C.surf,transition:"all 0.2s"}}>
            <input style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit"}} type={verSenha?"text":"password"} placeholder="Sua senha" value={senha} onChange={e=>setSenha(e.target.value)} onFocus={()=>setFocSenha(true)} onBlur={()=>setFocSenha(false)} onKeyDown={e=>e.key==="Enter"&&login()}/>
            <button onClick={()=>setVerSenha(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",padding:"6px",display:"flex",alignItems:"center",color:C.s}} aria-label="Mostrar senha">
              {verSenha
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>
        </div>
        {erro&&<div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,padding:"10px 14px",color:C.r,fontSize:14,display:"flex",gap:8,alignItems:"flex-start"}}><Ic n="alerta" size={18}/><span>{erro}</span></div>}
        <Btn label={loading?"Entrando...":"Entrar →"} onClick={login} disabled={loading||onlyDigits(cpf).length<11||!senha.trim()}/>
        <button onClick={onPrimeiro} style={{background:"none",border:"none",cursor:"pointer",color:C.s,fontSize:14,padding:"8px 0 0",fontFamily:"inherit",textDecoration:"underline",textUnderlineOffset:3}}>Esqueci minha senha</button>
      </div>
      <button onClick={onPrimeiro} style={{position:"relative",background:C.navy,border:"none",borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
        <div style={{width:40,height:40,borderRadius:12,background:`rgba(${C.yRgb},0.18)`,color:C.yd,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic n="cadeado" size={20}/></div>
        <div style={{flex:1}}><p style={{color:"#fff",fontSize:15,fontWeight:800,margin:"0 0 2px"}}>Primeiro acesso?</p><p style={{color:"rgba(255,255,255,0.75)",fontSize:13,margin:0}}>Crie sua senha em 1 minuto</p></div>
        <span style={{color:C.yd}}><Ic n="seta" size={20}/></span>
      </button>
    </div>
  );
};

// ─── PRIMEIRO ACESSO / ESQUECI A SENHA (tudo dentro do app) ───
// O app manda para o n8n (app-recuperar-senha), que pede ao SGP para enviar a senha
// no WhatsApp ou e-mail cadastrado. O cliente não sai do app.
const PrimeiroAcesso=({onVoltar})=>{
  const [doc,setDoc]=useState(""); const [tipo,setTipo]=useState("whatsapp");
  const [email,setEmail]=useState(""); const [zap,setZap]=useState("");
  const [foc,setFoc]=useState(""); const [enviando,setEnviando]=useState(false);
  const [res,setRes]=useState(null);
  const fmtZap=v=>{ const d=onlyDigits(v).slice(0,11); return d.length<=2?d:d.length<=7?`(${d.slice(0,2)}) ${d.slice(2)}`:`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`; };
  const docOk=[11,14].includes(onlyDigits(doc).length);
  const contatoOk=tipo==="email"?/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()):onlyDigits(zap).length>=10;
  const enviar=async()=>{
    if(!docOk||!contatoOk||enviando)return;
    setEnviando(true); setRes(null);
    try{
      const d=await api("app-recuperar-senha",{cpf:onlyDigits(doc),tipo,email:tipo==="email"?email.trim():"",contato:tipo==="whatsapp"?onlyDigits(zap):""});
      setRes({ok:!!(d&&d.ok),msg:(d&&d.mensagem)||"Não foi possível enviar agora."});
    }catch(e){ setRes({ok:false,msg:"Sem conexão com o servidor. Verifique sua internet e tente de novo."}); }
    setEnviando(false);
  };
  const caixa=(k)=>({display:"flex",alignItems:"center",border:`1.5px solid ${foc===k?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:foc===k?`rgba(${C.yRgb},0.05)`:C.surf,transition:"all 0.2s"});
  const entrada={flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit"};
  const rotulo={color:C.lbl,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"};
  const opcao=(v,ic,txt)=>(
    <button onClick={()=>{setTipo(v);setRes(null);}} aria-pressed={tipo===v} style={{flex:1,minHeight:48,display:"flex",alignItems:"center",justifyContent:"center",gap:8,borderRadius:12,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,
      background:tipo===v?C.navy:C.surf,color:tipo===v?"#fff":C.t,border:`1.5px solid ${tipo===v?C.navy:C.line2}`}}><span style={{color:tipo===v?C.yd:C.s}}><Ic n={ic} size={18}/></span>{txt}</button>
  );

  if(res&&res.ok) return (
    <div style={{padding:"20px 22px 28px",display:"flex",flexDirection:"column",gap:16,alignItems:"center",textAlign:"center"}}>
      <div style={{alignSelf:"flex-start"}}><Back onClick={onVoltar}/></div>
      <IcBola n="ok" cor={C.g} size={78}/>
      <h2 style={{color:C.t,fontSize:22,fontWeight:800,margin:0}}>Senha enviada!</h2>
      <p style={{color:C.s,fontSize:15,margin:0,lineHeight:1.5}}>{res.msg}</p>
      <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.5}}>Use essa senha com o seu CPF/CNPJ para entrar no app.</p>
      <Btn label="Ir para o login" onClick={onVoltar} s={{marginTop:6}}/>
      <button onClick={()=>setRes(null)} style={{background:"none",border:"none",color:C.s,fontSize:14,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,padding:10,fontFamily:"inherit"}}>Não chegou? Enviar de novo</button>
    </div>
  );

  return (
    <div style={{padding:"20px 22px 28px",display:"flex",flexDirection:"column",gap:18}}>
      <Back onClick={onVoltar}/>
      <div style={{display:"flex",gap:14,alignItems:"center"}}>
        <IcBola n="cadeado" cor={C.navy} fundo={`rgba(${C.yRgb},0.22)`} size={56} r={16}/>
        <div>
          <h2 style={{color:C.t,fontSize:22,fontWeight:800,margin:"0 0 4px"}}>Criar ou recuperar senha</h2>
          <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.45}}>Primeiro acesso ou esqueceu a senha? Enviamos uma nova para você agora.</p>
        </div>
      </div>
      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:20,padding:"20px 18px",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <label htmlFor="pa-doc" style={rotulo}>CPF ou CNPJ do titular</label>
          <div style={caixa("doc")}><input id="pa-doc" style={{...entrada,letterSpacing:1}} inputMode="numeric" placeholder="Só os números" value={doc} onChange={e=>{setDoc(fmtDoc(e.target.value));setRes(null);}} onFocus={()=>setFoc("doc")} onBlur={()=>setFoc("")}/></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <span style={rotulo}>Receber a senha por</span>
          <div style={{display:"flex",gap:10}}>{opcao("whatsapp","chat","WhatsApp")}{opcao("email","documento","E-mail")}</div>
        </div>
        {tipo==="whatsapp" ? (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label htmlFor="pa-zap" style={rotulo}>WhatsApp cadastrado</label>
            <div style={caixa("zap")}><input id="pa-zap" style={entrada} type="tel" inputMode="tel" placeholder="(61) 99999-9999" value={zap} onChange={e=>{setZap(fmtZap(e.target.value));setRes(null);}} onFocus={()=>setFoc("zap")} onBlur={()=>setFoc("")} onKeyDown={e=>e.key==="Enter"&&enviar()}/></div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label htmlFor="pa-email" style={rotulo}>E-mail cadastrado</label>
            <div style={caixa("email")}><input id="pa-email" style={entrada} type="email" inputMode="email" autoCapitalize="none" placeholder="voce@email.com" value={email} onChange={e=>{setEmail(e.target.value);setRes(null);}} onFocus={()=>setFoc("email")} onBlur={()=>setFoc("")} onKeyDown={e=>e.key==="Enter"&&enviar()}/></div>
          </div>
        )}
        <p style={{color:C.s,fontSize:13,margin:"-6px 0 0",lineHeight:1.45}}>Use o mesmo {tipo==="whatsapp"?"número":"e-mail"} que você informou na contratação.</p>
        {res&&!res.ok&&<div role="alert" style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,padding:"10px 14px",color:C.r,fontSize:14,display:"flex",gap:8,alignItems:"flex-start"}}><Ic n="alerta" size={18}/><span>{res.msg}</span></div>}
        <Btn label={enviando?"Enviando…":<IcTxt n="cadeado" t="Enviar minha senha"/>} onClick={enviar} disabled={enviando||!docOk||!contatoOk}/>
      </div>
      <div style={{background:`rgba(${C.yRgb},0.08)`,border:`1px solid rgba(${C.yRgb},0.3)`,borderRadius:14,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
        <p style={{color:C.t,fontSize:14,fontWeight:700,margin:0,display:"flex",alignItems:"center",gap:7}}><Ic n="info" size={17}/>Mudou de número ou e-mail?</p>
        <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.5}}>Fale com a gente no WhatsApp que a equipe atualiza seu cadastro e te ajuda a entrar.</p>
        <button onClick={()=>abrirNoApp(waLink("Olá! Preciso de ajuda para criar/recuperar minha senha do app da Oryx."))} style={{background:C.wa,color:"#fff",border:"none",borderRadius:12,padding:"12px 14px",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit",minHeight:46}}><Ic n="chat" size={18}/>Pedir ajuda no WhatsApp</button>
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
      <p style={{color:C.s,fontSize:14,margin:0}}>Você tem {conta.contratos.length} contratos. Escolha qual deseja acessar:</p>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {conta.contratos.map((ct,i)=>{
        const bloq=/bloque|inativ|suspens|cancel/i.test(ct.status||"");
        return (
          <div key={i} onClick={()=>onEscolher(ct)} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <div style={{flex:1}}>
              <p style={{color:C.t,fontSize:15,fontWeight:700,margin:"0 0 4px"}}>{ct.plano||"Contrato"}</p>
              <p style={{color:C.s,fontSize:13,margin:"0 0 8px"}}>Contrato #{ct.contratoId}{ct.cidade?` • ${ct.cidade}`:""}</p>
              <Badge label={ct.status||"Ativo"} color={bloq?C.r:C.g}/>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.s} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        );
      })}
    </div>
    <button onClick={onSair} style={{background:"none",border:`1px solid ${C.b}`,borderRadius:12,padding:12,color:C.s,fontSize:14,cursor:"pointer",marginTop:4}}>Sair</button>
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
              : <div style={{background:`linear-gradient(135deg,${p.cor||C.navy},${C.navy})`,padding:18,color:"#fff",position:"relative"}}>
                  <div style={{position:"absolute",top:-8,right:-8,width:54,height:54,borderRadius:"50%",background:`rgba(${C.yRgb},0.85)`}}/>
                  <div style={{fontSize:12,color:`${C.yd}`,fontWeight:800,letterSpacing:1,position:"relative"}}>PROMOÇÃO</div>
                  <div style={{fontSize:18,fontWeight:900,margin:"5px 0",position:"relative"}}>{p.titulo}</div>
                  {p.texto&&<div style={{fontSize:13,opacity:0.88,marginBottom:12,position:"relative"}}>{p.texto}</div>}
                  {p.link&&<div style={{background:`${C.yd}`,color:"#1a1000",fontSize:13,fontWeight:800,padding:"7px 14px",borderRadius:9,display:"inline-block",position:"relative"}}>{(p.botao||"Saiba mais")} →</div>}
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
      <div style={{flex:1}}><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 1px"}}>{ok?"Conexão online":"Conexão offline"}</p><p style={{color:C.s,fontSize:12.5,margin:0}}>{ok?"Seu serviço está ativo.":"Serviço suspenso — regularize para reativar."}</p></div>
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
        <button onClick={prev} aria-label="Mês anterior" style={{background:"none",border:"none",color:C.t,fontSize:24,cursor:"pointer",padding:"6px 14px",minHeight:44}}>‹</button>
        <span style={{color:C.t,fontSize:14,fontWeight:700}}>{MESES[mes-1]} {ano}</span>
        <button onClick={next} aria-label="Próximo mês" style={{background:"none",border:"none",color:C.t,fontSize:24,cursor:"pointer",padding:"6px 14px",minHeight:44}}>›</button>
      </div>
      {data===null ? <div role="status" aria-label="Buscando seu consumo" style={{display:"flex",flexDirection:"column",gap:12}}><Osso h={110} r={18}/><Osso h={180} r={16}/></div> : data==="erro" ? (<div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.r,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>Sem conexão</p><p style={{color:C.s,fontSize:14,margin:0}}>Não foi possível carregar o consumo. Verifique sua internet.</p></div>) : (<>
        <div style={{background:`linear-gradient(135deg,${C.navy},#000)`,borderRadius:18,padding:"20px 18px",color:"#fff"}}>
          <p style={{margin:"0 0 4px",fontSize:12,letterSpacing:1,color:`${C.yd}`,fontWeight:800}}>TOTAL NO MÊS</p>
          <p style={{margin:0,fontSize:30,fontWeight:900}}>{fmtBytes(data.total!=null?data.total:(data.consumoTotal||0))}</p>
          <p style={{margin:"6px 0 0",fontSize:13,opacity:.85}}>Plano: {data.plano||cliente.plano}</p>
        </div>
        {lista.length>0 ? (
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:"4px 16px"}}>
            {lista.map((it,i)=>{ const dia=it.data||it.dia||it.dataReferencia||it.referencia||("#"+(i+1)); const val=it.total!=null?it.total:((Number(it.download)||0)+(Number(it.upload)||0)||it.consumo||it.bytes||0); return (
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<lista.length-1?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:14}}>{dia}</span><span style={{color:C.t,fontSize:14,fontWeight:700}}>{fmtBytes(val)}</span></div>
            );})}
          </div>
        ) : (
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:18,textAlign:"center"}}><p style={{color:C.s,fontSize:14,margin:0}}>Sem detalhamento diário para este mês.</p></div>
        )}
      </>)}
    </div>
  );
};

// ─── CARD CENTRAL DINÂMICO (pendência | promoção | tudo certo) ───
const CardCentral = ({cliente,goTo}) => {
  const rp=useApi("app-promocoes",{});
  const promos=rp.data!==undefined?(rp.data.promocoes||rp.data.promos||[]):(rp.erro?[]:null);
  const ref=useRef(null); const [idx,setIdx]=useState(0);
  const abrir=async(link)=>{ if(!link)return; try{ await Browser.open({url:link,presentationStyle:"fullscreen"}); }catch(e){ window.open(link,"_blank"); } };
  const onScroll=()=>{ const el=ref.current; if(!el)return; setIdx(Math.round(el.scrollLeft/el.clientWidth)); };
  const valNum=parseFloat(String(cliente.valorAberto||"0").replace(/\./g,"").replace(",","."));
  const pend=(cliente.titulos>0)&&valNum>0;
  const st=String(cliente.status||"Ativo");
  const ativo=!/(inativ|bloqu|suspens|cancel|desativ|cortad)/i.test(st);
  const CARD={background:"#fff",borderRadius:22,boxShadow:"0 12px 30px rgba(0,0,0,0.18)"};

  if(!cliente.termoAssinado) return (
    <div onClick={()=>goTo("contrato")} style={{...CARD,padding:"26px 22px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:"pointer"}}>
      <div style={{width:74,height:74,borderRadius:"50%",background:`rgba(${C.yRgb},0.16)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.yd}}><Ic n="caneta" size={34} w={1.9}/></div>
      <p style={{color:"#16161d",fontSize:21,fontWeight:800,margin:0}}>Assine seu contrato</p>
      <p style={{color:"#6b6457",fontSize:14.5,margin:0,textAlign:"center"}}>Seu termo de adesão está pendente de assinatura.</p>
      <div style={{marginTop:8,width:"100%",background:`linear-gradient(135deg,${C.yd},${C.y})`,color:"#2b2b3d",fontSize:14,fontWeight:800,padding:"12px 0",borderRadius:13,textAlign:"center"}}>Assinar agora →</div>
    </div>
  );
  if(pend) return (
    <div onClick={()=>goTo("boleto")} style={{...CARD,padding:"26px 22px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:"pointer"}}>
      <div style={{width:74,height:74,borderRadius:"50%",background:"rgba(220,38,38,0.12)",display:"flex",alignItems:"center",justifyContent:"center",color:"#dc2626"}}><Ic n="alerta" size={34} w={1.9}/></div>
      <p style={{color:"#16161d",fontSize:21,fontWeight:800,margin:0}}>Fatura pendente</p>
      <p style={{color:"#6b6457",fontSize:14.5,margin:0,textAlign:"center"}}>R$ {cliente.valorAberto}{cliente.vencimento?` • venc. dia ${cliente.vencimento}`:""}</p>
      <div style={{marginTop:8,width:"100%",background:`linear-gradient(135deg,${C.yd},${C.y})`,color:"#2b2b3d",fontSize:14,fontWeight:800,padding:"12px 0",borderRadius:13,textAlign:"center"}}>Pagar com Pix / 2ª via →</div>
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
              : <div style={{background:`linear-gradient(140deg,${pp.cor||C.navy},#1a1c4e)`,padding:"24px 20px",color:"#fff",position:"relative",minHeight:160}}>
                  <div style={{position:"absolute",top:-12,right:-12,width:70,height:70,borderRadius:"50%",background:`rgba(${C.yRgb},0.85)`}}/>
                  <div style={{fontSize:12,color:`${C.yd}`,fontWeight:800,letterSpacing:1,position:"relative"}}>{pp.selo||"PROMOÇÃO"}</div>
                  <div style={{fontSize:23,fontWeight:900,margin:"8px 0 4px",position:"relative",lineHeight:1.15}}>{pp.titulo}</div>
                  {pp.texto&&<div style={{fontSize:14,opacity:0.9,marginBottom:16,position:"relative"}}>{pp.texto}</div>}
                  {pp.link&&<div style={{background:`${C.yd}`,color:"#1a1c4e",fontSize:14,fontWeight:800,padding:"9px 16px",borderRadius:10,display:"inline-block",position:"relative"}}>{(pp.botao||"Saiba mais")} →</div>}
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
      <div style={{width:78,height:78,borderRadius:"50%",background:ativo?"rgba(22,163,74,0.12)":"rgba(234,88,12,0.12)",display:"flex",alignItems:"center",justifyContent:"center",color:ativo?"#16a34a":"#ea580c"}}><Ic n={ativo?"ok":"alerta"} size={36} w={1.9}/></div>
      <p style={{color:"#16161d",fontSize:22,fontWeight:800,margin:0}}>{ativo?"Tudo certo":st}</p>
      <p style={{color:"#6b6457",fontSize:14,margin:0,textAlign:"center"}}>{ativo?"com o seu plano!":"Regularize para reativar sua conexão"}</p>
      <div style={{marginTop:4,background:ativo?"rgba(22,163,74,0.12)":"rgba(234,88,12,0.12)",color:ativo?"#15803d":"#c2410c",fontSize:13,fontWeight:700,padding:"5px 14px",borderRadius:20,textAlign:"center"}}>{cliente.plano}{ativo?" • em dia":""}</div>
    </div>
  );
};

const Home = ({goTo,cliente,theme,toggleTheme,onTrocar,varios}) => {
  const inicial=(cliente.nome||"C").charAt(0).toUpperCase();
  const primeiro=(cliente.nome||"Cliente").split(" ")[0];
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  const contatos=[["chat","WhatsApp da Oryx",()=>abrir(waLink())],["instagram","Instagram da Oryx",()=>abrir(`https://instagram.com/${CFG.instagram}`)],["telefone","Ligar para a Oryx",ligarSuporte]];
  const atalhos=[
    {ic:"cartao",label:"2ª via",screen:"boleto"},
    {ic:"destravar",label:"Desbloqueio",screen:"desbloqueio"},
    {ic:"wifi",label:"Meu Wi-Fi",screen:"wifi"},
    {ic:"grafico",label:"Consumo",screen:"consumo"},
    {ic:"caneta",label:"Contrato",screen:"contrato"},
    {ic:"raio",label:"Velocidade",screen:"velocidade"},
    {ic:"tv",label:"Meus Apps",screen:"apps"},
    {ic:"chat",label:"Suporte",screen:"suporte"},
  ].filter(a=>ligado(a.screen));
  const claroSec=C.logoNeg?"rgba(255,255,255,0.72)":"rgba(43,43,61,0.7)";
  const titColor=C.logoNeg?"#ffffff":"#2b2b3d";
  return (
    <div style={{minHeight:"100%",background:C.logoNeg?C.bg:`linear-gradient(170deg,${C.yClaro},${C.yd})`,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"18px 18px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:8}}>
          {contatos.map(([n,nome,fn],i)=>(
            <button key={i} onClick={fn} aria-label={nome} style={{width:42,height:42,borderRadius:"50%",background:C.navy,border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><Ic n={n} size={19}/></button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <ThemeBtn theme={theme} onClick={toggleTheme}/>
          <button onClick={()=>goTo("perfil")} aria-label="Meu perfil" style={{width:42,height:42,borderRadius:"50%",background:C.navy,border:`2px solid ${C.yd}`,display:"flex",alignItems:"center",justifyContent:"center",color:`${C.yd}`,fontSize:15,fontWeight:700,cursor:"pointer"}}>{inicial}</button>
        </div>
      </div>
      <div style={{padding:"16px 20px 0"}}>
        <p style={{color:claroSec,fontSize:14,margin:0}}>Olá,</p>
        <h2 style={{color:titColor,fontSize:24,fontWeight:800,margin:0}}>{primeiro}!</h2>
        {varios&&<button onClick={onTrocar} style={{background:"none",border:"none",padding:"6px 0",color:titColor,fontSize:14,fontWeight:700,margin:"2px 0 0",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"inherit"}}><Ic n="trocar" size={15}/>Trocar contrato</button>}
      </div>
      <div style={{flex:1,display:"flex",alignItems:"center",padding:"14px 18px"}}>
        <div style={{width:"100%"}}><CardCentral cliente={cliente} goTo={goTo}/></div>
      </div>
      <div style={{padding:"0 0 calc(18px + env(safe-area-inset-bottom)) 16px",display:"flex",gap:11,overflowX:"auto",scrollbarWidth:"none"}}>
        {atalhos.map((a,i)=>(
          <button key={i} onClick={()=>goTo(a.screen)} style={{minWidth:92,flexShrink:0,background:C.navy,border:"none",borderRadius:16,padding:"15px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:9,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{color:C.yd}}><Ic n={a.ic} size={24}/></span>
            <span style={{fontSize:13.5,fontWeight:600,textAlign:"center"}}>{a.label}</span>
          </button>
        ))}
        <div style={{minWidth:14,flexShrink:0}}/>
      </div>
    </div>
  );
};

// ─── BOLETO ───
const montarBoletos = (d) => {
      const hoje=new Date(); hoje.setHours(0,0,0,0);
      return ((d&&(d.boletos||d.titulos))||[]).map(b=>{
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
};
const Boleto = ({goBack,goTo,cliente}) => {
  const [sel,setSel]=useState(null); const [copiado,setCopiado]=useState(false); const [copiadoPix,setCopiadoPix]=useState(false);
  const resp=useApi("app-boletos",{cpf:cliente.cpf,contrato:cliente.contratoId});
  const lista=resp.data!==undefined?montarBoletos(resp.data):(resp.erro?"erro":null);

  if(lista===null) return <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}><Back onClick={goBack}/><h2 style={{color:C.t,fontSize:19,fontWeight:700,margin:0}}>2ª Via de Boleto</h2><EsqueletoLista n={3} label="Buscando seus boletos"/></div>;

  if(lista==="erro") return <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}><Back onClick={goBack}/><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>2ª Via de Boleto</h2><div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.r,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>Sem conexão</p><p style={{color:C.s,fontSize:14,margin:0}}>Não foi possível carregar seus boletos. Verifique sua internet.</p></div></div>;

  if(sel!==null){const b=lista[sel];return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={()=>setSel(null)}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Boleto — {b.mes}</h2>
      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Competência",b.mes],["Vencimento",b.venc],["Valor",b.valor],["Status",b.status.toUpperCase()],["Contrato",`#${cliente.contratoId}`]].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<4?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:14}}>{k}</span><span style={{color:C.t,fontSize:14,fontWeight:700}}>{v}</span></div>
        ))}
      </div>
      {b.status!=="pago"&&<>
        {b.linha&&<div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:12,padding:14}}>
          <p style={{color:C.s,fontSize:12,margin:"0 0 6px",letterSpacing:1,textTransform:"uppercase"}}>Código de barras</p>
          <p style={{color:C.t,fontSize:12.5,fontFamily:"monospace",margin:0,letterSpacing:1,wordBreak:"break-all"}}>{b.linha}</p>
        </div>}
        {b.linha&&<Btn label={<IcTxt n={copiado?"check":"copiar"} t={copiado?"Copiado!":"Copiar código de barras"}/>} onClick={()=>{navigator.clipboard?.writeText(b.linha);setCopiado(true);setTimeout(()=>setCopiado(false),2000);}} s={{background:`rgba(${C.yRgb},0.12)`,color:C.logoNeg?C.y:C.navy,boxShadow:"none",border:`1px solid rgba(${C.yRgb},0.45)`}}/>}
        {b.pix&&<div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:12,padding:14}}>
          <p style={{color:C.s,fontSize:12,margin:"0 0 6px",letterSpacing:1,textTransform:"uppercase"}}>Pix copia e cola</p>
          <p style={{color:C.t,fontSize:12.5,fontFamily:"monospace",margin:0,letterSpacing:0.5,wordBreak:"break-all"}}>{b.pix}</p>
        </div>}
        {b.pix&&<Btn label={<IcTxt n={copiadoPix?"check":"pix"} t={copiadoPix?"Pix copiado!":"Copiar Pix (copia e cola)"}/>} onClick={()=>{navigator.clipboard?.writeText(b.pix);setCopiadoPix(true);setTimeout(()=>setCopiadoPix(false),2000);}}/>}
        {b.link&&<Btn label={<IcTxt n="documento" t="Abrir boleto / PDF"/>} onClick={async()=>{try{await Browser.open({url:b.link,presentationStyle:"fullscreen"});}catch(e){window.open(b.link,"_blank");}}} s={{background:`rgba(${C.yRgb},0.12)`,color:C.logoNeg?C.y:C.navy,boxShadow:"none",border:`1px solid rgba(${C.yRgb},0.45)`}}/>}
      </>}
      {b.status==="pago"&&<div style={{background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:12,padding:14,textAlign:"center"}}><p style={{color:C.g,fontSize:14,fontWeight:700,margin:0,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ic n="check" size={17}/>Boleto quitado</p></div>}
    </div>
  );}

  return(
    <div style={{padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>2ª Via de Boleto</h2>
      <p style={{color:C.s,fontSize:14,margin:0}}>Contrato #{cliente.contratoId} — {cliente.nome}</p>
      {ligado("notas")&&<button onClick={()=>goTo("notas")} style={{alignSelf:"flex-start",background:C.surf,border:`1px solid ${C.b}`,borderRadius:12,padding:"10px 14px",color:C.t,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit"}}><Ic n="recibo" size={18}/>Minhas notas fiscais<Ic n="seta" size={16}/></button>}
      {lista.length===0&&<div style={{background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.g,fontSize:16,fontWeight:700,margin:"0 0 4px",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Ic n="ok" size={19}/>Conta em dia!</p><p style={{color:C.s,fontSize:14,margin:0}}>Nenhum boleto em aberto.</p></div>}
      {lista.map((b,i)=>(
        <div key={i} onClick={()=>setSel(i)} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
          <div><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>{b.mes}</p><p style={{color:C.s,fontSize:13,margin:"0 0 8px"}}>Venc. {b.venc}</p><Badge label={b.status} color={b.cor}/></div>
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
      <div><h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Teste de Velocidade</h2><p style={{color:C.s,fontSize:14,margin:"4px 0 0"}}>Medição feita dentro do app, sem abrir o navegador</p></div>

      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"24px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <div style={{position:"relative",width:200,height:200}}>
          <svg width="200" height="200" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="86" fill="none" stroke={C.line2} strokeWidth="14"/>
            <circle cx="100" cy="100" r="86" fill="none" stroke={C.y} strokeWidth="14" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC*(1-pct)} transform="rotate(-90 100 100)" style={{transition:"stroke-dashoffset 0.25s"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:C.t,fontSize:42,fontWeight:900,lineHeight:1}}>{centro}</span>
            <span style={{color:C.s,fontSize:14,fontWeight:700,marginTop:2}}>Mbps</span>
          </div>
        </div>
        <p style={{color:testando?C.y:C.s,fontSize:14,fontWeight:700,margin:0}}>{faseLabel}</p>

        <div style={{display:"flex",gap:10,width:"100%"}}>
          {[["Ping",res.ping==null?"—":res.ping+" ms"],["Download",res.down==null?"—":fmt(res.down)+" Mbps"],["Upload",res.up==null?"—":fmt(res.up)+" Mbps"]].map(([k,v],i)=>(
            <div key={i} style={{flex:1,background:C.card,border:`1px solid ${C.line}`,borderRadius:12,padding:"10px 6px",textAlign:"center"}}>
              <p style={{color:C.s,fontSize:12,margin:"0 0 3px",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{k}</p>
              <p style={{color:C.t,fontSize:14,fontWeight:800,margin:0}}>{v}</p>
            </div>
          ))}
        </div>

        <button onClick={iniciar} disabled={testando} style={{width:"100%",background:testando?C.line3:C.y,color:C.navy,border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:800,cursor:testando?"default":"pointer",opacity:testando?0.7:1}}>{testando?"Testando…":((fase==="done"||fase==="erro")?"Testar novamente":"Iniciar teste →")}</button>
      </div>

      <div style={{background:`rgba(${C.yRgb},0.07)`,border:`1px solid ${C.line}`,borderRadius:12,padding:"13px 15px"}}>
        <p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 6px",display:"flex",alignItems:"center",gap:7}}><Ic n="lampada" size={17}/>Dicas para um teste preciso</p>
        <p style={{color:C.s,fontSize:12.5,margin:0,lineHeight:1.6}}>• Conecte o aparelho no Wi-Fi e fique perto do roteador<br/>• Feche apps e downloads em segundo plano<br/>• Evite outras pessoas usando a internet durante o teste<br/>• Para medir o plano contratado, use cabo no computador quando possível</p>
      </div>
    </div>
  );
};

const Suporte=({goBack,goTo})=>{
  const [faq,setFaq]=useState(null);
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  const canais=[
    {icon:"chat",label:"Chat pelo WhatsApp",sub:"Atendimento rápido",color:C.wa,action:"Iniciar",go:()=>abrir(waLink("Olá! Preciso de ajuda com minha internet Oryx."))},
    {icon:"telefone",label:"Ligar para o suporte",sub:CFG.telefone_exibir,color:C.p,action:"Ligar",go:ligarSuporte},
    {icon:"ferramenta",label:"Abrir chamado técnico",sub:"Falar com o suporte",color:C.o,action:"Abrir",go:()=>abrir(waLink("Olá! Preciso de ajuda com minha internet Oryx. Quero abrir um chamado técnico."))},
    {icon:"destravar",label:"Desbloqueio de confiança",sub:"Liberar conexão",color:C.logoNeg?C.y:"#B4870A",action:"Liberar",go:()=>goTo("desbloqueio"),funcao:"desbloqueio"},
  ].filter(c=>!c.funcao||ligado(c.funcao));
  const redes=[
    {icon:"instagram",label:"Instagram",sub:"@"+CFG.instagram,color:"#E1306C",go:()=>abrir(`https://instagram.com/${CFG.instagram}`)},
    {icon:"facebook",label:"Facebook",sub:"Oryx Internet",color:"#1877F2",go:()=>abrir(CFG.facebook)},
  ];
  const faqs=CFG.faq&&CFG.faq.length?CFG.faq:PADRAO.faq;
  return(
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Suporte & Contato</h2>
      <p style={{color:C.s,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:0}}>Canais de atendimento</p>
      {canais.map((item,i)=>(
        <div key={i} onClick={item.go} style={{background:C.surf,border:`1px solid ${item.color}22`,borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}>
          <div style={{width:46,height:46,borderRadius:14,background:`${item.color}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:item.color}}><Ic n={item.icon} size={22}/></div>
          <div style={{flex:1}}><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 2px"}}>{item.label}</p><p style={{color:C.s,fontSize:13,margin:0}}>{item.sub}</p></div>
          <span style={{color:item.color,fontSize:13,fontWeight:600,whiteSpace:"nowrap"}}>{item.action} →</span>
        </div>
      ))}
      <p style={{color:C.s,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:"4px 0 0"}}>Redes sociais</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {redes.map((r,i)=>(
          <div key={i} onClick={r.go} style={{background:C.surf,border:`1px solid ${r.color}22`,borderRadius:14,padding:"14px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer"}}>
            <div style={{width:40,height:40,borderRadius:12,background:`${r.color}15`,display:"flex",alignItems:"center",justifyContent:"center",color:r.color}}><Ic n={r.icon} size={20}/></div>
            <p style={{color:C.t,fontSize:14,fontWeight:700,margin:0}}>{r.label}</p>
            <p style={{color:C.s,fontSize:12,margin:0}}>{r.sub}</p>
          </div>
        ))}
      </div>
      <p style={{color:C.s,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",margin:"4px 0 0"}}>Perguntas frequentes</p>
      {faqs.map((f,i)=>(
        <div key={i} style={{background:C.surf,border:`1px solid ${faq===i?`rgba(${C.yRgb},0.25)`:C.b}`,borderRadius:14,overflow:"hidden",cursor:"pointer"}} onClick={()=>setFaq(faq===i?null:i)}>
          <div style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><p style={{color:C.t,fontSize:14,fontWeight:600,margin:0,flex:1,paddingRight:8}}>{f.q}</p><span style={{color:C.y,fontSize:16,display:"block",transform:faq===i?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}>›</span></div>
          {faq===i&&<div style={{padding:"0 16px 14px",borderTop:`1px solid ${C.line}`}}><p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.6}}>{f.a}</p></div>}
        </div>
      ))}
      <div style={{background:`rgba(${C.yRgb},0.06)`,border:`1px solid rgba(${C.yRgb},0.15)`,borderRadius:16,padding:16,textAlign:"center"}}>
        <p style={{color:C.s,fontSize:13,margin:"0 0 6px"}}>Horário de atendimento</p>
        <p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 10px"}}>{CFG.horario}</p>
        <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.5,display:"flex",gap:6,justifyContent:"center"}}><Ic n="local" size={16} s={{marginTop:2}}/><span>{CFG.endereco}</span></p>
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
    abrir(waLink(msg));
  };
  const campo=(label,val,setVal,ph,key,type)=>(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{color:C.lbl,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>{label}</label>
      <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${foc===key?C.y:C.line2}`,borderRadius:12,padding:"0 14px",background:foc===key?`rgba(${C.yRgb},0.05)`:C.surf}}>
        <input style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit"}} type={type||"text"} placeholder={ph} value={val} onChange={e=>setVal(e.target.value)} onFocus={()=>setFoc(key)} onBlur={()=>setFoc("")}/>
      </div>
    </div>
  );
  return (
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:16}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Atualizar cadastro</h2>
      <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.5}}>Informe seu novo telefone e/ou e-mail. Sua solicitação será enviada para a equipe da Oryx pelo WhatsApp.</p>
      {campo("Telefone / WhatsApp",tel,setTel,"(61) 9 9999-9999","tel","tel")}
      {campo("E-mail",email,setEmail,"voce@email.com","email","email")}
      <Btn label="Enviar atualização" onClick={enviar} disabled={!tel.trim()&&!email.trim()}/>
    </div>
  );
};

const Notas = ({goBack,cliente}) => {
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  const statusLabel=(st)=>{ const m={"1":"Autorizada","3":"Em digitação","5":"Rejeitada","8":"Cancelada","9":"Importada","10":"Aguardando","11":"Substituída"}; return m[String(st)]||String(st||""); };
  const resp=useApi("app-notas",{cpf:cliente.cpf,contrato:cliente.contratoId});
  const lista=resp.data!==undefined
    ? ((resp.data.notas||resp.data.results||resp.data.list||[]).map(n=>({numero:n.numero||n.id, id:n.id, data:n.data_emissao||n.data||"", status:n.status, serie:n.serie||""})))
    : (resp.erro?"erro":null);
  const baixar=(id)=>{ abrir(API_BASE+"/app-nota-pdf?id="+encodeURIComponent(id)+"&contrato="+encodeURIComponent(cliente.contratoId)+"&sessao="+encodeURIComponent(SESSAO)); };
  return (
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Notas fiscais</h2>
      <p style={{color:C.s,fontSize:14,margin:0}}>Notas emitidas no seu contrato #{cliente.contratoId}.</p>
      {lista===null ? <EsqueletoLista n={2} label="Buscando suas notas"/> : lista==="erro" ? (
        <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.r,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>Sem conexão</p><p style={{color:C.s,fontSize:14,margin:0}}>Não foi possível carregar suas notas. Verifique sua internet.</p></div>
      ) : (
        lista.length===0 ? (
          <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:20,textAlign:"center"}}><p style={{color:C.s,fontSize:14,margin:0}}>Nenhuma nota fiscal emitida ainda.</p></div>
        ) : lista.map((n,i)=>(
          <div key={i} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 4px"}}>NFCom Nº {n.numero}{n.serie?(" • Série "+n.serie):""}</p><p style={{color:C.s,fontSize:13,margin:"0 0 8px"}}>Emitida em {fmtData(n.data)}</p><Badge label={statusLabel(n.status)} color={String(n.status)==="1"?C.g:C.o}/></div>
            {String(n.status)==="1" ? <button onClick={()=>baixar(n.id)} style={{background:C.y,color:"#1a1000",border:"none",borderRadius:12,padding:"10px 14px",fontSize:14,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>Baixar PDF</button> : <span style={{color:C.s,fontSize:12.5,whiteSpace:"nowrap"}}>PDF indisponível</span>}
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
      <div style={{width:60,height:60,borderRadius:"50%",background:`rgba(${C.yRgb},0.15)`,border:`2px solid rgba(${C.yRgb},0.3)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.y,fontSize:24,fontWeight:700}}>{(cliente.nome||"C").charAt(0)}</div>
      <div><h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:"0 0 3px"}}>{cliente.nome}</h2><p style={{color:C.s,fontSize:14,margin:0}}>Cliente Oryx Internet</p></div>
    </div>
    <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
      {[["Nome",cliente.nome],[docLabel(cliente.cpf),maskDoc(cliente.cpf)],["Plano",cliente.plano],["Contrato",`#${cliente.contratoId}`],["Status",cliente.status||"Ativo"]].map(([k,v],i,a)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<a.length-1?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:14}}>{k}</span><span style={{color:C.t,fontSize:14,fontWeight:600}}>{v}</span></div>
      ))}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {[[<IcTxt n="caneta" t="Atualizar cadastro"/>,()=>goTo("atualizar")]].map(([lbl,fn],i)=>(
        <button key={i} onClick={fn} style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:14,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",color:C.t,fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left"}}>{lbl}<span style={{color:C.s}}>›</span></button>
      ))}
    </div>
    <button onClick={goLogin} style={{background:"none",border:"1px solid rgba(241,85,85,0.3)",borderRadius:14,padding:14,color:C.r,fontSize:14,fontWeight:600,cursor:"pointer"}}>Sair da conta</button>
    <p style={{color:C.t3,fontSize:12,textAlign:"center",margin:"4px 0 0"}}>{ehNativo()?`Versão do app: ${APP_BUILD||"teste"}`:"Central do Assinante (web)"}</p>
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
          <div style={{width:72,height:72,borderRadius:"50%",background:ok?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)",border:`2px solid ${ok?"rgba(52,211,153,0.4)":"rgba(248,113,113,0.4)"}`,display:"flex",alignItems:"center",justifyContent:"center",color:ok?C.g:C.r}}><Ic n={ok?"destravar":"alerta"} size={32} w={1.9}/></div>
          <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>{ok?"Desbloqueio realizado!":"Não foi possível"}</h2>
          <p style={{color:C.s,fontSize:14,margin:0}}>{res?.mensagem||res?.msg||(ok?"Sua conexão foi liberada.":"Tente novamente ou fale com um atendente.")}</p>
        </div>
        {ok&&<div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:10}}>
          <p style={{color:C.t,fontSize:14,margin:0,lineHeight:1.6}}>O desbloqueio de confiança vale por <strong>{res?.liberado_dias||2} dias</strong>. Regularize seu pagamento para evitar novo bloqueio.</p>
          {res?.data_promessa&&<p style={{color:C.s,fontSize:14,margin:0,display:"flex",alignItems:"center",gap:6}}><Ic n="calendario" size={15}/>Promessa de pagamento até: <strong style={{color:C.t}}>{res.data_promessa}</strong></p>}
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
        <p style={{color:C.t,fontSize:15,fontWeight:700,margin:"0 0 8px",display:"flex",alignItems:"center",gap:8}}><Ic n="destravar" size={18}/>Está com a conexão bloqueada?</p>
        <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.6}}>Você pode liberar temporariamente sua internet enquanto regulariza o pagamento. O desbloqueio é válido por alguns dias.</p>
      </div>
      <div style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Cliente",cliente.nome],["Contrato",`#${cliente.contratoId}`],["Plano",cliente.plano]].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<2?`1px solid rgba(255,255,255,0.06)`:undefined}}><span style={{color:C.s,fontSize:14}}>{k}</span><span style={{color:C.t,fontSize:14,fontWeight:700}}>{v}</span></div>
        ))}
      </div>
      <Btn label={<IcTxt n="destravar" t="Liberar minha conexão"/>} onClick={liberar}/>
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
        <button onClick={onClose} aria-label="Voltar" style={{background:"none",border:"none",color:C.t,fontSize:26,lineHeight:1,cursor:"pointer",padding:"8px 10px 8px 4px",minHeight:44}}>‹</button>
        <span style={{color:C.t,fontSize:15,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title||"Documento"}</span>
        <button onClick={abrirExterno} style={{background:"none",border:"none",color:C.yd,fontSize:14,fontWeight:700,cursor:"pointer"}}>Baixar</button>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:C.surf,padding:"12px 10px calc(14px + env(safe-area-inset-bottom))"}}>
        {estado==="load"&&<p style={{color:C.s,fontSize:14,textAlign:"center",marginTop:40}}>Carregando documento…</p>}
        {estado==="erro"&&(<div style={{textAlign:"center",marginTop:40,padding:"0 24px"}}><p style={{color:C.s,fontSize:14,lineHeight:1.5}}>Não foi possível exibir o PDF aqui. Toque abaixo para abrir.</p><button onClick={abrirExterno} style={{marginTop:14,background:C.y,color:"#1a1000",border:"none",borderRadius:12,padding:"12px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Abrir documento</button></div>)}
        {estado==="ok"&&pages.map((src,i)=>(<img key={i} src={src} alt={"Página "+(i+1)} style={{width:"100%",display:"block",marginBottom:10,borderRadius:6,boxShadow:"0 2px 10px rgba(0,0,0,0.15)"}}/>))}
      </div>
    </div>
  );
};

const PhotoCard=({label,val,onPick,capture})=>(
  <label style={{flex:1,minWidth:0,aspectRatio:"1/1",background:val?"#000":C.surf,border:`1.5px dashed ${val?"transparent":C.line3}`,borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer",overflow:"hidden",position:"relative"}}>
    <input type="file" accept="image/*" capture={capture} onChange={onPick} style={{display:"none"}}/>
    {val
      ? <><img src={val} alt={label} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/><span style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:12,fontWeight:700,padding:"4px 0",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>{label}<Ic n="check" size={12}/></span></>
      : <><span style={{color:C.s}}><Ic n="camera" size={24}/></span><span style={{color:C.s,fontSize:12,fontWeight:700,textAlign:"center",padding:"0 4px"}}>{label}</span></>}
  </label>
);

// Assinatura completa dentro do app: o n8n (app-assinar-contrato) envia as fotos e a assinatura
// para o formulário oficial do SGPsign, então o contrato fica assinado lá, igual pela página web.
const AssinarContrato=({cliente,onClose,onAssinado})=>{
  const canvasRef=useRef(null); const drawing=useRef(false);
  const [temAss,setTemAss]=useState(false);
  const [fotos,setFotos]=useState({frente:null,selfie:null});
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

  const completo = temAss && fotos.frente && fotos.selfie && aceite;
  const enviar=async()=>{
    if(!completo||enviando)return; setEnviando(true); setErro(null);
    try{
      const assinatura=canvasRef.current.toDataURL("image/png");
      const d=await api("app-assinar-contrato",{termoUrl:cliente.termoUrl,cpf:cliente.cpf,contrato:cliente.contratoId,nome:cliente.nome,assinatura,fotoDoc:fotos.frente,foto:fotos.selfie});
      if(d&&d.ok){ setOk(true); onAssinado&&onAssinado(); }
      else setErro((d&&(d.mensagem||d.message))||"Não foi possível enviar agora. Tente novamente.");
    }catch(e){ setErro("Falha de conexão. Tente novamente."); }
    setEnviando(false);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:C.bg,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"calc(10px + env(safe-area-inset-top)) 14px 10px",borderBottom:`1px solid ${C.line}`,background:C.nav}}>
        <button onClick={onClose} aria-label="Voltar" style={{background:"none",border:"none",color:C.t,fontSize:26,lineHeight:1,cursor:"pointer",padding:"8px 10px 8px 4px",minHeight:44}}>‹</button>
        <span style={{color:C.t,fontSize:15,fontWeight:700,flex:1}}>Assinar contrato</span>
      </div>

      {ok ? (
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:"0 28px",textAlign:"center"}}>
          <div style={{width:74,height:74,borderRadius:"50%",background:"rgba(52,211,153,0.15)",border:"2px solid rgba(52,211,153,0.4)",display:"flex",alignItems:"center",justifyContent:"center",color:C.g}}><Ic n="ok" size={34} w={1.9}/></div>
          <p style={{color:C.t,fontSize:18,fontWeight:800,margin:0}}>Contrato assinado!</p>
          <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.5}}>Obrigado! Sua assinatura foi registrada na plataforma oficial de assinatura eletrônica.</p>
          <button onClick={onClose} style={{marginTop:8,width:"100%",maxWidth:280,background:C.y,color:"#1a1000",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:800,cursor:"pointer"}}>Concluir</button>
        </div>
      ) : (
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"16px 16px calc(20px + env(safe-area-inset-bottom))",display:"flex",flexDirection:"column",gap:16}}>
          <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.5}}>Contrato #{cliente.contratoId} — {cliente.nome}. Tire as duas fotos, assine no quadro e confirme.</p>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <label style={{color:C.t,fontSize:14,fontWeight:700}}>Sua assinatura</label>
              <button onClick={limpar} style={{background:"none",border:"none",color:C.yd,fontSize:13,fontWeight:700,cursor:"pointer"}}>Limpar</button>
            </div>
            <canvas ref={canvasRef} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{width:"100%",height:170,background:"#ffffff",border:`1px solid ${C.line2}`,borderRadius:12,touchAction:"none",display:"block"}}/>
            {!temAss&&<p style={{color:C.s,fontSize:12,margin:"6px 0 0",textAlign:"center"}}>Assine com o dedo dentro do quadro</p>}
          </div>

          <div>
            <label style={{color:C.t,fontSize:14,fontWeight:700,display:"block",marginBottom:8}}>Documento e selfie</label>
            <div style={{display:"flex",gap:10}}>
              <PhotoCard label="Foto do documento" val={fotos.frente} onPick={lerFoto("frente")} capture="environment"/>
              <PhotoCard label="Selfie com documento" val={fotos.selfie} onPick={lerFoto("selfie")} capture="user"/>
            </div>
          </div>

          <label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
            <input type="checkbox" checked={aceite} onChange={e=>setAceite(e.target.checked)} style={{marginTop:2,width:18,height:18,flexShrink:0,accentColor:C.y}}/>
            <span style={{color:C.t,fontSize:13.5,lineHeight:1.45}}>Li e aceito os termos do contrato e confirmo que as informações e fotos enviadas são verdadeiras.</span>
          </label>

          {erro&&<div style={{background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.4)",borderRadius:12,padding:"11px 14px",color:C.t,fontSize:14,display:"flex",gap:8,alignItems:"flex-start"}}><Ic n="alerta" size={18} s={{color:C.r}}/><span>{erro}</span></div>}

          <button onClick={enviar} disabled={!completo||enviando} style={{width:"100%",background:(!completo||enviando)?C.line3:C.y,color:"#1a1000",border:"none",borderRadius:14,padding:15,fontSize:15,fontWeight:800,cursor:(!completo||enviando)?"default":"pointer",opacity:(!completo||enviando)?0.7:1}}>{enviando?"Assinando…":"Assinar contrato"}</button>
          <p style={{color:C.s,fontSize:12,margin:0,textAlign:"center",lineHeight:1.4}}>A assinatura é registrada no SGPsign, com data e hora.</p>
        </div>
      )}
    </div>
  );
};

const Contrato = ({goBack,cliente}) => {
  const [verPdf,setVerPdf]=useState(null);
  const [assinando,setAssinando]=useState(false); const [feito,setFeito]=useState(false);
  const assinado=!!cliente.termoAssinado||feito;
  const url=cliente.termoUrl||"";
  const pdf=cliente.termoPdf||"";
  const abrir=async(u)=>{ if(!u)return; try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  return(<>
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onClick={goBack}/>
      <h2 style={{color:C.t,fontSize:18,fontWeight:700,margin:0}}>Meu Contrato</h2>
      <p style={{color:C.s,fontSize:14,margin:0}}>Contrato #{cliente.contratoId} — {cliente.nome}</p>

      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:0}}>
        {[["Plano",cliente.plano],["Contrato",`#${cliente.contratoId}`],[docLabel(cliente.cpf),maskDoc(cliente.cpf)],["Status",cliente.status||"Ativo"]].map(([k,v],i,a)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:i<a.length-1?`1px solid ${C.line}`:undefined}}><span style={{color:C.s,fontSize:14}}>{k}</span><span style={{color:C.t,fontSize:14,fontWeight:700}}>{v}</span></div>
        ))}
      </div>

      {assinado ? (
        <div style={{background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.25)",borderRadius:16,padding:18,display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(52,211,153,0.15)",border:"2px solid rgba(52,211,153,0.4)",display:"flex",alignItems:"center",justifyContent:"center",color:C.g}}><Ic n="ok" size={28} w={1.9}/></div>
          <p style={{color:C.g,fontSize:16,fontWeight:700,margin:"4px 0 0"}}>{feito?"Contrato assinado!":"Contrato assinado"}</p>
          <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.5}}>{feito?"Obrigado! Sua assinatura foi registrada.":"Seu termo de adesão já está assinado e registrado no sistema."}</p>
          {pdf&&<button onClick={()=>setVerPdf(pdf)} style={{marginTop:8,width:"100%",background:C.surf2,color:C.t,border:`1px solid ${C.line2}`,borderRadius:12,padding:13,fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}><Ic n="documento" size={18}/>Baixar termo assinado (PDF)</button>}
        </div>
      ) : (
        <div style={{background:`rgba(${C.yRgb},0.07)`,border:`1px solid rgba(${C.yRgb},0.25)`,borderRadius:16,padding:18,display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:`rgba(${C.yRgb},0.15)`,border:`2px solid rgba(${C.yRgb},0.35)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.yd}}><Ic n="caneta" size={28} w={1.9}/></div>
          <p style={{color:C.t,fontSize:16,fontWeight:700,margin:"4px 0 0"}}>Termo de adesão pendente</p>
          {url ? (<>
            <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.5}}>Assine aqui mesmo no app: foto do documento, selfie com o documento e sua assinatura. Leva 2 minutos.</p>
            {pdf&&<button onClick={()=>setVerPdf(pdf)} style={{marginTop:10,width:"100%",background:C.surf2,color:C.t,border:`1.5px solid ${C.line2}`,borderRadius:12,padding:13,fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}><Ic n="documento" size={18}/>Ler o termo de adesão</button>}
            <Btn label={<IcTxt n="caneta" t="Assinar agora"/>} onClick={()=>setAssinando(true)} s={{marginTop:4}}/>
          </>) : (
            <p style={{color:C.s,fontSize:13,margin:"8px 0 0",fontStyle:"italic"}}>O termo ainda não está disponível. Fale com o suporte se precisar assinar agora.</p>
          )}
        </div>
      )}
    </div>
      {verPdf&&<PdfViewer url={verPdf} title="Termo de adesão" onClose={()=>setVerPdf(null)}/>}
      {assinando&&<AssinarContrato cliente={cliente} onClose={()=>setAssinando(false)} onAssinado={()=>setFeito(true)}/>}
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
  const PORTAL=CFG.portal;
  const abrir=async(u)=>{ try{ await Browser.open({url:u,presentationStyle:"fullscreen"}); }catch(e){ window.open(u,"_blank"); } };
  return(
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:16}}>
      <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Meus Apps</h2>
      <p style={{color:C.s,fontSize:14,margin:"-6px 0 0"}}>Acesse os serviços inclusos no seu plano</p>

      <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"22px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:18,background:`rgba(${C.yRgb},0.14)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.yd}}><Ic n="tv" size={30} w={1.9}/></div>
        <p style={{color:C.t,fontSize:16,fontWeight:700,margin:"6px 0 0"}}>Portal do Assinante</p>
        <p style={{color:C.s,fontSize:13,margin:0,lineHeight:1.5}}>Acesse seus aplicativos de streaming, serviços e benefícios inclusos no seu plano Oryx.</p>
        <button onClick={()=>abrirNoApp(PORTAL)} style={{marginTop:10,width:"100%",background:C.y,color:C.navy,border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Abrir Portal do Assinante →</button>
      </div>

      <div style={{background:`rgba(${C.yRgb},0.07)`,border:`1px solid ${C.line}`,borderRadius:12,padding:"13px 15px"}}>
        <p style={{color:C.t,fontSize:14,fontWeight:700,margin:"0 0 6px",display:"flex",alignItems:"center",gap:7}}><Ic n="lampada" size={17}/>O que você encontra no portal</p>
        <p style={{color:C.s,fontSize:12.5,margin:0,lineHeight:1.6}}>• Aplicativos de streaming e TV<br/>• Serviços e benefícios do plano<br/>• Configurações da sua conta</p>
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
      setMsg("Pedido enviado! A troca pode levar até 1 minuto pra valer. Depois reconecte seus aparelhos com o novo nome e senha.");
      setEditar(false); setNome(""); setSenha("");
      setTimeout(carregar,4000);
    }catch(e){ setMsg("Não deu pra alterar agora. "+((e&&e.message)?e.message:"")+" Tente de novo em instantes."); }
    setSalvando(false);
  }

  const inputStyle={width:"100%",boxSizing:"border-box",background:C.surf,border:`1.5px solid ${C.line2}`,borderRadius:12,padding:"13px 14px",color:C.t,fontSize:16,fontFamily:"inherit",outline:"none"};

  return (
    <div style={{padding:"20px 16px 24px",display:"flex",flexDirection:"column",gap:16}}>
      <h2 style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Meu Wi-Fi</h2>
      <p style={{color:C.s,fontSize:14,margin:"-6px 0 0"}}>Altere o nome e a senha da sua rede — de qualquer lugar</p>

      {st==="load"&&<div role="status" aria-label="Carregando sua rede" style={{display:"flex",flexDirection:"column",gap:12}}>{[0,1].map(i=><div key={i} style={{background:C.card,border:`1px solid ${C.line}`,borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:8}}><Osso w="30%" h={12}/><Osso w="55%" h={18}/></div>)}<Osso h={50} r={14}/></div>}

      {st==="erro"&&(
        <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"22px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"}}>
          <div style={{width:64,height:64,borderRadius:18,background:`rgba(${C.yRgb},0.14)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.yd}}><Ic n="wifi" size={30} w={1.9}/></div>
          <p style={{color:C.t,fontSize:16,fontWeight:700,margin:"4px 0 0"}}>Não conseguimos carregar sua rede</p>
          <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.55}}>Pode ser instabilidade momentânea. Tente de novo em instantes ou fale com o suporte.</p>
          <button onClick={carregar} style={{marginTop:8,width:"100%",background:C.y,color:C.navy,border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,cursor:"pointer"}}>Tentar de novo</button>
          <a href={waLink("Olá! Quero trocar o nome/senha do meu Wi-Fi.")} style={{color:C.s,fontSize:14,textDecoration:"underline",textUnderlineOffset:3}}>Falar com o suporte</a>
        </div>
      )}

      {st==="ready"&&!editar&&(
        <>
          {redes.map((r,i)=>(
            <div key={i} style={{background:C.card,border:`1px solid ${C.line}`,borderRadius:16,padding:"16px",display:"flex",flexDirection:"column",gap:6}}>
              <span style={{color:C.s,fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Rede {r.band}</span>
              <p style={{color:C.s,fontSize:12,margin:"2px 0 0"}}>Nome (SSID)</p>
              <p style={{color:C.t,fontSize:16,fontWeight:700,margin:0,wordBreak:"break-all"}}>{r.ssid||"—"}</p>
            </div>
          ))}
          <div style={{background:`rgba(${C.yRgb},0.07)`,border:`1px solid ${C.line}`,borderRadius:12,padding:"11px 14px"}}>
            <p style={{color:C.s,fontSize:14,margin:0,lineHeight:1.55,display:"flex",gap:7}}><Ic n="cadeado" size={16} s={{marginTop:2}}/><span>Por segurança, a senha atual não pode ser exibida. Você pode definir uma senha nova a qualquer momento.</span></p>
          </div>
          <Btn label="Alterar nome e senha" onClick={()=>{ setEditar(true); setNome(""); setSenha(""); setMsg(""); }}/>
          {msg&&<div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:10,padding:"10px 14px",color:C.t,fontSize:14}}>{msg}</div>}
          <button onClick={carregar} style={{background:"none",border:"none",color:C.s,fontSize:14,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,alignSelf:"center"}}>Atualizar</button>
        </>
      )}

      {st==="ready"&&editar&&(
        <div style={{background:C.surf,border:`1px solid ${C.b}`,borderRadius:18,padding:"20px 18px",display:"flex",flexDirection:"column",gap:14}}>
          <h3 style={{color:C.t,fontSize:16,fontWeight:800,margin:0}}>Alterar Wi-Fi</h3>
          <p style={{color:C.s,fontSize:13,margin:"-6px 0 0",lineHeight:1.5}}>Seu nome vira <b>ORYX-</b>seu-nome (e a rede 5G ganha <b>_5G</b> no fim). Vale pras duas redes. A troca pode levar até 1 minuto.</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{color:C.lbl,fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Novo nome (opcional)</label>
            <input value={nome} onChange={e=>setNome(e.target.value)} maxLength={32} placeholder="Ex.: Casa da Ana" style={inputStyle}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{color:C.lbl,fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Nova senha</label>
            <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${C.line2}`,borderRadius:12,padding:"0 12px",background:C.surf}}>
              <input value={senha} onChange={e=>setSenha(e.target.value)} type={ver?"text":"password"} maxLength={63} placeholder="Mínimo 8 caracteres" style={{flex:1,background:"none",border:"none",outline:"none",color:C.t,fontSize:16,padding:"13px 0",fontFamily:"inherit"}}/>
              <button onClick={()=>setVer(v=>!v)} aria-label={ver?"Ocultar senha":"Mostrar senha"} style={{background:"none",border:"none",color:C.s,fontSize:13,cursor:"pointer",padding:"10px 6px"}}>{ver?"ocultar":"ver"}</button>
            </div>
          </div>
          {msg&&<div style={{background:"rgba(220,38,38,0.1)",border:"1px solid rgba(220,38,38,0.3)",borderRadius:10,padding:"10px 14px",color:C.r,fontSize:14}}>{msg}</div>}
          <Btn label={salvando?"Enviando…":"Salvar alterações"} onClick={salvar} disabled={salvando||senha.trim().length<8}/>
          <button onClick={()=>{ setEditar(false); setMsg(""); }} disabled={salvando} style={{background:"none",border:"none",color:C.s,fontSize:14,cursor:"pointer",alignSelf:"center"}}>Cancelar</button>
        </div>
      )}
    </div>
  );
}


// ─── AVISO DO PAINEL (faixa no topo: manutenção, instabilidade...) ───
const AvisoApp=()=>{
  const a=vigente(CFG.aviso);
  if(!a||!a.texto)return null;
  const tipos={info:["#E8F0FE","#1E4FB5","info"],alerta:["#FFF1E0","#B4500A","alerta"],sucesso:["#E5F6EC","#157A42","ok"]};
  const [fundo,cor,icone]=tipos[a.tipo]||tipos.info;
  return(
    <div onClick={a.link?()=>abrirNoApp(a.link):undefined} style={{background:fundo,color:cor,padding:"10px 16px",fontSize:14,fontWeight:600,lineHeight:1.4,display:"flex",gap:8,alignItems:"flex-start",cursor:a.link?"pointer":"default"}}>
      <Ic n={icone} size={18}/><span style={{flex:1}}>{a.texto}</span>{a.link&&<span style={{fontSize:16}}>›</span>}
    </div>
  );
};

// ─── VERSÃO NOVA NA PLAY STORE ───
const abrirLoja=()=>{ try{ window.location.href=`market://details?id=${LOJA_ID}`; }catch(e){ abrirNoApp(`https://play.google.com/store/apps/details?id=${LOJA_ID}`); } };
const AtualizarApp=({obrigatorio,onDepois})=>(
  <div style={{position:"fixed",inset:0,zIndex:50,background:obrigatorio?C.bg:"rgba(0,0,0,0.55)",display:"flex",alignItems:obrigatorio?"center":"flex-end",justifyContent:"center",padding:obrigatorio?24:0}}>
    <div style={{background:C.card,width:"100%",maxWidth:420,borderRadius:obrigatorio?24:"24px 24px 0 0",padding:"28px 22px calc(22px + env(safe-area-inset-bottom))",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center",boxShadow:"0 -10px 40px rgba(0,0,0,0.25)"}}>
      <div style={{width:70,height:70,borderRadius:"50%",background:`rgba(${C.yRgb},0.16)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.yd}}><Ic n="foguete" size={34} w={1.9}/></div>
      <p style={{color:C.t,fontSize:20,fontWeight:800,margin:0}}>Nova versão do app</p>
      <p style={{color:C.s,fontSize:14,margin:"0 0 8px",lineHeight:1.5}}>{CFG.versao_texto||(obrigatorio?"Para continuar usando o app da Oryx, atualize para a versão mais nova.":"Tem novidade no app da Oryx! Atualize para aproveitar.")}</p>
      <Btn label="Atualizar agora" onClick={abrirLoja}/>
      {!obrigatorio&&<button onClick={onDepois} style={{background:"none",border:"none",color:C.s,fontSize:14,padding:10,cursor:"pointer"}}>Agora não</button>}
    </div>
  </div>
);

const TABS=["home","boleto","velocidade","apps","wifi","suporte"];
const TLABELS={home:"Início",boleto:"Boleto",velocidade:"Velocidade",apps:"Meus Apps",wifi:"Wi-Fi",suporte:"Suporte"};
const TICONS={home:Ico.home,boleto:Ico.boleto,velocidade:Ico.velocidade,apps:Ico.apps,wifi:Ico.wifi,suporte:Ico.suporte};

// ─── APP ───
// no celular (APK) ou no navegador (Central do Assinante no site)
const ehNativo=()=>{ try{ const cap=window.Capacitor; return !!(cap&&cap.isNativePlatform&&cap.isNativePlatform()); }catch(e){ return false; } };
// ─── NOTIFICAÇÕES PUSH (Firebase) ───
// Um ouvinte só, para o app inteiro: ele sempre usa o login atual. Antes, cada login somava
// um ouvinte novo e o token também era enviado com o CPF de logins anteriores (o n8n recusava).
const PUSH={cpf:"",contrato:"",ouvindo:false};
const registrarPush=async(cpf,contratoId)=>{
  PUSH.cpf=String(cpf||"").replace(/\D/g,""); PUSH.contrato=String(contratoId||"");
  try{
    const cap=window.Capacitor;
    if(!cap||!cap.isNativePlatform||!cap.isNativePlatform())return; // só no celular
    const {PushNotifications}=await import("@capacitor/push-notifications");
    let perm=await PushNotifications.checkPermissions();
    if(perm.receive!=="granted") perm=await PushNotifications.requestPermissions();
    if(perm.receive!=="granted")return;
    if(!PUSH.ouvindo){
      PUSH.ouvindo=true;
      PushNotifications.addListener("registration",async(t)=>{
        if(!PUSH.cpf||!SESSAO)return;
        try{await api("app-token",{cpf:PUSH.cpf,contrato:PUSH.contrato,token:t.value,plataforma:"android"});}catch(e){}
      });
    }
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
  const [aviso,setAviso]=useState("");
  const onAuth=(a)=>{ SESSAO=a.sessao||""; setAviso(""); setConta(a); if(a.contratos.length===1){ setCliente(mkCliente(a,a.contratos[0])); preCarregar(mkCliente(a,a.contratos[0])); setScreen("main"); salvarSessao(a,a.contratos[0].contratoId); registrarPush(a.cpf,a.contratos[0].contratoId); } else { setScreen("selecao"); salvarSessao(a,null); } };
  const escolher=(ct)=>{ setCliente(mkCliente(conta,ct)); preCarregar(mkCliente(conta,ct)); setScreen("main"); salvarSessao(conta,ct.contratoId); registrarPush(conta.cpf,ct.contratoId); };
  const refreshCliente=async()=>{
    if(!conta||!cliente)return;
    try{
      const d=await api("app-login",{cpf:conta.cpf,senha:conta.senha});
      let contratos=null;
      if(d&&d.ok!==false&&Array.isArray(d.contratos)&&d.contratos.length) contratos=d.contratos;
      else if(d&&d.ok!==false&&(d.contratoId||d.nome)) contratos=[{contratoId:d.contratoId,clienteId:d.clienteId,plano:d.plano,status:d.status,vencimento:d.vencimento,valorAberto:d.valorAberto,titulos:d.titulos,pendencia:d.pendencia,termoAssinado:d.termoAssinado,termoUrl:d.termoUrl,termoPdf:d.termoPdf}];
      if(!contratos)return;
      // cada atualização renova a chave de sessão (mais 30 dias)
      const nc={...conta,nome:d.nome||conta.nome,contratos,sessao:d.sessao||conta.sessao||""};
      SESSAO=nc.sessao;
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
      SESSAO=s.conta.sessao||"";
      setConta(s.conta);
      const ct=s.contratoId?s.conta.contratos.find(x=>String(x.contratoId)===String(s.contratoId)):null;
      if(ct){ setCliente(mkCliente(s.conta,ct)); preCarregar(mkCliente(s.conta,ct)); setScreen("main"); registrarPush(s.conta.cpf,ct.contratoId); }
      else if(s.conta.contratos.length===1){ setCliente(mkCliente(s.conta,s.conta.contratos[0])); preCarregar(mkCliente(s.conta,s.conta.contratos[0])); setScreen("main"); registrarPush(s.conta.cpf,s.conta.contratos[0].contratoId); }
      else { setScreen("selecao"); }
    }
  },[]);
  // configuração do painel: chega ao abrir o app e fica guardada para a próxima vez
  const [,setCfgVersao]=useState(0);
  const [depois,setDepois]=useState(false);
  useEffect(()=>{ configPronta.then(c=>{ if(!c)return; CFG={...PADRAO,...c}; try{localStorage.setItem(CKEY,JSON.stringify(c));}catch(e){} setCfgVersao(v=>v+1); }); },[]);
  Object.assign(C, themes[theme], acento());
  const toggleTheme=()=>setTheme(t=>t==="light"?"dark":"light");
  const goTo=(s)=>{if(!ligado(s))return; if(TABS.includes(s)){setTab(s);setScreen("main");}else setScreen(s);};
  const abas=TABS.filter(ligado);
  const obrigatorio=APP_BUILD>0&&Number(CFG.versao_minima||0)>APP_BUILD;
  const sugerir=!obrigatorio&&!depois&&APP_BUILD>0&&Number(CFG.versao_atual||0)>APP_BUILD;
  const goBack=()=>{setScreen("main");setTab("home");};
  const goLogin=()=>{SESSAO="";limparSessao();limparCache();setScreen("login");setTab("home");setCliente(null);setConta(null);};
  // n8n recusou a chave (venceu ou foi trocada): volta para o login com um aviso
  aoExpirarSessao=()=>{ goLogin(); setAviso("Sua sessão expirou. Entre novamente."); };
  // quem já estava logado antes desta versão ainda não tem chave: busca uma agora
  useEffect(()=>{ if(conta&&cliente&&!conta.sessao) refreshCliente(); },[conta&&conta.sessao,cliente&&cliente.contratoId]);
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
    <div style={{position:"fixed",inset:0,maxWidth:520,margin:"0 auto",boxShadow:"0 0 40px rgba(0,0,0,0.12)",background:C.bg,display:"flex",flexDirection:"column",fontFamily:"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"}}>
      <EstilosGlobais/>
      {/* área de conteúdo — ocupa o espaço disponível e rola */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingTop:"env(safe-area-inset-top)"}}>
        <AvisoApp/>
        {screen==="login"&&<Login key={aviso} aviso={aviso} onAuth={onAuth} theme={theme} toggleTheme={toggleTheme} onPrimeiro={()=>setScreen("primeiro")}/>}
        {screen==="primeiro"&&<PrimeiroAcesso onVoltar={()=>setScreen("login")}/>}
          {screen==="selecao"&&conta&&<SelectContrato conta={conta} onEscolher={escolher} onSair={goLogin} theme={theme} toggleTheme={toggleTheme}/>}
        {screen!=="login"&&screen!=="selecao"&&screen!=="primeiro"&&cliente&&screenMap[isMain?tab:screen]}
      </div>
      {/* barra de abas fixa no rodapé, respeitando o gesto do Android */}
      {screen!=="login"&&screen!=="selecao"&&screen!=="primeiro"&&!(isMain&&tab==="home")&&(
        <div style={{display:"flex",background:C.nav,borderTop:`1px solid ${C.line}`,padding:"8px 0 calc(4px + env(safe-area-inset-bottom))",flexShrink:0}}>
          {abas.map(t=>(
            <button key={t} onClick={()=>{setTab(t);setScreen("main");}} aria-current={tab===t&&isMain?"page":undefined} style={{flex:1,minHeight:52,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"6px 0",color:tab===t&&isMain?C.y:C.t3,transition:"color 0.2s"}}>
              {TICONS[t](tab===t&&isMain)}
              <span style={{fontSize:11,fontWeight:tab===t&&isMain?700:500}}>{TLABELS[t]}</span>
              {tab===t&&isMain&&<div style={{width:18,height:3,background:C.y,borderRadius:99}}/>}
            </button>
          ))}
        </div>
      )}
      {(obrigatorio||sugerir)&&<AtualizarApp obrigatorio={obrigatorio} onDepois={()=>setDepois(true)}/>}
    </div>
  );
}
