import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,type BufferGeometry,type Material} from 'three';
import {createCameraModel} from '../src/camera-model.ts';

test('three camera replacements detach their roots and release every owned surface exactly once',()=>{
  const viewScene=new Group();
  for(let cycle=0;cycle<3;cycle++){
    const camera=createCameraModel({quality:'low',canvasLabels:false});viewScene.add(camera.group);
    const geometries=new Set<BufferGeometry>(),materials=new Set<Material>();
    camera.group.traverse(object=>{if(object instanceof Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
    let geometryReleases=0,materialReleases=0;
    for(const geometry of geometries)geometry.addEventListener('dispose',()=>geometryReleases++);
    for(const material of materials)material.addEventListener('dispose',()=>materialReleases++);
    assert.equal(viewScene.children.length,1);camera.update(1/60,{focalLength:105,raised:false});camera.dispose();
    assert.equal(camera.group.parent,null);assert.equal(viewScene.children.length,0,'a disposed camera must not leave an empty root in the persistent view scene');
    assert.equal(geometryReleases,geometries.size);assert.equal(materialReleases,materials.size);
    camera.dispose();assert.equal(geometryReleases,geometries.size);assert.equal(materialReleases,materials.size,'repeated cleanup is safe');
  }
});
