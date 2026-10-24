"""VaaniBoard v2: parametric CAD model (CadQuery).

Run:  python vaaniboard_cad.py  ->  writes step/, stl/, dxf/, render/parts.json

Every dimension is a named parameter below; change one and re-run.
Axes: X = width (left/right), Y = depth (front edge y=0, rear edge y=D), Z = up.
The key panel is tilted 10 degrees towards the child.
Top-panel features are placed in panel coordinates (u = across, v = up the slope,
h = height above the panel surface).
"""
import json, math, os
import cadquery as cq

OUT = os.path.dirname(os.path.abspath(__file__))
for d in ("step", "stl", "dxf", "render"):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# ---------------------------------------------------------------- parameters
W, D = 240.0, 250.0          # footprint (fits a 256 mm print bed)
H_FRONT = 40.0               # front edge height
TILT = 10.0                  # panel tilt, degrees
WALL = 3.0                   # PETG wall and top-panel thickness
PLATE = 3.0                  # base plate thickness
R_VERT, R_TOP = 8.0, 4.0     # corner and top-edge fillets

PITCH = 50.0                 # key pitch (20 mm gaps reduce wrong presses)
COLS = [-75.0, -25.0, 25.0, 75.0]
ROWS = [-95.0, -45.0, 5.0, 55.0]          # v positions, front row first
BTN_HOLE = 30.0              # arcade button snap-in diameter
BEZEL_BARREL, BEZEL_FLANGE = 33.2, 38.0   # translucent LED light-ring bezel
KEYCAP_D, KEYCAP_BOTTOM, KEYCAP_TOP = 40.0, 6.6, 14.0
PICTURE_D = 34.0             # laminated picture disc under a clear lens

KG_T, KG_HEIGHT, KG_HOLE = 3.0, 11.0, 44.0  # keyguard: clear acrylic on 11 mm standoffs
KG_U, KG_V0, KG_V1, KG_R = 106.0, -124.0, 84.0, 10.0

SPK_UV, SPK_D = (-60.0, 101.0), 40.0       # 40 mm, 3 W speaker under the grille
MIC_UV, LED_UV, LOGO_UV = (95.0, 108.0), (95.0, 94.0), (18.0, 101.0)

BAY_C, BAY_OPEN, BAY_REBATE = (0.0, 100.0), (106.0, 62.0), (126.0, 74.0)
LIPO = (100.0, 55.0, 9.0)    # 1S 3,000 mAh pouch cell
PERF_C, PERF = (-55.0, 180.0), (90.0, 70.0)

# Modified Fitzgerald key: one colour per word class, words never move (motor planning)
VOCAB = [  # column-wise; each list runs front row -> back row
    ("people", (0.98, 0.80, 0.18), ["main", "aap", "mummy", "teacher"]),
    ("actions", (0.30, 0.72, 0.38), ["chahiye", "khelna", "jaana", "ruko"]),
    ("things", (0.96, 0.55, 0.20), ["paani", "khana", "toilet", "ghar"]),
    ("urgent / social", (0.90, 0.33, 0.52), ["dard", "madad", "haan", "nahi"]),
]

# ---------------------------------------------------------------- geometry helpers
a = math.radians(TILT)
H_BACK = H_FRONT + D * math.tan(a)
L_SLOPE = D / math.cos(a)
N = cq.Vector(0, -math.sin(a), math.cos(a))      # panel normal
YV = cq.Vector(0, math.cos(a), math.sin(a))      # up-slope direction
XV = cq.Vector(1, 0, 0)
O = cq.Vector(0, D / 2, (H_FRONT + H_BACK) / 2)  # panel centre


def P(u, v, h=0.0):
    return O + XV * u + YV * v + N * h


def panel(u=0.0, v=0.0, h=0.0):
    return cq.Plane(origin=P(u, v, h), xDir=XV, normal=N)


def cyl(r, length, u, v, h0, down=False):
    """Cylinder on the panel axis starting at height h0, going up (or down)."""
    d = N * (-1 if down else 1)
    return cq.Solid.makeCylinder(r, length, P(u, v, h0), d)


