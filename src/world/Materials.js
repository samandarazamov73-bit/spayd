import * as THREE from 'three';

/**
 * Materials (lite)
 * ----------------
 * Лёгкая библиотека PBR-материалов БЕЗ нормал-мап и сложных шейдеров.
 * Все материалы — MeshStandardMaterial с текстурой и базовым PBR
 * (roughness/metalness). Без normalMap, displacementMap, AO.
 */
export class Materials {
  constructor(assets) {
    this.assets = assets;

    const wallpaper = assets.createWallpaperTexture();
    const carpet    = assets.createCarpetTexture();
    const marble    = assets.createMarbleTexture();

    this.wall = new THREE.MeshStandardMaterial({
      map: wallpaper, roughness: 0.92, metalness: 0.0, color: 0xffffff
    });

    this.carpet = new THREE.MeshStandardMaterial({
      map: carpet, roughness: 1.0, metalness: 0.0
    });

    this.marble = new THREE.MeshStandardMaterial({
      map: marble, roughness: 0.25, metalness: 0.05
    });

    this.ceiling = new THREE.MeshStandardMaterial({
      color: 0xc8c4be, roughness: 0.95, metalness: 0.0
    });

    this.darkWood = new THREE.MeshStandardMaterial({
      color: 0x4a2e1c, roughness: 0.55, metalness: 0.05
    });

    this.lightWood = new THREE.MeshStandardMaterial({
      color: 0x8a6a3e, roughness: 0.7, metalness: 0.0
    });

    this.brushedMetal = new THREE.MeshStandardMaterial({
      color: 0x9a9a9a, roughness: 0.35, metalness: 0.95
    });

    this.steel = new THREE.MeshStandardMaterial({
      color: 0xb8b8b8, roughness: 0.22, metalness: 1.0
    });

    // Стекло — простое, без transmission (transmission = тяжёлый шейдер)
    this.glass = new THREE.MeshStandardMaterial({
      color: 0x556677, roughness: 0.1, metalness: 0.0,
      transparent: true, opacity: 0.45
    });

    this.fabric = new THREE.MeshStandardMaterial({
      color: 0x8a4a3a, roughness: 0.95, metalness: 0.0
    });

    this.linen = new THREE.MeshStandardMaterial({
      color: 0xd8d1c4, roughness: 0.85, metalness: 0.0
    });

    this.blackPlastic = new THREE.MeshStandardMaterial({
      color: 0x101010, roughness: 0.42, metalness: 0.1
    });

    this.tvScreen = new THREE.MeshBasicMaterial({ color: 0x111111 });

    this.lampShade = new THREE.MeshStandardMaterial({
      color: 0xffe7c0, roughness: 0.6, metalness: 0.0,
      emissive: 0xffd296, emissiveIntensity: 0.7
    });

    this.fluorescentTube = new THREE.MeshStandardMaterial({
      color: 0xfff8e8, emissive: 0xfff0d4, emissiveIntensity: 1.4, roughness: 0.4
    });

    this.nightSky = new THREE.MeshBasicMaterial({
      color: 0x040608, side: THREE.BackSide
    });

    this.buttonOff = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a, roughness: 0.6, metalness: 0.5
    });
    this.buttonOn = new THREE.MeshStandardMaterial({
      color: 0xff8a40, roughness: 0.4, metalness: 0.3,
      emissive: 0xff5a20, emissiveIntensity: 1.2
    });

    this.paperBag = new THREE.MeshStandardMaterial({
      color: 0xc8a878, roughness: 0.95, metalness: 0.0
    });
  }
}
