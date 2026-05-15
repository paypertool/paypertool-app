# Ghid migrare PayPerTool — de la zero la producție

Ghid pas-cu-pas în română, scris pentru începători. Te ia de la „nu am nimic"
la „am proiectul rulat în producție pe contul meu, cu identitate complet
nouă, gata de lansat public".

**Timp estimat total:** 3-5 ore (incluzând timpul de așteptare pentru emailuri
de confirmare etc.). Nu e nevoie să faci tot într-o singură sesiune — fiecare
pas e independent.

**Convenție:** comenzile pe care le rulezi în terminal arată așa:
```bash
pnpm install
```
Tot ce e între `<>` înlocuiești cu valoarea ta (ex: `<emailul-tău>`).

---

## Pas 0 — Conturi noi (în această ordine!)

Ordinea contează: ai nevoie de mail înainte de orice, GitHub înainte de npm,
wallet înainte de Railway.

### 0.1 Email nou

Recomandare: **ProtonMail** (gratuit, în Elveția, bun pentru context crypto)
sau **Gmail** dacă vrei familiaritate.

- Mergi pe https://proton.me sau https://gmail.com
- Creează cont nou. Folosește un nume legat de produs (ex:
  `paypertool.dev@proton.me`, `team.paypertool@gmail.com`).
- **Activează 2FA imediat** (autentificare în 2 pași). Folosește o aplicație
  gen Google Authenticator sau Authy, NU SMS.
- Salvează codurile de recuperare într-un manager de parole (Bitwarden e
  gratis și recomandat).

### 0.2 Cont GitHub nou

- https://github.com/signup
- Folosește mailul nou de la 0.1.
- Username: ceva legat de produs sau brand-ul tău (ex: `paypertool`,
  `paypertool-dev`).
- **Activează 2FA** (Settings → Password and authentication → Enable 2FA).
- Pe pagina de profil → New repository:
  - Name: `paypertool`
  - Visibility: **Public** (vrei să fie indexat de search engines)
  - Nu bifa „Initialize with README" — îl ai deja în ZIP.
  - Click Create.

### 0.3 Wallet nou (MetaMask)

Wallet-ul ăsta primește banii de la useri. **Cheia privată stă DOAR la tine,
niciodată în cod, niciodată pe server.** Serverul folosește doar adresa
publică.

- Instalează extensia MetaMask: https://metamask.io/download/
- **Create new wallet** (NU import — vrei wallet nou, complet separat).
- **SCRIE pe hârtie cele 12 cuvinte** (seed phrase). Pune hârtia într-un
  loc sigur. Dacă pierzi cele 12 cuvinte și pierzi accesul la laptop,
  banii dispar pentru totdeauna. Niciun support nu te poate ajuta.
- **NU le pune în Notes, în Drive, în Telegram. Doar pe hârtie.**
- Adaugă rețeaua Base:
  - MetaMask → Networks → Add network → Add manually
  - Network name: `Base`
  - RPC URL: `https://mainnet.base.org`
  - Chain ID: `8453`
  - Currency symbol: `ETH`
  - Block explorer: `https://basescan.org`
