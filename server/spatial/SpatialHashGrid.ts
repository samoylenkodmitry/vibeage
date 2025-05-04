import { VecXZ } from '../../shared/messages';

// Define EntityId type locally to avoid dependency issues
type EntityId = string;

/**
 * Constants for the spatial hash grid
 */
const CELL = 6; // Cell size in world units
const INV_CELL = 1 / CELL; // Inverse of cell size for efficient calculation

/**
 * Type representing a cell coordinate in the grid
 */
type GridCoord = { ix: number; iz: number };

/**
 * Generates a string key from grid coordinates
 */
function coordToKey(ix: number, iz: number): string {
  return `${ix},${iz}`;
}

/**
 * Converts a world position to grid cell coordinates
 */
function worldToGridCoord(pos: VecXZ): GridCoord {
  return {
    ix: Math.floor(pos.x * INV_CELL),
    iz: Math.floor(pos.z * INV_CELL)
  };
}

/**
 * Checks if an entity has moved to a different grid cell
 */
export function gridCellChanged(oldPos: VecXZ, newPos: VecXZ): boolean {
  const oldCell = worldToGridCoord(oldPos);
  const newCell = worldToGridCoord(newPos);
  return oldCell.ix !== newCell.ix || oldCell.iz !== newCell.iz;
}

/**
 * Interface for the spatial hash grid operations
 */
export interface SpatialHashGrid {
  insert(id: EntityId, pos: VecXZ): void;
  move(id: EntityId, oldPos: VecXZ, newPos: VecXZ): void;
  remove(id: EntityId, pos: VecXZ): void;
  
  /**
   * Returns ids whose centres fall within `r` of `pos` (inclusive)
   */
  queryCircle(pos: VecXZ, r: number): EntityId[];
}

/**
 * Creates a new spatial hash grid
 */
export function createSpatialHashGrid(): SpatialHashGrid {
  // Map of cell keys to sets of entity IDs
  const cells = new Map<string, Set<EntityId>>();

  return {
    /**
     * Inserts an entity into the grid at the specified position
     */
    insert(id: EntityId, pos: VecXZ): void {
      const { ix, iz } = worldToGridCoord(pos);
      const key = coordToKey(ix, iz);
      
      if (!cells.has(key)) {
        cells.set(key, new Set<EntityId>());
      }
      
      cells.get(key)!.add(id);
    },
    
    /**
     * Moves an entity from its old position to a new position in the grid
     */
    move(id: EntityId, oldPos: VecXZ, newPos: VecXZ): void {
      const oldGridCoord = worldToGridCoord(oldPos);
      const newGridCoord = worldToGridCoord(newPos);
      
      // If the entity hasn't changed cells, no need to update the grid
      if (oldGridCoord.ix === newGridCoord.ix && oldGridCoord.iz === newGridCoord.iz) {
        return;
      }
      
      // Remove from old cell
      const oldKey = coordToKey(oldGridCoord.ix, oldGridCoord.iz);
      const oldCell = cells.get(oldKey);
      if (oldCell) {
        oldCell.delete(id);
        // Clean up empty cells to prevent memory leaks
        if (oldCell.size === 0) {
          cells.delete(oldKey);
        }
      }
      
      // Add to new cell
      const newKey = coordToKey(newGridCoord.ix, newGridCoord.iz);
      if (!cells.has(newKey)) {
        cells.set(newKey, new Set<EntityId>());
      }
      
      cells.get(newKey)!.add(id);
    },
    
    /**
     * Removes an entity from the grid
     */
    remove(id: EntityId, pos: VecXZ): void {
      const { ix, iz } = worldToGridCoord(pos);
      const key = coordToKey(ix, iz);
      
      const cell = cells.get(key);
      if (cell) {
        cell.delete(id);
        // Clean up empty cells to prevent memory leaks
        if (cell.size === 0) {
          cells.delete(key);
        }
      }
    },
    
    /**
     * Queries the grid for entities within a circle centered at pos with radius r
     */
    queryCircle(pos: VecXZ, r: number): EntityId[] {
      const result: EntityId[] = [];
      const { ix: centerIx, iz: centerIz } = worldToGridCoord(pos);
      
      // Determine the range of cells to check based on the radius
      const cellRadius = Math.ceil(r * INV_CELL);
      
      // Generate keys for all cells that might intersect with the circle
      for (let ix = centerIx - cellRadius; ix <= centerIx + cellRadius; ix++) {
        for (let iz = centerIz - cellRadius; iz <= centerIz + cellRadius; iz++) {
          const key = coordToKey(ix, iz);
          const cell = cells.get(key);
          
          if (cell) {
            // Add all entities from this cell to the result
            for (const id of cell) {
              result.push(id);
            }
          }
        }
      }
      
      // The result is already deduplicated because we're using a Set
      return result;
    }
  };
}
