class SoftBody {
  constructor(tetMesh, scene, edgeCompliance = 100.0, volCompliance = 0.0) {
    // physics

    this.numParticles = tetMesh.verts.length / 3;
    this.numTets = tetMesh.tetIds.length / 4;
    this.pos = new Float32Array(tetMesh.verts);
    this.prevPos = tetMesh.verts.slice();
    this.vel = new Float32Array(3 * this.numParticles);

    this.tetIds = tetMesh.tetIds;
    this.edgeIds = tetMesh.tetEdgeIds;
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

    // surface tri mesh
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geometry.setIndex(tetMesh.tetSurfaceTriIds);
    const material = new THREE.MeshPhongMaterial({ color: 0xf02000 });
    material.flatShading = true;

    this.surfaceMesh = new THREE.Mesh(geometry, material);
    this.surfaceMesh.geometry.computeVertexNormals();
    this.surfaceMesh.userData = this;
    this.surfaceMesh.layers.enable(1);
    scene.add(this.surfaceMesh);

    this.volIdOrder = [
      [1, 3, 2],
      [0, 2, 3],
      [0, 3, 1],
      [0, 1, 2],
    ];
  }

  translate(x, y, z) {
    for (let i = 0; i < this.numParticles; i++) {
      vecAdd(this.pos, i, [x, y, z], 0);
      vecAdd(this.prevPos, i, [x, y, z], 0);
    }
  }

  updateMeshes() {
    this.surfaceMesh.geometry.computeVertexNormals();
    this.surfaceMesh.geometry.attributes.position.needsUpdate = true;
    this.surfaceMesh.geometry.computeBoundingSphere();
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
    this.updateMeshes();
  }

  solveEdges(compliance, dt) {
    const alpha = compliance / dt / dt; // alpha / (dt)2

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
      const C = len - restLen; // edge constraint
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

  squash() {
    for (let i = 0; i < this.numParticles; i++) {
      this.pos[3 * i + 1] = 0.5;
    }
    this.updateMeshes();
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
