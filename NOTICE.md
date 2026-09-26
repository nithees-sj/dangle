# Notices

Dangle is an original GNOME Shell extension. All artwork (charms and icons) in
`extension/charms/` and `extension/icons/` was drawn for this project.

## Ported ideas and values

The rope solver in `core/` is a JavaScript port of the *ideas and numeric values*
of the Verlet rope simulation in **Hangly for Windows**
(https://github.com/SharanCreatedThis/Hangly-Windows), which is MIT licensed.
Specifically:

- `core/rope.js` — solver step order (pin → integrate → drive held node → relax →
  stretch clamp), physics constants (gravity, damping, reach ratio,
  max speed, initial release angle), push speed formula, drag reach clamp,
  anchor translation that preserves motion, charm-pair separation constraint.
- `core/ropeStyles.js` — the nine rope styles' physics profiles and colour
  palette values (stretch ceilings and iteration budgets re-tuned for Dangle).
- `core/charmLayout.js` — attachment nodes and size scales for 1–3 charms per
  cord, and the clearance rule that caps charm radii.

No code, image, icon or other asset was copied from that project, and its
branding is not used. Its artwork is not licensed for reuse and none is included.

### MIT License (Hangly for Windows)

```
MIT License

Copyright (c) 2026 sharancreatedthis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
