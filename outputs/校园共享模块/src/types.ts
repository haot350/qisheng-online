export type Vec3=[number,number,number];
export type WeaponId='glock'|'mp5'|'m4a1'|'ak47'|'r870'|'awm'|'m249';
export type PrimaryWeaponId=Exclude<WeaponId,'glock'>;
export interface MovementCheckpoint {stamina:number;recoveryWait:number;exhausted:boolean;slideLeft:number;cooldown:number;direction:[number,number]|null;}
export type NearbyInteractionKind='revive'|'task'|'weapon'|'gadget'|'supply';
export type NearbyInteractionAction='revive'|'take'|'activate'|'hold'|'carry'|'deliver'|'extract'|'ammo'|'replace'|'supply'|'helmet'|'grenade'|'cards';
export interface NearbyInteraction {
 kind:NearbyInteractionKind;id:string;action:NearbyInteractionAction;
 taskId?:string;siteId?:string;weapon?:WeaponId;available:boolean;reason?:'full';
}

export type Point={id:string;label:string;position:Vec3};
export type MapChunk={url:string;center:Vec3;radius:number;triangles?:number;bytes?:number;kind?:'exterior'|'interior';floor?:number;building?:string;combatOccluder?:boolean;residency?:'structure'|'detail';sourceChunk?:string;sourceChunks?:string[];decodedGeometryBytes?:number;textureResources?:{id:string;bytes:number}[];bounds?:{min:Vec3;max:Vec3}};
export type MapManifest={version:number;source:string;sourceVersion?:string;sourceSha256:string;visualRevision?:string;chunks:MapChunk[];collisionUrl:string;navmeshUrl:string;visionUrl?:string;physicsRevision?:string;collisionPatch?:{version:string;sourceCollisionHash:string;sourceVisualHash:string;patchHash:string};lowestOpenElevation?:number;physicsVersion?:string;spawn:Vec3;spawnYaw:number;npcSpawns:Vec3[];clues:Point[];supplies:Point[];extraction:Vec3;bounds:{min:Vec3;max:Vec3};floors?:{id:number;elevation:number;bounds:{min:Vec3;max:Vec3}}[];stairRoutes?:{core:string;from_floor:number;to_floor:number;points:Vec3[]}[]};
