# EcoCredx

Blockchain-based environmental credit marketplace.

**Live site: https://alexm2025.github.io/EcoCredx/** (Sepolia test network)

**Android app:** [download EcoCredx.apk](https://github.com/Alexm2025/EcoCredx/releases/latest/download/EcoCredx.apk)

People earn credits for verified eco-friendly work, trade them peer-to-peer, and retire them to
offset their footprint. Every claim, approval, sale and retirement is recorded on-chain.

```
EcoCredx/
├── contracts-app/     Solidity contracts, tests, deploy + seed scripts (Hardhat 3)
├── frontend/          React app (Vite + ethers v6)
└── mobile/            Android wrapper that opens the live site as an app (Capacitor)
```

## Run it locally

You need Node.js 22 or newer. Use three terminals.

**Terminal 1 — local blockchain** (leave it running)

```
cd contracts-app
npm install
npm run node
```

**Terminal 2 — deploy the contracts and load demo data**

```
cd contracts-app
npm run deploy:local
npm run seed:local
```

**Terminal 3 — the app**

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

The local chain lives in memory. Every time you restart terminal 1, run the two commands in
terminal 2 again.

## Using the app

Click **Connect wallet** (top right). There are two ways to connect:

- **Demo accounts** — the test accounts of your local chain. No browser extension needed, and
  you can switch between roles in one click. This is the easiest way to present the project.
- **MetaMask** — add the network "Hardhat Local" (RPC `http://127.0.0.1:8545`, chain id `31337`)
  and import one of the private keys that `npm run node` prints.

After seeding, the demo accounts are:

| Account | Role | Starts with |
|---|---|---|
| Admin | Appoints and removes verifiers | — |
| Verifier | Approves or rejects claims | 2 claims waiting for review |
| GreenGrid Energy | Participant | Renewable energy and carbon credits, 2 listings |
| River Trust | Participant | Water and biodiversity credits, 2 listings |
| Buyer | Participant | 20 carbon credits bought from the marketplace |

A walkthrough that shows every feature:

1. **Buyer → Earn credits**: submit a claim with an evidence link.
2. **Verifier → Verify**: approve it. The credits are minted to the buyer.
3. **Buyer → Marketplace**: buy credits from a listing, then list some of your own.
4. **Buyer → My wallet**: send credits to another address, then retire some.
5. **Ledger**: every step above appears as a permanent record.
6. **Earn credits again with the same evidence link**: the claim is refused (no double counting).

## How it works

| Contract | What it does |
|---|---|
| `EcoCredit.sol` | ERC-1155 token. Each token id is a credit type: Carbon (0), Water (1), Renewable Energy (2), Waste (3), Biodiversity (4). Holds the claim → verify → mint flow, retirement, and roles. |
| `EcoMarketplace.sol` | Listings priced in the network's currency. Listed credits are held in escrow by the contract; payment goes to the seller minus the platform fee. |

Rules the contracts enforce:

- Credits are only minted when a verifier approves a claim. Not even the admin can mint directly.
- Each claim carries a fingerprint (hash) of its evidence. A fingerprint can back only one live claim.
- A verifier cannot review their own claim.
- A verifier may approve fewer credits than were claimed, never more.
- Retired credits are burned, so they cannot be sold or retired a second time.
- Listed credits are locked in escrow, so the same credits cannot be listed twice.
- The platform fee can never exceed 10%, and a listing keeps the fee it was created with.
- A pause stops activity but never moves or removes anyone's credits.

## Tests

```
cd contracts-app
npm test
```

## Putting it online

A public website cannot reach the chain on your laptop, so the hosted version uses the Sepolia
test network (free, no real money) and GitHub Pages.

**1. Deploy the contracts to Sepolia** (once, and again only when a `.sol` file changes)

1. Copy `contracts-app/.env.example` to `contracts-app/.env` and set `SEPOLIA_PRIVATE_KEY` to
   the private key of a throwaway wallet. Never use a wallet that holds real funds.
2. Send that wallet about 0.05 Sepolia ETH from a faucet (search "Sepolia faucet").
3. `cd contracts-app` and run `npm run deploy:sepolia`.
4. Optional: `npm run seed:sepolia` adds the demo claims and listings (takes a few minutes).

This writes `frontend/src/contracts/deployments/11155111.json`, which is how the website finds
the contracts. The wallet that deployed is the admin of the hosted app.

**2. Publish the website**

1. Push this folder to a GitHub repository (branch `main`).
2. In the repository: Settings → Pages → Source → **GitHub Actions**.

`.github/workflows/deploy.yml` then builds and publishes the site on every push. The address is
`https://<your-username>.github.io/<repository-name>/`.

**3. Keep changing it**

Edit, test locally, then `git add -A`, `git commit -m "what changed"`, `git push`. The site
updates itself in a minute or two. Running locally keeps using the local chain, so experiments
never touch the hosted data.

What visitors get:

- Without a wallet: everything is visible, read-only (dashboard, marketplace, ledger).
- With MetaMask on Sepolia and a little test ETH: they can claim, buy, sell and retire.
- The one-click demo accounts exist only on your own machine.

## Running it as a business

**How it earns.** The marketplace keeps a platform fee from each sale. The buyer pays the listed
price; the seller receives it minus the fee. The fee starts at 2%, is locked into a listing when
it is created, and can never exceed 10%. Collected fees build up in the contract until the owner
withdraws them to the payout address.

**Owner controls** (Admin tab, visible only to the admin wallet):

| Control | What it does |
|---|---|
| Appoint / remove verifiers | Decides who may approve claims. |
| Set fee | Changes the fee for listings created from then on (0–10%). |
| Withdraw fees | Sends collected fees to the payout address. |
| Set payout address | Changes where fees go. |
| Pause marketplace | Stops new listings and purchases. Sellers can still cancel. |
| Pause all credit activity | Freezes claims, minting, transfers and retirement. |

The owner cannot mint credits, move anyone's credits, or take escrowed credits.

### Before taking real money

The public site runs on a test network with invented demo data, and says so on every page. The
software is ready to be pointed at a real network, but these steps are not code and have to be
done by the people running the business:

1. **Security audit.** Have an independent firm audit `EcoCredit.sol` and `EcoMarketplace.sol`.
   They have automated tests but no third-party review.
2. **Legal.** Register the business and get advice on how environmental credits and crypto
   payments are regulated and taxed where you operate (in India this includes the tax rules for
   virtual digital assets, and KYC / anti-money-laundering duties). Have a lawyer review the
   terms and risk notices on the About page.
3. **Real verifiers.** Credits are only as good as the people approving them. Sign up accredited
   verification bodies and publish who they are and what standard they apply.
4. **Safer admin keys.** Move the admin role and marketplace ownership from a single wallet to a
   multi-signature wallet (for example Safe), so one stolen key cannot pause the platform or
   redirect fees.
5. **Launch on a real network.** Create a dedicated wallet, fund it, put its key and an RPC URL in
   `contracts-app/.env` (`POLYGON_PRIVATE_KEY`, `POLYGON_RPC_URL`), and run
   `npm run deploy:polygon`. Do **not** run the seed script there (it refuses to). Commit the new
   file in `frontend/src/contracts/deployments/` and push; the site then shows the real network
   by default.
6. **Distribution.** A custom domain, and a Google Play developer account to publish the
   `EcoCredx.aab` bundle that the Android workflow builds.

## Mobile app

The Android app is a thin wrapper around the live site, so it always shows the latest published
version and never needs rebuilding for website changes.

- **Install:** download `EcoCredx.apk` from the link at the top (or the footer of the site), open it
  on the phone, and allow installing from that source when Android asks.
- **What it can do:** everything a visitor without a wallet can do: view the dashboard,
  marketplace and ledger. Phones have no MetaMask extension, so to claim, buy or retire from a
  phone, open the site inside the MetaMask app's built-in browser instead.
- **No download needed:** on Android or iPhone, open the site in the browser and choose
  "Add to Home screen" / "Install app".
- **Rebuilding:** `.github/workflows/android.yml` builds a signed APK (and an `.aab` bundle for
  Google Play) and publishes them as a GitHub Release whenever something under `mobile/` changes,
  or when run by hand from the Actions tab.
- **Signing key:** `mobile/ecocredx-release.jks` and `mobile/keystore.properties` exist only on the
  computer that created them (and as GitHub secrets). Back them up somewhere safe: without them
  no update to the published app can be released.

## Troubleshooting

- **"No blockchain connection"** — terminal 1 is not running, or you have not deployed. Start the
  node, run `npm run deploy:local`, reload the page.
- **"The EcoCredx contracts are not deployed on this chain yet"** — the node was restarted.
  Run `npm run deploy:local` and `npm run seed:local` again.
- **MetaMask transactions fail or hang after restarting the node** — MetaMask remembers the old
  chain. In MetaMask: Settings → Advanced → Clear activity tab data, then try again.
