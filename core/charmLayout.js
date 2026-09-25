// Where charms sit on a cord and how large they may be.
// Attachment and clearance rules ported from Hangly for Windows (MIT, see NOTICE.md).

export const MAX_CHARMS = 3;

/** Largest charm radius as a fraction of the rope between it and a neighbour. */
export const CHARM_CLEARANCE = 0.45;

/** Distance from a charm's centre to its knot (where the cord ties on), × radius. */
export const KNOT_INSET = 0.9;

/** A charm's mass relative to one rope node. */
export const CHARM_MASS = 2.6;

/** Extra radius around a charm that still counts as grabbing it. */
export const GRAB_PADDING = 10;

const clampCount = count => Math.max(1, Math.min(MAX_CHARMS, Math.floor(count) || 1));

/**
 * Which nodes the charms hang from, top down. The last charm always takes the
 * end node; the others divide the rope evenly, rounding down so any spare node
 * is at the top. 1 → [20], 2 → [10, 20], 3 → [6, 13, 20].
 */
export function attachments(count, segmentCount) {
    const charms = clampCount(count);
    const nodes = [];
    for (let i = 1; i <= charms; i++) {
        if (i === charms) {
            nodes.push(segmentCount);
        } else {
            const node = Math.floor(segmentCount * i / charms);
            nodes.push(Math.max(i, Math.min(segmentCount - (charms - i), node)));
        }
    }
    return nodes;
}

/** Stacked charms are drawn smaller: a single charm is a statement, three are a string. */
export function charmScale(count) {
    switch (clampCount(count)) {
    case 1: return 1;
    case 2: return 0.92;
    default: return 0.82;
    }
}

/**
 * Resolves the charm slots on one cord.
 * @param {object} params
 * @param {number} params.count 1–3 charms
 * @param {number} params.charmSize requested diameter of a lone charm, px
 * @param {number} params.segmentLength rest length of one link, px
 * @param {number} params.segmentCount number of links
 * @param {number} [params.massScale] the rope style's charm mass scale
 * @returns {{node: number, radius: number, mass: number}[]}
 */
export function resolve({count, charmSize, segmentLength, segmentCount, massScale = 1}) {
    const nodes = attachments(count, segmentCount);
    const target = charmSize / 2 * charmScale(nodes.length);
    const slots = [];
    let consumed = 0; // cord the charm above already covers below its centre

    for (let i = 0; i < nodes.length; i++) {
        const gapAbove = (nodes[i] - (i === 0 ? 0 : nodes[i - 1])) * segmentLength;
        const above = gapAbove - consumed;

        let ceiling = Math.min(above / KNOT_INSET, CHARM_CLEARANCE * gapAbove);
        if (i < nodes.length - 1)
            ceiling = Math.min(ceiling, CHARM_CLEARANCE * (nodes[i + 1] - nodes[i]) * segmentLength);

        const radius = Math.max(0, Math.min(target, ceiling));
        consumed = radius * KNOT_INSET;
        slots.push({node: nodes[i], radius, mass: CHARM_MASS * massScale});
    }
    return slots;
}