def keys():
    for ci, (_, colour, words) in enumerate(VOCAB):
        for ri, word in enumerate(words):
            yield ci, ri, COLS[ci], ROWS[ri], colour, word


def compound(solids):
    return cq.Compound.makeCompound(list(solids))


def rbox(w, d, h, r, x=0, y=0, z=0):
    return cq.Workplane("XY").box(w, d, h, centered=(True, True, False)) \
        .edges("|Z").fillet(r).translate((x, y, z))


# ---------------------------------------------------------------- housing
outer = (cq.Workplane("YZ")
         .polyline([(0, 0), (D, 0), (D, H_BACK), (0, H_FRONT)]).close()
         .extrude(W / 2, both=True)
         .edges("|Z").fillet(R_VERT)
         .faces(">Z").edges().fillet(R_TOP))
above = cq.Workplane("XY").box(W + 20, D + 20, 200, centered=(True, False, False)).translate((0, -10, PLATE))
shell_outer = outer.intersect(above)
plate_outer = outer.cut(above)

shell = shell_outer.faces("<Z").shell(-WALL)

# key holes with translucent bezels
shell = shell.cut(compound(cyl(BEZEL_BARREL / 2 + 0.1, 10, u, v, 3, down=True) for *_, u, v, _, _ in keys()))

# stiffening ribs between key columns (children bang boards)
for x in (-50.0, 0.0, 50.0):
    rib = cq.Workplane(panel(x, -19, -WALL + 0.2)).rect(2.0, 198).extrude(-8)
    shell = shell.union(rib)

# screw bosses (M3 heat-set inserts from below)
BOSSES = [(-112, 8), (0, 8), (112, 8), (-112, 242), (0, 242), (112, 242)]
cols = compound(cq.Solid.makeCylinder(5, 120, cq.Vector(x, y, PLATE)) for x, y in BOSSES)
shell = shell.union(cq.Workplane().add(cols).intersect(shell_outer))
shell = shell.cut(compound(cq.Solid.makeCylinder(2.1, 8, cq.Vector(x, y, PLATE - 0.1)) for x, y in BOSSES))

# keyguard standoffs on the panel
KG_POSTS = [(-98, -116), (98, -116), (-98, 76), (98, 76)]
for u, v in KG_POSTS:
    shell = shell.union(cq.Workplane().add(cyl(5, KG_HEIGHT + 1, u, v, -1)))
shell = shell.cut(compound(cyl(1.25, 10, u, v, KG_HEIGHT + 0.5, down=True) for u, v in KG_POSTS))

# speaker grille (concentric holes), speaker cup, mic port, status LED port
holes = [(0.0, 0.0)]
for r, n in ((5.5, 6), (10.5, 12), (15.0, 18)):
    holes += [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]
su, sv = SPK_UV
shell = shell.cut(compound(cyl(1.5, 10, su + x, sv + y, 3, down=True) for x, y in holes))
cup = cyl(SPK_D / 2 + 3, 8, su, sv, -WALL + 0.5, down=True).cut(cyl(SPK_D / 2 + 0.6, 10, su, sv, 0, down=True))
shell = shell.union(cq.Workplane().add(cup))
shell = shell.cut(compound([cyl(0.8, 10, *MIC_UV, 3, down=True), cyl(2.6, 10, *LED_UV, 3, down=True)]))
for dx in (-9.0, 9.0):  # INMP441 locating pins
    shell = shell.union(cq.Workplane().add(cyl(1.2, 4, MIC_UV[0] + dx, MIC_UV[1], -WALL + 0.3, down=True)))

# embossed logo
logo = cq.Workplane(panel(*LOGO_UV, -0.1)).text("VaaniBoard", 10, 0.9, fontPath=FONT,
                                                  halign="center", valign="center", combine=False)
shell = shell.union(logo)

# rear-wall ports: USB-C, two 3.5 mm access jacks, power rocker
USB_X, USB_Z = 70.0, 13.7
JACKS = [(20.0, 24.0), (40.0, 24.0)]
ROCKER = (96.0, 30.0, 19.2, 12.8)
usb = cq.Workplane("XZ").center(USB_X, USB_Z).slot2D(10.0, 4.0).extrude(-12).translate((0, D - 6, 0))
shell = shell.cut(usb)
for x, z in JACKS:
    shell = shell.cut(cq.Solid.makeCylinder(3.1, 12, cq.Vector(x, D - 6, z), cq.Vector(0, 1, 0)))
