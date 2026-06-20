# DFNET Telecomunicações — App do Cliente

App do cliente da DFNET Telecomunicações (login por CPF, 2ª via de boleto, ordens de serviço,
desbloqueio de confiança e assinatura de contrato). Feito em React + Vite, empacotado
em APK Android com Capacitor e buildado na nuvem pelo GitHub Actions.

O app conversa com webhooks do n8n (ver `src/App.jsx`, constante `API_BASE`). O token
do SGP fica no n8n, nunca no app.

---

## Como gerar o APK (passo a passo)

Você NÃO precisa instalar nada na sua máquina. O APK é gerado na nuvem pelo GitHub.

### 1. Criar o repositório no GitHub
- Acesse https://github.com/new
- Nome: `dfnet-app` (ou o que preferir)
- Deixe **público** ou **privado** (tanto faz para o build funcionar)
- NÃO marque "Add a README" (já temos um)
- Clique em **Create repository**

### 2. Subir os arquivos
A forma mais simples, sem usar terminal:
- Na página do repositório recém-criado, clique em **uploading an existing file**
- Arraste TODOS os arquivos e pastas deste projeto (incluindo a pasta `.github` e a `src`)
- Clique em **Commit changes**

> Importante: a pasta `.github/workflows/` precisa subir junto — é ela que faz a mágica.
> Se o arrastar não incluir pastas ocultas, use a opção de upload de pasta ou o GitHub Desktop.

### 3. Aguardar o build
- Vá na aba **Actions** do repositório
- O workflow **Build APK** vai iniciar sozinho (ou clique em **Run workflow**)
- Espere uns 3 a 6 minutos até ficar com o ✓ verde

### 4. Baixar o APK
- Clique na execução que terminou (✓ verde)
- Lá embaixo, em **Artifacts**, baixe o `dfnet-app-apk`
- Dentro do .zip está o `app-debug.apk`

### 5. Instalar no celular
- Envie o `app-debug.apk` para o celular (WhatsApp, link, etc.)
- Ao abrir, o Android vai pedir para **permitir instalação de fontes desconhecidas** — autorize
- Pronto, o app instala

---

## Rodar no computador (opcional, para testar antes)

```bash
npm install
npm run dev
```

Abre em http://localhost:5173

---

## Configurações importantes

- **App ID (package Android):** `com.dfnet.cliente` — em `capacitor.config.json`
- **URL dos webhooks:** constante `API_BASE` no topo de `src/App.jsx`
  (⚠️ PENDENTE DFNET: trocar pela base de webhooks do n8n da DFNET — ver CONFIGURAR-DFNET.md)
- O APK gerado é **debug** (instalável, mas não assinado para a Play Store).
  Para publicar na Play Store é preciso gerar um `.aab` assinado — me avise quando chegar nessa fase.

## Próximos passos sugeridos
- Ícone e splash screen personalizados (logo da DFNET)
- Versão assinada (.aab) para a Play Store
- Ligar o `app-os-abrir` no endpoint real de criar OS do SGP
