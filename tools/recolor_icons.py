#!/usr/bin/env python3
"""Give the app icons another background colour.
The icons are a white drawing on one flat colour, so every pixel is a mix of the two: the mix is read off the old
picture and applied to the new colour, which keeps the drawing and its smooth edges exactly.
    python3 tools/recolor_icons.py '#c2006a' '#b45309'      (old colour, new colour; icons in docs/icons)"""
import sys, glob, os
import numpy as np, cv2

def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)

old, new = rgb(sys.argv[1]), rgb(sys.argv[2])
ch = int(np.argmin(old))                                   # the channel in which the old colour is farthest from white
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', 'docs', 'icons', '*.png'))):
    im = cv2.imread(f, cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float64)        # RGB
    a = np.clip((im[:, :, ch] - old[ch]) / (255.0 - old[ch]), 0, 1)[:, :, None]    # 0 = background, 1 = white
    out = new[None, None, :] * (1 - a) + 255.0 * a
    cv2.imwrite(f, np.round(out).astype(np.uint8)[:, :, ::-1])
    print(os.path.basename(f), im.shape[1], 'x', im.shape[0])
