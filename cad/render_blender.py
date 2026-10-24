"""Render VaaniBoard views in Blender (Cycles).

Run:  Blender -b -P render_blender.py -- hero exploded cutaway top rear
"""
import bpy, json, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
META = json.load(open(os.path.join(HERE, "render", "parts.json")))
VIEWS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["hero"]
HIGHLIGHT = {"paani", "khana"}          # keys lit by the "board that listens"
SAMPLES = int(os.environ.get("SAMPLES", "160"))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception:
        pass
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 2000, 1250
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Punchy"
    return sc


def mat(name, rgba, kind):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgba[:3], 1)
    b.inputs["Roughness"].default_value = 0.42
    if kind in ("clear", "acrylic"):
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.02
        b.inputs["IOR"].default_value = 1.49
        b.inputs["Base Color"].default_value = (0.95, 0.98, 1.0, 1)
    elif kind == "translucent":
        b.inputs["Transmission Weight"].default_value = 0.85
        b.inputs["Roughness"].default_value = 0.35
    elif kind == "metal":
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.3
    elif kind == "led":
        b.inputs["Emission Color"].default_value = (1, 1, 1, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    elif kind == "screen":
        b.inputs["Emission Color"].default_value = (0.35, 0.75, 1.0, 1)
        b.inputs["Emission Strength"].default_value = 0.6
    elif kind.startswith("petg"):
        b.inputs["Roughness"].default_value = 0.5
        b.inputs["Coat Weight"].default_value = 0.15
    elif kind.startswith("cap"):
        b.inputs["Roughness"].default_value = 0.3
        b.inputs["Coat Weight"].default_value = 0.4
    return m


def glow_mat(name, rgb, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Emission Color"].default_value = (*rgb, 1)
    b.inputs["Emission Strength"].default_value = strength
    b.inputs["Transmission Weight"].default_value = 0.6
    return m


def import_parts(exploded):
    objs = {}
    for p in META["parts"]:
        path = os.path.join(HERE, "stl", p["name"] + ".stl")
        bpy.ops.wm.stl_import(filepath=path)
        o = bpy.context.selected_objects[0]
        o.name = p["name"]
        o.data.materials.append(mat(p["name"], p["color"], p["material"]))
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
        if exploded:
            o.location = Vector(p["explode"])
        objs[p["name"]] = (o, p)
    return objs


def light_keys(objs, exploded):
    """Split the bezel ring mesh per key; make the highlighted keys glow blue."""
    o, p = objs["bezels_lightring"]
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.mesh.separate(type="LOOSE")
    parts = [x for x in bpy.context.selected_objects]
    blue = glow_mat("glow_blue", (0.15, 0.55, 1.0), 25.0)
    for k in META["keys"]:
        if k["word"] not in HIGHLIGHT:
            continue
        kp = Vector(k["pos"])
        best = min(parts, key=lambda x: (x.matrix_world @ (sum((Vector(v.co) for v in x.data.vertices), Vector()) /
                                                           len(x.data.vertices)) - kp - x.location).length)
        best.data.materials.clear()
        best.data.materials.append(blue)
        light = bpy.data.lights.new("keyglow", "POINT")
        light.energy = 1500
        light.color = (0.3, 0.6, 1.0)
        light.shadow_soft_size = 8
        lo = bpy.data.objects.new("keyglow", light)
        n = Vector(META["normal"])
        lo.location = kp + n * 4 + (Vector(p["explode"]) if exploded else Vector())
        bpy.context.scene.collection.objects.link(lo)


def labels(objs, exploded):
    tilt = math.radians(10)
    off = Vector(objs["pictures_people"][1]["explode"]) if exploded else Vector()
    ink = mat("ink", (0.05, 0.06, 0.08, 1), "ink")
    for k in META["keys"]:
        bpy.ops.object.text_add(location=Vector(k["pos"]) + Vector(META["normal"]) * -0.02 + off,
                                rotation=(tilt, 0, 0))
        t = bpy.context.object
        t.data.body = k["word"]
        t.data.size = 6.0 if len(k["word"]) <= 6 else 4.8
        t.data.align_x, t.data.align_y = "CENTER", "CENTER"
        t.data.extrude = 0.05
        t.data.materials.append(ink)


def stage(sc, center, size):
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(center.x, center.y, -2.0 if True else 0))
    floor = bpy.context.object
    floor.data.materials.append(mat("floor", (0.96, 0.965, 0.97, 1), "floor"))
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.92, 0.95, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    for name, loc, energy, s in [("key", (-450, -420, 650), 9.0e6, 450), ("fill", (550, -250, 380), 3.0e6, 500),
                                 ("rim", (0, 650, 520), 5.0e6, 400)]:
        l = bpy.data.lights.new(name, "AREA")
        l.energy = energy
        l.size = s
        lo = bpy.data.objects.new(name, l)
        lo.location = Vector(loc) + Vector((center.x, center.y, 0))
        d = center - lo.location
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(lo)


def camera(sc, loc, target, lens=50, ortho=None):
    c = bpy.data.cameras.new("cam")
    c.lens = lens
    c.clip_end = 20000
    if ortho:
        c.type = "ORTHO"
        c.ortho_scale = ortho
    o = bpy.data.objects.new("cam", c)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(o)
    sc.camera = o


def cut(objs, names, xmin):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(xmin + 500, 125, 50), scale=(1000, 1000, 1000))
    cutter = bpy.context.object
    cutter.hide_render = True
    for o in list(bpy.data.objects):          # labels on the removed half
        if o.type == "FONT" and o.location.x > xmin - 20:
            bpy.data.objects.remove(o)
    for n in names:
        o = bpy.data.objects.get(n)
        if o is None or o.hide_render or o.type != "MESH":
            continue
        m = o.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.solver = "EXACT"
        m.object = cutter


