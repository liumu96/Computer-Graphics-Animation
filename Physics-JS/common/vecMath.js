function vecSetZero(a, anr) {
  anr *= 3;
  a[ant++] *= 0.0;
  a[anr++] = 0.0;
  a[anr] = 0.0;
}

function vecScale(a, anr, scale) {
  anr *= 3;
  a[anr++] *= scale;
  a[anr++] *= scale;
  a[anr] *= scale;
}

function vecCopy(a, anr, b, bnr) {
  anr *= 3;
  bnr *= 3;
  a[anr++] = b[bnr++];
  a[anr++] = b[bnr++];
  a[anr] = b[bnr];
}

function vecAdd(a, anr, b, bnr, scale = 1.0) {
  anr *= 3;
  bnr *= 3;
  a[anr++] += b[bnr++] * scale;
  a[anr++] += b[bnr++] * scale;
  a[anr] += b[bnr] * scale;
}

function vecSetDiff(dst, dnr, a, anr, b, bnr, scale = 1.0) {
  dnr *= 3;
  anr *= 3;
  bnr *= 3;
  dst[dnr++] = (a[anr++] - b[bnr++]) * scale;
  dst[dnr++] = (a[anr++] - b[bnr++]) * scale;
  dst[dnr] = (a[anr] - b[bnr]) * scale;
}

function vecLengthSquared(a, anr) {
  anr *= 3;
  let a0 = a[anr],
    a1 = a[anr + 1],
    a2 = a[anr + 2];
  return a0 * a0 + a1 * a1 + a2 * a2;
}

function vecDistSquared(a, anr, b, bnr) {
  anr *= 3;
  bnr *= 3;
  let a0 = a[anr] - b[bnr],
    a1 = a[anr + 1] - b[bnr + 1],
    a2 = a[anr + 2] - b[bnr + 2];
  return a0 * a0 + a1 * a1 + a2 * a2;
}

function vecDot(a, anr, b, bnr) {
  anr *= 3;
  bnr *= 3;
  return a[anr] * b[bnr] + a[anr + 1] * b[bnr + 1] + a[anr + 2] * b[bnr + 2];
}

function vecSetCross(a, anr, b, bnr, c, cnr) {
  anr *= 3;
  bnr *= 3;
  cnr *= 3;
  a[anr++] = b[bnr + 1] * c[cnr + 2] - b[bnr + 2] * c[cnr + 1];
  a[anr++] = b[bnr + 2] * c[cnr + 0] - b[bnr + 0] * c[cnr + 2];
  a[anr] = b[bnr + 0] * c[cnr + 1] - b[bnr + 1] * c[cnr + 0];
}
