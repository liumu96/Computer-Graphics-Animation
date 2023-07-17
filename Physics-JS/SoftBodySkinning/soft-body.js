class SoftBody {
  constructor(
    tetMesh,
    visMesh,
    scene,
    edgeCompliance = 0.0,
    volCompliance = 0.0
  ) {
    // physics

    this.numParticles = tetMesh.verts.length / 3;
    this.numTets = tetMesh.tetIds.length / 4;
    this.pos = new Float32Array(tetMesh.verts);
    this.prevPos = tetMesh.verts.slice();
    this.vel = new Float32Array(3 * this.numParticles);

    this.tetIds = tetMesh.tetIds;
    this.edgeIds = tetMesh.edgeIds;
    this.restVol = new Float32Array(this.numTets);
    this.edgeLengths = new Float32Array(this.edgeIds.length / 2);
    this.invMass = new Float32Array(this.numParticles);

    this.edgeCompliance = edgeCompliance;
    this.volCompliance = volCompliance;

    this.temp = new Float32Array(4 * 3);
    this.grads = new Float32Array(4 * 3);

    this.grabId = -1;
    this.grabInvMass = 0.0;

    this.initPhysics();

    // visual tet mesh

    const tetGeometry = new THREE.BufferGeometry();
    tetGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3)
    );
    tetGeometry.setIndex(tetMesh.edgeIds);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
    });
    this.tetMesh = new THREE.LineSegments(tetGeometry, lineMaterial);
    scene.add(this.tetMesh);
    this.tetMesh.visible = false;

    // visual embedded mesh

    this.numVisVerts = visMesh.verts.length / 3;
    this.skinningInfo = new Float32Array(4 * this.numVisVerts);
    this.computeSkinningInfo(visMesh.verts);

    const visGeometry = new THREE.BufferGeometry();
    visGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(3 * this.numVisVerts), 3)
    );
    visGeometry.setIndex(visMesh.triIds);
    const visMaterial = new THREE.MeshPhongMaterial({ color: 0xf78a1d });
    this.visMesh = new THREE.Mesh(visGeometry, visMaterial);
    this.visMesh.castShadow = true;
    this.visMesh.userData = this; // for raycasting
    this.visMesh.layers.enable(1);
    scene.add(this.visMesh);
    visGeometry.computeVertexNormals();
    this.updateVisMesh();

    this.volIdOrder = [
      [1, 3, 2],
      [0, 2, 3],
      [0, 3, 1],
      [0, 1, 2],
    ];
  }

  computeSkinningInfo(visVerts) {
    // create a hash for all vertices of the visual mesh

    const hash = new Hash(0.05, this.numVisVerts);
    hash.create(visVerts);

    this.skinningInfo.fill(-1.0); // undefined

    const minDist = new Float32Array(this.numVisVerts);
    minDist.fill(Number.MAX_VALUE);
    const border = 0.05;

    // each tet searches for containing vertices

    const tetCenter = new Float32Array(3);
    const mat = new Float32Array(9);
    const bary = new Float32Array(4);

    for (let i = 0; i < this.numTets; i++) {
      // compute bounding sphere of tet

      tetCenter.fill(0.0);
      for (let j = 0; j < 4; j++)
        vecAdd(tetCenter, 0, this.pos, this.tetIds[4 * i + j], 0.25);

      let rMax = 0.0;
      for (let j = 0; j < 4; j++) {
        const r2 = vecDistSquared(
          tetCenter,
          0,
          this.pos,
          this.tetIds[4 * i + j]
        );
        rMax = Math.max(rMax, Math.sqrt(r2));
      }

      rMax += border;

      hash.query(tetCenter, 0, rMax);
      if (hash.queryIds.length == 0) continue;

      const id0 = this.tetIds[4 * i];
      const id1 = this.tetIds[4 * i + 1];
      const id2 = this.tetIds[4 * i + 2];
      const id3 = this.tetIds[4 * i + 3];

      vecSetDiff(mat, 0, this.pos, id0, this.pos, id3);
      vecSetDiff(mat, 1, this.pos, id1, this.pos, id3);
      vecSetDiff(mat, 2, this.pos, id2, this.pos, id3);

      matSetInverse(mat);

      for (let j = 0; j < hash.queryIds.length; j++) {
        const id = hash.queryIds[j];

        // we already have skinning info

        if (minDist[id] <= 0.0) continue;

        if (vecDistSquared(visVerts, id, tetCenter, 0) > rMax * rMax) continue;

        // compute barycentric coords for candidate

        vecSetDiff(bary, 0, visVerts, id, this.pos, id3);
        matSetMult(mat, bary, 0, bary, 0);
        bary[3] = 1.0 - bary[0] - bary[1] - bary[2];

        let dist = 0.0;
        for (let k = 0; k < 4; k++) dist = Math.max(dist, -bary[k]);

        if (dist < minDist[id]) {
          minDist[id] = dist;
          this.skinningInfo[4 * id] = i;
          this.skinningInfo[4 * id + 1] = bary[0];
          this.skinningInfo[4 * id + 2] = bary[1];
          this.skinningInfo[4 * id + 3] = bary[2];
        }
      }
    }
  }

  getTetVolume(nr) {
    const id0 = this.tetIds[4 * nr];
    const id1 = this.tetIds[4 * nr + 1];
    const id2 = this.tetIds[4 * nr + 2];
    const id3 = this.tetIds[4 * nr + 3];
    vecSetDiff(this.temp, 0, this.pos, id1, this.pos, id0);
    vecSetDiff(this.temp, 1, this.pos, id2, this.pos, id0);
    vecSetDiff(this.temp, 2, this.pos, id3, this.pos, id0);
    vecSetCross(this.temp, 3, this.temp, 0, this.temp, 1);
    return vecDot(this.temp, 3, this.temp, 2) / 6.0;
  }

  initPhysics() {
    this.invMass.fill(0.0);
    this.restVol.fill(0.0);

    for (let i = 0; i < this.numTets; i++) {
      const vol = this.getTetVolume(i);
      this.restVol[i] = vol;
      const pInvMass = vol > 0.0 ? 1.0 / (vol / 4.0) : 0.0;
      this.invMass[this.tetIds[4 * i]] += pInvMass;
      this.invMass[this.tetIds[4 * i + 1]] += pInvMass;
      this.invMass[this.tetIds[4 * i + 2]] += pInvMass;
      this.invMass[this.tetIds[4 * i + 3]] += pInvMass;
    }
    for (let i = 0; i < this.edgeLengths.length; i++) {
      const id0 = this.edgeIds[2 * i];
      const id1 = this.edgeIds[2 * i + 1];
      this.edgeLengths[i] = Math.sqrt(
        vecDistSquared(this.pos, id0, this.pos, id1)
      );
    }
  }

  preSolve(dt, gravity) {
    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] == 0.0) continue;
      vecAdd(this.vel, i, gravity, 0, dt);
      vecCopy(this.prevPos, i, this.pos, i);
      vecAdd(this.pos, i, this.vel, i, dt);
      const y = this.pos[3 * i + 1];
      if (y < 0.0) {
        vecCopy(this.pos, i, this.prevPos, i);
        this.pos[3 * i + 1] = 0.0;
      }
    }
  }

  solve(dt) {
    this.solveEdges(this.edgeCompliance, dt);
    this.solveVolumes(this.volCompliance, dt);
  }

  postSolve(dt) {
    for (let i = 0; i < this.numParticles; i++) {
      if (this.invMass[i] == 0.0) continue;
      vecSetDiff(this.vel, i, this.pos, i, this.prevPos, i, 1.0 / dt);
    }
  }

  solveEdges(compliance, dt) {
    const alpha = compliance / dt / dt;

    for (let i = 0; i < this.edgeLengths.length; i++) {
      const id0 = this.edgeIds[2 * i];
      const id1 = this.edgeIds[2 * i + 1];
      const w0 = this.invMass[id0];
      const w1 = this.invMass[id1];
      const w = w0 + w1;
      if (w == 0.0) continue;

      vecSetDiff(this.grads, 0, this.pos, id0, this.pos, id1);
      const len = Math.sqrt(vecLengthSquared(this.grads, 0));
      if (len == 0.0) continue;
      vecScale(this.grads, 0, 1.0 / len);
      const restLen = this.edgeLengths[i];
      const C = len - restLen;
      const s = -C / (w + alpha);
      vecAdd(this.pos, id0, this.grads, 0, s * w0);
      vecAdd(this.pos, id1, this.grads, 0, -s * w1);
    }
  }

  solveVolumes(compliance, dt) {
    const alpha = compliance / dt / dt;

    for (let i = 0; i < this.numTets; i++) {
      let w = 0.0;

      for (let j = 0; j < 4; j++) {
        const id0 = this.tetIds[4 * i + this.volIdOrder[j][0]];
        const id1 = this.tetIds[4 * i + this.volIdOrder[j][1]];
        const id2 = this.tetIds[4 * i + this.volIdOrder[j][2]];

        vecSetDiff(this.temp, 0, this.pos, id1, this.pos, id0);
        vecSetDiff(this.temp, 1, this.pos, id2, this.pos, id0);
        vecSetCross(this.grads, j, this.temp, 0, this.temp, 1);
        vecScale(this.grads, j, 1.0 / 6.0);

        w +=
          this.invMass[this.tetIds[4 * i + j]] *
          vecLengthSquared(this.grads, j);
      }
      if (w == 0.0) continue;

      const vol = this.getTetVolume(i);
      const restVol = this.restVol[i];
      const C = vol - restVol;
      const s = -C / (w + alpha);

      for (let j = 0; j < 4; j++) {
        const id = this.tetIds[4 * i + j];
        vecAdd(this.pos, id, this.grads, j, s * this.invMass[id]);
      }
    }
  }

  endFrame() {
    this.updateTetMesh();
    this.updateVisMesh();
  }

  updateTetMesh() {
    const positions = this.tetMesh.geometry.attributes.position.array;
    for (let i = 0; i < this.pos.length; i++) positions[i] = this.pos[i];
    this.tetMesh.geometry.attributes.position.needsUpdate = true;
    this.tetMesh.geometry.computeBoundingSphere();
  }

  updateVisMesh() {
    const positions = this.visMesh.geometry.attributes.position.array;
    let nr = 0;
    for (let i = 0; i < this.numVisVerts; i++) {
      let tetNr = this.skinningInfo[nr++] * 4;
      if (tetNr < 0) {
        nr += 3;
        continue;
      }
      const b0 = this.skinningInfo[nr++];
      const b1 = this.skinningInfo[nr++];
      const b2 = this.skinningInfo[nr++];
      const b3 = 1.0 - b0 - b1 - b2;
      const id0 = this.tetIds[tetNr++];
      const id1 = this.tetIds[tetNr++];
      const id2 = this.tetIds[tetNr++];
      const id3 = this.tetIds[tetNr++];
      vecSetZero(positions, i);
      vecAdd(positions, i, this.pos, id0, b0);
      vecAdd(positions, i, this.pos, id1, b1);
      vecAdd(positions, i, this.pos, id2, b2);
      vecAdd(positions, i, this.pos, id3, b3);
    }
    this.visMesh.geometry.computeVertexNormals();
    this.visMesh.geometry.attributes.position.needsUpdate = true;
    this.visMesh.geometry.computeBoundingSphere();
  }

  squash() {
    for (let i = 0; i < this.numParticles; i++) {
      this.pos[3 * i + 1] = 0.5;
    }
    this.endFrame();
  }

  startGrab(pos) {
    const p = [pos.x, pos.y, pos.z];
    let minD2 = Number.MAX_VALUE;
    this.grabId = -1;
    for (let i = 0; i < this.numParticles; i++) {
      const d2 = vecDistSquared(p, 0, this.pos, i);
      if (d2 < minD2) {
        minD2 = d2;
        this.grabId = i;
      }
    }

    if (this.grabId >= 0) {
      this.grabInvMass = this.invMass[this.grabId];
      this.invMass[this.grabId] = 0.0;
      vecCopy(this.pos, this.grabId, p, 0);
    }
  }

  moveGrabbed(pos, vel) {
    if (this.grabId >= 0) {
      const p = [pos.x, pos.y, pos.z];
      vecCopy(this.pos, this.grabId, p, 0);
    }
  }

  endGrab(pos, vel) {
    if (this.grabId >= 0) {
      this.invMass[this.grabId] = this.grabInvMass;
      const v = [vel.x, vel.y, vel.z];
      vecCopy(this.vel, this.grabId, v, 0);
    }
    this.grabId = -1;
  }
}
