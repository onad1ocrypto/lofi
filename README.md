# Lofi Ice Escape

<p align="center">
  <img src="public/assets/aistudio/lofi-thumbnail_3eb5d1a2.png" alt="Lofi Ice Escape Thumbnail" width="100%" />
</p>

**Lofi Ice Escape** is a 3D browser snowboarding game built for the **Sui** ecosystem (**CLAY Hackathon III**). Play as **Lofi** and lead your growing crew of **Lil Yetis** down alpine slopes, carving past obstacles, hitting optional ramps, controlling speed on steep descents, and outrunning the avalanche to reach the warm **Shelter**.

- **Live Demo:** https://lofiescape.fun
- **Demo Mode:** Playable immediately with no wallet required.
- **Sui Integration:** Optional Sui Wallet connection (Nightly, Slush, Backpack, OKX) for Rider Profile, Daily Check-In, 7 Claimable Badges, and Leaderboard.

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

## Rider Avatars

Connect any Sui Wallet to choose your rider avatar and set your verified username:

| Goggles | Beanie | Shades | Headphones |
| :---: | :---: | :---: | :---: |
| <img src="public/assets/aistudio/lofi-avatar-1-goggles_439b2dfb.png" width="120" alt="Lofi Goggles" /> | <img src="public/assets/aistudio/lofi-avatar-2-beanie_4742f5df.png" width="120" alt="Lofi Beanie" /> | <img src="public/assets/aistudio/lofi-avatar-3-shades_b89ea6c1.png" width="120" alt="Lofi Shades" /> | <img src="public/assets/aistudio/lofi-avatar-4-headphones_24b7e03f.png" width="120" alt="Lofi Headphones" /> |

---

## 7 Claimable Sui Badges

Complete in-game milestones and claim each badge via `sui:signPersonalMessage`:

| Badge | Name | Unlock Requirement |
| :---: |---|---|
| <img src="public/assets/aistudio/lofi-badge-new-player__1_-removebg-preview_11abffc7.png" width="64" alt="New User Verified" /> | **New User Verified** | Connect Sui wallet & save username |
| <img src="public/assets/aistudio/lofi-badge-example__1_-removebg-preview_f18f842a.png" width="64" alt="First Shelter" /> | **First Shelter** | Complete Level 1 solo |
| <img src="public/assets/aistudio/lofi-badge-growing-crew-removebg-preview_15809afa.png" width="64" alt="Growing Crew" /> | **Growing Crew** | Complete Level 3 (*First Drop*) |
| <img src="public/assets/aistudio/lofi-badge-carving-master-removebg-preview_7c79957f.png" width="64" alt="Carving Master" /> | **Carving Master** | Complete Level 4 (*Carving Pass*) |
| <img src="public/assets/aistudio/lofi-badge-airborne-yeti-removebg-preview_6c0022f5.png" width="64" alt="Airborne Yeti" /> | **Airborne Yeti** | Complete Level 5 (*Drop & Jump*) |
| <img src="public/assets/aistudio/lofi-badge-slalom-pro-removebg-preview_6fc2a744.png" width="64" alt="Slalom Pro" /> | **Slalom Pro** | Complete Level 6 (*Pine Slalom*) |
| <img src="public/assets/aistudio/lofi-badge-summit-champion__1_-removebg-preview_b49ee6b7.png" width="64" alt="Summit Champion" /> | **Summit Champion** | Complete Level 10 (*Summit Run*) with all 9 Lil Yetis |

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

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **3D Engine:** Three.js
- **Blockchain:** Sui Wallet Standard (`sui:signPersonalMessage`), Sui Testnet RPC (`VITE_SUI_RPC_URL`)

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
