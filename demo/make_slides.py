#!/usr/bin/env python3
"""ListingCheck demo video slides, 1280x720. No secrets, no real names."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1280, 720
OUT = "/tmp/lc-demo/slides"
os.makedirs(OUT, exist_ok=True)

BG = (14, 22, 40)
PANEL = (23, 33, 58)
PANEL2 = (30, 44, 74)
WHITE = (241, 245, 249)
MUTED = (148, 163, 184)
TEAL = (45, 212, 191)
GREEN = (74, 222, 128)
AMBER = (251, 191, 36)
RED = (248, 113, 113)
DIMLINE = (51, 65, 85)

FD = "/usr/share/fonts/truetype/dejavu/"
def font(name, size):
    return ImageFont.truetype(FD + name, size)

F_TITLE = font("DejaVuSans-Bold.ttf", 84)
F_H1 = font("DejaVuSans-Bold.ttf", 46)
F_H2 = font("DejaVuSans-Bold.ttf", 30)
F_BODY = font("DejaVuSans.ttf", 27)
F_BODY_B = font("DejaVuSans-Bold.ttf", 27)
F_SMALL = font("DejaVuSans.ttf", 21)
F_SMALL_B = font("DejaVuSans-Bold.ttf", 21)
F_MONO = font("DejaVuSansMono.ttf", 23)
F_MONO_S = font("DejaVuSansMono.ttf", 19)
F_MONO_B = font("DejaVuSansMono-Bold.ttf", 23)
F_BIG = font("DejaVuSans-Bold.ttf", 110)

def base():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=TEAL)
    return img, d

def badge(d, text="TESTNET  |  Ethereum Sepolia"):
    tw = d.textlength(text, font=F_SMALL_B)
    x0, y0 = W - 40 - tw - 28, 30
    d.rounded_rectangle([x0, y0, x0 + tw + 28, y0 + 40], radius=8,
                        outline=AMBER, width=2)
    d.text((x0 + 14, y0 + 8), text, font=F_SMALL_B, fill=AMBER)

def footer(d, n):
    d.line([60, H - 56, W - 60, H - 56], fill=DIMLINE, width=1)
    d.text((60, H - 44), "ListingCheck  |  Telegraph Hackathon Season II, Mission 01 Exchange",
           font=F_SMALL, fill=MUTED)
    d.text((W - 90, H - 44), f"{n} / 9", font=F_SMALL, fill=MUTED)

def heading(d, kicker, title):
    d.text((60, 44), kicker.upper(), font=F_SMALL_B, fill=TEAL)
    d.text((60, 76), title, font=F_H1, fill=WHITE)

def save(img, name):
    img.save(f"{OUT}/{name}")
    print("wrote", name)

# ---- 1. Title ----
img, d = base()
badge(d)
d.text((60, 180), "ListingCheck", font=F_TITLE, fill=WHITE)
d.text((60, 290), "Token-listing verification, bought through Telegraph.",
       font=F_BODY, fill=MUTED)
d.rectangle([60, 380, 1220, 382], fill=DIMLINE)
d.text((60, 410), "One token address in. Five paid intelligence checks.",
       font=F_H2, fill=TEAL)
d.text((60, 460), "One risk memo out, with the evidence and the cost.",
       font=F_H2, fill=TEAL)
d.text((60, 580), "Telegraph Hackathon Season II  |  Apps & Agents  |  Mission 01 Exchange",
       font=F_BODY, fill=WHITE)
d.text((60, 625), "Demo by cezo484  |  All results shown are testnet results.",
       font=F_SMALL, fill=MUTED)
save(img, "s01_title.png")

# ---- 2. Problem ----
img, d = base()
badge(d)
heading(d, "01  The problem", "A token can look safe and still be a trap")
rows = [
    ("Fake listing announcements", "Scam tokens ride fake \"listed on a major exchange\" claims."),
    ("Hidden risk", "Backdoored contracts, sanctioned wallets, wash trading that fakes demand."),
    ("Slow manual checks", "A listing team must verify all of it before listing, by hand."),
]
y = 190
for t, s in rows:
    d.rounded_rectangle([60, y, 1220, y + 118], radius=12, fill=PANEL)
    d.text((90, y + 18), t, font=F_BODY_B, fill=WHITE)
    d.text((90, y + 60), s, font=F_BODY, fill=MUTED)
    y += 140
footer(d, 2)
save(img, "s02_problem.png")

# ---- 3. Five checks ----
img, d = base()
badge(d)
heading(d, "02  How it works", "Five checks, one token address, in parallel")
checks = [
    ("Contract audit", "SMART_CONTRACT_AUDIT_GENERAL", "Reentrancy, access control, overflow risks"),
    ("On-chain metric", "ONCHAIN_METRIC_VERIFY_GENERAL", "Contract balance at the latest block"),
    ("Sanctions screen", "SANCTIONS_SCREENING_MATCH_GENERAL", "OFAC, EU, and UN consolidated lists"),
    ("Wash trading", "WASH_TRADING_DETECTION_GENERAL", "Circular transfers, artificial share of volume"),
    ("Social bot check", "SOCIAL_BOT_DETECTION_GENERAL", "Is the project account automated or coordinated?"),
]
y = 160
for name, intent, desc in checks:
    d.rounded_rectangle([60, y, 1220, y + 84], radius=10, fill=PANEL)
    d.text((90, y + 10), name, font=F_BODY_B, fill=WHITE)
    d.text((90, y + 46), desc, font=F_SMALL, fill=MUTED)
    iw = d.textlength(intent, font=F_MONO_S)
    d.text((1190 - iw, y + 28), intent, font=F_MONO_S, fill=TEAL)
    y += 94
d.text((60, 634), "Each check is a Telegraph request, paid in testnet USDC via x402.",
       font=F_SMALL, fill=MUTED)
footer(d, 3)
save(img, "s03_checks.png")

# ---- 4. Terminal demo run ----
img, d = base()
badge(d, "DEMO MODE  |  Fixture answers, free, no payment")
heading(d, "03  Demo run", "$ npm run demo")
d.rounded_rectangle([60, 168, 1220, 640], radius=12, fill=(8, 13, 26))
lines = [
    ("# Listing risk memo", WHITE),
    ("Network: testnet (Ethereum Sepolia payments, Telegraph devnode)", MUTED),
    ("", WHITE),
    ("## Verdict: LIST", GREEN),
    ("", WHITE),
    ("Contract audit:    clear   $0.01 USDC (testnet)", WHITE),
    ("On-chain metric:   clear   $0.01 USDC (testnet)", WHITE),
    ("Sanctions screen:  clear   $0.01 USDC (testnet)", WHITE),
    ("Wash trading:      clear   $0.01 USDC (testnet)", WHITE),
    ("Social bot check:  clear   $0.01 USDC (testnet)", WHITE),
    ("", WHITE),
    ("Requests: 5    Total spent: $0.05 USDC (testnet)", TEAL),
]
y = 196
for txt, col in lines:
    d.text((90, y), txt, font=F_MONO, fill=col)
    y += 36
footer(d, 4)
save(img, "s04_terminal.png")

# ---- 5. Live testnet run ----
img, d = base()
badge(d, "LIVE TESTNET RUN  |  19 Nov 2026")
heading(d, "04  Real miners, real testnet", "The same run on the live devnode")
d.rounded_rectangle([60, 168, 620, 300], radius=12, fill=PANEL)
d.text((90, 190), "Run time", font=F_SMALL_B, fill=MUTED)
d.text((90, 218), "34 seconds", font=F_H2, fill=WHITE)
d.text((90, 262), "18:03:06 - 18:03:40 UTC", font=F_SMALL, fill=MUTED)
d.rounded_rectangle([660, 168, 1220, 300], radius=12, fill=PANEL)
d.text((690, 190), "Verdict", font=F_SMALL_B, fill=MUTED)
d.text((690, 218), "REVIEW", font=F_H2, fill=AMBER)
d.text((690, 262), "Not LIST. The reader is conservative.", font=F_SMALL, fill=MUTED)
d.rounded_rectangle([60, 322, 1220, 640], radius=12, fill=PANEL)
facts = [
    ("Miners:", "openai (audit), TxLens (on-chain, sanctions)"),
    ("Cost:", "5 requests x $0.01 = $0.05 USDC (testnet)"),
    ("Why REVIEW?", "Audit answer could not be read as clear, so inconclusive."),
    ("", "Wash trading answer reported 32% of volume as artificial."),
    ("Rule:", "An unreadable answer never becomes a pass."),
]
y = 348
for k, v in facts:
    if k:
        d.text((90, y), k, font=F_BODY_B, fill=TEAL)
    d.text((330, y), v, font=F_BODY, fill=WHITE)
    y += 52
footer(d, 5)
save(img, "s05_live.png")

# ---- 6. Cost ----
img, d = base()
badge(d)
heading(d, "05  Observed cost", "Five cents of testnet USDC per full memo")
d.text((60, 200), "$0.05", font=F_BIG, fill=TEAL)
bw = d.textlength("$0.05", font=F_BIG)
lx = 60 + bw + 20
d.text((lx, 240), "USDC (testnet)", font=F_H2, fill=WHITE)
d.text((lx, 290), "5 checks x $0.01 each  |  live quote per request",
       font=F_BODY, fill=MUTED)
caps = [
    ("$0.02", "maximum per call, quote above the cap is refused"),
    ("$1.00", "maximum per run, checked before anything is bought"),
    ("8", "requests maximum per run"),
]
y = 400
for amt, desc in caps:
    d.rounded_rectangle([60, y, 1220, y + 66], radius=10, fill=PANEL)
    d.text((90, y + 16), amt, font=F_BODY_B, fill=AMBER)
    d.text((250, y + 18), desc, font=F_BODY, fill=WHITE)
    y += 78
footer(d, 6)
save(img, "s06_cost.png")

# ---- 7. Memo result ----
img, d = base()
badge(d)
heading(d, "06  The result", "The memo is the evidence pack")
d.rounded_rectangle([60, 168, 1220, 330], radius=12, fill=PANEL)
d.text((90, 192), "Verdict:  LIST  /  REVIEW  /  DO NOT LIST", font=F_H2, fill=WHITE)
d.text((90, 248), "Blocks a listing: sanctions match, critical audit finding,",
       font=F_BODY, fill=MUTED)
d.text((90, 284), "or wash trading above half the volume.", font=F_BODY, fill=MUTED)
items = [
    "Every line names its evidence: miner, intent, cost, latency.",
    "The miner answer stays in the memo, word for word.",
    "A human reviewer still signs off before any listing.",
]
y = 360
for t in items:
    d.text((90, y), "\u2022  " + t, font=F_BODY, fill=WHITE)
    y += 52
d.text((60, 560), "Saved per run: memo.md + memo.json + ledger.json under runs/",
       font=F_MONO_S, fill=TEAL)
footer(d, 7)
save(img, "s07_memo.png")

# ---- 8. Try it ----
img, d = base()
badge(d)
heading(d, "07  Try it", "Free to reproduce, no wallet needed")
d.rounded_rectangle([60, 168, 1220, 448], radius=12, fill=(8, 13, 26))
cmds = [
    ("$ git clone https://github.com/cezo484/listingcheck", WHITE),
    ("$ npm install", WHITE),
    ("$ npm test        # 65 tests, all passing", MUTED),
    ("$ npm run demo    # full memo, fixture answers, free", TEAL),
]
y = 194
for txt, col in cmds:
    d.text((90, y), txt, font=F_MONO_B, fill=col)
    y += 52
d.text((90, 404), "Demo mode: no network, no payment, no funds.",
       font=F_SMALL, fill=MUTED)
d.text((60, 478), "For a real testnet run: fund a fresh Sepolia wallet with test",
       font=F_BODY, fill=WHITE)
d.text((60, 518), "USDC from the Circle faucet, then run the check command.",
       font=F_BODY, fill=WHITE)
d.text((60, 578), "github.com/cezo484/listingcheck  |  Node 18 or newer", font=F_MONO_S, fill=TEAL)
footer(d, 8)
save(img, "s08_tryit.png")

# ---- 9. End card ----
img, d = base()
badge(d)
d.text((60, 200), "ListingCheck", font=F_TITLE, fill=WHITE)
d.text((60, 310), "Evidence before listing.", font=F_H2, fill=TEAL)
d.rectangle([60, 390, 1220, 392], fill=DIMLINE)
d.text((60, 420), "A testnet prototype for the Telegraph Hackathon, Season II,",
       font=F_BODY, fill=WHITE)
d.text((60, 460), "Mission 01 Exchange. Not a listing decision.",
       font=F_BODY, fill=WHITE)
d.text((60, 500), "Not financial advice.", font=F_BODY, fill=WHITE)
d.text((60, 600), "Demo by cezo484", font=F_SMALL, fill=MUTED)
save(img, "s09_end.png")

print("All slides done.")
