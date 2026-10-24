import {DRIVING_VEHICLES} from '@qisheng/shared/ranking';
import CAR from './vehicle-definition.json' with {type:'json'};

export type DrivingVehicleId='bao5'|'tank'|'scooter';
export const drivingVehicleId=(value:unknown):DrivingVehicleId=>value==='tank'||value==='scooter'?value:'bao5';
export type VehicleDefinition=Omit<typeof CAR,'model'|'physics'> & {
 id:DrivingVehicleId; model:string; label:string; role:string; description:string;
 maximumSpeed:number; boostSpeed:number; durability:number; manual:boolean; boost:boolean;
 wheelNames:string[]; physics:typeof CAR.physics;
};
const tank:VehicleDefinition={
 ...CAR,id:'tank',model:'campus-tank',displayName:'轻型坦克',label:'轻型坦克',role:'装甲与火力',
 description:'履带原地转向，有限炮弹。留意窄路与近距离爆炸。',
 assetUrl:'/vehicles/campus-tank-r1.glb',maximumSpeed:DRIVING_VEHICLES.tank.normalSpeed*3.6,boostSpeed:DRIVING_VEHICLES.tank.boostSpeed*3.6,durability:DRIVING_VEHICLES.tank.durability,manual:false,boost:false,
 dimensions:{length:4.9,width:2.38,height:2.12,wheelbase:2.8,track:1.9},
 wheelNames:['road_lf','road_rf','road_lm','road_rm','road_lr','road_rr'],
 physics:{...CAR.physics,anchor:.79,wheels:[[-.94,-.10,-1.4],[.94,-.10,-1.4],[-.94,-.1,0],[.94,-.1,0],[-.94,-.1,1.4],[.94,-.1,1.4]],wheelRadius:.36,mass:6000,centerOfMass:[0,-.25,0],inertia:[13000,17000,6500],chassis:{half:[1.13,.36,2.25],center:[0,-.02,0]},roof:{half:[.67,.35,.79],center:[0,.75,-.12]},spare:{half:[.48,.07,.4],center:[0,.35,1.72]},suspension:{restLength:.28,stiffness:48,compression:6,relaxation:6.8,maxTravel:.18,maxForce:42000},engineForce:24000,boostForce:24000,brakeForce:700},
 camera:{targetHeight:1.18,distance:9.2,height:4.1},clearance:{half:[1.24,.96,2.5],center:[0,1.03,0]},
 notes:'Original compact fictional light tank. Metres, Y up, -Z forward; arcade dynamics, not a real vehicle specification.'
};
const scooter:VehicleDefinition={
 ...CAR,id:'scooter',model:'campus-scooter',displayName:'电动滑板车',label:'电动滑板车',role:'轻巧与转向',
 description:'起步轻快，适合穿行。车况较低，碰撞前先减速。',
 assetUrl:'/vehicles/campus-scooter-r1.glb',maximumSpeed:DRIVING_VEHICLES.scooter.normalSpeed*3.6,boostSpeed:DRIVING_VEHICLES.scooter.boostSpeed*3.6,durability:DRIVING_VEHICLES.scooter.durability,manual:false,boost:true,
 dimensions:{length:1.35,width:.58,height:1.88,wheelbase:1.05,track:0},wheelNames:['wheel_front','wheel_rear'],
 physics:{...CAR.physics,anchor:.54,wheels:[[0,-.12,-.525],[0,-.12,.525]],wheelRadius:.17,mass:115,centerOfMass:[0,.05,.05],inertia:[38,26,12],chassis:{half:[.18,.09,.56],center:[0,-.22,0]},roof:{half:[.22,.61,.22],center:[0,.68,.12]},spare:{half:[.28,.04,.045],center:[0,.7,-.48]},suspension:{restLength:.25,stiffness:96,compression:5.5,relaxation:6.2,maxTravel:.12,maxForce:2300},engineForce:650,boostForce:900,brakeForce:35},
 camera:{targetHeight:1.05,distance:5.6,height:2.7},clearance:{half:[.33,.92,.73],center:[0,1.02,0]},
 notes:'Original standing electric scooter with an anonymous rider. Metres, Y up, -Z forward. Steering and balance assistance do not alter collision.'
};
export const VEHICLES:Readonly<Record<DrivingVehicleId,VehicleDefinition>>={
 bao5:{...CAR,id:'bao5',label:CAR.displayName,role:'全能越野',description:'自动或手动六挡，手刹转弯与短时加速。',maximumSpeed:DRIVING_VEHICLES.bao5.normalSpeed*3.6,boostSpeed:DRIVING_VEHICLES.bao5.boostSpeed*3.6,durability:DRIVING_VEHICLES.bao5.durability,manual:true,boost:true,wheelNames:['wheel_fl','wheel_fr','wheel_rl','wheel_rr']},tank,scooter,
};
export const vehicleDefinition=(id:unknown):VehicleDefinition=>VEHICLES[drivingVehicleId(id)];
