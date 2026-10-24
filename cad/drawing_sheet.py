"""A3 general-arrangement drawing for VaaniBoard v2 (dimensions in mm, scale 1:2).

Run after vaaniboard_cad.py (reads render/parts.json).  Output: drawings/VaaniBoard_v2_GA_drawing.pdf/.png
"""
import json, math, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle, Polygon, Rectangle

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "render", "parts.json")))["params"]
os.makedirs(os.path.join(HERE, "drawings"), exist_ok=True)
plt.rcParams["font.family"] = "Arial"

S = 0.5                                   # drawing scale 1:2
W, D, HF, HB, T = P["W"], P["D"], P["H_FRONT"], P["H_BACK"], P["TILT"]
c = math.cos(math.radians(T))
COLS, ROWS = [-75, -25, 25, 75], [-95, -45, 5, 55]
INK, DIM, CL = "#1E293B", "#0369A1", "#94A3B8"

fig = plt.figure(figsize=(16.54, 11.69))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 420); ax.set_ylim(0, 297); ax.set_aspect("equal"); ax.axis("off")
ax.add_patch(Rectangle((10, 10), 400, 277, fill=False, lw=1.4, ec=INK))


def dim(x1, y1, x2, y2, text, off=8, side=1, fs=7.5):
    """Linear dimension between two sheet points (horizontal or vertical)."""
    horiz = abs(y2 - y1) < 1e-6 or abs(x2 - x1) > abs(y2 - y1)
    if horiz:
        y = max(y1, y2) + off if side > 0 else min(y1, y2) - off
        ax.plot([x1, x1], [y1, y], color=DIM, lw=0.4); ax.plot([x2, x2], [y2, y], color=DIM, lw=0.4)
        ax.annotate("", (x1, y), (x2, y), arrowprops=dict(arrowstyle="<->", color=DIM, lw=0.6, shrinkA=0, shrinkB=0))
        ax.text((x1 + x2) / 2, y + 1.0, text, ha="center", va="bottom", fontsize=fs, color=DIM, bbox=dict(fc="white", ec="none", pad=0.6))
    else:
        x = max(x1, x2) + off if side > 0 else min(x1, x2) - off
        ax.plot([x1, x], [y1, y1], color=DIM, lw=0.4); ax.plot([x2, x], [y2, y2], color=DIM, lw=0.4)
        ax.annotate("", (x, y1), (x, y2), arrowprops=dict(arrowstyle="<->", color=DIM, lw=0.6, shrinkA=0, shrinkB=0))
        ax.text(x + (1.2 if side > 0 else -1.2), (y1 + y2) / 2, text, ha="left" if side > 0 else "right",
                va="center", fontsize=fs, color=DIM, rotation=90 if False else 0)


def note(x, y, tx, ty, text, fs=7):
    ax.annotate(text, (x, y), (tx, ty), fontsize=fs, color=INK, va="center",
                arrowprops=dict(arrowstyle="-", color=CL, lw=0.5))


def label(x, y, text):
    ax.text(x, y, text, fontsize=10, weight="bold", color=INK)


# ------------------------------------------------ TOP VIEW (plan), origin = board front-left
ox, oy = 28, 82
label(ox, oy + D * S + 22, "TOP VIEW  (1:2)")
ax.add_patch(FancyBboxPatch((ox, oy), W * S, D * S, boxstyle=f"round,pad=0,rounding_size={8 * S}",
                            fill=False, lw=1.1, ec=INK))
def tp(u, v):  # panel (u, v) -> sheet, projected onto plan
    return ox + (W / 2 + u) * S, oy + (D / 2 + v * c) * S
kx0, ky0 = tp(-106, -124); kx1, ky1 = tp(106, 84)
ax.add_patch(FancyBboxPatch((kx0, ky0), kx1 - kx0, ky1 - ky0, boxstyle=f"round,pad=0,rounding_size={10 * S}",
                            fill=False, lw=0.6, ec=DIM, ls="--"))
