# Trains the small Latin glyph classifier used by src/reader/ (ocrNet in classify.js) and writes src/latin.gen.js.
# Data: /tmp/latin/part-*.bin made by test/gen_latin.js (glyphs drawn from open-source fonts, run through the page's own pipeline).
# usage: python3 train/train_latin.py [holdout|final] [epochs] [h1] [h2]
import numpy as np, json, sys, glob, base64, time, hashlib
mode = sys.argv[1] if len(sys.argv) > 1 else 'holdout'
EPOCHS = int(sys.argv[2]) if len(sys.argv) > 2 else 16
H1 = int(sys.argv[3]) if len(sys.argv) > 3 else 320
H2 = int(sys.argv[4]) if len(sys.argv) > 4 else 160
GS = 3.0
meta = json.load(open('/tmp/latin/faces.json'))
classes = meta['classes']; nL = len(classes); ligs = meta.get('ligs', []); NC = nL + 2 + len(ligs)
faces = meta['faces']
Fs, Gs, ys, fs_ = [], [], [], []
for p in sorted(glob.glob('/tmp/latin/part-*.y.bin')):
    b = p[:-6]
    y = np.fromfile(p, dtype=np.uint8)
    Fs.append(np.fromfile(b + '.F.bin', dtype=np.uint8).reshape(-1, 576)[:len(y)]); Gs.append(np.fromfile(b + '.G.bin', dtype=np.float32).reshape(-1, 5)[:len(y)])
    ys.append(y); fs_.append(np.fromfile(b + '.f.bin', dtype=np.uint16)[:len(y)])
F = np.concatenate(Fs); G = np.concatenate(Gs); y = np.concatenate(ys).astype(np.int64); fid = np.concatenate(fs_)
print('samples', len(y), 'faces', len(np.unique(fid)), 'classes', NC)
# hold out whole families
fam_of = np.array([f['fam'] for f in faces]); cat_of = np.array([f['cat'] for f in faces])
def held(name): return int(hashlib.md5(name.encode()).hexdigest(), 16) % 8 == 0
hold_face = np.array([held(f['fam']) and f['cat'] not in ('sys', 'cjk', 'cjkx') for f in faces])
val = hold_face[fid] if mode == 'holdout' else np.zeros(len(y), bool)
if mode != 'holdout':
    rng0 = np.random.default_rng(5); val = rng0.random(len(y)) < 0.02          # a small random slice, only to watch the loss
tr = ~val
print('train', tr.sum(), 'val', val.sum(), 'held-out families', sorted(set(fam_of[hold_face]))[:60] if mode == 'holdout' else '-')
def feats(Fq, Gq): return np.concatenate([Fq.astype(np.float32) / 255.0, Gq * GS], axis=1)
Xv = feats(F[val], G[val]); yv = y[val]
Ftr, Gtr, ytr = F[tr], G[tr], y[tr]
rng = np.random.default_rng(0)
D = 581
def init(nin, n): return (rng.standard_normal((n, nin)) * np.sqrt(2.0 / nin)).astype(np.float32), np.zeros(n, np.float32)
W1, b1 = init(D, H1); W2, b2 = init(H1, H2); W3, b3 = init(H2, NC)
P = [W1, b1, W2, b2, W3, b3]
M = [np.zeros_like(p) for p in P]; V = [np.zeros_like(p) for p in P]
def fwd(X, P):
    W1, b1, W2, b2, W3, b3 = P
    h1 = np.maximum(X @ W1.T + b1, 0); h2 = np.maximum(h1 @ W2.T + b2, 0); z = h2 @ W3.T + b3
    return h1, h2, z
def acc(X, yy, P, bs=4096):
    pred = np.concatenate([fwd(X[i:i + bs], P)[2].argmax(1) for i in range(0, len(X), bs)])
    return pred, float((pred == yy).mean())