- Adaugă tokenul USDC pe Base:
  - În MetaMask, asigură-te că ești pe rețeaua Base (selectorul de sus).
  - Click pe „Tokens" → „Import tokens" → paste:
    `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - Symbol va apărea automat „USDC". Save.
- **Notează adresa publică a wallet-ului** (începe cu `0x...`, 42 caractere
  total). O să o folosești la Pas 3.

### 0.4 Cont npm nou

- https://www.npmjs.com/signup
- Folosește mailul nou. Username: ceva legat de tine personal (ex:
  `paypertool-dev`, `tudor-paypertool`).
- **Activează 2FA** (account settings → security → enable 2FA).
- Creează organizația:
  - Click pe avatarul tău (sus dreapta) → „Add an organization"
  - Plan: Free
  - Org name: `paypertool` (același nume ca pachetul vechi — îl vei
    elibera la Pas 7)
  - Members: doar tu pentru moment.
- **Generează un token de acces** (îl vei folosi la publish):
  - Avatar → Access Tokens → Generate new token → **Granular Access Token**
  - Name: `paypertool-publish`
  - Expiration: 90 days
  - Packages and scopes: Read and write → selectează `@paypertool` (tot scope-ul)
  - Bypass two-factor authentication: **DA, bifează** (altfel publish-ul va
    cere confirmare în browser de fiecare dată)
  - Click Generate. **Copiază token-ul ACUM** (începe cu `npm_...`). Nu îl
    mai vezi niciodată după ce închizi pagina. Salvează-l în managerul de
    parole.

### 0.5 Cont Railway nou

- https://railway.app
- Sign in with GitHub — folosește contul GitHub nou de la 0.2.
- Vei primi $5 credit/lună gratuit (suficient pentru un proiect mic).
- **Adaugă card** doar dacă vrei să depășești $5/lună. Pentru început NU e
  nevoie.

---

## Pas 1 — Setup pe laptopul tău

### 1.1 Instalează tools

**Node.js 24** (versiunea exactă a proiectului):
- Mac/Linux: instalează `nvm` (Node Version Manager) de aici
  https://github.com/nvm-sh/nvm, apoi:
  ```bash
  nvm install 24
  nvm use 24
  ```
- Windows: descarcă direct de aici https://nodejs.org/en/download (alege LTS 24)

Verifică:
```bash
node --version    # trebuie să zică v24.x.x
```

**pnpm 9** (package manager-ul folosit de proiect):
```bash
npm install -g pnpm@9
pnpm --version    # trebuie să zică 9.x.x
```

**git** (pentru push pe GitHub):
- Mac: vine cu Xcode Command Line Tools (`xcode-select --install`)
- Windows: https://git-scm.com/download/win
- Linux: `sudo apt install git`

Verifică: `git --version`

**Editor cod**: VS Code https://code.visualstudio.com/ (recomandat, dar
oricare merge).

### 1.2 Configurează git cu identitatea nouă

```bash
git config --global user.name "<numele-tău>"
git config --global user.email "<emailul-nou-de-la-0.1>"
```

Generează cheie SSH pentru GitHub (mai sigur decât HTTPS+token):
```bash
ssh-keygen -t ed25519 -C "<emailul-nou>"
# Apasă Enter la toate (acceptă defaults)
```

Afișează cheia publică:
```bash
cat ~/.ssh/id_ed25519.pub    # Mac/Linux
type %USERPROFILE%\.ssh\id_ed25519.pub    # Windows cmd
```

Copiază tot output-ul. Pe GitHub: Settings → SSH and GPG keys → New SSH key
→ paste → Save.

Test:
```bash
ssh -T git@github.com    # ar trebui să zică "Hi <username>!"
```

---

## Pas 2 — Dezarhivează și pregătește proiectul

```bash
cd ~/Desktop    # sau unde vrei să trăiască proiectul
unzip paypertool-export.zip
mv paypertool-export paypertool
cd paypertool
```

Inițializează git local:
```bash
git init -b main
git add .
git commit -m "Initial commit — fork from PayPerTool"
```

---

## Pas 3 — Schimbă wallet-ul receiver în cod

**Aici se decide unde ajung banii.** Schimbi adresa publică (NU cheia
privată) într-un singur fișier.

Deschide în VS Code:
```
artifacts/api-server/src/lib/x402-config.ts
```

Caută linia 8, vei vedea:
```ts
export const RECEIVER_ADDRESS =
  "0xD54173d0708d16bBe17A8a1156e66460aE872Ff7" as Address;
```

Înlocuiește cu adresa publică a wallet-ului tău nou (de la Pas 0.3):
```ts
export const RECEIVER_ADDRESS =
  "0x<adresa-ta-publică-de-42-caractere>" as Address;
```

**Verifică de 2 ori adresa.** O literă greșită = banii ajung la o adresă
moartă, imposibil de recuperat.

Salvează fișierul. Commit:
```bash
git add artifacts/api-server/src/lib/x402-config.ts
git commit -m "Update receiver wallet to new identity"
```

> **Notă pentru viitor:** poți schimba wallet-ul ori de câte ori vrei.
> Doar repeți pașii de mai sus + push pe GitHub. Railway redeploys automat
> în ~60 secunde.

---

## Pas 4 — Test local (opțional dar recomandat)

Acum ai proiectul curat cu wallet-ul tău. Înainte să-l urci, hai să te
asiguri că pornește pe laptop.

### 4.1 Postgres local (sau Neon free)

**Varianta simplă — Neon free tier (online, fără instalare):**
- https://neon.tech → Sign up cu emailul nou
- Create project → Region: cel mai apropiat de tine (Frankfurt pentru EU)
- După create, vei vedea „Connection string". Copiază-l (începe cu
  `postgresql://...`).