shell = shell.cut(cq.Workplane("XY").box(ROCKER[2], 12, ROCKER[3]).translate((ROCKER[0], D - 1, ROCKER[1])))

# ---------------------------------------------------------------- base plate
plate = plate_outer
# gasket groove under the wall line (1.5 mm TPU cord)
g_out = rbox(W - 2 * 0.8, D - 2 * 0.8, 1.2, R_VERT - 0.8, 0, D / 2, PLATE - 1.0)
g_in = rbox(W - 2 * 2.2, D - 2 * 2.2, 1.2, R_VERT - 2.2, 0, D / 2, PLATE - 1.0)
plate = plate.cut(g_out.cut(g_in))

plate = plate.cut(compound(cq.Solid.makeCylinder(1.75, 10, cq.Vector(x, y, -1)) for x, y in BOSSES))
plate = plate.cut(compound(cq.Solid.makeCone(3.4, 1.7, 1.7, cq.Vector(x, y, 0)) for x, y in BOSSES))

bx, by = BAY_C
plate = plate.cut(cq.Workplane("XY").box(*BAY_OPEN, 10).translate((bx, by, 0)))
plate = plate.cut(cq.Workplane("XY").box(*BAY_REBATE, 3.0).translate((bx, by, 0)))   # 1.5 mm rebate
bay = (cq.Workplane("XY").rect(BAY_OPEN[0] + 2 + 4, BAY_OPEN[1] + 2 + 4).extrude(14)
       .cut(cq.Workplane("XY").rect(BAY_OPEN[0] + 2, BAY_OPEN[1] + 2).extrude(14))
       .translate((bx, by, PLATE)))
plate = plate.union(bay)
DOOR_SCREWS = [(bx - 58, by), (bx + 58, by)]
for x, y in DOOR_SCREWS:
    plate = plate.union(cq.Workplane().add(cq.Solid.makeCylinder(4, 5, cq.Vector(x, y, PLATE - 0.1))))
plate = plate.cut(compound(cq.Solid.makeCylinder(1.25, 8, cq.Vector(x, y, 1.5)) for x, y in DOOR_SCREWS))

px, py = PERF_C
PERF_POSTS = [(px + sx * (PERF[0] / 2 - 4), py + sy * (PERF[1] / 2 - 4)) for sx in (-1, 1) for sy in (-1, 1)]
TP_POSTS = [(USB_X - 9, D - 18), (USB_X + 9, D - 18)]
for (x, y), h in [(p, 6.0) for p in PERF_POSTS] + [(p, 8.6) for p in TP_POSTS]:
    post = cq.Solid.makeCylinder(3, h, cq.Vector(x, y, PLATE - 0.1)).cut(
        cq.Solid.makeCylinder(1.25, h + 1, cq.Vector(x, y, PLATE)))
    plate = plate.union(cq.Workplane().add(post))

MODE_XY = (96.0, 215.0)
plate = plate.cut(cq.Solid.makeCylinder(3.5, 10, cq.Vector(*MODE_XY, -1)))
plate = plate.cut(cq.Solid.makeCylinder(6.0, 1.5, cq.Vector(*MODE_XY, 0)))
FEET = [(-100, 22), (100, 22), (-100, 228), (100, 228)]
plate = plate.cut(compound(cq.Solid.makeCylinder(7.2, 1.0, cq.Vector(x, y, 0)) for x, y in FEET))
under_txt = cq.Workplane(cq.Plane(origin=(0, 200, 0), xDir=(-1, 0, 0), normal=(0, 0, -1))) \
    .text("VaaniBoard  ·  VK26-IITI-AS-0216  ·  PETG", 6, -0.5, fontPath=FONT,
          halign="center", valign="center", combine=False)
plate = plate.cut(under_txt)
mode_txt = cq.Workplane(cq.Plane(origin=(MODE_XY[0], MODE_XY[1] - 11, 0), xDir=(-1, 0, 0), normal=(0, 0, -1))) \
    .text("MODE", 4, -0.5, fontPath=FONT, halign="center", valign="center", combine=False)