BS = 256; n = len(ytr); steps = EPOCHS * (n // BS); t = 0; LS = 0.05; t0 = time.time()
for ep in range(EPOCHS):
    perm = rng.permutation(n); tot = 0.0
    for i in range(0, n - BS + 1, BS):
        ix = np.sort(perm[i:i + BS])
        Fb = Ftr[ix].astype(np.float32) / 255.0
        # light augmentation: contrast and a little noise
        gam = rng.uniform(0.75, 1.3, (BS, 1)).astype(np.float32)
        Fb = np.clip(Fb, 0, 1) ** gam + 0.03 * rng.standard_normal(Fb.shape, dtype=np.float32)
        Gb = Gtr[ix] + rng.normal(0, 0.015, (BS, 5)).astype(np.float32)
        X = np.concatenate([Fb, Gb * GS], axis=1); yb = ytr[ix]
        h1, h2, z = fwd(X, P)
        z -= z.max(1, keepdims=True); p = np.exp(z); p /= p.sum(1, keepdims=True)
        T = np.full_like(p, LS / NC); T[np.arange(BS), yb] += 1 - LS
        tot += float(-(T * np.log(p + 1e-9)).sum(1).mean())
        dz = (p - T) / BS
        gW3 = dz.T @ h2; gb3 = dz.sum(0); dh2 = (dz @ P[4]) * (h2 > 0)
        gW2 = dh2.T @ h1; gb2 = dh2.sum(0); dh1 = (dh2 @ P[2]) * (h1 > 0)
        gW1 = dh1.T @ X; gb1 = dh1.sum(0)
        t += 1
        lr = 1.5e-3 * 0.5 * (1 + np.cos(np.pi * t / steps)) + 2e-5
        for k, g in enumerate([gW1, gb1, gW2, gb2, gW3, gb3]):
            M[k] = 0.9 * M[k] + 0.1 * g; V[k] = 0.999 * V[k] + 0.001 * g * g
            P[k] -= (lr * (M[k] / (1 - 0.9 ** t)) / (np.sqrt(V[k] / (1 - 0.999 ** t)) + 1e-8)).astype(np.float32)
        if t % 100 == 0:                      # inputs that are always empty leave moments that decay into denormals, which are very slow
            for k in range(6): M[k][np.abs(M[k]) < 1e-18] = 0; V[k][V[k] < 1e-30] = 0
    _, a = acc(Xv, yv, P)
    print('epoch', ep + 1, 'loss %.4f' % (tot / (n // BS)), 'val acc %.4f' % a, '%ds' % (time.time() - t0), flush=True)
# quantise weights to int8 per layer and check nothing was lost
Q = []
for k in (0, 2, 4):
    W = P[k]; s = float(np.abs(W).max() / 127.0); q = np.clip(np.round(W / s), -127, 127).astype(np.int8)
    Q.append((q, s, P[k + 1].astype(np.float32)))
Pq = [Q[0][0].astype(np.float32) * Q[0][1], Q[0][2], Q[1][0].astype(np.float32) * Q[1][1], Q[1][2], Q[2][0].astype(np.float32) * Q[2][1], Q[2][2]]
pred, a = acc(Xv, yv, Pq)
print('quantised val acc %.4f' % a)
names = list(classes) + ['汉', '∅'] + ligs
# accuracy when look-alikes that shape alone cannot settle count as one
groups = ['oO0', 'lI1|', 'cC', 'sS', 'vV', 'wW', 'xX', 'zZ', 'uU', 'kK', 'pP', "',", '.·', '-–—_']
gid = {c: c for c in names}
for g in groups:
    for c in g: gid[c] = g[0]
gy = np.array([names.index(gid[names[i]]) for i in range(NC)])
print('val acc with look-alikes merged %.4f' % float((gy[pred] == gy[yv]).mean()))
if mode == 'holdout':
    cats = cat_of[fid[val]]
    for c in sorted(set(cats)): m = cats == c; print('  category', c, 'n', m.sum(), 'acc %.4f' % float((pred[m] == yv[m]).mean()), 'merged %.4f' % float((gy[pred[m]] == gy[yv[m]]).mean()))
    conf = {}
    for a_, b_ in zip(yv[pred != yv], pred[pred != yv]): conf[(names[a_], names[b_])] = conf.get((names[a_], names[b_]), 0) + 1
    print('top confusions (truth→read):', ' '.join('%s→%s:%d' % (k[0], k[1], v) for k, v in sorted(conf.items(), key=lambda kv: -kv[1])[:60]))
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
layers = [{'nin': int(q.shape[1]), 'n': int(q.shape[0]), 'scale': s, 'w': b64(q), 'b': b64(b)} for q, s, b in Q]
out = ('/* Generated by train/train_latin.py. A small classifier for Latin letters, digits and punctuation, trained for this page\n'
       '   on glyphs drawn from open-source fonts and run through the page\'s own pipeline (test/gen_latin.js, gen_cjk.js, gen_extra.js).\n'
       '   Class \\u0001 means "a Chinese character", \\u0002 "not one glyph"; fi fl ff ffi ffl are the joined forms. Weights are int8, one row per output. */\n'
       'const OCR_NET = ' + json.dumps({'classes': list(classes) + ['\u0001', '\u0002'] + ligs, 'gs': GS, 'layers': layers}, ensure_ascii=True) + ';\n')
dst = 'src/latin.gen.js' if mode == 'final' else '/tmp/latin/latin.holdout.js'
open(dst, 'w').write(out)
print('wrote', dst, '%.0f KB' % (len(out) / 1024))