**Varianta locală (dacă preferi):**
- Mac: `brew install postgresql@16 && brew services start postgresql@16`
- Linux: `sudo apt install postgresql && sudo systemctl start postgresql`
- Windows: https://www.postgresql.org/download/windows/

Apoi creează baza:
```bash
psql -U postgres -c "CREATE DATABASE paypertool;"
```

### 4.2 Configurează `.env`

```bash
cp .env.example .env
```

Deschide `.env` în editor și completează:
- `DATABASE_URL` = string-ul de la Neon SAU `postgres://postgres:postgres@localhost:5432/paypertool`
- `SESSION_SECRET` = generează cu `openssl rand -hex 32` (Mac/Linux) sau
  ia un string random de 64 caractere de pe https://generate-secret.now.sh/64
- `X402_NETWORK` = `base-sepolia` pentru test (NU mainnet local!)
- `PORT` = `8080`

### 4.3 Instalează dependențele și pornește

```bash
pnpm install
# Așteaptă 2-3 min, descarcă tot necesar
```

Rulează migrările bazei de date:
```bash
pnpm --filter @workspace/db run db:push
```

Pornește serverul:
```bash
pnpm --filter @workspace/api-server run dev
```

În alt terminal, pornește landing-ul:
```bash
pnpm --filter @workspace/web run dev
```

Deschide browser-ul:
- Landing: http://localhost:5173 (sau ce port îți zice Vite)
- API health: http://localhost:8080/api/healthz

Dacă vezi „ok" pe healthz și landing-ul se încarcă → totul funcționează.
Oprește serverele cu Ctrl+C.

---

## Pas 5 — Push pe GitHub nou

```bash
git remote add origin git@github.com:<username-ul-tău>/paypertool.git
git branch -M main
git push -u origin main
```

Verifică pe github.com că vezi codul.

---

## Pas 6 — Deploy pe Railway

### 6.1 Creează proiect

- https://railway.app → New Project → Deploy from GitHub repo
- Selectează `<username>/paypertool`
- Railway detectează automat `nixpacks.toml` și `railway.json`. Builds-ul
  pornește singur.

### 6.2 Adaugă Postgres

În proiectul Railway:
- Click „+ New" → Database → Add PostgreSQL
- Așteaptă ~30s să se provisioneze
- Click pe baza nouă → Variables → vei vedea `DATABASE_URL` generat
  automat. Nu trebuie să-l copiezi — Railway îl injectează singur în
  serviciul tău (vezi pasul următor).

### 6.3 Variabile de mediu

Click pe serviciul `paypertool` (nu pe Postgres) → Variables → adaugă:

| Variabilă | Valoare |
|---|---|
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` (referință — Railway o leagă automat) |
| `SESSION_SECRET` | string random 64 caractere |
| `X402_NETWORK` | `base` (sau `base-sepolia` dacă vrei să testezi mai întâi) |
| `NODE_ENV` | `production` |

> **Important — `DATABASE_URL` e obligatoriu.** În Postgres se țin DOUĂ
> lucruri persistente: (1) memoria pe sesiune a tool-ului `agent_memory`
> și (2) contorul live de pe landing (`X calls / $Y paid`). Fără DB,
> contorul resetează la 0 la fiecare redeploy și `agent_memory` nu
> funcționează. Tabelele se creează automat la prima cerere — nu trebuie
> să rulezi migrări manuale.

Opționale (doar dacă vrei tools-urile cu LLM):
- `OPENAI_API_KEY` — cheia ta OpenAI

### 6.4 Domeniu public

Settings → Networking → Generate Domain. Vei primi ceva gen
`paypertool-production-xxxx.up.railway.app`. Notează-l.

### 6.5 Update healthcheck (deja e setat în railway.json, sări dacă e OK)

Railway va aștepta `/api/healthz` să răspundă 200. Build-ul + deploy-ul
durează ~2-3 min prima dată. Vezi log-uri live în tab-ul „Deployments".

### 6.6 Test producție

```bash
curl https://<noul-tău-domeniu>.up.railway.app/api/healthz
curl https://<noul-tău-domeniu>.up.railway.app/api/tools
```

Al doilea ar trebui să returneze JSON cu cele 12 tools și `"network":"base"`.

---

## Pas 7 — Eliberare nume npm vechi + publish nou

**Atenție la timing:** ai 72h de la publish-ul vechi (ora ~21:30 ora României,
14 mai 2026) ca unpublish-ul să fie instant. După, trebuie tichet la npm
support (durează zile).

### 7.1 Logout npm vechi (dacă ești logat)

```bash
npm logout
npm whoami    # ar trebui să zică "not logged in"
```

### 7.2 Login pe contul vechi temporar pentru unpublish

(Doar dacă ai acces la el. Dacă nu ai, sări și creează direct cu nume nou,
gen `@paypertool-io/mcp` sau `@paypertool-dev/mcp`.)

```bash
npm login
# Email vechi, parola veche, OTP din authenticator
npm unpublish @paypertool/mcp --force
# "force" e cerut pentru că pachetul are versiuni publicate
npm logout
```

Verifică: deschide https://www.npmjs.com/package/@paypertool/mcp — trebuie
să vezi „This package has been removed".

### 7.3 Login pe contul npm nou

```bash
npm login
# Email nou, parola nouă, OTP din authenticator
```

Sau folosește token-ul de la Pas 0.4 (mai simplu pentru CI):
```bash
echo "//registry.npmjs.org/:_authToken=<token-ul-tău-npm>" > ~/.npmrc
```

### 7.4 Build și publish pachetul

```bash
cd lib/paypertool-mcp
pnpm run build
npm publish --access public
```

Ar trebui să vezi `+ @paypertool/mcp@0.1.1`.

Verifică: https://www.npmjs.com/package/@paypertool/mcp (poate dura 5-10 min
să apară în UI, dar registry-ul îl servește instant).

**Test rapid că merge:**
```bash
npx -y @paypertool/mcp --help
# Ar trebui să afișeze ajutorul CLI-ului
```

Curăță token-ul din `~/.npmrc` dacă ai folosit metoda cu token:
```bash
rm ~/.npmrc
```

---

## Pas 8 — Update landing cu noul domeniu

Pe landing snippet-ul de install conține URL-ul Railway-ului. Trebuie
actualizat la noul domeniu.

Editează:
```
artifacts/web/src/pages/Home.tsx
```

Caută `web-production-a4921.up.railway.app` (Ctrl+F). Vor fi 2-3 ocurențe.
Înlocuiește toate cu noul tău domeniu de la Pas 6.4.

Editează și:
```
lib/paypertool-mcp/src/cli.ts
```

Caută aceeași string. Înlocuiește. Asta face ca pachetul npm să folosească
noul tău server ca default.

Apoi:
```bash
git add -A
git commit -m "Point landing and MCP CLI to new Railway domain"
git push
```

Railway redeploys automat în ~60s. Verifică landing-ul nou.

**Bumpează și pachetul npm la 0.1.2** (pentru că ai schimbat default-ul
URL):
```bash
cd lib/paypertool-mcp
# editează package.json: "version": "0.1.2"
# editează src/index.ts: version: "0.1.2"
pnpm run build
npm publish --access public
```

---

## Pas 9 — Smoke test mainnet

Acum ai serverul live cu wallet-ul tău. Hai să confirmăm că o plată reală
trece end-to-end.

### 9.1 Pregătește wallet de test (NU cel receiver!)

Ai nevoie de un al doilea wallet, doar pentru test. Creează un nou cont
în MetaMask (icon avatar dreapta sus → Add account). Acesta va fi
„cumpărătorul".

### 9.2 Trimite USDC pe Base mainnet la wallet-ul de test

Ai nevoie de ~$0.50 USDC + ~$0.30 ETH (pentru gas) pe Base mainnet în
wallet-ul de test.

Cele mai simple opțiuni:
- Cumpără ETH pe Coinbase, withdraw direct pe Base (gratuit, 1 min)
- Sau bridge de pe alt L2 cu https://bridge.base.org

### 9.3 Configurează MCP-ul cu wallet-ul de test

Pe laptop-ul tău, extrage cheia privată a wallet-ului de test:
- MetaMask → click pe contul de test → 3 puncte → Account details →
  Show private key → introdu parola

> **Foarte important:** NU folosi cheia privată a wallet-ului receiver
> aici. Niciodată. Receiver-ul doar primește bani; cheia lui nu trebuie
> să atingă vreodată un calculator conectat la internet.

În Claude Desktop, deschide:
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Adaugă:
```json
{
  "mcpServers": {
    "paypertool": {
      "command": "npx",
      "args": ["-y", "@paypertool/mcp"],
      "env": {
        "PAYPERTOOL_PRIVATE_KEY": "0x<cheia-privată-de-test>",
        "PAYPERTOOL_NETWORK": "base",
        "PAYPERTOOL_BASE_URL": "https://<domeniul-tău-railway>.up.railway.app"
      }
    }
  }
}
```

Restartează Claude Desktop complet (Cmd+Q / Alt+F4, apoi redeschide).

### 9.4 Testează

În Claude, scrie:
> „Folosește tool-ul scrape_url ca să extragi conținutul de pe https://example.com"

Claude va:
1. Apela `scrape_url` pe serverul tău
2. Primi 402 Payment Required (pentru $0.005)
3. Semna automat plata cu wallet-ul de test
4. Retrimite request-ul cu header `X-PAYMENT`
5. Primi conținutul + header `X-PAYMENT-RESPONSE` cu tx hash

Verifică pe https://basescan.org/address/<adresa-receiver-ului-tău> că vezi
+0.005 USDC. Tx-ul apare în 2-3 secunde după call.

**Dacă vezi tx-ul → totul funcționează. Ești live.**

---

## Plan B — Dacă ceva pică

### Build pică pe Railway
- Verifică log-urile în tab-ul „Deployments"
- Cele mai comune cauze:
  - Lipsește `DATABASE_URL` — adaugă-l
  - Versiune Node greșită — `nixpacks.toml` îl forțează la 24, dar verifică
- Dacă build-ul trece dar healthcheck pică, e probabil DB connection. Verifică
  variabila e legată corect (`${{ Postgres.DATABASE_URL }}`).

### `pnpm install` pică local
- Șterge `node_modules` și `pnpm-lock.yaml`, încearcă din nou
- Verifică `node --version` să fie 24.x

### npm publish dă „403 Forbidden"
- Token expirat sau scope greșit. Regenerează token la npm settings.
- Verifică că ai bifat „Bypass 2FA" la generare.

### Plata dă timeout pe mainnet
- Verifică `X402_NETWORK=base` (nu `base-mainnet`, nu `mainnet`)
- Verifică wallet-ul de test are ETH pentru gas
- Verifică facilitator-ul public x402.org e up: `curl https://x402.org/facilitator/verify`