plate = plate.cut(mode_txt)

door = (cq.Workplane("XY").box(BAY_REBATE[0] - 0.4, BAY_REBATE[1] - 0.4, 1.5, centered=(True, True, False))
        .edges("|Z").fillet(3).translate((bx, by, 0)))
door = door.cut(compound(cq.Solid.makeCylinder(1.7, 3, cq.Vector(x, y, -1)) for x, y in DOOR_SCREWS))
door = door.cut(compound(cq.Solid.makeCone(3.2, 1.6, 1.5, cq.Vector(x, y, 0)) for x, y in DOOR_SCREWS))
door = door.cut(cq.Workplane("XY").box(20, 6, 0.6, centered=(True, True, False)).translate((bx, by - 25, 0)))  # pull notch
feet = compound(cq.Solid.makeCylinder(7.0, 3.0, cq.Vector(x, y, -2.0)) for x, y in FEET)

# ---------------------------------------------------------------- key stack
def bezel(u, v):
    s = cyl(BEZEL_FLANGE / 2, 1.2, u, v, 0).fuse(cyl(BEZEL_BARREL / 2, WALL, u, v, 0, down=True))
    return s.cut(cyl(BTN_HOLE / 2, 10, u, v, 3, down=True))


def arcade(u, v):
    s = cyl(16.5, 2.0, u, v, 1.2).fuse(cyl(12.0, 6.0, u, v, 3.2))
    s = s.fuse(cyl(14.6, 18.0, u, v, -WALL, down=True))
    sw = cq.Workplane(panel(u, v, -WALL - 18)).rect(12.8, 19.8).extrude(-10.5).val()
    return s.fuse(sw)


def keycap(u, v):
    hgt = KEYCAP_TOP - KEYCAP_BOTTOM
    s = cq.Workplane(panel(u, v, KEYCAP_BOTTOM)).circle(KEYCAP_D / 2).extrude(hgt).faces(">Z").edges().fillet(1.5).val()
    s = s.cut(cyl(12.2, 2.6, u, v, KEYCAP_BOTTOM - 0.1))                 # socket on the plunger
    s = s.cut(cyl(PICTURE_D / 2 + 0.2, 1.7, u, v, KEYCAP_TOP - 1.6))     # picture + lens pocket
    return s


def picture(u, v):
    return cyl(PICTURE_D / 2, 0.4, u, v, KEYCAP_TOP - 1.6)


def lens(u, v):
    return cyl(PICTURE_D / 2, 1.0, u, v, KEYCAP_TOP - 1.15)


def ws2812(u, v):
    return cq.Workplane(panel(u, v - 15.8, -WALL)).rect(5, 5).extrude(-1.6).val()


bezels = compound(bezel(u, v) for *_, u, v, _, _ in keys())
buttons = compound(arcade(u, v) for *_, u, v, _, _ in keys())
leds = compound(ws2812(u, v) for *_, u, v, _, _ in keys())
lenses = compound(lens(u, v) for *_, u, v, _, _ in keys())
caps_by_class = {name: compound(keycap(COLS[ci], v) for v in ROWS) for ci, (name, _, _) in enumerate(VOCAB)}
pics_by_class = {name: compound(picture(COLS[ci], v) for v in ROWS) for ci, (name, _, _) in enumerate(VOCAB)}

# ---------------------------------------------------------------- keyguard (flat for laser cutting, then placed)
kg_flat = (cq.Workplane("XY").rect(2 * KG_U, KG_V1 - KG_V0).extrude(KG_T).edges("|Z").fillet(KG_R)
           .translate((0, (KG_V0 + KG_V1) / 2, 0)))
kg_flat = kg_flat.cut(compound(cq.Solid.makeCylinder(KG_HOLE / 2, 10, cq.Vector(u, v, -1)) for *_, u, v, _, _ in keys()))
kg_flat = kg_flat.cut(compound(cq.Solid.makeCylinder(1.7, 10, cq.Vector(u, v, -1)) for u, v in KG_POSTS))
cq.exporters.export(kg_flat.section(KG_T / 2), os.path.join(OUT, "dxf", "keyguard_3mm_acrylic.dxf"))


