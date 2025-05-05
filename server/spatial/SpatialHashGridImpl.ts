import { VecXZ } from '../../shared/messages';

// Define EntityId type locally to avoid dependency issues
type EntityId = string;

/**
 * A spatial hash grid implementation for efficient spatial queries
 */
export class SpatialHashGridImpl {
  private cells: Map<string, Set<EntityId>>;
  private cellSize: number;
  private invCellSize: number;
  private _scratchSet: Set<string>;
  private _scratchArr: string[];

  /**
   * Creates a new spatial hash grid with customizable cell size
   * @param cellSize The size of each grid cell (default: 6)
   */
  constructor(cellSize: number = 6) {
    this.cells = new Map<string, Set<EntityId>>();
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this._scratchSet = new Set<string>();
    this._scratchArr = [] as string[];
  }

  /**
   * Generates a hash key from world coordinates
   */
  private hash(x: number, z: number): string {
    const ix = Math.floor(x * this.invCellSize);
    const iz = Math.floor(z * this.invCellSize);
    return `${ix},${iz}`;
  }

  /**
   * Checks if an entity has moved to a different grid cell
   */
  public cellChanged(oldPos: VecXZ, newPos: VecXZ): boolean {
    const oldKey = this.hash(oldPos.x, oldPos.z);
    const newKey = this.hash(newPos.x, newPos.z);
    return oldKey !== newKey;
  }

  /**
   * Inserts an entity into the grid at the specified position
   */
  public insert(id: EntityId, x: number, z: number): void {
    const key = this.hash(x, z);
    
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set<EntityId>());
    }
    
    this.cells.get(key)!.add(id);
  }
  
  /**
   * Moves an entity from its old position to a new position in the grid
   */
  public move(id: EntityId, oldX: number, oldZ: number, newX: number, newZ: number): void {
    const oldKey = this.hash(oldX, oldZ);
    const newKey = this.hash(newX, newZ);
    
    // If the entity hasn't changed cells, no need to update the grid
    if (oldKey === newKey) {
      return;
    }
    
    // Remove from old cell
    const oldCell = this.cells.get(oldKey);
    if (oldCell) {
      oldCell.delete(id);
      // Clean up empty cells to prevent memory leaks
      if (oldCell.size === 0) {
        this.cells.delete(oldKey);
      }
    }
    
    // Add to new cell
    if (!this.cells.has(newKey)) {
      this.cells.set(newKey, new Set<EntityId>());
    }
    
    this.cells.get(newKey)!.add(id);
  }
  
  /**
   * Removes an entity from the grid
   */
  public remove(id: EntityId, x: number, z: number): void {
    const key = this.hash(x, z);
    
    const cell = this.cells.get(key);
    if (cell) {
      cell.delete(id);
      // Clean up empty cells to prevent memory leaks
      if (cell.size === 0) {
        this.cells.delete(key);
      }
    }
  }
  
  /**
   * Queries the grid for entities within a circle centered at (cx,cz) with radius r
   * Returns deduplicated list of entity IDs
   */
  public queryCircle(cx: number, cz: number, r: number): EntityId[] {
    const set = this._scratchSet;
    set.clear();
    
    const cellRadius = Math.ceil(r * this.invCellSize);
    const centerIx = Math.floor(cx * this.invCellSize);
    const centerIz = Math.floor(cz * this.invCellSize);
    
    // Generate keys for all cells that might intersect with the circle
    for (let ix = centerIx - cellRadius; ix <= centerIx + cellRadius; ix++) {
      for (let iz = centerIz - cellRadius; iz <= centerIz + cellRadius; iz++) {
        const key = `${ix},${iz}`;
        const cell = this.cells.get(key);
        
        if (cell) {
          // Add all entities from this cell to the result set
          for (const id of cell) {
            set.add(id);
          }
        }
      }
    }
    
    // Convert set to array using scratch array to avoid allocation
    this._scratchArr.length = 0;
    for (const id of set) {
      this._scratchArr.push(id);
    }
    
    return this._scratchArr;
  }
}