### Vrei să schimbi wallet-ul receiver mai târziu
1. Editezi `artifacts/api-server/src/lib/x402-config.ts` linia 8
2. Commit + push
3. Railway redeploys în ~60s
4. Banii noi merg la wallet-ul nou. Banii vechi rămân la wallet-ul vechi.

### Vrei custom domain (paypertool.io în loc de railway.app)
1. Cumpără domeniul (Namecheap, Cloudflare, etc.)
2. Pe Railway: Settings → Networking → Custom Domain → adaugă-l
3. Railway îți zice ce DNS records să pui la registrar
4. Așteaptă propagare (5-60 min)
5. SSL automat de la Railway (Let's Encrypt)

---

## Întreținere ușoară

- **Update dependențe:** `pnpm update --latest` lunar, testezi local, push
- **Backup DB:** Railway Postgres are auto-backup. Dacă vrei manual:
  `pg_dump $DATABASE_URL > backup.sql`
- **Monitor uptime:** adaugă proiectul pe https://uptimerobot.com (free,
  notificare pe email dacă cade)
- **Rotire wallet:** la fiecare câteva mii $ acumulați, mută într-un cold
  wallet (Ledger). Nu ține totul pe MetaMask.

---

## Resurse utile

- **x402 spec:** https://x402.org
- **Coinbase x402 GitHub:** https://github.com/coinbase/x402
- **Base docs:** https://docs.base.org
- **MCP spec:** https://modelcontextprotocol.io
- **Railway docs:** https://docs.railway.app
- **ARCHITECTURE.md** și **RUNBOOK.md** din acest repo — mai detalii tehnice

---

## Cheatsheet — comenzi pe care le vei rula des

```bash
# Pull modificări de pe GitHub
git pull

# Modifici cod, commit, push (Railway redeploys automat)
git add -A && git commit -m "<ce-ai-schimbat>" && git push

# Test local înainte de push
pnpm --filter @workspace/api-server run dev

# Republish pachetul npm după modificări
cd lib/paypertool-mcp
# Bumpează version în package.json și src/index.ts
pnpm run build
npm publish --access public

# Vezi log-uri Railway în terminal
railway logs    # după ce instalezi: npm i -g @railway/cli && railway login
```

Succes la lansare.