def to_panel(shape, h):
    """Map a shape built in flat XY (x=u, y=v, z=h) onto the tilted panel."""
    loc = cq.Location(panel(0, 0, h))
    return shape.moved(loc) if hasattr(shape, "moved") else shape


keyguard = to_panel(kg_flat.val(), KG_HEIGHT)
thumbs = compound(cyl(5.0, 4.0, u, v, KG_HEIGHT + KG_T).fuse(cyl(1.5, 9, u, v, KG_HEIGHT + KG_T, down=True))
                  for u, v in KG_POSTS)

# ---------------------------------------------------------------- electronics (purchased parts, simplified)
def box(w, d, h, x, y, z):
    return cq.Solid.makeBox(w, d, h, cq.Vector(x - w / 2, y - d / 2, z))


perf = box(*PERF, 1.6, px, py, PLATE + 6)
zp = PLATE + 6 + 1.6
esp_pcb = box(69.0, 25.5, 1.6, px, py - 8, zp + 8.5)
esp_can = box(18.0, 25.5, 3.2, px + 22, py - 8, zp + 10.1)
headers = compound([box(64.0, 2.5, 8.5, px, py - 8 + 11.5, zp), box(64.0, 2.5, 8.5, px, py - 8 - 11.5, zp)])
amp = box(17.8, 17.8, 1.6, px - 30, py + 24, zp + 3)
mcp = box(30.0, 20.0, 1.6, px + 8, py + 24, zp + 3)
sdm = box(18.0, 30.0, 1.6, px - 34, py - 8, zp + 3)
pcbs = compound([perf, esp_pcb, amp, mcp, sdm])
modules = compound([esp_can, headers])
lipo = box(*LIPO, bx, by, 1.6)
tp = box(17.0, 28.0, 1.6, USB_X, D - 18, PLATE + 8.5)
usbc = box(9.0, 7.4, 3.2, USB_X, D - 4.6, PLATE + 10.1)
jacks = compound(cq.Solid.makeCylinder(3.0, 15, cq.Vector(x, D - 3 - 14, z), cq.Vector(0, 1, 0)).fuse(
    cq.Solid.makeCylinder(4.2, 2.0, cq.Vector(x, D, z), cq.Vector(0, 1, 0))) for x, z in JACKS)
rocker = box(21.0, 2.0, 15.0, ROCKER[0], D + 1, ROCKER[1] - 7.5).fuse(
    box(ROCKER[2] - 0.4, 16.0, ROCKER[3] - 0.4, ROCKER[0], D - 9, ROCKER[1] - 6.2))
speaker = cyl(SPK_D / 2, 5.0, *SPK_UV, -WALL - 0.2, down=True).fuse(cyl(11.0, 12.0, *SPK_UV, -WALL - 5, down=True))
mic = cq.Workplane(panel(*MIC_UV, -WALL)).rect(14, 14).extrude(-1.2).val()
lightpipe = cyl(2.5, 8.0, *LED_UV, 0.4, down=True)
mode_sw = box(12.0, 12.0, 4.0, *MODE_XY, 1.6).fuse(box(16, 16, 1.6, *MODE_XY, 5.6))

# ---------------------------------------------------------------- access switch puck + teacher badge
PUCK_XY = (-205.0, 70.0)
def puck_parts():
    x, y = PUCK_XY
    base = (cq.Workplane("XY").circle(45).extrude(26).faces(">Z").edges().fillet(6)
            .faces("<Z").shell(-2.4))
    base = base.cut(cq.Workplane("XY").circle(BTN_HOLE / 2).extrude(40))
    guide = cq.Workplane("XY").circle(39.5).circle(37.5).extrude(7).translate((0, 0, 25))
    base = base.union(guide)
    base = base.cut(cq.Solid.makeCylinder(3.1, 20, cq.Vector(-50, 0, 10), cq.Vector(1, 0, 0)))
    floor = cq.Workplane("XY").circle(42.4).extrude(2.4)
    paddle = (cq.Workplane("XY").circle(36.5).extrude(9).faces(">Z").edges().fillet(7)
              .cut(cq.Workplane("XY").circle(12.2).extrude(2.6)).translate((0, 0, 30.4)))
    btn = cq.Solid.makeCylinder(16.5, 2, cq.Vector(0, 0, 26)).fuse(cq.Solid.makeCylinder(12, 5, cq.Vector(0, 0, 28))) \
        .fuse(cq.Solid.makeCylinder(14.6, 18, cq.Vector(0, 0, 8)))
    m = cq.Location(cq.Vector(x, y, 0))
    return base.val().moved(m), floor.val().moved(m), paddle.val().moved(m), btn.moved(m)


