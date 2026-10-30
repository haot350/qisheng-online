/** Planned production origins. Local previews still load all assets locally. */
export const SITE_ORIGIN = 'https://zbqsgz.tianhw.top';
export const GAME_ORIGIN = 'https://game.tianhw.top';
export type CampusFloor = -1 | 0 | 1 | 2 | 3 | 4 | 5;

export type CampusBuildingId = 'south-teaching' | 'middle-teaching' | 'north-teaching' | 'garage';
export const CAMPUS_BUILDINGS:readonly {id:CampusBuildingId;label:string;short:string}[]=[{id:'south-teaching',label:'南教学楼',short:'南楼'},{id:'middle-teaching',label:'中教学楼',short:'中楼'},{id:'north-teaching',label:'北教学楼',short:'北楼'},{id:'garage',label:'地下自行车库',short:'车库'}];
