/**
 * Hash table for self collision of the Cloth objec
 */
class Hash {
  constructor(spacing, maxNumObjects) {
    this.spacing = spacing;
    this.tableSize = 5 * maxNumObjects;

    // Here, cellStart means where to start looking in cellEntries
    // Add +1 for guard
    this.cellStart = new Int32Array(this.tableSize + 1);

    // Here, cellEntries are the indices of the particles in entire particle list
    this.cellEntries = new Int32Array(maxNumObjects); // particle lookup array
    this.queryIds = new Int32Array(maxNumObjects);
    this.querySize = 0;

    this.maxNumObjects = maxNumObjects;

    // Keep track of where to first index into adjIds
    // so firstAdjId[id] = idx for adjIds
    this.firstAdjId = new Int32Array(maxNumObjects + 1);

    // All particle ids adjacent to a particular id packed into a dense array
    // use firstAdd[id] to access
    this.adjIds = new Int32Array(10 * maxNumObjects);
  }

  hashCoords(xi, yi, zi) {
    const h = (xi * 92837111) ^ (yi * 689287499) ^ (zi * 283923481); // fantasy function
    return Math.abs(h) % this.tableSize;
  }

  intCoord(coord) {
    return Math.floor(coord / this.spacing);
  }

  hashPos(pos, nr) {
    return this.hashCoords(
      this.intCoord(pos[3 * nr]),
      this.intCoord(pos[3 * nr + 1]),
      this.intCoord(pos[3 * nr + 2])
    );
  }

  /**
   * Create the spatial hash table data structure
   * @param {*} pos
   */
  create(pos) {
    const numObjects = Math.min(pos.length / 3, this.cellEntries.length);

    // determine cell sizes
    this.cellStart.fill(0);
    this.cellEntries.fill(0);

    for (let i = 0; i < numObjects; i++) {
      const h = this.hashPos(pos, i);
      this.cellStart[h]++;
    }

    // determine cells starts
    let start = 0;
    for (let i = 0; i < this.tableSize; i++) {
      start += this.cellStart[i];
      this.cellStart[i] = start;
    }
    this.cellStart[this.tableSize] = start; // guard

    // fill in objects ids
    for (let i = 0; i < numObjects; i++) {
      const h = this.hashPos(pos, i);
      this.cellStart[h]--;
      this.cellEntries[this.cellStart[h]] = i;
    }
  }

  query(pos, nr, maxDist) {
    const x0 = this.intCoord(pos[3 * nr] - maxDist);
    const y0 = this.intCoord(pos[3 * nr + 1] - maxDist);
    const z0 = this.intCoord(pos[3 * nr + 2] - maxDist);

    const x1 = this.intCoord(pos[3 * nr] + maxDist);
    const y1 = this.intCoord(pos[3 * nr + 1] + maxDist);
    const z1 = this.intCoord(pos[3 * nr + 2] + maxDist);

    this.querySize = 0;

    for (let xi = x0; xi <= x1; xi++) {
      for (let yi = y0; yi <= y1; yi++) {
        for (let zi = z0; zi <= z1; zi++) {
          const h = this.hashCoords(xi, yi, zi);
          const start = this.cellStart[h];
          const end = this.cellStart[h + 1];
          for (let i = start; i < end; i++) {
            this.queryIds[this.querySize] = this.cellEntries[i];
            this.querySize++;
          }
        }
      }
    }
  }

  queryAll(pos, maxDist) {
    let num = 0;
    const maxDist2 = maxDist * maxDist;

    for (let i = 0; i < this.maxNumObjects; i++) {
      const id0 = i;
      this.firstAdjId[id0] = num;
      this.query(pos, id0, maxDist);

      for (let j = 0; j < this.querySize; j++) {
        const id1 = this.queryIds[j];
        if (id1 >= id0) continue;
        const dist2 = vecDistSquared(pos, id0, pos, id1);
        if (dist2 > maxDist2) continue;

        if (num >= this.adjIds.length) {
          const newIds = new Int32Array(2 * num); // dynamic array
          newIds.set(this.adjIds);
          this.adjIds = newIds;
        }

        this.adjIds[num++] = id1;
      }
    }
    this.firstAdjId[(this.maxNumObjects = num)];
  }
}
