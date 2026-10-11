#!/usr/bin/env python3
"""Encode the staged CC0 WAV clips into tight, game-ready Ogg Vorbis files.

Mono, peak-normalised, trimmed, and gently faded so nothing clicks. Used by
tools/fetch-assets.mjs (which provisions a venv with numpy + soundfile).
"""
import sys
import os
import numpy as np
import soundfile as sf

SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)

TARGET = 0.89          # peak normalisation target
THRESH = 0.0015        # silence trim threshold
PAD = 0.004            # seconds of fade at both ends
COMPRESSION = 0.55   # Vorbis VBR quality, 0..1 (~110 kbps mono — transparent for SFX)

total_in = total_out = 0
for name in sorted(os.listdir(SRC)):
    if not name.lower().endswith(".wav"):
        continue
    data, sr = sf.read(os.path.join(SRC, name), dtype="float32", always_2d=True)
    x = data.mean(axis=1)                       # downmix to mono

    # trim leading/trailing silence
    nz = np.flatnonzero(np.abs(x) > THRESH)
    if nz.size:
        a, b = max(0, nz[0] - int(0.002 * sr)), min(len(x), nz[-1] + int(0.006 * sr))
        x = x[a:b]

    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    if peak > 1e-6:
        x = x * (TARGET / peak)

    fade = max(1, int(PAD * sr))
    if len(x) > fade * 2:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        x[:fade] *= ramp
        x[-fade:] *= ramp[::-1]

    out = os.path.join(DST, os.path.splitext(name)[0] + ".ogg")
    try:
        sf.write(out, x, sr, format="OGG", subtype="VORBIS", compression_level=COMPRESSION)
    except TypeError:  # older libsndfile bindings
        sf.write(out, x, sr, format="OGG", subtype="VORBIS")
    si, so = os.path.getsize(os.path.join(SRC, name)), os.path.getsize(out)
    total_in += si
    total_out += so

print(f"encoded {len(os.listdir(DST))} clips: "
      f"{total_in/1048576:.1f} MB wav -> {total_out/1048576:.2f} MB ogg "
      f"({100*(1-total_out/max(total_in,1)):.0f}% smaller)")
