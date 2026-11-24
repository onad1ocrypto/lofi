# Lofi Ice Escape

<p align="center">
  <img src="public/assets/aistudio/lofi-thumbnail_3eb5d1a2.png" alt="Lofi Ice Escape Thumbnail" width="100%" />
</p>

**Lofi Ice Escape** is a 3D browser snowboarding game built for the **Sui** ecosystem (**CLAY Hackathon III**). Play as **Lofi** and lead your growing crew of **Lil Yetis** down alpine slopes, carving past obstacles, hitting optional ramps, controlling speed on steep descents, and outrunning the avalanche to reach the warm **Shelter**.

- **Live Demo:** https://lofi-ice-escape.vercel.app
- **Demo Mode:** Playable immediately with no wallet required.
- **Sui Integration:** Optional Sui Wallet connection (Nightly, Slush, Backpack, OKX, Surf) for Rider Profile, Daily Check-In, 7 Claimable Badges, and Leaderboard.

---

## Screenshots

<p align="center">
  <img src="public/assets/aistudio/lofi-arena-reference_04be73df.png" alt="Lofi Ice Escape Gameplay Arena" width="48%" />
  <img src="public/assets/aistudio/lofi-arena-banner_b09e6e57.png" alt="Lofi The Yeti Arena Banner" width="48%" />
</p>
<p align="center">
  <img src="public/assets/aistudio/lofi-finish-celebration_5280b066.png" alt="Level Complete Celebration" width="48%" />
  <img src="public/assets/aistudio/lofi-game-over_00db1b57.png" alt="Avalanche Game Over" width="48%" />
</p>

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Steer Left / Right | `A` / `D` or `←` / `→` | On-screen steering |
| Brake (Steep Descent) | Hold `S` or `↓` | Hold **BRAKE** button |
| Jump / Trick | `Space` (on ramps) | On-screen jump |

---

## 10-Level Progression

Every completed level recruits **1 new Lil Yeti** at the Shelter to join your crew for the next run (`Level N = Lofi + N−1 Lil Yetis`):

1. **Level 1** — Lofi rides solo
2. **Level 2** — 1 Lil Yeti
3. **Level 3: First Drop** — Steep Descent & Brake introduction (2 Lil Yetis)
4. **Level 4: Carving Pass** — S-curve carving (3 Lil Yetis)
5. **Level 5: Drop & Jump** — Optional ramp vs. safe route (4 Lil Yetis)
6. **Level 6: Pine Slalom** — Zig-zag pine slalom (5 Lil Yetis)
7. **Level 7: Avalanche Alley** — Downhill, flat momentum, downhill (6 Lil Yetis)
8. **Level 8: Rock Garden** — Multi-route rock choices (7 Lil Yetis)
9. **Level 9: Double Drop** — Two steep descents with recovery (8 Lil Yetis)
10. **Level 10: Summit Run** — Final combined challenge (9 Lil Yetis)

---

## Sui Wallet Features

- **Demo Mode:** Full 10-level gameplay and continuous 3-track EDM soundtrack without a wallet.
- **Wallet Login (Wallet Standard):** Connect with **Nightly**, **Slush**, **Backpack**, **OKX Wallet**, or **Surf**.
- **Rider Profile:** Choose from 4 Lofi avatars, set a rider username (verified via `sui:signPersonalMessage`), and track progress.
- **Daily Check-In:** Sign daily with your Sui wallet to build your **Streak Fire** and earn points.
- **7 Claimable Badges:**
  1. **New User Verified** — Connect wallet & save username
  2. **First Shelter** — Complete Level 1
  3. **Growing Crew** — Complete Level 3
  4. **Carving Master** — Complete Level 4
  5. **Airborne Yeti** — Complete Level 5
  6. **Slalom Pro** — Complete Level 6
  7. **Summit Champion** — Complete Level 10
- **Leaderboard:** Top 10 riders ranked by highest level, points, and badges claimed.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **3D Engine:** Three.js
- **Blockchain:** Sui Wallet Standard (`@mysten/sui` / `sui:signPersonalMessage`), Sui Testnet RPC (`VITE_SUI_RPC_URL`)

---

## Run Locally

```bash
npm install
npm run dev
```

Optional `.env`:

```env
VITE_SUI_RPC_URL=https://fullnode.testnet.sui.io:443
```

---

## License

Licensed under the [MIT License](LICENSE).
