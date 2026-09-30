"""Render N evenly spaced "photos" of a glTF object on a plain background (Blender, headless).

Usage:
  blender --background --python scripts/render_turntable.py -- \
      --model path/to/model.gltf --out path/to/output_dir [--frames 12] [--size 1024] \
      [--samples 64] [--limit 0] [--elevation 15]

The object turns on a virtual turntable while the camera and lights stay fixed, exactly like a real
product shoot, so patterns and marks travel around the piece consistently. Used to produce
demonstration photo sets from CC0 scanned models (Poly Haven); never used on real customers' pieces.
"""
import argparse
import math
import os
import sys
import time

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--frames", type=int, default=12)
    p.add_argument("--size", type=int, default=1024)
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--limit", type=int, default=0, help="render only the first N frames (0 = all)")
    p.add_argument("--elevation", type=float, default=24.0, help="camera angle above the horizon, degrees")
    p.add_argument("--exposure", type=float, default=0.0, help="exposure compensation in EV (negative for white pieces)")
    return p.parse_args(argv)


def enable_gpu(scene):
    """Use the GPU when Cycles can (OptiX, then CUDA); otherwise stay on the CPU."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == kind]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type == kind
                    scene.cycles.device = "GPU"
                    print(f"[render] device: {kind} -> {[d.name for d in gpus]}")
                    return
            except Exception as err:  # noqa: BLE001
                print(f"[render] {kind} unavailable: {err}")
    except Exception as err:  # noqa: BLE001
        print(f"[render] GPU setup failed: {err}")
    scene.cycles.device = "CPU"
    print("[render] device: CPU")


def world_bounds(objects):
    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return lo, hi


def add_area_light(name, location, energy, size, target):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.size = size
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    track = obj.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    return obj


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    bpy.ops.import_scene.gltf(filepath=args.model)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("No mesh found in the model")

    # Normalize: largest extent = 1 (height or horizontal diagonal, since the piece turns), base on
    # z = 0, centered on the origin, all parts under one turntable empty.
    lo, hi = world_bounds(meshes)
    extent = max(hi.z - lo.z, math.hypot(hi.x - lo.x, hi.y - lo.y))
    turntable = bpy.data.objects.new("Turntable", None)
    scene.collection.objects.link(turntable)
    for o in meshes:
        o.parent = turntable
        o.matrix_parent_inverse = turntable.matrix_world.inverted()
    scale = 1.0 / extent
    turntable.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    lo, hi = world_bounds(meshes)
    turntable.location = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    bpy.context.view_layer.update()
    lo, hi = world_bounds(meshes)
    print(f"[render] object bounds after normalizing: {tuple(round(v, 3) for v in lo)} .. {tuple(round(v, 3) for v in hi)}")

    # The turntable must spin around the object's own vertical axis, so pivot from the origin.
    pivot = bpy.data.objects.new("Pivot", None)
    scene.collection.objects.link(pivot)
    turntable.parent = pivot

    # Seamless plain paper: a big matte plane with a neutral world of a similar tone.
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    paper = bpy.context.active_object
    mat = bpy.data.materials.new("Paper")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.42, 0.42, 0.42, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    paper.data.materials.append(mat)
    # The world color is tuned to match the lit paper so the horizon disappears into the backdrop.
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.56, 0.56, 0.56, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world

    mid_height = hi.z / 2
    center = bpy.data.objects.new("Look", None)
    center.location = (0, 0, mid_height)
    scene.collection.objects.link(center)
    add_area_light("Key", (-1.8, -2.2, 2.2), 170, 2.0, center)
    add_area_light("Fill", (2.4, -1.6, 1.2), 45, 3.0, center)
    add_area_light("Top", (0.0, 0.3, 3.0), 35, 3.0, center)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 60
    cam = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    fov = 2 * math.atan(cam_data.sensor_width / (2 * cam_data.lens))
    # The piece (largest extent 1) should fill most of the frame: more pixels on the object means
    # cleaner masks later, when the background is removed.
    distance = (1.0 * 1.2) / (2 * math.tan(fov / 2))
    el = math.radians(args.elevation)
    cam.location = (0, -distance * math.cos(el), mid_height + distance * math.sin(el))
    track = cam.constraints.new("TRACK_TO")
    track.target = center
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    scene.render.engine = "CYCLES"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = args.size
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = args.exposure
    enable_gpu(scene)

    total = args.limit or args.frames
    for i in range(total):
        pivot.rotation_euler.z = math.radians(i * 360.0 / args.frames)
        scene.render.filepath = os.path.join(args.out, f"{i + 1:02d}.jpg")
        started = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[render] frame {i + 1}/{total} at {i * 360.0 / args.frames:.0f} deg took {time.time() - started:.1f}s")


main()
