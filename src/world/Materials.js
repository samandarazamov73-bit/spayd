import * as THREE from 'three';

/**
 * Materials
 * ---------
 * Библиотека PBR-материалов. Все материалы — MeshStandardMaterial
 * с подготовленными текстурами из AssetLoader.
 *
 * Использование:
 *   const M = new Materials(assets);
 *   mesh.material = M.carpet;
 */
export class Materials {
  constructor(assets) {
    this.assets = assets;

    const wallpaper = assets.createWallpaperTexture();
    const carpet    = assets.createCarpetTexture();
    const marble    = assets.createMarbleTexture();
    const noiseDark = assets.createNoiseTexture({ size: 256, base: '#1a1a1a', amount: 14 });
    const bumpN     = assets.createBumpNormal({ size: 256, strength: 0.4 });

    // === Стены номера / коридора ===
    this.wall = new THREE.MeshStandardMaterial({
      map: wallpaper,
      normalMap: bumpN,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.92,
      metalness: 0.0,
      color: 0xffffff
    });

    // === Пол: ковёр ===
    this.carpet = new THREE.MeshStandardMaterial({
      map: carpet,
      normalMap: bumpN,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 1.0,
      metalness: 0.0
    });

    // === Пол лобби: мрамор ===
    this.marble = new THREE.MeshStandardMaterial({
      map: marble,
      roughness: 0.18,
      metalness: 0.05,
      envMapIntensity: 1.0
    });

    // === Потолок ===
    this.ceiling = new THREE.MeshStandardMaterial({
      color: 0xc8c4be,
      roughness: 0.95,
      metalness: 0.0
    });

    // === Тёмное дерево (двери, мебель) ===
    this.darkWood = new THREE.MeshStandardMaterial({
      color: 0x2e1a10,
      roughness: 0.55,
      metalness: 0.05,
      normalMap: bumpN,
      normalScale: new THREE.Vector2(0.3, 0.3)
    });

    // === Светлое дерево (стол, тумбочка) ===
    this.lightWood = new THREE.MeshStandardMaterial({
      color: 0x6a4a2e,
      roughness: 0.7,
      metalness: 0.0
    });

    // === Металл (петли, ручки, кнопки лифта) ===
    this.brushedMetal = new THREE.MeshStandardMaterial({
      color: 0x8a8a8a,
      roughness: 0.35,
      metalness: 0.95
    });

    // === Полированная сталь лифта ===
    this.steel = new THREE.MeshStandardMaterial({
      color: 0xa8a8a8,
      roughness: 0.22,
      metalness: 1.0
    });

    // === Стекло окна ===
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0x223344,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.85,
      thickness: 0.05,
      ior: 1.45,
      transparent: true,
      opacity: 0.55
    });

    // === Ткань (постель, диван) ===
    this.fabric = new THREE.MeshStandardMaterial({
      color: 0x6a3a32,
      roughness: 0.95,
      metalness: 0.0
    });

    // === Простыня белая ===
    this.linen = new THREE.MeshStandardMaterial({
      color: 0xc8c1b4,
      roughness: 0.85,
      metalness: 0.0
    });

    // === Чёрный пластик ТВ / телефона ===
    this.blackPlastic = new THREE.MeshStandardMaterial({
      color: 0x080808,
      roughness: 0.42,
      metalness: 0.1
    });

    // === Эмиссивный экран ТВ — заменяется на VideoTexture позже ===
    this.tvScreen = new THREE.MeshBasicMaterial({
      color: 0x111111
    });

    // === Лампа (плафон): полупрозрачный материал, эмиссивный ===
    this.lampShade = new THREE.MeshStandardMaterial({
      color: 0xffe7c0,
      roughness: 0.6,
      metalness: 0.0,
      emissive: 0xffd296,
      emissiveIntensity: 0.7
    });

    // === Бра / лампа коридора (трубка) ===
    this.fluorescentTube = new THREE.MeshStandardMaterial({
      color: 0xfff8e8,
      emissive: 0xfff0d4,
      emissiveIntensity: 1.4,
      roughness: 0.4
    });

    // === Чёрная ночь за окном (для skybox/окна) ===
    this.nightSky = new THREE.MeshBasicMaterial({
      color: 0x040608,
      side: THREE.BackSide
    });

    // === Кнопка лифта (неактивная / активная) ===
    this.buttonOff = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a, roughness: 0.6, metalness: 0.5
    });
    this.buttonOn = new THREE.MeshStandardMaterial({
      color: 0xff8a40, roughness: 0.4, metalness: 0.3,
      emissive: 0xff5a20, emissiveIntensity: 1.2
    });

    // === Бумажный пакет с едой ===
    this.paperBag = new THREE.MeshStandardMaterial({
      color: 0xb89868,
      roughness: 0.95,
      metalness: 0.0
    });
  }
}