puck_base, puck_floor, puck_paddle, puck_btn = puck_parts()

BADGE_XY = (205.0, 55.0)
def badge_parts():
    x, y = BADGE_XY
    body = cq.Workplane("XY").box(52, 34, 15, centered=(True, True, False)).edges("|Z").fillet(7).edges(">Z").fillet(3)
    body = body.faces("<Z").shell(-1.8)
    body = body.cut(cq.Workplane("XY").box(25.5, 14.5, 10).translate((-4, 2, 15)))       # OLED window
    body = body.cut(cq.Solid.makeCylinder(3.6, 10, cq.Vector(17, 0, 10)))              # acknowledge button
    body = body.cut(cq.Workplane("XZ").center(0, 5).slot2D(10, 4).extrude(-10).translate((0, 22, 0)))  # USB-C
    lug = cq.Workplane("XY").box(10, 30, 6, centered=(True, True, False)).cut(
        cq.Workplane("XY").box(4, 24, 10).translate((0, 0, 3)))
    body = body.union(lug.translate((-30, 0, 4.5))).union(lug.translate((30, 0, 4.5)))
    screen = cq.Workplane("XY").box(25, 14, 0.8, centered=(True, True, False)).translate((-4, 2, 13.4))
    btn = cq.Solid.makeCylinder(3.2, 1.2, cq.Vector(17, 0, 14.6))
    strap = (cq.Workplane("YZ").rect(24, 1.6).extrude(70, both=True).translate((0, 0, 7.5))
             .edges("|X").fillet(0.7))
    m = cq.Location(cq.Vector(x, y, 0), cq.Vector(0, 0, 1), 18)
    return body.val().moved(m), screen.val().moved(m), btn.moved(m), strap.val().moved(m)


badge_body, badge_screen, badge_btn, badge_strap = badge_parts()

# ---------------------------------------------------------------- export
n_up = (N.x, N.y, N.z)
PARTS = [  # name, shape, material, explode (dx, dy, dz) in mm
    ("housing_top", shell.val(), "petg_teal", (0, 0, 0)),
    ("base_plate", plate.val(), "petg_white", (0, 0, -95)),
    ("battery_door", door.val(), "petg_white", (0, 0, -190)),
    ("rubber_feet", feet, "rubber", (0, 0, -205)),
    ("lipo_3000mAh", lipo, "lipo", (0, 0, -150)),
    ("perfboard_and_modules", pcbs, "pcb", (0, 0, -95)),
    ("esp32s3_parts", modules, "metal", (0, 0, -95)),
    ("tp4056_usbc", compound([tp, usbc]), "pcb", (0, 0, -95)),
    ("mode_switch", mode_sw, "black", (0, 0, -95)),
    ("speaker_40mm", speaker, "metal", tuple(-28 * c for c in n_up)),
    ("inmp441_mic", mic, "pcb", tuple(-18 * c for c in n_up)),
    ("ws2812b_leds", leds, "led", tuple(-14 * c for c in n_up)),
    ("status_lightpipe", lightpipe, "clear", tuple(14 * c for c in n_up)),
    ("jacks_3p5mm", jacks, "metal", (0, 40, 0)),
    ("power_rocker", rocker, "black", (0, 40, 0)),
    ("bezels_lightring", bezels, "translucent", tuple(22 * c for c in n_up)),
    ("arcade_buttons", buttons, "black", tuple(48 * c for c in n_up)),
    *[(f"keycaps_{name.split()[0]}", caps_by_class[name], f"cap_{i}", tuple(78 * c for c in n_up))
      for i, (name, _, _) in enumerate(VOCAB)],
    *[(f"pictures_{name.split()[0]}", pics_by_class[name], f"pic_{i}", tuple(96 * c for c in n_up))
      for i, (name, _, _) in enumerate(VOCAB)],
    ("lenses", lenses, "clear", tuple(108 * c for c in n_up)),
    ("keyguard_acrylic", keyguard, "acrylic", tuple(132 * c for c in n_up)),
    ("thumb_screws", thumbs, "metal", tuple(152 * c for c in n_up)),
    ("access_switch_base", puck_base, "petg_teal", (0, 0, 0)),
    ("access_switch_floor", puck_floor, "petg_white", (0, 0, -30)),
    ("access_switch_button", puck_btn, "black", (0, 0, 25)),
    ("access_switch_paddle", puck_paddle, "cap_3", (0, 0, 55)),
    ("badge_case", badge_body, "petg_teal", (0, 0, 0)),
    ("badge_oled", badge_screen, "screen", (0, 0, 18)),
    ("badge_button", badge_btn, "cap_1", (0, 0, 26)),
    ("badge_strap", badge_strap, "rubber", (0, 0, -18)),
]
PRINTED = {"housing_top", "base_plate", "battery_door", "bezels_lightring", "keycaps_people", "keycaps_actions",
           "keycaps_things", "keycaps_urgent", "access_switch_base", "access_switch_floor", "access_switch_paddle",
           "badge_case"}