def render(view):
    sc = reset()
    exploded = view == "exploded"
    objs = import_parts(exploded)
    light_keys(objs, exploded)
    labels(objs, exploded)
    c = Vector((0, 125, 40))
    if exploded:  # lift the stack so parts below the housing clear the floor
        for o in bpy.data.objects:
            if o.parent is None:
                o.location.z += 215
    stage(sc, c, 300)
    if view in ("hero", "hero_board"):
        camera(sc, (430, -400, 400), (5, 105, 20), lens=50)
        if view == "hero_board":
            for n in ("badge_case", "badge_oled", "badge_button", "badge_strap"):
                objs[n][0].hide_render = True
    elif view == "exploded":
        sc.render.resolution_x, sc.render.resolution_y = 1700, 2000
        camera(sc, (470, -470, 400), (0, 112, 205), lens=40)
        for n in ("access_switch_base", "access_switch_floor", "access_switch_button", "access_switch_paddle",
                  "badge_case", "badge_oled", "badge_button", "badge_strap"):
            objs[n][0].hide_render = True
    elif view == "cutaway":
        for n in ("access_switch_base", "access_switch_floor", "access_switch_button", "access_switch_paddle",
                  "badge_case", "badge_oled", "badge_button", "badge_strap"):
            objs[n][0].hide_render = True
        cut(objs, [n for n in objs if not n.startswith("bezels")] +
            [o.name for o in bpy.data.objects if o.name.startswith("bezels")], -25.0)
        camera(sc, (430, -230, 250), (-45, 125, 35), lens=50)
    elif view == "top":
        camera(sc, (0, 125, 900), (0, 125.01, 0), ortho=560)
        sc.render.resolution_x, sc.render.resolution_y = 2000, 1700
    elif view == "rear":
        for n in ("access_switch_base", "access_switch_floor", "access_switch_button", "access_switch_paddle",
                  "badge_case", "badge_oled", "badge_button", "badge_strap"):
            objs[n][0].hide_render = True
        camera(sc, (-330, 720, 250), (15, 150, 40), lens=50)
    sc.render.filepath = os.path.join(HERE, "renders", f"vaaniboard_{view}.png")
    bpy.ops.render.render(write_still=True)


os.makedirs(os.path.join(HERE, "renders"), exist_ok=True)
for v in VIEWS:
    render(v)
