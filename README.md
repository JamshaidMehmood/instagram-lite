# Instagram Lite

A small Instagram-style app: photo posts, likes, comments and profiles.

- **`Backend/`** — Express + TypeScript + MongoDB (Mongoose, GridFS)
- **`post-application/`** — React + TypeScript + MUI + Redux Toolkit Query

---

## Running it locally

You need Node 20+ and a MongoDB instance (local `mongod` or an Atlas cluster).

### 1. API

```bash
cd Backend
npm install
npx playwright install chromium   # one-time: browser used to fetch seed photos
cp .env.example .env              # then fill in the two JWT secrets
npm run seed                      # optional: 4 users, 8 posts, likes and comments
npm run dev                       # http://localhost:5000
```

Generate the secrets with `openssl rand -base64 48`. The app validates its
environment at boot and refuses to start if anything is missing or malformed,
so a bad `.env` fails immediately rather than on the first request that needs it.

`npm run seed` downloads real photographs with Playwright (see
[`src/scripts/fetchPhotos.ts`](Backend/src/scripts/fetchPhotos.ts)) — it drives
a headless Chromium to pull genuine Unsplash images from Lorem Picsum, cropped
to each post's aspect ratio, then pushes them through the same GridFS upload
path a real user hits. The photos are cached under `seed-assets/` (gitignored),
so only the first seed needs the network and the browser.

After seeding, the fastest way in is the **demo account**:

| Email               | Password   |
| ------------------- | ---------- |
| `demo@example.com`  | `Demo1234` |

The sign-in page also has a **"Try the demo account"** button that logs in with
these in one click. The demo user already has its own posts plus likes and
comments, so the feed and its profile are populated straight away. The other
seeded members — `ayesha@`, `bilal@`, `hina@`, `usman@`, `sara@`, `zain@`,
`mariam@` (`@example.com`) — all use the password `Password1`.

### 2. Web

```bash
cd post-application
npm install
npm start                     # http://localhost:3000
```

`REACT_APP_API_URL` in `.env.development` points the SPA at the API.

---

## API

All routes are under `/api/v1`. Responses are `{ data, meta? }` on success and
`{ error: { code, message, details? } }` on failure.

| Method   | Route                     | Auth      | Notes                                     |
| -------- | ------------------------- | --------- | ----------------------------------------- |
| `POST`   | `/auth/signup`            | –         | Returns a session                         |
| `POST`   | `/auth/login`             | –         |                                           |
| `POST`   | `/auth/refresh`           | cookie    | Rotates the refresh token                 |
| `POST`   | `/auth/logout`            | cookie    |                                           |
| `GET`    | `/auth/me`                | bearer    |                                           |
| `GET`    | `/posts`                  | optional  | Cursor-paginated feed                     |
| `POST`   | `/posts`                  | bearer    | `multipart/form-data`: `image`, `caption`, `location` |
| `GET`    | `/posts/:id`              | optional  |                                           |
| `DELETE` | `/posts/:id`              | bearer    | Author only                               |
| `POST`   | `/posts/:id/likes`        | bearer    | Idempotent                                |
| `DELETE` | `/posts/:id/likes`        | bearer    | Idempotent                                |
| `GET`    | `/posts/:id/likes`        | –         |                                           |
| `GET`    | `/posts/:id/comments`     | optional  | Cursor-paginated                          |
| `POST`   | `/posts/:id/comments`     | bearer    |                                           |
| `DELETE` | `/comments/:commentId`    | bearer    | Comment author or post author             |
| `GET`    | `/users/:username`        | optional  |                                           |
| `GET`    | `/users/:username/posts`  | optional  | Cursor-paginated                          |
| `GET`    | `/media/:id`              | –         | Streams from GridFS, cached immutably     |

`GET /health` reports process uptime and database connectivity.

---

## Design notes

**Images live in GridFS, not in the post document.** A post stores a 12-byte
ObjectId, so a feed page is a few hundred bytes per post rather than megabytes
of base64, and no post can approach the 16 MB BSON limit. Dimensions are parsed
from the file header at upload so the client can reserve the right box before
the image loads — that is what keeps the feed from reflowing as you scroll.

**Pagination is keyset, not `skip`.** `skip` walks and discards every skipped
document, and it double-serves or drops rows when items are inserted mid-page,
which is exactly what an append-heavy feed does. Cursors key off
`(createdAt, _id)` and are O(index seek) at any depth.

**One page of posts costs three queries** regardless of page size: the
paginated `find`, the `populate` batch for authors, and a single `$in` lookup
that resolves "which of these has the viewer liked?".

**Concurrency is handled by indexes, not by read-then-write.** A unique index
on `{ post, user }` is what makes double-liking impossible; the service inserts
unconditionally and treats duplicate-key as "already liked". Counters move with
atomic `$inc` alongside the write that changes them.

**Refresh tokens rotate and detect reuse.** Access tokens live 15 minutes in
memory only; the long-lived credential is an httpOnly cookie that JavaScript
cannot read. Replaying an already-rotated token revokes the whole token family.

**Every design value comes from `src/theme/tokens.ts`.** No component contains
a raw hex code, so light/dark mode and any rebrand are one-file changes.

---

## Scripts

| Directory          | Command             | Does                                  |
| ------------------ | ------------------- | ------------------------------------- |
| `Backend`          | `npm run dev`       | Watch mode via tsx                    |
| `Backend`          | `npm run build`     | Compile to `dist/`                    |
| `Backend`          | `npm start`         | Run the compiled server               |
| `Backend`          | `npm run typecheck` | `tsc --noEmit`                        |
| `Backend`          | `npm run seed`      | Reset and populate a dev database     |
| `post-application` | `npm start`         | Dev server                            |
| `post-application` | `npm run build`     | Production bundle                     |
| `post-application` | `npm run typecheck` | `tsc --noEmit`                        |
