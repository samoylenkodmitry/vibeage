import { it, expect } from 'vitest';
import { SpatialHashGrid, gridCellChanged } from '../server/spatial/SpatialHashGrid';

  it('should detect cell changes correctly', () => {
    // With our cell size of 6, positions 10.5 and 12.5 should be in different cells
    // (indexes 1 and 2 respectively)
    expect(gridCellChanged(
      { x: 10.5, z: 20.5 },
      { x: 12.5, z: 22.5 }
    )).toBe(true);
    
    // Same cell - closer points
    expect(gridCellChanged(
      { x: 7.0, z: 7.0 },
      { x: 7.5, z: 7.5 }
    )).toBe(false);
    
    // Different cell - x direction
    expect(gridCellChanged(
      { x: 5.9, z: 20.5 },
      { x: 6.1, z: 20.5 }
    )).toBe(true);
    
    // Different cell - z direction
    expect(gridCellChanged(
      { x: 10.5, z: 5.9 },
      { x: 10.5, z: 6.1 }
    )).toBe(true);
  });
  it('should handle basic insert and query operations', () => {
    const grid = new SpatialHashGrid(6);
    
    // Insert an entity
    grid.insert('entity1', { x: 10, z: 20 });
    
    // Query within radius
    const result1 = grid.queryCircle({ x: 10, z: 20 }, 1);
    expect(result1).toContain('entity1');
    
    // Query outside radius - should find because we're querying all cells that intersect the circle
    const result2 = grid.queryCircle({ x: 20, z: 30 }, 1);
    expect(result2).not.toContain('entity1');
  });
  it('returns each id only once', () => {
    const grid = new SpatialHashGrid(6);
    grid.insert('A', { x: 0, z: 0 });
    grid.insert('A', { x: 0, z: 0 });  // same cell, allowed internally
    const res = grid.queryCircle({ x: 0, z: 0 }, 1);
    expect(res.filter((id: string) => id === 'A').length).toBe(1);
  });
  
  it('should handle entity movement between cells', () => {
    const grid = new SpatialHashGrid(6);
    
    // Insert an entity
    grid.insert('entity1', { x: 10, z: 20 });
    
    // Move the entity to a new cell
    grid.move('entity1', { x: 10, z: 20 }, { x: 30, z: 40 });
    
    // Query the old position - should not find the entity
    const result1 = grid.queryCircle({ x: 10, z: 20 }, 1);
    expect(result1).not.toContain('entity1');
    
    // Query the new position - should find the entity
    const result2 = grid.queryCircle({ x: 30, z: 40 }, 1);
    expect(result2).toContain('entity1');
  });
  
  it('should handle entity removal', () => {
    const grid = new SpatialHashGrid(6);
    
    // Insert an entity
    grid.insert('entity1', { x: 10, z: 20 });
    
    // Remove the entity
    grid.remove('entity1', { x: 10, z: 20 });
    
    // Query - should not find the entity
    const result = grid.queryCircle({ x: 10, z: 20 }, 1);
    expect(result).not.toContain('entity1');
  });
  
  it('should dedup entities when querying multiple cells', () => {
    const grid = new SpatialHashGrid(6);
    
    // Insert the same entity into multiple cells
    grid.insert('entity1', { x: 5.9, z: 0 });
    grid.move('entity1', { x: 5.9, z: 0 }, { x: 6.1, z: 0 });
    
    // Query a position that would encompass both cells
    const result = grid.queryCircle({ x: 6, z: 0 }, 1);
    
    // The entity should appear only once in the result
    expect(result.filter((id: string) => id === 'entity1').length).toBe(1);
  });
