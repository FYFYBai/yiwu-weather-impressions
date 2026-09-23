import { Box3 } from 'three';

export function visibleMeshBounds(root) {
  const bounds = new Box3();
  let meshes = 0;
  root.updateMatrixWorld(true);
  root.traverseVisible(node => {
    if (!node.isMesh || !node.geometry?.getAttribute('position')?.count) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox?.isEmpty()) {
      bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
      meshes++;
    }
  });
  return { bounds, meshes };
}
