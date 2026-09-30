"""Background removal with a small ONNX segmentation model that runs inside the Lambda.

This is pure segmentation: it produces a mask, and the piece's pixels stay exactly as photographed.
Nothing is generated or "improved". The model file lives in S3 (too big for the zip) and is copied
to /tmp once per warm container.
"""
import os
import threading

import numpy as np
from PIL import Image

from core import env, processed_bucket, s3

_MODEL_PATH = "/tmp/segment.onnx"
_MEAN = np.array((0.485, 0.456, 0.406), dtype=np.float32)
_SIZE = 1024
_lock = threading.Lock()
_session = None


def _load():
    global _session
    with _lock:
        if _session is None:
            import onnxruntime as ort

            path = os.environ.get("SEGMENT_MODEL_PATH")  # local override for development and tests
            if not path:
                path = _MODEL_PATH
                if not os.path.exists(path):
                    s3().download_file(processed_bucket(), env("SEGMENT_MODEL_KEY"), path)
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            _session = ort.InferenceSession(path, options, providers=["CPUExecutionProvider"])
        return _session


def segment_alpha(image: Image.Image) -> np.ndarray:
    """Soft foreground mask in [0, 1] with the same height and width as `image`."""
    session = _load()
    w, h = image.size
    x = np.asarray(image.convert("RGB").resize((_SIZE, _SIZE), Image.LANCZOS), dtype=np.float32)
    x = x / max(float(x.max()), 1e-6)
    x = (x - _MEAN).transpose(2, 0, 1)[None].astype(np.float32)
    out = session.run(None, {session.get_inputs()[0].name: x})[0][0, 0]
    out = (out - out.min()) / max(float(out.max() - out.min()), 1e-6)
    mask = Image.fromarray((out * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    return np.asarray(mask, dtype=np.float32) / 255