for u in COLS:
    for v in ROWS:
        x, y = tp(u, v)
        ax.add_patch(Circle((x, y), 22 * S, fill=False, lw=0.5, ec=DIM, ls="--"))
        ax.add_patch(Circle((x, y), 20 * S, fill=False, lw=0.9, ec=INK))
        ax.add_patch(Circle((x, y), 17 * S, fill=False, lw=0.4, ec=CL))
        ax.plot([x - 3, x + 3], [y, y], color=CL, lw=0.3); ax.plot([x, x], [y - 3, y + 3], color=CL, lw=0.3)
for u, v in [(-98, -116), (98, -116), (-98, 76), (98, 76)]:
    ax.add_patch(Circle(tp(u, v), 5 * S, fill=False, lw=0.7, ec=INK))
gx, gy = tp(-60, 101)
ax.add_patch(Circle((gx, gy), 16.5 * S, fill=False, lw=0.5, ec=INK, hatch="....."))
ax.add_patch(Circle(tp(95, 108), 1.2, fill=True, color=INK)); ax.add_patch(Circle(tp(95, 94), 2.6 * S, fill=False, ec=INK))
ax.text(*tp(18, 101), "VaaniBoard", ha="center", va="center", fontsize=6.5, color=INK, weight="bold")
x0, y0 = ox, oy
dim(x0, y0, x0 + W * S, y0, f"{W:.0f}", off=9, side=-1)
dim(x0, y0, x0, y0 + D * S, f"{D:.0f}", off=9, side=-1)
a1, b1 = tp(-75, -95); a2, _ = tp(-25, -95)
dim(a1, b1, a2, b1, "50 pitch", off=b1 - oy + 19, side=-1)
_, r1 = tp(75, -95); _, r2 = tp(75, -45)
dim(a1 + 150 * S, r1, a1 + 150 * S, r2, "50 along slope", off=22 * S + 3)
note(*tp(-75 + 14, -95 + 14), ox + W * S + 6, oy + 34, "Keycap Ø40, picture Ø34\nunder clear lens")
note(*tp(75 + 15.5, -45 - 15.5), ox + W * S + 6, oy + 50, "Keyguard hole Ø44\n(3 mm clear acrylic)")
note(*tp(98, 76), ox + W * S + 6, oy + 104, "M3 standoff ×4, 11 mm\n(keyguard thumb screws)")
note(gx + 6, gy + 6, ox + W * S + 6, oy + 120, "Speaker grille Ø33 (37 × Ø3)\nmic port Ø1.6, status LED Ø5")

# ------------------------------------------------ SIDE VIEW (from the right)
sx, sy = 215, 175
label(sx, sy + HB * S + 22, "SIDE VIEW  (1:2)  ·  front edge on the left")
ax.add_patch(Polygon([(sx, sy), (sx + D * S, sy), (sx + D * S, sy + HB * S), (sx, sy + HF * S)],
                     closed=True, fill=False, lw=1.1, ec=INK))
ax.plot([sx, sx + D * S], [sy + 3 * S, sy + 3 * S], color=INK, lw=0.5)
t = math.tan(math.radians(T))
def side_pt(y, h):  # depth y, height h above the panel (along normal)
    return sx + (y - h * math.sin(math.radians(T))) * S, sy + (HF + y * t + h * c) * S
for h, ls, col in [(11, "--", DIM), (14, "--", DIM)]:
    p0, p1 = side_pt(4, h), side_pt(D - 30, h)
    ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color=col, lw=0.6, ls=ls)
for v in ROWS:
    y = D / 2 + v * c
    for h0, h1, w in [(-21, 9.2, 12), (6.6, 14, 20)]:
        q = [side_pt(y - w, h0), side_pt(y + w, h0), side_pt(y + w, h1), side_pt(y - w, h1)]
        ax.add_patch(Polygon(q, closed=True, fill=False, lw=0.4, ec=CL))