COLORS = {"petg_teal": (0.06, 0.45, 0.48, 1), "petg_white": (0.80, 0.82, 0.85, 1), "rubber": (0.1, 0.1, 0.1, 1),
          "lipo": (0.55, 0.62, 0.72, 1), "pcb": (0.05, 0.35, 0.18, 1), "metal": (0.7, 0.7, 0.72, 1),
          "black": (0.08, 0.08, 0.09, 1), "led": (1.0, 1.0, 0.95, 1), "clear": (0.85, 0.95, 1.0, 0.3),
          "translucent": (0.97, 0.97, 0.94, 0.6), "acrylic": (0.85, 0.95, 1.0, 0.25), "screen": (0.02, 0.05, 0.1, 1)}
for i, (_, rgb, _) in enumerate(VOCAB):
    COLORS[f"cap_{i}"] = (*rgb, 1)
    COLORS[f"pic_{i}"] = tuple(0.55 + 0.45 * c for c in rgb) + (1,)

assy = cq.Assembly(name="VaaniBoard_v2")
meta = {"parts": [], "keys": [], "normal": n_up}
for name, shape, mat, ex in PARTS:
    assy.add(shape, name=name, color=cq.Color(*COLORS[mat]))
    cq.exporters.export(shape, os.path.join(OUT, "stl", f"{name}.stl"), tolerance=0.03, angularTolerance=0.15)
    if name in PRINTED:
        cq.exporters.export(shape, os.path.join(OUT, "step", f"{name}.step"))
    meta["parts"].append({"name": name, "material": mat, "color": COLORS[mat], "explode": ex})
assy.export(os.path.join(OUT, "step", "VaaniBoard_v2_assembly.step"))

for ci, ri, u, v, rgb, word in keys():
    meta["keys"].append({"word": word, "class": VOCAB[ci][0], "pos": tuple(P(u, v, KEYCAP_TOP - 1.15).toTuple())})
meta["params"] = {"W": W, "D": D, "H_FRONT": H_FRONT, "H_BACK": round(H_BACK, 1), "TILT": TILT, "WALL": WALL,
                  "PITCH": PITCH, "KG_HOLE": KG_HOLE, "KEYCAP_D": KEYCAP_D, "PICTURE_D": PICTURE_D,
                  "L_SLOPE": round(L_SLOPE, 1)}
with open(os.path.join(OUT, "render", "parts.json"), "w") as f:
    json.dump(meta, f, indent=1)

vol = shell.val().Volume() + plate.val().Volume()
print(f"housing {W:.0f} x {D:.0f} mm, height {H_FRONT:.0f}->{H_BACK:.1f} mm; "
      f"printed housing+plate volume {vol / 1000:.0f} cm3 (~{vol / 1000 * 1.27:.0f} g PETG at 100% infill)")
