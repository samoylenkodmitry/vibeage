import { VecXZ } from '../shared/types.js';

// Constants for the game world
const WORLD_BOUNDS = {
    minX: -500,
    maxX: 500,
    minZ: -500,
    maxZ: 500
};

// Define obstacles - can be expanded with more complex shapes
const OBSTACLES: Array<{
    type: 'circle' | 'rectangle';
    center?: VecXZ;
    position?: VecXZ;
    radius?: number;
    width?: number;
    height?: number;
}> = [
    // Central lake - moved away from spawn
    {
        type: 'circle',
        center: { x: 100, z: 100 }, // was { x: 0, z: 0 }
        radius: 50
    },
    // Mountain area - north rectangle
    {
        type: 'rectangle',
        position: { x: -100, z: 300 },
        width: 200,
        height: 100
    },
    // Ruins - west rectangle
    {
        type: 'rectangle',
        position: { x: -300, z: -50 },
        width: 100,
        height: 100
    }
];

/**
 * Check if a line segment intersects with a circle
 * @param start Start point of line segment
 * @param end End point of line segment
 * @param center Circle center
 * @param radius Circle radius
 * @returns True if line segment intersects with circle
 */
function lineIntersectsCircle(start: VecXZ, end: VecXZ, center: VecXZ, radius: number): boolean {
    // Vector from start to end
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    
    // Vector from start to circle center
    const sx = center.x - start.x;
    const sz = center.z - start.z;
    
    // Length of line segment squared
    const lengthSquared = dx * dx + dz * dz;
    
    // Dot product of the two vectors
    const dotProduct = sx * dx + sz * dz;
    
    // Projection of center onto line segment
    const projection = dotProduct / lengthSquared;
    
    // Closest point on line segment to circle center
    let closestX, closestZ;
    
    if (projection < 0) {
        // Closest point is start
        closestX = start.x;
        closestZ = start.z;
    } else if (projection > 1) {
        // Closest point is end
        closestX = end.x;
        closestZ = end.z;
    } else {
        // Closest point is on the line segment
        closestX = start.x + projection * dx;
        closestZ = start.z + projection * dz;
    }
    
    // Distance from closest point to circle center
    const distance = Math.sqrt(
        Math.pow(closestX - center.x, 2) + 
        Math.pow(closestZ - center.z, 2)
    );
    
    // Check if distance is less than radius (intersection)
    return distance <= radius;
}

/**
 * Check if a line segment intersects with a rectangle
 * @param start Start point of line segment
 * @param end End point of line segment
 * @param rectPos Rectangle position (top-left corner)
 * @param width Rectangle width
 * @param height Rectangle height
 * @returns True if line segment intersects with rectangle
 */
function lineIntersectsRectangle(
    start: VecXZ, 
    end: VecXZ, 
    rectPos: VecXZ, 
    width: number, 
    height: number
): boolean {
    // Rectangle corners
    const topLeft = rectPos;
    const topRight = { x: rectPos.x + width, z: rectPos.z };
    const bottomLeft = { x: rectPos.x, z: rectPos.z + height };
    const bottomRight = { x: rectPos.x + width, z: rectPos.z + height };
    
    // Check if line intersects any of the rectangle edges
    return (
        lineIntersectsLine(start, end, topLeft, topRight) ||
        lineIntersectsLine(start, end, topRight, bottomRight) ||
        lineIntersectsLine(start, end, bottomRight, bottomLeft) ||
        lineIntersectsLine(start, end, bottomLeft, topLeft)
    );
}

/**
 * Check if two line segments intersect
 * @param a1 First point of first line
 * @param a2 Second point of first line
 * @param b1 First point of second line
 * @param b2 Second point of second line
 * @returns True if lines intersect
 */
function lineIntersectsLine(a1: VecXZ, a2: VecXZ, b1: VecXZ, b2: VecXZ): boolean {
    // Direction vectors
    const dxa = a2.x - a1.x;
    const dza = a2.z - a1.z;
    const dxb = b2.x - b1.x;
    const dzb = b2.z - b1.z;
    
    // Cross product of direction vectors
    const crossProduct = dxa * dzb - dza * dxb;
    
    // If cross product is zero, lines are parallel
    if (Math.abs(crossProduct) < 1e-10) return false;
    
    // Vector from a1 to b1
    const dx = b1.x - a1.x;
    const dz = b1.z - a1.z;
    
    // Parameters for line equations
    const t = (dx * dzb - dz * dxb) / crossProduct;
    const u = (dx * dza - dz * dxa) / crossProduct;
    
    // Check if intersection point is on both line segments
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Check if a movement path from start to destination is blocked by any obstacle
 * @param start Starting position
 * @param dest Destination position
 * @returns true if the path is blocked
 */
export function isPathBlocked(start: VecXZ, dest: VecXZ): boolean {
    // Check world boundaries
    if (dest.x < WORLD_BOUNDS.minX || dest.x > WORLD_BOUNDS.maxX ||
        dest.z < WORLD_BOUNDS.minZ || dest.z > WORLD_BOUNDS.maxZ) {
        console.log('[COLLISION] Blocked by world bounds', { start, dest, bounds: WORLD_BOUNDS });
        return true;
    }
    // Check obstacle collisions
    for (const obstacle of OBSTACLES) {
        if (obstacle.type === 'circle' && obstacle.center && obstacle.radius) {
            if (lineIntersectsCircle(start, dest, obstacle.center, obstacle.radius)) {
                console.log('[COLLISION] Blocked by circle', { start, dest, center: obstacle.center, radius: obstacle.radius });
                return true;
            }
        } else if (obstacle.type === 'rectangle' && obstacle.position && obstacle.width && obstacle.height) {
            if (lineIntersectsRectangle(start, dest, obstacle.position, obstacle.width, obstacle.height)) {
                console.log('[COLLISION] Blocked by rectangle', { start, dest, position: obstacle.position, width: obstacle.width, height: obstacle.height });
                return true;
            }
        }
    }
    console.log('[COLLISION] Path clear', { start, dest });
    return false;
}

/**
 * Find a valid destination point as close as possible to the requested one
 * @param start Starting position
 * @param dest Requested destination
 * @returns Valid destination point
 */
export function findValidDestination(start: VecXZ, dest: VecXZ): VecXZ {
    // If path is not blocked, return original destination
    if (!isPathBlocked(start, dest)) return dest;
    
    // Simple approach: try points along the line from start to dest
    const dx = dest.x - start.x;
    const dz = dest.z - start.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Try increments of 5% back from the destination
    for (let percent = 0.95; percent >= 0.05; percent -= 0.05) {
        const testPoint = {
            x: start.x + dx * percent,
            z: start.z + dz * percent
        };
        
        if (!isPathBlocked(start, testPoint)) {
            console.log('[COLLISION] Clamped destination', { from: dest, to: testPoint });
            return testPoint;
        }
    }
    console.log('[COLLISION] No valid destination found, returning start', { start, dest });
    return { ...start };
}