ax.add_patch(Rectangle((sx + 40 * S, sy + 1.5 * S), 100 * S, 9 * S, fill=False, ec=CL, lw=0.5, hatch="///"))
dim(sx, sy, sx + D * S, sy, f"{D:.0f}", off=9, side=-1)
dim(sx, sy, sx, sy + HF * S, f"{HF:.0f}", off=8, side=-1)
dim(sx + D * S, sy, sx + D * S, sy + HB * S, f"{HB:.1f}", off=8)
ax.text(sx + 70, sy + (HF + 140 * t) * S - 9, f"{T:.0f}° tilt", fontsize=8, color=DIM, rotation=T)
note(*side_pt(150, 14), sx + 40, sy + HB * S + 12, "Keycap top +14 / keyguard top +14 above panel")
note(sx + 90 * S, sy + 6 * S, sx + 70, sy - 22, "1S LiPo 3,000 mAh in screwed bay (no child access)")
note(sx + 3, sy + 1.5 * S, sx + 2, sy - 32, "3 mm base plate, TPU gasket groove, M3 into heat-set inserts")

# ------------------------------------------------ REAR VIEW (ports)
rx, ry = 215, 52
label(rx, ry + HB * S + 16, "REAR VIEW  (1:2)  ·  ports")
ax.add_patch(FancyBboxPatch((rx, ry), W * S, HB * S, boxstyle=f"round,pad=0,rounding_size={4 * S}",
                            fill=False, lw=1.1, ec=INK))
def rp(x, z):  # rear view is seen from behind: board +X appears on the left
    return rx + (W / 2 - x) * S, ry + z * S
ax.add_patch(FancyBboxPatch((rp(70 + 5, 0)[0], rp(0, 13.7 - 2)[1]), 10 * S, 4 * S,
                            boxstyle=f"round,pad=0,rounding_size={2 * S}", fill=False, ec=INK, lw=0.8))
for x in (20, 40):
    ax.add_patch(Circle(rp(x, 24), 3.1 * S, fill=False, ec=INK, lw=0.8))
ax.add_patch(Rectangle(rp(96 + 9.6, 30 - 6.4), 19.2 * S, 12.8 * S, fill=False, ec=INK, lw=0.8))
note(*rp(70, 15), rx + W * S + 4, ry + 8, "USB-C charge, 10 × 4 slot")
note(*rp(30, 26), rx + W * S + 4, ry + 22, "2 × 3.5 mm access jacks\n(switch, blink sensor)")
note(*rp(96, 36), rx + W * S + 4, ry + 36, "Power rocker 19.2 × 12.8")
dim(rx, ry, rx + W * S, ry, f"{W:.0f}", off=8, side=-1)

# ------------------------------------------------ title block + notes
ax.add_patch(Rectangle((215, 12), 193, 30, fill=False, lw=1, ec=INK))
ax.text(219, 34, "VaaniBoard v2 · General arrangement", fontsize=12, weight="bold", color=INK)
ax.text(219, 27, "VK26-IITI-AS-0216 · Assistive Solutions · Stage 2 design", fontsize=8, color=INK)
ax.text(219, 20, "Units mm · Scale 1:2 on A3 · Sheet 1/1 · 08 Oct 2026", fontsize=8, color=INK)
ax.text(219, 14.5, "Parametric CadQuery model prepared with AI assistance (Claude); values are design targets",
        fontsize=6.5, color="#64748B")
notes = ("NOTES\n1. Housing + base plate: PETG, 3 mm walls, 4 perimeters, 25% gyroid; fits a 256 mm bed.\n"
         "2. Bezels: natural (translucent) PETG light rings; WS2812B under each key.\n"
         "3. Keycaps: Fitzgerald colours (people / actions / things / urgent); words never move.\n"
         "4. Keyguard: 3 mm clear acrylic, laser-cut from keyguard_3mm_acrylic.dxf.\n"
         "5. Corner radius R8, top edge R4; no sharp edges or small detachable parts.")
ax.text(28, 38, notes, fontsize=7, color=INK, va="top", linespacing=1.5)

for ext in ("pdf", "png"):
    fig.savefig(os.path.join(HERE, "drawings", f"VaaniBoard_v2_GA_drawing.{ext}"), dpi=200)
print("drawing written")
