# Aplikacja Pamiętnik – Backend (Express) + Frontend (React + Vite)

Krótki przewodnik uruchomienia lokalnie i wdrożenia na VPS (Nginx + Cloudflare).
Repo zawiera dwie części: `Backend/` (API) i `Frontend/` (aplikacja React).

## Wymagania

- Node.js 20+
- PostgreSQL 14+ (lokalnie i/lub na VPS)
- Nginx (prod), PM2 (prod), opcjonalnie Cloudflare (proxy + cert Origin)

## Zmienne środowiskowe

Backend (`Backend/.env`):

- `FRONTEND_URL=frontend_url`
- `DB_HOST=localhost`
- `DB_PORT=5432`
- `DB_NAME=<nazwa_bazy>`
- `DB_USER=<uzytkownik>`
- `DB_PASSWORD=<haslo>`
- `JWT_SECRET=<tajny_klucz>`
- `API_KEY=<klucz_api>`

Frontend (`Frontend/.env`):

- `VITE_BACKEND_URL=backend_url`

## Uruchomienie lokalne

Backend:

```bash
cd Backend
npm install
# migracje/seed wg potrzeb
# npx knex migrate:latest --knexfile ./knexfile.js
# npx knex seed:run --knexfile ./knexfile.js
npm run dev
```

Domyślnie: `http://localhost:5000`.

Frontend:

```bash
cd Frontend
npm install
npm run dev
```

Dev: `http://localhost:5173`.

## Build produkcyjny (skrót)

Frontend (Vite build):

```bash
cd Frontend
npm ci || npm install
npm run build  # wynik w Frontend/dist
```

Backend (PM2):

```bash
cd Backend
npm ci || npm install
pm2 start server.js --name backend
pm2 save
pm2 startup  # uruchom wskazaną komendę
```

Nginx (schemat):

- Frontend (443) serwuje `Frontend/dist` + redirect 80→443
- API (443) proxy do `http://localhost:5000` + redirect 80→443
- SSL:
  - Opcja A: Cloudflare Origin Certificate na VPS + Cloudflare SSL „Full” (rekordy DNS proxowane – pomarańczowa chmurka)
  - Opcja B: Let’s Encrypt (webroot/standalone) i standardowe ścieżki certów

Ważne: w `Backend/server.js` włączone jest `app.set('trust proxy', 1)` (wymagane przy Nginx/Cloudflare, m.in. dla rate‑limit/IP).

## Testy (Vitest + Supertest)

Nigdy nie uruchamiaj testów na produkcyjnej bazie. Użyj oddzielnej bazy testowej i `NODE_ENV=test`:

```bash
# przykład tworzenia bazy i użytkownika testowego
sudo -u postgres psql <<'SQL'
CREATE USER diary_test_user WITH PASSWORD 'TestDb#2025';
CREATE DATABASE diary_ai_test OWNER diary_test_user;
GRANT ALL PRIVILEGES ON DATABASE diary_ai_test TO diary_test_user;
SQL

# migracje dla środowiska testowego
cd Backend
NODE_ENV=test DB_HOST=localhost DB_PORT=5432 DB_NAME=diary_ai_test \
DB_USER=diary_test_user DB_PASSWORD='TestDb#2025' \
npx knex migrate:latest --knexfile ./knexfile.js

# uruchom wybrane testy
NODE_ENV=test DB_HOST=localhost DB_PORT=5432 DB_NAME=diary_ai_test \
DB_USER=diary_test_user DB_PASSWORD='TestDb#2025' \
npx vitest run __tests__/auth.test.js
```

## Częste problemy i rozwiązania

- „ERR_SSL_VERSION_OR_CIPHER_MISMATCH” – rekord DNS nie jest proxowany przez Cloudflare lub tryb SSL niepasujący do certyfikatu origin. Ustaw „Full”, włącz TLS 1.3, Minimum TLS 1.2 i proxy (pomarańczowa chmurka).
- ACME 404 (Let’s Encrypt) – upewnij się, że `location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }` jest wewnątrz bloku `server` (80) vhostów frontu i API.
- CORS – `FRONTEND_URL` w `Backend/.env` musi wskazywać właściwą domenę frontu (z protokołem).
- Rate limit/Forwarded IP – wymagane `app.set('trust proxy', 1)` za Nginx/Cloudflare.
- Knex „relation does not exist” – uruchom migracje w aktywnym środowisku (sprawdź `NODE_ENV`).

## Dodatkowe wskazówki

- PgAdmin4 do bazy na VPS najlepiej przez tunel SSH: `ssh -L 5433:127.0.0.1:5432 user@vps -N`, a w PgAdmin host `127.0.0.1`, port `5433`.
- Po zmianie `.env` w Frontend – wykonaj ponowny build. Po publikacji włącz „Purge Everything” w Cloudflare (cache).

---

W razie pytań: sprawdź logi Nginx (`/var/log/nginx/error.log`) i PM2 (`pm2 logs backend`), a w Backend: `Backend/logs/`.
